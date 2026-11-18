import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { conexaoPg } from './_env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const migrationFile = process.argv[2] || '20260729_lembretes_horarios_recebimento.sql';
const sqlPath = path.join(root, 'supabase', 'migrations', migrationFile);

if (!fs.existsSync(sqlPath)) {
  console.error('Migration não encontrada:', sqlPath);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, 'utf8');
const client = new pg.Client(conexaoPg());

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
