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
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { segredosDoConstrutor } from './desktop-verificar.mjs';

const require = createRequire(import.meta.url);
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// A mesma regra que o aplicativo aplica ao abrir (desktop/main.cjs).
const { chaveDeServidor, papelDoJwt } = require(path.join(raiz, 'desktop', 'lib', 'chavePublica.cjs'));

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

const url = lerEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
const anonKey = lerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

if (!url || !anonKey) {
  console.error(
    'Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (no ambiente ou no .env.local).',
  );
  process.exit(1);
}

// JWT com papel service_role ou chave no formato novo `sb_secret_…`.
const role = papelDoJwt(anonKey);
if (chaveDeServidor(anonKey)) {
  console.error(
    'A chave informada é de servidor (service_role ou sb_secret_). O .exe não pode levá-la: use a chave anônima (NEXT_PUBLIC_SUPABASE_ANON_KEY).',
  );
  process.exit(1);
}
// Alguém colou, no lugar da chave pública, o valor de uma variável que é segredo.
const trocada = segredosDoConstrutor({ raiz }).find((segredo) => segredo.valor === anonKey.trim());
if (trocada) {
  console.error(
    `NEXT_PUBLIC_SUPABASE_ANON_KEY tem o mesmo valor de ${trocada.nome}, que é segredo do servidor. Use a chave anônima.`,
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
