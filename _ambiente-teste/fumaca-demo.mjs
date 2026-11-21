// Fumaça da demonstração publicada (DEMO_PUBLICA=1).
//
//   node fumaca-demo.mjs fora                 compra → pagamento → webhook → conta → e-mail, pela internet, sem senha
//   node fumaca-demo.mjs preparar             (na VPS) entra como conta de exemplo e pede um link de envio; imprime { url, caminho, tamanho }
//   node fumaca-demo.mjs confirmar <caminho>  (na VPS) confirma o envio e baixa o arquivo pela rota do app
//   node fumaca-demo.mjs google               (na VPS) a Ana conecta o Google de teste, a fila vai para lá e ela desliga
//
// Na VPS, as chaves e a senha vêm de /etc/ortus-demo/*.env (rodar como ortusdemo). Nada disso é impresso.
import crypto from 'node:crypto';
import fs from 'node:fs';

const SITE = process.env.SITE || 'https://ortus.trinityforce.duckdns.org';
const API = process.env.API || 'https://api.ortus.trinityforce.duckdns.org';
const [modo, arg] = process.argv.slice(2);
let falhas = 0;
const ok = (nome, cond, extra = '') => {
  if (!cond) falhas += 1;
  console.log(`${cond ? 'OK   ' : 'FALHA'} ${nome}${!cond && extra ? ` — ${extra}` : ''}`);
};
const fim = () => { console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo'); process.exit(falhas ? 1 : 0); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function fora() {
  const marca = crypto.randomBytes(3).toString('hex');
  const email = `fumaca.${marca}@exemplo.test`;
  const json = { 'content-type': 'application/json', origin: SITE };

  const vitrine = await fetch(`${SITE}/api/public/assinatura/planos`).then((r) => r.json());
  ok('vitrine: assinatura disponível com os três planos', vitrine.disponivel === true && (vitrine.planos || []).length === 3, JSON.stringify(vitrine).slice(0, 200));

  const outra = await fetch(`${SITE}/api/public/assinatura/checkout`, { method: 'POST', headers: { ...json, origin: 'https://golpe.example' }, body: '{}' });
  ok('compra pedida por outra origem: recusada', outra.status === 403, String(outra.status));

  const r = await fetch(`${SITE}/api/public/assinatura/checkout`, {
    method: 'POST', headers: json,
    body: JSON.stringify({ plano: 'profissional', clinica: `Clínica Fumaça ${marca}`, responsavel: 'Teste Fumaça', email, telefone: '(11) 98888-7777', aceite: true }),
  });
  const compra = await r.json().catch(() => ({}));
  ok('compra aberta: resposta leva à tela do provedor (endereço público)', r.status === 200 && String(compra.url || '').startsWith(`${API}/provedor/pagar?pref=`), JSON.stringify(compra));
  const pref = new URL(compra.url).searchParams.get('pref');

  const tela = await fetch(compra.url).then((x) => x.text());
  ok('tela de pagamento abre com o valor do plano', /Pagar com Pix/.test(tela) && /197,00/.test(tela));

  const pago = await fetch(`${API}/provedor/pagar/acao`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ pref, acao: 'pix' }).toString(),
  });
  const volta = pago.headers.get('location') || '';
  ok('pagar com Pix volta para o retorno do site', pago.status === 303 && volta.startsWith(`${SITE}/checkout/retorno`), `${pago.status} ${volta.slice(0, 80)}`);

  let sit = {};
  for (let i = 0; i < 20; i += 1) {
    sit = await fetch(`${SITE}/api/public/assinatura/pedido?id=${compra.pedido}`).then((x) => x.json()).catch(() => ({}));
    if (sit.conta_criada) break;
    await espera(500);
  }
  ok('webhook assinado chegou, pagamento relido e conta criada', sit.conta_criada === true && sit.pagamento_status === 'aprovado', JSON.stringify(sit));

  const caixa = await fetch(`${API}/caixa?para=${encodeURIComponent(email)}`).then((x) => x.text());
  const link = (caixa.match(/href="(https:\/\/[^"]+\/(?:primeiro-acesso|acesso|auth\/v1\/verify)[^"]*)"/) || [])[1]?.replace(/&amp;/g, '&') || '';
  ok('e-mail de acesso na caixa da demonstração', /Abrir link/.test(caixa) && Boolean(link), caixa.slice(0, 120));
  ok('link do e-mail aponta para o site publicado', link.startsWith(SITE) || link.startsWith(`${API}/auth/v1/verify`), link.slice(0, 80));

  const fechada = await fetch(`${API}/caixa?para=ana.admin@maissorriso.test`).then((x) => x.text());
  ok('caixa de conta de exemplo fica fechada', /caixa dela fica fechada/.test(fechada));

  // Google Agenda: só o consentimento é público; token, agenda e controles de teste, não.
  ok('rotina rápida sem o segredo: 401', (await fetch(`${SITE}/api/rotinas/rapida`)).status === 401);
  const consentimento = await fetch(`${API}/google/o/oauth2/v2/auth?client_id=teste-ortus&redirect_uri=${encodeURIComponent(`${SITE}/api/google/retorno`)}&state=x`);
  ok('consentimento do Google de teste abre pela internet', consentimento.status === 200 && /Permitir/.test(await consentimento.text()));
  for (const caminho of ['/google/_teste/estado', '/google/calendar/v3/calendars/primary/events', '/google/userinfo']) {
    const r = await fetch(`${API}${caminho}`);
    ok(`Google de teste fechado para fora: ${caminho}`, r.status === 403 || r.status === 404, String(r.status));
  }
  const tokenFora = await fetch(`${API}/google/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&client_id=teste-ortus&refresh_token=x' });
  ok('Google de teste fechado para fora: /google/token', tokenFora.status === 403 || tokenFora.status === 404, String(tokenFora.status));
  fim();
}

function lerEnv(arquivo) {
  return Object.fromEntries(fs.readFileSync(arquivo, 'utf8').split('\n').filter((l) => /^[A-Z_0-9]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"(.*)"$/, '$1')]));
}

async function sessao() {
  const web = lerEnv('/etc/ortus-demo/web.env');
  const api = lerEnv('/etc/ortus-demo/api.env');
  const r = await fetch(`http://127.0.0.1:${api.PORTA}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: web.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ana.admin@maissorriso.test', password: api.SENHA_DEMO }),
  });
  const s = await r.json();
  if (!s.access_token) throw new Error(`login falhou (${r.status})`);
  const app = `http://127.0.0.1:${web.PORT}`;
  const chamar = (caminho, init = {}) => fetch(`${app}${caminho}`, {
    ...init, headers: { authorization: `Bearer ${s.access_token}`, cookie: 'ortus_auth=1', 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const pacientes = await fetch(`http://127.0.0.1:${api.PORTA}/rest/v1/pacientes?select=id,nome&order=nome&limit=1`, {
    headers: { apikey: web.NEXT_PUBLIC_SUPABASE_ANON_KEY, authorization: `Bearer ${s.access_token}` },
  }).then((x) => x.json());
  return { chamar, paciente: pacientes[0] };
}

async function preparar() {
  const { chamar, paciente } = await sessao();
  const conteudo = 'arquivo de fumaca da demonstracao\n';
  const caminho = `pacientes/${paciente.id}/documentos/fumaca-${crypto.randomBytes(3).toString('hex')}.txt`;
  const r = await chamar('/api/armazenamento', { method: 'POST', body: JSON.stringify({ acao: 'preparar', caminho, tamanho: Buffer.byteLength(conteudo), contentType: 'text/plain' }) });
  const d = await r.json();
  if (d.modo !== 'r2' || !d.url) throw new Error(`preparar: ${r.status} ${JSON.stringify(d).slice(0, 200)}`);
  process.stdout.write(`${JSON.stringify({ url: d.url, caminho, conteudo })}\n`);
}

async function confirmar(caminho) {
  const { chamar } = await sessao();
  const c = await chamar('/api/armazenamento', { method: 'POST', body: JSON.stringify({ acao: 'confirmar', caminho }) });
  ok('confirmar o envio (cota registrada)', c.ok, `${c.status} ${(await c.text().catch(() => '')).slice(0, 160)}`);
  const b = await chamar(`/api/armazenamento/arquivo?caminho=${encodeURIComponent(caminho)}`, { headers: { 'content-type': '' } });
  const texto = await b.text();
  ok('baixar pela rota do app devolve o mesmo conteúdo', b.ok && texto === 'arquivo de fumaca da demonstracao\n', `${b.status} ${texto.slice(0, 80)}`);
  fim();
}

async function google() {
  const { chamar } = await sessao();
  const st = await chamar('/api/google/status').then((r) => r.json());
  ok('perfil: integração do Google ligada', st.integracao === true, JSON.stringify(st));
  if (st.conectado) await chamar('/api/google/desconectar', { method: 'POST', body: '{}' });
  const con = await chamar('/api/google/conectar', { method: 'POST', body: '{}' }).then((r) => r.json());
  const url = new URL(con.url || 'http://x/');
  ok('conectar leva ao consentimento público com o retorno do site', url.origin === API && url.searchParams.get('redirect_uri') === `${SITE}/api/google/retorno`, con.url || JSON.stringify(con));
  const ida = await fetch(`${con.url}&auto=1&conta=fumaca@google.test`, { redirect: 'manual' });
  const volta = await fetch(ida.headers.get('location') || `${SITE}/`, { redirect: 'manual' });
  ok('o retorno conecta e volta ao perfil', /\/perfil\?google=conectado$/.test(volta.headers.get('location') || ''), `${ida.status} ${volta.status} ${volta.headers.get('location')}`);
  const st2 = await chamar('/api/google/status').then((r) => r.json());
  ok('perfil mostra a conta conectada', st2.conectado === true && st2.email === 'fumaca@google.test', JSON.stringify(st2));
  const envio = await chamar('/api/google/empurrar', { method: 'POST', body: '{}' }).then((r) => r.json());
  ok('as consultas da Ana vão para o Google de teste', envio.enviados > 0 && envio.falhas === 0, JSON.stringify(envio));
  const des = await chamar('/api/google/desconectar', { method: 'POST', body: '{}' });
  const st3 = await chamar('/api/google/status').then((r) => r.json());
  ok('desligar volta ao estado inicial', des.ok && st3.conectado === false, JSON.stringify(st3));
  fim();
}

if (modo === 'fora') await fora();
else if (modo === 'google') await google();
else if (modo === 'preparar') await preparar();
else if (modo === 'confirmar') await confirmar(arg);
else { console.log('uso: node fumaca-demo.mjs fora | preparar | confirmar <caminho> | google'); process.exit(2); }
