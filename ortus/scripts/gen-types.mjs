import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env.local');

if (!fs.existsSync(envPath)) {
  console.error('.env.local não encontrado');
  process.exit(1);
}

const env = fs.readFileSync(envPath, 'utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();

if (!dbUrl) {
  console.error('DATABASE_URL ausente em .env.local');
  process.exit(1);
}

const outPath = path.join(root, 'lib', 'database.types.ts');
console.log('Gerando tipos Supabase em lib/database.types.ts ...');

const result = spawnSync(
  'npx',
  ['supabase', 'gen', 'types', 'typescript', '--db-url', dbUrl],
  { cwd: root, encoding: 'utf8', shell: true },
);

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'Falha ao gerar tipos');
  process.exit(result.status || 1);
}

fs.writeFileSync(outPath, result.stdout, 'utf8');
console.log('OK —', outPath);
