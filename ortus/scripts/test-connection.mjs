import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const directUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
const ref = env.match(/SUPABASE_PROJECT_REF=(.+)/)?.[1]?.trim() || 'vjqeekvoxddxwvbazwlt';
const passMatch = directUrl?.match(/postgres:([^@]+)@/);
const password = passMatch ? decodeURIComponent(passMatch[1]) : null;

if (!password) {
  console.error('Could not parse password from DATABASE_URL');
  process.exit(1);
}

const candidates = [
  directUrl,
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-sa-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres`,
];

for (const url of candidates) {
  const label = url.includes('pooler') ? 'pooler' : 'direct';
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const r = await client.query('SELECT current_database(), version()');
    console.log('OK:', label, r.rows[0].current_database);
    console.log('WORKING_URL_PREFIX:', url.split('@')[0].replace(password, '***') + '@' + url.split('@')[1]);
    await client.end();
    process.exit(0);
  } catch (e) {
    console.log('FAIL:', label, e.message);
    try { await client.end(); } catch {}
  }
}
process.exit(1);
