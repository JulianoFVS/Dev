#!/usr/bin/env node
/**
 * ORTUS — Tira as fotos de paciente do bucket público do R2.
 *
 * A foto de perfil do paciente (pacientes/<uuid>/avatar.jpg) agora vai para o
 * bucket privado e só abre pela rota autenticada. As enviadas antes continuam
 * no bucket público: o app já as lê de lá como reserva, sem expor pela rota
 * pública, mas quem tem o link direto do R2 (R2_PUBLIC_URL) ainda as vê.
 *
 * Para cada objeto em `pacientes/` do bucket público: copia para o privado,
 * confere o tamanho da cópia e só então apaga a pública. Se o privado já tem
 * o arquivo (a foto foi trocada depois da mudança), a pública é a antiga:
 * apaga sem sobrescrever a nova. Não mexe no banco nem no Storage do Supabase
 * (lá os buckets já são privados e a rota pública recusa o caminho).
 *
 * SEM PARÂMETROS É SÓ SIMULAÇÃO: lista o que faria e não muda nada.
 *   node scripts/mover-fotos-pacientes.mjs            # simulação
 *   node scripts/mover-fotos-pacientes.mjs --aplicar  # copia e apaga
 *
 * Variáveis (do ambiente ou de .env.local): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY e, se não forem as de sempre, R2_BUCKET_PUBLICO e
 * R2_BUCKET_PRIVADO. Pode rodar de novo: o que já saiu do público não aparece.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env, exigir } from './_env.mjs';

const APLICAR = process.argv.includes('--aplicar');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const FOTO = new RegExp(`^pacientes/${UUID.source}/avatar\\.jpg$`);

exigir('R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY');
const publico = env('R2_BUCKET_PUBLICO') || 'ortus-publico';
const privado = env('R2_BUCKET_PRIVADO') || 'ortus-privado';
if (publico === privado) {
  console.error('R2_BUCKET_PUBLICO e R2_BUCKET_PRIVADO apontam para o mesmo bucket: não há o que mover.');
  process.exit(1);
}

// Fora de produção o endereço pode apontar para o S3 local de teste, como em lib/r2.ts.
const teste = process.env.NODE_ENV !== 'production' ? env('ORTUS_TESTE_URL_R2').replace(/\/$/, '') : '';
const s3 = new S3Client({
  region: 'auto',
  endpoint: teste || `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  forcePathStyle: Boolean(teste),
  credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const ausente = (err) => err?.name === 'NotFound' || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404;
/** O id do paciente não vai inteiro para a tela nem para o log de quem roda o script. */
const curto = (chave) => chave.replace(UUID, (id) => `${id.slice(0, 8)}…`);

async function listar(bucket, prefixo) {
  const itens = [];
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefixo, ContinuationToken: token, MaxKeys: 1000 }));
    for (const o of r.Contents || []) itens.push({ chave: o.Key, bytes: Number(o.Size || 0) });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return itens;
}

/** Tamanho do objeto, ou null quando não existe. */
async function tamanhoEm(bucket, chave) {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: chave }));
    return Number(head.ContentLength ?? 0);
  } catch (err) {
    if (ausente(err)) return null;
    throw err;
  }
}

async function copiarParaPrivado(chave) {
  const obj = await s3.send(new GetObjectCommand({ Bucket: publico, Key: chave }));
  const corpo = await obj.Body.transformToByteArray();
  await s3.send(new PutObjectCommand({
    Bucket: privado,
    Key: chave,
    Body: corpo,
    ContentType: obj.ContentType || 'application/octet-stream',
  }));
  return corpo.length;
}

try {
  console.log('=== ORTUS — fotos de paciente fora do bucket público ===');
  console.log(`Público: ${publico} · privado: ${privado}${teste ? ' · S3 de teste' : ''}`);
  console.log(APLICAR ? 'MODO: APLICAR (copia, confere e apaga a pública)\n' : 'MODO: simulação (nada muda; para aplicar, rode com --aplicar)\n');

  const plano = [];
  for (const item of await listar(publico, 'pacientes/')) {
    const noPrivado = await tamanhoEm(privado, item.chave);
    plano.push({ ...item, foto: FOTO.test(item.chave), copiar: !(noPrivado > 0) });
  }

  if (!plano.length) {
    console.log('Nenhum arquivo de paciente no bucket público. Nada a fazer.');
    process.exit(0);
  }

  const aCopiar = plano.filter((p) => p.copiar);
  const soApagar = plano.filter((p) => !p.copiar);
  const fora = plano.filter((p) => !p.foto);
  console.log(`Arquivos de paciente no bucket público: ${plano.length} (${(plano.reduce((s, p) => s + p.bytes, 0) / 1e6).toFixed(1).replace('.', ',')} MB)`);
  console.log(`  copiar para o privado e apagar a pública: ${aCopiar.length}`);
  console.log(`  já estão no privado (a pública é cópia antiga, só apagar): ${soApagar.length}`);
  if (fora.length) {
    console.log(`  fora do padrão pacientes/<id>/avatar.jpg (vão para o privado, mas a ficha não os mostra): ${fora.length}`);
    for (const p of fora.slice(0, 20)) console.log(`    ${curto(p.chave)}`);
    if (fora.length > 20) console.log(`    … e mais ${fora.length - 20}`);
  }

  if (!APLICAR) {
    for (const p of plano.slice(0, 20)) console.log(`  ${p.copiar ? 'copiaria e apagaria' : 'apagaria'}: ${curto(p.chave)}`);
    if (plano.length > 20) console.log(`  … e mais ${plano.length - 20}`);
    console.log('\nSimulação: nada foi copiado nem apagado.');
    process.exit(0);
  }

  let copiados = 0;
  let apagados = 0;
  const falhas = [];
  for (const p of plano) {
    try {
      if (p.copiar) {
        const bytes = await copiarParaPrivado(p.chave);
        // Só apaga a pública depois de ver a cópia inteira no privado.
        if ((await tamanhoEm(privado, p.chave)) !== bytes) {
          falhas.push(`${curto(p.chave)}: a cópia no privado não confere`);
          continue;
        }
        copiados += 1;
      }
      await s3.send(new DeleteObjectCommand({ Bucket: publico, Key: p.chave }));
      apagados += 1;
    } catch (err) {
      falhas.push(`${curto(p.chave)}: ${err?.name || 'erro'}`);
    }
  }

  console.log(`\nCopiados para o privado: ${copiados}. Apagados do público: ${apagados}.`);
  if (falhas.length) {
    console.log(`Ficaram no público (rode de novo depois de ver a causa): ${falhas.length}`);
    for (const f of falhas.slice(0, 20)) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  }
} catch (err) {
  console.error('\nERRO:', err?.name || 'erro', '-', err?.message || '');
  process.exitCode = 1;
}
