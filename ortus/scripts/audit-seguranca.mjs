import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const url = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!url) {
  console.error('DATABASE_URL ausente em .env.local');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();

  const semRls = await client.query(`
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
    ORDER BY 1`);
  console.log('== Tabelas public SEM RLS ==');
  for (const r of semRls.rows) console.log('-', r.relname);

  const abertas = await client.query(`
    SELECT tablename, policyname, cmd, roles::text AS roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        roles::text LIKE '%anon%' OR roles::text = '{public}'
      )
      AND (coalesce(qual, '') IN ('true', '') OR coalesce(with_check, '') = 'true')
    ORDER BY 1, 2`);
  console.log('\n== Políticas abertas (anon/public com true) ==');
  for (const p of abertas.rows) console.log(`- ${p.tablename}.${p.policyname} [${p.cmd}] ${p.roles} using=${p.qual ?? '-'} check=${p.with_check ?? '-'}`);

  const autenticadoTrue = await client.query(`
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles::text LIKE '%authenticated%'
      AND (qual = 'true' OR with_check = 'true')
    ORDER BY 1, 2`);
  console.log('\n== Políticas "true" para qualquer usuário logado ==');
  for (const p of autenticadoTrue.rows) console.log(`- ${p.tablename}.${p.policyname} [${p.cmd}]`);

  const grantsAnon = await client.query(`
    SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'anon'
    GROUP BY 1 ORDER BY 1`);
  console.log('\n== Permissões do papel anon (sem login) ==');
  for (const g of grantsAnon.rows) console.log(`- ${g.table_name}: ${g.privs}`);

  const definer = await client.query(`
    SELECT p.proname, array_to_string(p.proconfig, ',') AS cfg,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
    ORDER BY 1`);
  console.log('\n== Funções SECURITY DEFINER ==');
  for (const f of definer.rows) console.log(`- ${f.proname} anon=${f.anon_exec} search_path=${f.cfg || 'NÃO FIXADO'}`);
} catch (e) {
  console.error('ERRO:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
