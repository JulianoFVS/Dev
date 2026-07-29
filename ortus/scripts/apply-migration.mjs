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

const migrationFile = process.argv[2] || '20260729_lembretes_horarios_recebimento.sql';
const sqlPath = path.join(root, 'supabase', 'migrations', migrationFile);

if (!fs.existsSync(sqlPath)) {
  console.error('Migration não encontrada:', sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log('Aplicando', migrationFile, '...');
  await client.query(sql);
  console.log('OK — migration aplicada.');
} catch (e) {
  console.error('ERRO:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
