import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env.local'), 'utf8');
const url = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();

if (!url) {
  console.error('DATABASE_URL ausente em .env.local');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();

  const politicas = await client.query(`
    SELECT policyname, cmd, roles::text AS roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    ORDER BY policyname`);
  console.log('== Políticas de storage.objects ==');
  for (const p of politicas.rows) {
    console.log(`- ${p.policyname} [${p.cmd}] ${p.roles}`);
    if (p.qual) console.log(`    using: ${p.qual}`);
    if (p.with_check) console.log(`    check: ${p.with_check}`);
  }

  const buckets = await client.query(`SELECT id, public, file_size_limit FROM storage.buckets ORDER BY id`);
  console.log('\n== Buckets ==');
  for (const b of buckets.rows) console.log(`- ${b.id} público=${b.public} limite_arquivo=${b.file_size_limit ?? 'sem'}`);

  const uso = await client.query(`
    SELECT bucket_id, split_part(name, '/', 1) AS pasta, count(*)::int AS arquivos,
           round(sum(COALESCE((metadata->>'size')::bigint, 0)) / 1048576.0, 2) AS mb
    FROM storage.objects
    GROUP BY 1, 2
    ORDER BY 1, 2`);
  console.log('\n== Uso por bucket e pasta ==');
  for (const u of uso.rows) console.log(`- ${u.bucket_id}/${u.pasta}: ${u.arquivos} arquivos, ${u.mb} MB`);

  const colunas = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clinicas' ORDER BY ordinal_position`);
  console.log('\n== Colunas de clinicas ==');
  console.log(colunas.rows.map((c) => c.column_name).join(', '));

  const temLimite = colunas.rows.some((c) => c.column_name === 'limite_armazenamento_mb');
  if (temLimite) {
    const porClinica = await client.query(`
      SELECT c.id, c.limite_armazenamento_mb AS limite_mb,
             round(public.armazenamento_uso_clinica(c.id) / 1048576.0, 2) AS usado_mb
      FROM clinicas c ORDER BY c.id`);
    console.log('\n== Uso por clínica ==');
    for (const c of porClinica.rows) console.log(`- clínica ${c.id}: ${c.usado_mb} MB de ${c.limite_mb} MB`);
  }
} catch (e) {
  console.error('ERRO:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
