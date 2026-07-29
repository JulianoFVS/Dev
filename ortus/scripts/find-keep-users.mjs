import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const url = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

for (const term of ['julia', 'juliano', 'gabriel']) {
  const { rows } = await client.query(`
    SELECT p.id, p.nome, p.user_id, u.email AS auth_email
    FROM profissionais p
    LEFT JOIN auth.users u ON u.id = p.user_id
    WHERE p.nome ILIKE $1 OR u.email ILIKE $2
    ORDER BY p.id
  `, [`%${term}%`, `%${term}%`]);
  console.log(`\n=== ${term.toUpperCase()} ===`);
  rows.forEach(r => console.log(`  prof[${r.id}] ${r.nome} | auth: ${r.auth_email || '-'}`));
}

const { rows: authOnly } = await client.query(`
  SELECT id, email, raw_user_meta_data->>'nome' AS nome FROM auth.users
  WHERE email ILIKE '%julia%' OR raw_user_meta_data->>'nome' ILIKE '%julia%'
`);
console.log('\n=== AUTH JULIA ===');
authOnly.forEach(r => console.log(`  ${r.email} | ${r.nome || '-'}`));

await client.end();
