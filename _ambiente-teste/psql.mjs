// Mini "psql" para o Postgres local de teste: node psql.mjs "SQL" [--como email]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ortus', 'package.json'));
const pg = require('pg');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', ssl: false });
await db.connect();
const args = process.argv.slice(2);
const i = args.indexOf('--como');
const como = i >= 0 ? args[i + 1] : null;
const sqls = args.filter((a, k) => k !== i && k !== i + 1);
try {
  await db.query('BEGIN');
  if (como) {
    const u = (await db.query('SELECT id, email FROM auth.users WHERE email = $1', [como])).rows[0];
    if (!u) throw new Error('usuário não encontrado: ' + como);
    await db.query('SET LOCAL ROLE authenticated');
    await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: u.id, email: u.email, role: 'authenticated' })]);
  }
  for (const s of sqls) {
    const r = await db.query(s);
    console.log(JSON.stringify(r.rows ?? r, null, 0), r.rowCount != null ? `(linhas: ${r.rowCount})` : '');
  }
} catch (e) {
  console.log('ERRO:', e.message, e.code || '');
} finally {
  await db.query('ROLLBACK').catch(() => {});
  await db.end();
}
