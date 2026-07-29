import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!url) {
  console.error('DATABASE_URL not found');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

const CHECK_TABLES = [
  'configuracoes_clinica', 'comissoes_regras', 'comissoes_lancamentos', 'tarefas',
  'tratamentos_base', 'planos', 'agendamentos', 'permissoes_modulos', 'especialidades',
  'planos_tratamentos', 'audit_log', 'servicos',
];

try {
  await client.connect();
  const { rows: tables } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY 1
  `);
  const names = tables.map((r) => r.table_name);
  console.log('=== TABLES (' + names.length + ') ===');
  console.log(names.join('\n'));
  console.log('\n=== CHECK ===');
  for (const t of CHECK_TABLES) {
    console.log(`${t}: ${names.includes(t) ? 'OK' : 'MISSING'}`);
  }
  const { rows: agCols } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agendamentos'
    ORDER BY ordinal_position
  `);
  console.log('\n=== agendamentos columns ===');
  console.log(agCols.map((r) => r.column_name).join(', '));
  const { rows: cfgKeys } = await client.query(`
    SELECT DISTINCT chave FROM configuracoes_clinica ORDER BY 1
  `);
  console.log('\n=== configuracoes_clinica keys ===');
  console.log(cfgKeys.map((r) => r.chave).join(', ') || '(empty)');
  const { rows: migrations } = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
    ) AS has_migrations_table
  `);
  console.log('\n=== supabase_migrations tracking ===', migrations[0]?.has_migrations_table ? 'YES' : 'NO');
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
