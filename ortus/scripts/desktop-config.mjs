#!/usr/bin/env node
/**
 * Gera `desktop/config.json` com a URL do Supabase e a chave ANÔNIMA.
 *
 * A chave anônima é pública por natureza (vai no bundle do navegador). Este
 * script se recusa a gravar qualquer chave de service role — o .exe nunca
 * pode carregar privilégio total.
 *
 * Uso: node scripts/desktop-config.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function lerEnv(nome) {
  if (process.env[nome]) return process.env[nome];
  const arquivo = path.join(raiz, '.env.local');
  if (!fs.existsSync(arquivo)) return '';
  const linha = fs
    .readFileSync(arquivo, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith(`${nome}=`));
  if (!linha) return '';
  return linha.slice(linha.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

/** Lê o payload do JWT para conferir a role. */
function roleDoJwt(token) {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return json.role || '';
  } catch {
    return '';
  }
}

const url = lerEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
const anonKey = lerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

if (!url || !anonKey) {
  console.error(
    'Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (no ambiente ou no .env.local).',
  );
  process.exit(1);
}

const role = roleDoJwt(anonKey);
if (role === 'service_role') {
  console.error(
    'A chave informada é a SERVICE ROLE. O .exe não pode levá-la: use a chave anônima (NEXT_PUBLIC_SUPABASE_ANON_KEY).',
  );
  process.exit(1);
}
if (role && role !== 'anon') {
  console.warn(`Aviso: a chave tem role "${role}" em vez de "anon". Confirme que é a chave pública.`);
}

const destino = path.join(raiz, 'desktop', 'config.json');
fs.writeFileSync(
  destino,
  `${JSON.stringify({ supabaseUrl: url, supabaseAnonKey: anonKey }, null, 2)}\n`,
);

console.log(`desktop/config.json gerado (${url}, role=${role || 'desconhecida'})`);
