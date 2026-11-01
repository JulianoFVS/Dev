import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CreateBucketCommand, HeadObjectCommand, PutBucketCorsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envTexto = fs.readFileSync(path.join(root, '.env.local'), 'utf8');

function envVal(nome) {
  const linha = envTexto.match(new RegExp(`^${nome}=(.*)$`, 'm'));
  return linha?.[1]?.trim().replace(/^"|"$/g, '') || '';
}

const faltando = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL']
  .filter((nome) => !envVal(nome));
if (faltando.length) {
  console.error('Faltam estas variáveis em .env.local:', faltando.join(', '));
  process.exit(1);
}

const bucketPublico = envVal('R2_BUCKET_PUBLICO') || 'ortus-publico';
const bucketPrivado = envVal('R2_BUCKET_PRIVADO') || 'ortus-privado';
const basePublica = envVal('R2_PUBLIC_URL').replace(/\/$/, '');
const supabaseUrl = envVal('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
const serviceKey = envVal('SUPABASE_SERVICE_ROLE_KEY');

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${envVal('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: envVal('R2_ACCESS_KEY_ID'),
    secretAccessKey: envVal('R2_SECRET_ACCESS_KEY'),
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

function publico(caminho) {
  if (caminho.startsWith('avatares/')) return true;
  if (/^clinicas\/\d+\//.test(caminho)) return true;
  return /^pacientes\/[0-9a-f-]{36}\/avatar\.[a-z0-9]+$/i.test(caminho);
}

function urlNova(caminho) {
  const encoded = caminho.split('/').map(encodeURIComponent).join('/');
  if (basePublica && publico(caminho)) return `${basePublica}/${encoded}`;
  return `/api/public/midia/${encoded}`;
}

function caminhoDeUrl(url) {
  const marcas = [
    ['/object/public/arquivos_ortus/', ''],
    ['/object/public/avatars/', 'avatares/'],
  ];
  for (const [marca, prefixo] of marcas) {
    const i = url.indexOf(marca);
    if (i >= 0) return prefixo + decodeURIComponent(url.slice(i + marca.length).split('?')[0]);
  }
  return null;
}

async function baixarSupabase(bucket, chave) {
  const destino = `${supabaseUrl}/storage/v1/object/${bucket}/${chave.split('/').map(encodeURIComponent).join('/')}`;
  const resposta = await fetch(destino, {
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
  });
  if (!resposta.ok) throw new Error(`Falha ao baixar ${bucket}/${chave} (${resposta.status})`);
  return Buffer.from(await resposta.arrayBuffer());
}

async function jaEstaNoR2(bucket, chave, tamanho) {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: chave }));
    return Number(head.ContentLength || 0) === tamanho;
  } catch (err) {
    if (err?.name === 'NotFound' || err?.name === 'NoSuchKey') return false;
    throw err;
  }
}

async function garantirBucket(bucket) {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (err) {
    if (err?.name !== 'BucketAlreadyOwnedByYou' && err?.name !== 'BucketAlreadyExists') throw err;
  }
  const origens = (envVal('R2_CORS_ORIGENS') || 'http://localhost:3000,http://127.0.0.1:3000,https://ortus.digital,https://www.ortus.digital')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  await s3.send(new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: origens,
        AllowedMethods: ['GET', 'PUT', 'HEAD'],
        AllowedHeaders: ['content-type', 'content-length'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600,
      }],
    },
  }));
}

const db = new pg.Client({ connectionString: envVal('DATABASE_URL'), ssl: { rejectUnauthorized: false } });

const soBuckets = process.argv.includes('--buckets');

try {
  await garantirBucket(bucketPublico);
  await garantirBucket(bucketPrivado);
  if (soBuckets) {
    console.log(`Buckets prontos: ${bucketPublico} e ${bucketPrivado}. Nada foi copiado.`);
    process.exit(0);
  }
  await db.connect();
  const objetos = await db.query(`
    SELECT bucket_id, name, COALESCE((metadata->>'size')::bigint, 0) AS bytes,
           COALESCE(metadata->>'mimetype', 'application/octet-stream') AS tipo
    FROM storage.objects
    WHERE bucket_id IN ('arquivos_ortus', 'avatars')
    ORDER BY bucket_id, name
  `);

  let copiados = 0;
  let pulados = 0;
  for (const item of objetos.rows) {
    const chave = item.bucket_id === 'avatars' ? `avatares/${item.name}` : item.name;
    const bucket = publico(chave) ? bucketPublico : bucketPrivado;
    const tamanho = Number(item.bytes) || 0;
    if (tamanho > 0 && await jaEstaNoR2(bucket, chave, tamanho)) {
      pulados += 1;
    } else {
      const corpo = await baixarSupabase(item.bucket_id, item.name);
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: chave,
        Body: corpo,
        ContentType: item.tipo,
      }));
      copiados += 1;
    }

    if (item.bucket_id === 'arquivos_ortus' && item.name.startsWith('pacientes/')) {
      const paciente = item.name.split('/')[1];
      await db.query(`
        INSERT INTO armazenamento_objetos (caminho, clinica_id, bytes)
        SELECT $1, clinica_id, $2 FROM pacientes WHERE id::text = $3
        ON CONFLICT (caminho) DO UPDATE SET bytes = EXCLUDED.bytes, atualizado_em = now()
      `, [chave, tamanho || 0, paciente]);
    } else if (item.bucket_id === 'avatars') {
      await db.query(`
        INSERT INTO armazenamento_objetos (caminho, clinica_id, bytes)
        VALUES ($1, NULL, $2)
        ON CONFLICT (caminho) DO UPDATE SET bytes = EXCLUDED.bytes, atualizado_em = now()
      `, [chave, tamanho || 0]);
    } else if (item.bucket_id === 'arquivos_ortus' && item.name.startsWith('clinicas/')) {
      const clinica = Number(item.name.split('/')[1]);
      if (Number.isInteger(clinica)) {
        await db.query(`
          INSERT INTO armazenamento_objetos (caminho, clinica_id, bytes)
          VALUES ($1, $2, $3)
          ON CONFLICT (caminho) DO UPDATE SET bytes = EXCLUDED.bytes, atualizado_em = now()
        `, [chave, clinica, tamanho || 0]);
      }
    }
  }

  let reescritos = 0;
  for (const tabela of [
    ['pacientes', 'foto_url', 'id'],
    ['clinicas', 'logo_url', 'id'],
    ['profissionais', 'foto_url', 'id'],
  ]) {
    const [nome, coluna, id] = tabela;
    const linhas = await db.query(`SELECT ${id} AS id, ${coluna} AS url FROM ${nome} WHERE ${coluna} LIKE '%/object/public/%'`);
    for (const linha of linhas.rows) {
      const caminho = caminhoDeUrl(linha.url);
      if (!caminho || !publico(caminho)) continue;
      const versao = linha.url.includes('?') ? linha.url.slice(linha.url.indexOf('?')) : '';
      await db.query(`UPDATE ${nome} SET ${coluna} = $2 WHERE ${id} = $1`, [linha.id, `${urlNova(caminho)}${versao}`]);
      reescritos += 1;
    }
  }

  console.log(`Copiados: ${copiados}. Já estavam iguais: ${pulados}. Links atualizados: ${reescritos}.`);
  console.log(basePublica
    ? 'Fotos e logos passam a abrir direto no R2.'
    : 'Fotos e logos abrem pelo Ortus (/api/public/midia). Para servir direto da Cloudflare, preencha R2_PUBLIC_URL e rode de novo.');
} catch (err) {
  console.error('ERRO:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await db.end();
}
