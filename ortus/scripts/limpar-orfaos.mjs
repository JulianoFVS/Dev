#!/usr/bin/env node
/**
 * ORTUS — Arquivos órfãos no R2 e no Storage do Supabase.
 *
 * Órfão = arquivo de paciente cujo paciente não existe mais no banco
 * (pacientes/<uuid>/...), ou arquivo da pasta legado/ que nenhuma linha do
 * banco cita. Foi assim que sobraram as 4 fotos de HOF e o jpeg antigo
 * apontados no levantamento de 18/11.
 *
 * Sem parâmetros: só lista (nada é apagado).
 *   node scripts/limpar-orfaos.mjs
 *   node scripts/limpar-orfaos.mjs --apagar --projeto=<project ref mostrado>
 *
 * Variáveis: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * e as R2_* (do ambiente ou de .env.local).
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { conexaoPg, env, exigir, projectRef } from './_env.mjs';

const args = process.argv.slice(2);
const APAGAR = args.includes('--apagar');
const projetoArg = args.find((a) => a.startsWith('--projeto='))?.split('=').slice(1).join('=') ?? null;
const UUID = /^pacientes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//;

exigir('DATABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY');
const db = new pg.Client(conexaoPg());
const supa = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
let s3 = null;

function clienteR2() {
  if (!env('R2_ACCOUNT_ID') || !env('R2_ACCESS_KEY_ID') || !env('R2_SECRET_ACCESS_KEY')) return null;
  const teste = process.env.NODE_ENV !== 'production' ? env('ORTUS_TESTE_URL_R2') : '';
  return new S3Client({
    region: 'auto',
    endpoint: teste || `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    forcePathStyle: Boolean(teste),
    credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') },
  });
}

async function listarR2(bucket) {
  const saida = [];
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token, MaxKeys: 1000 }));
    for (const o of r.Contents || []) saida.push(o.Key);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return saida;
}

async function listarStorage(bucket, prefixo = '', saida = [], nivel = 0) {
  if (nivel > 6) return saida;
  const { data, error } = await supa.storage.from(bucket).list(prefixo, { limit: 1000 });
  if (error) throw new Error(error.message);
  for (const item of data || []) {
    const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
    if (item.id) saida.push(caminho);
    else await listarStorage(bucket, caminho, saida, nivel + 1);
  }
  return saida;
}

async function principal() {
  const ref = projectRef() || '(desconhecido)';
  console.log(`=== ORTUS — arquivos órfãos ===\nProjeto Supabase: ${ref}\n${APAGAR ? 'MODO: APAGAR' : 'MODO: só lista (nada é apagado)'}\n`);
  if (APAGAR && projetoArg !== ref) {
    console.error(`Recusado: --projeto=${projetoArg || '(vazio)'} não confere com o projeto deste banco (${ref}).`);
    return 2;
  }

  const pacientes = new Set((await db.query('SELECT id::text AS id FROM public.pacientes')).rows.map((r) => r.id));
  // Caminhos citados em qualquer coluna de texto das tabelas que guardam arquivo.
  const citados = new Set();
  for (const sql of [
    `SELECT caminho AS c FROM public.armazenamento_objetos`,
    `SELECT storage_path AS c FROM public.paciente_documentos WHERE storage_path IS NOT NULL`,
    `SELECT foto_url AS c FROM public.pacientes WHERE foto_url IS NOT NULL`,
  ]) {
    try {
      for (const r of (await db.query(sql)).rows) if (r.c) citados.add(String(r.c));
    } catch {
      /* coluna ou tabela ausente neste banco: segue sem ela */
    }
  }
  const citado = (chave) => [...citados].some((c) => c === chave || c.endsWith(`/${chave}`) || c.includes(`/${chave}?`));
  const orfao = (chave) => {
    const m = chave.match(UUID);
    if (m) return !pacientes.has(m[1]) ? 'paciente não existe' : null;
    if (chave.startsWith('legado/')) return citado(chave) ? null : 'pasta legado sem referência';
    return null;
  };

  s3 = clienteR2();
  const achados = [];
  for (const bucket of [env('R2_BUCKET_PUBLICO'), env('R2_BUCKET_PRIVADO')].filter(Boolean)) {
    if (!s3) {
      console.log(`R2 ${bucket}: não configurado neste ambiente`);
      continue;
    }
    for (const chave of await listarR2(bucket)) {
      const motivo = orfao(chave);
      if (motivo) achados.push({ onde: 'r2', bucket, chave, motivo });
    }
  }
  for (const bucket of ['arquivos_ortus', 'avatars']) {
    try {
      for (const chave of await listarStorage(bucket)) {
        const motivo = orfao(chave);
        if (motivo) achados.push({ onde: 'storage', bucket, chave, motivo });
      }
    } catch (e) {
      console.log(`Storage ${bucket}: não deu para listar (${e.message})`);
    }
  }

  if (!achados.length) {
    console.log('Nenhum arquivo órfão.');
    return 0;
  }
  console.log(`${achados.length} arquivo(s) órfão(s):`);
  for (const a of achados) console.log(`  ${a.onde} ${a.bucket}: ${a.chave} — ${a.motivo}`);
  if (!APAGAR) {
    console.log(`\nNada foi apagado. Para apagar: --apagar --projeto=${ref}`);
    return 0;
  }

  let apagados = 0;
  for (const a of achados) {
    try {
      if (a.onde === 'r2') await s3.send(new DeleteObjectCommand({ Bucket: a.bucket, Key: a.chave }));
      else {
        const { error } = await supa.storage.from(a.bucket).remove([a.chave]);
        if (error) throw error;
      }
      apagados += 1;
    } catch (e) {
      console.warn(`  não apagou ${a.chave}: ${e.message}`);
    }
  }
  console.log(`\n${apagados} de ${achados.length} apagados.`);
  return apagados === achados.length ? 0 : 1;
}

await db.connect();
try {
  process.exitCode = await principal();
} catch (e) {
  console.error('ERRO:', e.message);
  process.exitCode = 1;
} finally {
  await db.end().catch(() => undefined);
  s3?.destroy();
}
