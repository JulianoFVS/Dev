// Utilitários dos testes de ponta a ponta contra o app em http://localhost:3000
// e o ambiente local (Supabase/R2/Resend/provedor falsos).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(AQUI, '..', 'ortus', 'package.json'));
const { createClient } = require('@supabase/supabase-js');

export const env = Object.fromEntries(
  fs.readFileSync(path.join(AQUI, 'env.gerado'), 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
export const APP = process.env.APP || 'http://localhost:3000';
export const TESTE = `${env.NEXT_PUBLIC_SUPABASE_URL}/_teste`;
export const SEGREDO_CRON = 'segredo-do-agendador-local';
export const SENHA = 'Teste@1234';

export const novoCliente = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
export const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

export async function entrar(email, senha = SENHA) {
  const c = novoCliente();
  const { data, error } = await c.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return { c, user: data.user, token: data.session.access_token, email };
}

/** Chama uma rota do app. `quem` é o retorno de entrar() ou null (sem sessão). */
export async function api(quem, caminho, { metodo = 'GET', corpo, cabecalhos = {} } = {}) {
  const r = await fetch(`${APP}${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo !== undefined && !(corpo instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}),
      ...(quem ? { authorization: `Bearer ${quem.token}`, cookie: 'ortus_auth=1' } : {}),
      ...cabecalhos,
    },
    body: corpo === undefined ? undefined : corpo instanceof Uint8Array ? corpo : JSON.stringify(corpo),
    redirect: 'manual',
  });
  const tipo = r.headers.get('content-type') || '';
  let dados;
  if (tipo.includes('json')) dados = await r.json().catch(() => null);
  else dados = new Uint8Array(await r.arrayBuffer());
  return { status: r.status, dados, tipo, cabecalhos: r.headers };
}

export async function sql(texto, params = []) {
  const r = await fetch(`${TESTE}/sql`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto, params }) });
  const d = await r.json();
  if (!r.ok) throw new Error(`sql: ${d.erro}`);
  return d.linhas;
}

export const emails = async () => (await fetch(`${TESTE}/emails`)).json();
export const limparEmails = () => fetch(`${TESTE}/emails`, { method: 'DELETE' });
export const resendFalha = (ligar) => fetch(`${TESTE}/resend-falha?ligar=${ligar ? 1 : 0}`);

let total = 0;
let falhas = 0;
export function ok(nome, cond, extra = '') {
  total += 1;
  if (!cond) falhas += 1;
  console.log(`${cond ? 'OK   ' : 'FALHA'} ${nome}${extra && !cond ? ` — ${extra}` : ''}`);
  return Boolean(cond);
}
export function secao(titulo) { console.log(`\n== ${titulo}`); }
export function fim() {
  console.log(`\n${total - falhas}/${total} verificações OK`);
  process.exit(falhas ? 1 : 0);
}
