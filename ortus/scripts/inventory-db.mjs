/** Inventário rápido do banco — só leitura */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const url = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!url) { console.error('DATABASE_URL ausente'); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();

  const { rows: tables } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY 1
  `);

  console.log('=== CONTAGEM POR TABELA ===');
  for (const { table_name } of tables) {
    try {
      const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM "${table_name}"`);
      console.log(`${table_name}: ${rows[0].n}`);
    } catch {
      console.log(`${table_name}: (erro ao contar)`);
    }
  }

  console.log('\n=== CLÍNICAS ===');
  const { rows: clinicas } = await client.query(`
    SELECT id, nome, created_at::date AS criado
    FROM clinicas ORDER BY id
  `);
  clinicas.forEach(c => console.log(`  [${c.id}] ${c.nome} | ${c.criado}`));

  const { rows: profs } = await client.query(`
    SELECT p.id, p.nome, p.email, p.user_id, COALESCE(p.is_super_admin, false) AS is_super_admin
    FROM profissionais p ORDER BY p.id
  `);
  profs.forEach(p => console.log(`  [${p.id}] ${p.nome} | ${p.email || '-'} | super=${p.is_super_admin}`));

  console.log('\n=== AUTH USERS (contagem) ===');
  const { rows: authCount } = await client.query(`SELECT COUNT(*)::int AS n FROM auth.users`);
  console.log(`  Total logins: ${authCount[0].n}`);

  console.log('\n=== PACIENTES (amostra) ===');
  const { rows: pacs } = await client.query(`
    SELECT COUNT(*)::int AS total FROM pacientes
  `);
  console.log(`  Total: ${pacs[0].total}`);

  console.log('\n=== AGENDAMENTOS ===');
  const { rows: ags } = await client.query(`
    SELECT status, COUNT(*)::int AS n FROM agendamentos GROUP BY status ORDER BY n DESC
  `);
  ags.forEach(a => console.log(`  ${a.status}: ${a.n}`));

} catch (e) {
  console.error('ERRO:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
