// Todas as páginas do app respondem e compilam? (visitante e pessoa logada)
// Uso: node paginas.mjs   — contra http://localhost:3000
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP, entrar, fim, ok, secao } from './util.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const APPDIR = path.join(AQUI, '..', 'ortus', 'app');

// Rotas de página a partir das pastas de app/ (sem rotas dinâmicas, que exigem id).
function rotas(dir, base = '') {
  const saida = [];
  for (const nome of fs.readdirSync(dir)) {
    const cheio = path.join(dir, nome);
    if (!fs.statSync(cheio).isDirectory()) continue;
    if (nome === 'api' || nome.startsWith('_') || nome.startsWith('(') || nome.startsWith('[')) continue;
    const rota = `${base}/${nome}`;
    if (fs.existsSync(path.join(cheio, 'page.tsx'))) saida.push(rota);
    saida.push(...rotas(cheio, rota));
  }
  return saida;
}
const todas = ['/', ...rotas(APPDIR)].sort();
const PUBLICAS = new Set(['/', '/login', '/termos', '/privacidade', '/checkout', '/cadastro', '/acesso', '/checkout/retorno', '/recuperar-senha']);
// Exigem sessão, mas a própria tela confere no navegador (o proxy deixa passar; ver lib/rotasPublicas.ts).
const SEM_CASCA = new Set(['/primeiro-acesso', '/selecao', '/redefinir-senha']);
const ERRO = /Application error|Unhandled Runtime Error|Internal Server Error|Failed to compile|Module not found/i;

async function abrir(rota, cookie) {
  const r = await fetch(`${APP}${rota}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
  const corpo = r.status === 200 ? await r.text() : '';
  return { status: r.status, local: r.headers.get('location') || '', erro: ERRO.test(corpo) };
}

secao(`Visitante (${todas.length} páginas)`);
for (const rota of todas) {
  const r = await abrir(rota);
  if (SEM_CASCA.has(rota)) ok(`${rota} abre e a tela confere a sessão`, r.status === 200 && !r.erro, `${r.status}`);
  else if (PUBLICAS.has(rota)) ok(`${rota} abre sem login`, (r.status === 200 && !r.erro) || (rota === '/cadastro' && r.status === 307), `${r.status} ${r.local}`);
  else ok(`${rota} manda para o login`, r.status === 307 && /\/login/.test(r.local), `${r.status} ${r.local}`);
}

secao('Pessoa logada (a casca decide o resto no navegador)');
await entrar('ana.admin@maissorriso.test');
for (const rota of todas) {
  if (rota === '/cadastro') continue;
  const r = await abrir(rota, 'ortus_auth=1; ortus_modules=*');
  ok(`${rota} compila e responde`, r.status === 200 && !r.erro, `${r.status} ${r.local}`);
}
fim();
