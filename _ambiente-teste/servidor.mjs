// Ambiente local de teste do Ortus: imita o Supabase (auth, dados, storage),
// o R2 (S3), a Resend e o provedor de pagamento, tudo em 127.0.0.1.
//
//   node servidor.mjs            sobe tudo (HTTP :54321, Postgres :54322)
//
// Nada daqui toca serviço externo nem o banco de produção.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirBanco } from './banco.mjs';
import { Rest, respostaDeErro } from './rest.mjs';
import { CHAVE_ANON, CHAVE_SERVICO, tokenDeUsuario, verificar } from './jwt.mjs';
import { semear, USUARIOS } from './seed.mjs';
import { criarProvedorFalso } from './provedor.mjs';
import { criarGoogleFalso } from './google.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORTA || 54321);
const PORTA_PG = Number(process.env.PORTA_PG || 54322);
// Endereço que sai nos links (e-mail, tela de pagamento). Na demonstração
// pública é o https do proxy; o servidor continua escutando só em 127.0.0.1.
const BASE = (process.env.BASE_PUBLICA || `http://127.0.0.1:${PORTA}`).replace(/\/$/, '');
// Demonstração pública (DEMO_PUBLICA=1): sem SQL aberto nem controles de teste,
// caixa de e-mails só para leitura, memória com teto.
const DEMO = process.env.DEMO_PUBLICA === '1';
// Os valores fixos do ambiente local (segredo do JWT, senha das contas de
// exemplo) estão no repositório: a demonstração pública não sobe sem os dela.
if (DEMO) {
  const faltam = ['SEGREDO_JWT', 'SENHA_DEMO', 'S3_CHAVE_DEMO', 'S3_SEGREDO_DEMO'].filter((v) => !String(process.env[v] || '').trim());
  if (faltam.length) {
    console.error(`DEMO_PUBLICA=1 exige ${faltam.join(', ')} no ambiente: os valores locais são públicos.`);
    process.exit(1);
  }
}
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const LIMITE_OBJETOS = Number(process.env.LIMITE_OBJETOS_MB || 200) * 1024 * 1024;

const { db, erros } = await abrirBanco({ silencioso: true, ate: process.env.ATE || null });
if (erros.length) {
  console.error('Migrations com erro:', erros);
  process.exit(1);
}

// SQL extra do ambiente (migrations novas em teste entram pela pasta do projeto).
// ---------------------------------------------------------------------------
// Exclusão mútua: o PGlite atende uma conexão; cada requisição vira uma
// transação com o papel e as claims aplicados, como faz o PostgREST.
// ---------------------------------------------------------------------------
let fila = Promise.resolve();
function exclusivo(fn) {
  const p = fila.then(fn, fn);
  fila = p.catch(() => undefined);
  return p;
}

function executar(claims, fn) {
  return exclusivo(async () => {
    const papel = claims?.role === 'service_role' ? 'service_role' : claims?.role === 'authenticated' ? 'authenticated' : 'anon';
    await db.exec('BEGIN');
    try {
      await db.exec(`SET LOCAL ROLE ${papel}`);
      await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims || {})]);
      const r = await fn(db);
      await db.exec('COMMIT');
      return r;
    } catch (e) {
      await db.exec('ROLLBACK').catch(() => undefined);
      throw e;
    }
  });
}

/** SQL direto como dono do banco (semente, auth, utilitários de teste). */
function sql(texto, params = []) {
  return exclusivo(() => db.query(texto, params));
}

const rest = new Rest(executar);
await exclusivo(() => rest.carregarCatalogo(db));

// ---------------------------------------------------------------------------
// Estado em memória dos serviços falsos
// ---------------------------------------------------------------------------
const estado = {
  emails: [],            // caixa de saída (Resend + e-mails do Auth)
  refresh: new Map(),    // refresh_token -> user_id
  convites: new Map(),   // token de verificação -> { user_id, tipo, redirect }
  objetos: new Map(),    // `${bucket}/${chave}` -> { bytes, contentType }
  falharResend: false,
  requisicoes: [],
};
const provedor = criarProvedorFalso({ base: BASE });
const google = criarGoogleFalso({ base: BASE });

/** Caixa de saída. Na demonstração guarda só as últimas 500 mensagens. */
function guardarEmail(mensagem) {
  estado.emails.push(mensagem);
  if (DEMO && estado.emails.length > 500) estado.emails.splice(0, estado.emails.length - 500);
}

/** Como a lista de URLs permitidas do GoTrue: na demonstração, o link só volta para o próprio app. */
function destinoPermitido(destino) {
  if (!DEMO) return destino;
  try {
    const u = new URL(destino);
    if (u.origin === new URL(APP_URL).origin) return u.toString();
  } catch { /* cai no endereço do app */ }
  return `${APP_URL}/`;
}

function hashSenha(senha) {
  return crypto.createHash('sha256').update(`ortus-local:${senha}`).digest('hex');
}

function usuarioPublico(u) {
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: u.email_confirmed_at,
    confirmed_at: u.email_confirmed_at,
    last_sign_in_at: u.last_sign_in_at,
    app_metadata: { provider: 'email', providers: ['email'], ...(u.raw_app_meta_data || {}) },
    user_metadata: u.raw_user_meta_data || {},
    identities: [],
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}

function sessao(u) {
  const refresh = crypto.randomBytes(24).toString('base64url');
  estado.refresh.set(refresh, u.id);
  const agora = Math.floor(Date.now() / 1000);
  return {
    access_token: tokenDeUsuario(u),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: agora + 3600,
    refresh_token: refresh,
    user: usuarioPublico(u),
  };
}

async function usuarioPorId(id) {
  return (await sql('SELECT * FROM auth.users WHERE id = $1', [id])).rows[0] || null;
}
async function usuarioPorEmail(email) {
  return (await sql('SELECT * FROM auth.users WHERE lower(email) = lower($1)', [email])).rows[0] || null;
}

function ler(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    req.on('data', (c) => partes.push(c));
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

function claimsDe(req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : String(req.headers.apikey || '');
  const payload = verificar(token);
  return { token, payload };
}

function json(res, status, corpo, extra = {}) {
  const texto = corpo === null || corpo === undefined ? '' : JSON.stringify(corpo);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra });
  res.end(texto);
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS',
  'access-control-expose-headers': 'content-range, etag',
};

// ---------------------------------------------------------------------------
// Auth (GoTrue)
// ---------------------------------------------------------------------------
async function auth(req, res, url, corpoBruto) {
  const caminho = url.pathname.replace(/^\/auth\/v1/, '');
  const corpo = corpoBruto.length ? JSON.parse(corpoBruto.toString('utf8') || '{}') : {};
  const { payload } = claimsDe(req);
  const ehServico = payload?.role === 'service_role';

  if (caminho === '/token' && url.searchParams.get('grant_type') === 'password') {
    const u = await usuarioPorEmail(corpo.email || '');
    if (!u || u.encrypted_password !== hashSenha(corpo.password || '')) {
      return json(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (!u.email_confirmed_at) return json(res, 400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
    await sql('UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1', [u.id]);
    return json(res, 200, sessao(u));
  }
  if (caminho === '/token' && url.searchParams.get('grant_type') === 'refresh_token') {
    const id = estado.refresh.get(corpo.refresh_token || '');
    const u = id ? await usuarioPorId(id) : null;
    if (!u) return json(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
    estado.refresh.delete(corpo.refresh_token);
    return json(res, 200, sessao(u));
  }
  if (caminho === '/logout') return json(res, 204, null);

  if (caminho === '/user' && req.method === 'GET') {
    if (payload?.role !== 'authenticated') return json(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
    const u = await usuarioPorId(payload.sub);
    if (!u) return json(res, 403, { code: 403, error_code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' });
    return json(res, 200, usuarioPublico(u));
  }
  if (caminho === '/user' && req.method === 'PUT') {
    if (payload?.role !== 'authenticated') return json(res, 401, { code: 401, msg: 'invalid JWT' });
    if (corpo.password) {
      if (String(corpo.password).length < 6) return json(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
      await sql('UPDATE auth.users SET encrypted_password = $2, updated_at = now() WHERE id = $1', [payload.sub, hashSenha(corpo.password)]);
    }
    if (corpo.data) await sql('UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data || $2::jsonb WHERE id = $1', [payload.sub, JSON.stringify(corpo.data)]);
    return json(res, 200, usuarioPublico(await usuarioPorId(payload.sub)));
  }
  if (caminho === '/recover') {
    const u = await usuarioPorEmail(corpo.email || '');
    if (u) {
      const token = crypto.randomBytes(16).toString('hex');
      estado.convites.set(token, { user_id: u.id, tipo: 'recovery', redirect: url.searchParams.get('redirect_to') || '' });
      guardarEmail({ origem: 'supabase-auth', tipo: 'recovery', to: [u.email], subject: 'Redefinir senha', link: `${BASE}/auth/v1/verify?token=${token}&type=recovery`, em: new Date().toISOString() });
    }
    return json(res, 200, {});
  }
  if (caminho === '/verify' && req.method === 'POST') {
    // supabase.auth.verifyOtp({ token_hash, type }) — o link de e-mail aberto dentro do próprio app.
    const token = corpo.token_hash || corpo.token || '';
    const reg = estado.convites.get(token);
    if (!reg || (corpo.type && reg.tipo !== corpo.type)) {
      return json(res, 403, { code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' });
    }
    estado.convites.delete(token);
    await sql('UPDATE auth.users SET email_confirmed_at = coalesce(email_confirmed_at, now()), last_sign_in_at = now() WHERE id = $1', [reg.user_id]);
    return json(res, 200, sessao(await usuarioPorId(reg.user_id)));
  }
  if (caminho === '/verify' && req.method === 'GET') {
    const token = url.searchParams.get('token') || '';
    const reg = estado.convites.get(token);
    const destino = destinoPermitido(url.searchParams.get('redirect_to') || reg?.redirect || `${APP_URL}/`);
    if (!reg) {
      res.writeHead(303, { location: `${destino}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired` });
      return res.end();
    }
    estado.convites.delete(token);
    await sql('UPDATE auth.users SET email_confirmed_at = coalesce(email_confirmed_at, now()), last_sign_in_at = now() WHERE id = $1', [reg.user_id]);
    const s = sessao(await usuarioPorId(reg.user_id));
    const hash = new URLSearchParams({
      access_token: s.access_token, refresh_token: s.refresh_token, expires_in: '3600',
      expires_at: String(s.expires_at), token_type: 'bearer', type: reg.tipo,
    });
    res.writeHead(303, { location: `${destino}#${hash.toString()}` });
    return res.end();
  }

  // ----- rotas administrativas (service role) -----
  if (caminho === '/invite' && req.method === 'POST') {
    if (!ehServico) return json(res, 401, { code: 401, msg: 'not admin' });
    if (await usuarioPorEmail(corpo.email || '')) {
      return json(res, 422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
    }
    const novo = (await sql(
      `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data) VALUES (lower($1), $2, $3::jsonb) RETURNING *`,
      [corpo.email, hashSenha(crypto.randomBytes(12).toString('hex')), JSON.stringify(corpo.data || {})],
    )).rows[0];
    const token = crypto.randomBytes(16).toString('hex');
    const redirect = url.searchParams.get('redirect_to') || '';
    estado.convites.set(token, { user_id: novo.id, tipo: 'invite', redirect });
    guardarEmail({
      origem: 'supabase-auth', tipo: 'invite', to: [novo.email], subject: 'Confirme sua conta',
      link: `${BASE}/auth/v1/verify?token=${token}&type=invite${redirect ? `&redirect_to=${encodeURIComponent(redirect)}` : ''}`,
      em: new Date().toISOString(),
    });
    return json(res, 200, usuarioPublico(novo));
  }
  if (caminho === '/admin/generate_link' && req.method === 'POST') {
    if (!ehServico) return json(res, 401, { code: 401, msg: 'not admin' });
    let u = await usuarioPorEmail(corpo.email || '');
    if (!u && (corpo.type === 'invite' || corpo.type === 'signup')) {
      u = (await sql(
        `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data) VALUES (lower($1), $2, $3::jsonb) RETURNING *`,
        [corpo.email, hashSenha(corpo.password || crypto.randomBytes(12).toString('hex')), JSON.stringify(corpo.data || {})],
      )).rows[0];
    }
    if (!u) return json(res, 404, { code: 404, error_code: 'user_not_found', msg: 'User not found' });
    const token = crypto.randomBytes(16).toString('hex');
    for (const [antigo, reg] of estado.convites) if (reg.user_id === u.id && reg.tipo === corpo.type) estado.convites.delete(antigo);
    estado.convites.set(token, { user_id: u.id, tipo: corpo.type, redirect: corpo.redirect_to || '' });
    const link = `${BASE}/auth/v1/verify?token=${token}&type=${corpo.type}${corpo.redirect_to ? `&redirect_to=${encodeURIComponent(corpo.redirect_to)}` : ''}`;
    return json(res, 200, { ...usuarioPublico(u), action_link: link, email_otp: '000000', hashed_token: token, verification_type: corpo.type, redirect_to: corpo.redirect_to || '' });
  }
  const adm = caminho.match(/^\/admin\/users(?:\/([0-9a-f-]{36}))?$/);
  if (adm) {
    if (!ehServico) return json(res, 401, { code: 401, error_code: 'not_admin', msg: 'User not allowed' });
    const id = adm[1];
    if (!id && req.method === 'POST') {
      if (await usuarioPorEmail(corpo.email || '')) {
        return json(res, 422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
      }
      const novo = (await sql(
        `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data, raw_app_meta_data, email_confirmed_at)
         VALUES (lower($1), $2, $3::jsonb, $5::jsonb, CASE WHEN $4::boolean THEN now() END) RETURNING *`,
        [corpo.email, hashSenha(corpo.password || crypto.randomBytes(12).toString('hex')), JSON.stringify(corpo.user_metadata || {}), corpo.email_confirm === true,
          JSON.stringify(corpo.app_metadata || {})],
      )).rows[0];
      return json(res, 200, usuarioPublico(novo));
    }
    if (!id && req.method === 'GET') {
      const todos = (await sql('SELECT * FROM auth.users ORDER BY created_at')).rows;
      return json(res, 200, { users: todos.map(usuarioPublico), aud: 'authenticated' });
    }
    const u = id ? await usuarioPorId(id) : null;
    if (!u) return json(res, 404, { code: 404, error_code: 'user_not_found', msg: 'User not found' });
    if (req.method === 'GET') return json(res, 200, usuarioPublico(u));
    if (req.method === 'PUT') {
      if (corpo.email) await sql('UPDATE auth.users SET email = lower($2) WHERE id = $1', [id, corpo.email]);
      if (corpo.password) await sql('UPDATE auth.users SET encrypted_password = $2 WHERE id = $1', [id, hashSenha(corpo.password)]);
      if (corpo.email_confirm) await sql('UPDATE auth.users SET email_confirmed_at = coalesce(email_confirmed_at, now()) WHERE id = $1', [id]);
      if (corpo.user_metadata) await sql('UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data || $2::jsonb WHERE id = $1', [id, JSON.stringify(corpo.user_metadata)]);
      if (corpo.app_metadata) await sql('UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || $2::jsonb WHERE id = $1', [id, JSON.stringify(corpo.app_metadata)]);
      return json(res, 200, usuarioPublico(await usuarioPorId(id)));
    }
    if (req.method === 'DELETE') {
      await sql('DELETE FROM auth.users WHERE id = $1', [id]);
      return json(res, 200, {});
    }
  }
  return json(res, 404, { code: 404, msg: `auth: rota não implementada no ambiente de teste (${req.method} ${caminho})` });
}

// ---------------------------------------------------------------------------
// Storage do Supabase (só o que o Ortus usa como fallback) e S3 (R2)
// ---------------------------------------------------------------------------
async function storage(req, res, url, corpoBruto = Buffer.alloc(0)) {
  const lerCorpoStorage = async () => corpoBruto.toString('utf8');
  const caminho = url.pathname.replace(/^\/storage\/v1/, '');
  const m = caminho.match(/^\/object\/(?:authenticated\/|public\/|sign\/)?([^/]+)\/(.+)$/);
  if (m && req.method === 'GET') {
    const obj = estado.objetos.get(`supabase:${m[1]}/${decodeURIComponent(m[2])}`);
    if (!obj) return json(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    res.writeHead(200, { 'content-type': obj.contentType, ...CORS });
    return res.end(obj.bytes);
  }
  // supabase.storage.from(b).list(prefixo): pastas vêm com id null, arquivos com id e metadata.size
  const lista = caminho.match(/^\/object\/list\/([^/]+)$/);
  if (lista && req.method === 'POST') {
    const corpo = JSON.parse((await lerCorpoStorage(req)) || '{}');
    const prefixo = String(corpo.prefix || '').replace(/\/$/, '');
    const base = `supabase:${lista[1]}/${prefixo ? `${prefixo}/` : ''}`;
    const vistos = new Map();
    for (const [chave, obj] of estado.objetos) {
      if (!chave.startsWith(base)) continue;
      const resto = chave.slice(base.length);
      const [nome, ...sub] = resto.split('/');
      if (!nome) continue;
      if (sub.length) vistos.set(nome, { name: nome, id: null, metadata: null });
      else vistos.set(nome, { name: nome, id: crypto.createHash('md5').update(chave).digest('hex'), metadata: { size: obj.bytes.length, mimetype: obj.contentType } });
    }
    return json(res, 200, [...vistos.values()].slice(0, Number(corpo.limit) || 100));
  }
  const apagar = caminho.match(/^\/object\/([^/]+)$/);
  if (apagar && req.method === 'DELETE') {
    const corpo = JSON.parse((await lerCorpoStorage(req)) || '{}');
    const removidos = [];
    for (const nome of corpo.prefixes || []) {
      if (estado.objetos.delete(`supabase:${apagar[1]}/${nome}`)) removidos.push({ name: nome });
    }
    return json(res, 200, removidos);
  }
  if (req.method === 'DELETE') return json(res, 200, []);
  return json(res, 404, { statusCode: '404', error: 'not_found', message: `storage: ${req.method} ${caminho}` });
}

function xml(res, status, texto) {
  res.writeHead(status, { 'content-type': 'application/xml', ...CORS });
  res.end(texto);
}

// Na demonstração, de fora da máquina só entra PUT com link assinado de
// verdade (SigV4, como o R2 confere). Ler, listar e apagar ficam para o site,
// que chama o S3 a partir da própria máquina.
const S3_CHAVE = process.env.S3_CHAVE_DEMO || '';
const S3_SEGREDO = process.env.S3_SEGREDO_DEMO || '';
const IPS_INTERNOS = (process.env.IPS_INTERNOS || '127.,10.,::1').split(',').map((s) => s.trim()).filter(Boolean);

/** Veio da própria máquina? Sem X-Real-IP o pedido não passou pelo Nginx (só quem está na máquina alcança 127.0.0.1). */
function interno(req) {
  const ip = String(req.headers['x-real-ip'] || '').trim();
  if (!ip) return true;
  return IPS_INTERNOS.some((p) => ip === p || ip.startsWith(p));
}

const rfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (chave, texto) => crypto.createHmac('sha256', chave).update(texto).digest();

function assinaturaS3Valida(req) {
  const bruto = String(req.url || '');
  const i = bruto.indexOf('?');
  const caminho = i < 0 ? bruto : bruto.slice(0, i);
  const q = new URLSearchParams(i < 0 ? '' : bruto.slice(i + 1));
  const credencial = (q.get('X-Amz-Credential') || '').split('/');
  const data = q.get('X-Amz-Date') || '';
  const expira = Number(q.get('X-Amz-Expires') || 0);
  const cabecalhos = (q.get('X-Amz-SignedHeaders') || '').split(';').filter(Boolean);
  const assinatura = q.get('X-Amz-Signature') || '';
  const [chave, dia, regiao, servico, fim] = credencial;
  if (q.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256' || !assinatura || !cabecalhos.includes('host')) return false;
  if (!S3_SEGREDO || chave !== S3_CHAVE || fim !== 'aws4_request' || !/^\d{8}$/.test(dia || '')) return false;
  const m = data.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m || !data.startsWith(dia)) return false;
  const emitido = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (!(expira > 0 && expira <= 3600) || Date.now() > emitido + expira * 1000 || emitido > Date.now() + 5 * 60_000) return false;
  const pares = [];
  for (const [k, v] of q) if (k !== 'X-Amz-Signature') pares.push([rfc3986(k), rfc3986(v)]);
  pares.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1));
  const linhas = cabecalhos.map((h) => `${h}:${String(req.headers[h] ?? '').trim().replace(/\s+/g, ' ')}\n`).join('');
  const canonico = [req.method, caminho, pares.map(([k, v]) => `${k}=${v}`).join('&'), linhas, cabecalhos.join(';'),
    q.get('X-Amz-Content-Sha256') || 'UNSIGNED-PAYLOAD'].join('\n');
  const texto = ['AWS4-HMAC-SHA256', data, `${dia}/${regiao}/${servico}/aws4_request`, crypto.createHash('sha256').update(canonico).digest('hex')].join('\n');
  const k = hmac(hmac(hmac(hmac(`AWS4${S3_SEGREDO}`, dia), regiao), servico), 'aws4_request');
  const esperado = Buffer.from(crypto.createHmac('sha256', k).update(texto).digest('hex'));
  const recebido = Buffer.from(assinatura);
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}

async function s3(req, res, url, corpo) {
  if (DEMO && !interno(req)) {
    if (req.method !== 'PUT') return xml(res, 403, '<Error><Code>AccessDenied</Code><Message>Na demonstração, arquivo só se lê pelo site.</Message></Error>');
    if (!assinaturaS3Valida(req)) return xml(res, 403, '<Error><Code>SignatureDoesNotMatch</Code><Message>Link de envio inválido ou vencido.</Message></Error>');
  }
  const resto = decodeURIComponent(url.pathname.replace(/^\/s3\//, ''));
  const barra = resto.indexOf('/');
  const bucket = barra < 0 ? resto : resto.slice(0, barra);
  const chave = barra < 0 ? '' : resto.slice(barra + 1);
  const id = `${bucket}/${chave}`;
  if (!chave && req.method === 'GET') {
    const prefixo = url.searchParams.get('prefix') || '';
    const itens = [...estado.objetos.entries()].filter(([k]) => k.startsWith(`${bucket}/${prefixo}`));
    return xml(res, 200, `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name><KeyCount>${itens.length}</KeyCount><IsTruncated>false</IsTruncated>${itens.map(([k, v]) => `<Contents><Key>${k.slice(bucket.length + 1)}</Key><Size>${v.bytes.length}</Size><LastModified>${v.em}</LastModified></Contents>`).join('')}</ListBucketResult>`);
  }
  if (req.method === 'PUT') {
    // O link assinado amarra tipo e tamanho; o mock recusa o que divergir.
    const declarado = Number(req.headers['content-length'] || corpo.length);
    if (declarado !== corpo.length) return xml(res, 400, '<Error><Code>IncompleteBody</Code></Error>');
    if (DEMO) {
      // Os arquivos moram na memória: a demonstração tem teto e volta a zero quando reinicia.
      let total = corpo.length;
      for (const [chave, obj] of estado.objetos) if (chave !== id) total += obj.bytes.length;
      if (total > LIMITE_OBJETOS) return xml(res, 507, '<Error><Code>QuotaExceeded</Code><Message>A demonstração atingiu o limite de arquivos.</Message></Error>');
    }
    estado.objetos.set(id, { bytes: corpo, contentType: String(req.headers['content-type'] || 'application/octet-stream'), em: new Date().toISOString() });
    res.writeHead(200, { etag: `"${crypto.createHash('md5').update(corpo).digest('hex')}"`, ...CORS });
    return res.end();
  }
  const obj = estado.objetos.get(id);
  if (req.method === 'DELETE') {
    estado.objetos.delete(id);
    res.writeHead(204, CORS);
    return res.end();
  }
  if (!obj) {
    if (req.method === 'HEAD') { res.writeHead(404, CORS); return res.end(); }
    return xml(res, 404, '<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>');
  }
  const cab = { 'content-type': obj.contentType, 'content-length': String(obj.bytes.length), 'last-modified': new Date(obj.em).toUTCString(), etag: '"x"', ...CORS };
  if (req.method === 'HEAD') { res.writeHead(200, cab); return res.end(); }
  const faixa = String(req.headers.range || '').match(/^bytes=(\d+)-(\d*)$/);
  if (faixa) {
    const ini = Number(faixa[1]);
    const fim = Math.min(obj.bytes.length - 1, faixa[2] === '' ? obj.bytes.length - 1 : Number(faixa[2]));
    const parte = obj.bytes.subarray(ini, fim + 1);
    res.writeHead(206, { ...cab, 'content-length': String(parte.length), 'content-range': `bytes ${ini}-${fim}/${obj.bytes.length}` });
    return res.end(parte);
  }
  res.writeHead(200, cab);
  return res.end(obj.bytes);
}

// ---------------------------------------------------------------------------
// Resend falso + utilitários de teste
// ---------------------------------------------------------------------------
async function resend(req, res, corpo) {
  const pedido = JSON.parse(corpo.toString('utf8') || '{}');
  if (!String(req.headers.authorization || '').startsWith('Bearer re_')) {
    return json(res, 401, { statusCode: 401, name: 'validation_error', message: 'API key is invalid' });
  }
  const para = [].concat(pedido.to || []);
  if (estado.falharResend || para.some((p) => /recusado@|bounce@/.test(p))) {
    return json(res, 422, { statusCode: 422, name: 'validation_error', message: 'The recipient address was rejected by the test mailbox.' });
  }
  const id = crypto.randomUUID();
  guardarEmail({ origem: 'resend', id, ...pedido, to: para, em: new Date().toISOString() });
  return json(res, 200, { id });
}

async function utilitarios(req, res, url, corpo) {
  const caminho = url.pathname.replace(/^\/_teste/, '');
  if (caminho === '/emails') {
    if (req.method === 'DELETE') { estado.emails.length = 0; return json(res, 200, { ok: true }); }
    return json(res, 200, estado.emails);
  }
  if (caminho === '/resend-falha') {
    estado.falharResend = url.searchParams.get('ligar') === '1';
    return json(res, 200, { falhar: estado.falharResend });
  }
  if (caminho === '/sql' && req.method === 'POST') {
    const { texto, params } = JSON.parse(corpo.toString('utf8'));
    try {
      const r = await sql(texto, params || []);
      return json(res, 200, { linhas: r.rows, afetadas: r.affectedRows });
    } catch (e) {
      return json(res, 400, { erro: e.message, code: e.code });
    }
  }
  if (caminho === '/objetos' && req.method === 'POST') {
    // semeia um objeto: { chave: 'supabase:<bucket>/<caminho>' ou '<bucket>/<chave>' do S3, conteudo, tipo }
    const d = JSON.parse(corpo.toString('utf8') || '{}');
    estado.objetos.set(String(d.chave), { bytes: Buffer.from(String(d.conteudo || 'x')), contentType: d.tipo || 'application/octet-stream', em: new Date().toISOString() });
    return json(res, 200, { ok: true });
  }
  if (caminho === '/objetos') {
    return json(res, 200, [...estado.objetos.entries()].map(([k, v]) => ({ chave: k, bytes: v.bytes.length, tipo: v.contentType })));
  }
  if (caminho === '/recarregar') {
    await exclusivo(() => rest.carregarCatalogo(db));
    return json(res, 200, { ok: true });
  }
  if (caminho === '/requisicoes') return json(res, 200, estado.requisicoes.slice(-200));
  return json(res, 404, { erro: 'utilitário desconhecido' });
}

// ---------------------------------------------------------------------------
// Caixa de e-mails da demonstração (só leitura, por endereço)
// ---------------------------------------------------------------------------
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function linksDoEmail(e) {
  if (e.link) return [e.link];
  const achados = new Set();
  for (const m of String(e.html || '').matchAll(/href="(https?:\/\/[^"]+)"/g)) achados.add(m[1].replace(/&amp;/g, '&'));
  return [...achados].slice(0, 6);
}

function caixa(req, res, url) {
  const para = String(url.searchParams.get('para') || '').trim().toLowerCase().slice(0, 200);
  // "Nome <email>" ou só o e-mail: compara o endereço inteiro, nunca um pedaço.
  const endereco = (d) => { const s = String(d).trim().toLowerCase(); const m = s.match(/<([^>]+)>/); return (m ? m[1] : s).trim(); };
  // As contas de exemplo ficam com a caixa fechada: senão qualquer visitante
  // pediria "esqueci a senha" e tomaria a conta de quem está testando.
  const exemplo = Object.values(USUARIOS).some((u) => u.email === para);
  const mensagens = para && !exemplo ? estado.emails.filter((e) => [].concat(e.to || []).some((d) => endereco(d) === para)).reverse() : [];
  const quando = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  const cartoes = mensagens.map((e) => {
    const links = linksDoEmail(e);
    const corpo = e.html
      ? `<iframe title="Conteúdo do e-mail" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" loading="lazy" srcdoc="${esc(`<base target="_blank">${e.html}`)}"></iframe>`
      : e.text ? `<pre>${esc(e.text)}</pre>` : '';
    return `<article>
<p class="meta">${esc(quando(e.em))} · ${e.origem === 'resend' ? 'enviado pelo Ortus' : 'enviado pelo login (Supabase Auth)'}</p>
<h2>${esc(e.subject || '(sem assunto)')}</h2>
${links.length ? `<p class="links">${links.map((l) => `<a class="botao" href="${esc(l)}" target="_blank" rel="noopener noreferrer">Abrir link${links.length > 1 ? ` · ${esc(new URL(l).pathname)}` : ''}</a>`).join(' ')}</p>` : ''}
${corpo}
</article>`;
  }).join('\n');
  const pagina = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Caixa de e-mails · demonstração do Ortus</title>
<style>
:root{color-scheme:light;--borda:#e5e5e5;--texto:#171717;--fraco:#737373}
*{box-sizing:border-box}body{margin:0;background:#fafafa;color:var(--texto);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:24px;font-weight:600;letter-spacing:-.01em;margin:0 0 4px}h2{font-size:16px;font-weight:600;margin:2px 0 10px}
.aviso{color:var(--fraco);margin:0 0 20px}
form{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px}
label{display:block;width:100%;font-size:12px;font-weight:500;color:var(--fraco);margin-bottom:-2px}
input{flex:1 1 260px;height:40px;border:1px solid var(--borda);border-radius:6px;background:#fff;padding:0 12px;font:inherit}
button,.botao{display:inline-flex;align-items:center;height:40px;padding:0 14px;border:0;border-radius:6px;background:#171717;color:#fff;font:600 14px system-ui;text-decoration:none;cursor:pointer}
.exemplos{font-size:12px;color:var(--fraco);margin:0 0 24px;line-height:2}.exemplos a{color:var(--texto);margin-right:10px}
article{background:#fff;border:1px solid var(--borda);border-radius:8px;padding:16px;margin:0 0 14px}
.meta{font-size:12px;color:var(--fraco);margin:0}.links{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}
iframe{width:100%;height:440px;border:1px solid var(--borda);border-radius:6px;background:#fff}
pre{white-space:pre-wrap;font:13px/1.5 ui-monospace,monospace;margin:0}
.vazio{color:var(--fraco);border:1px dashed var(--borda);border-radius:8px;padding:20px;text-align:center}
</style></head><body><main>
<h1>Caixa de e-mails</h1>
<p class="aviso">Demonstração do Ortus: nenhum e-mail sai daqui para a internet. Os e-mails de acesso, convite e senha param nesta caixa. Quem souber o endereço vê as mensagens, então use só endereços de teste. Tudo volta ao começo quando a demonstração reinicia.</p>
<form method="get" action="/caixa"><label for="para">E-mail do destinatário</label>
<input id="para" name="para" type="email" required placeholder="nome@exemplo.test" value="${esc(para)}"><button type="submit">Abrir caixa</button></form>
<p class="exemplos">Para ver um e-mail chegando: assine um plano na demonstração com um endereço inventado (ex.: voce@exemplo.test), pague na tela de teste e abra a caixa desse endereço aqui.</p>
${exemplo ? `<p class="vazio">${esc(para)} é uma conta de exemplo: a caixa dela fica fechada na demonstração.</p>` : para ? (cartoes || `<p class="vazio">Nenhum e-mail para ${esc(para)} até agora.</p>`) : ''}
</main></body></html>`;
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; form-action 'self'; frame-ancestors 'none'",
  });
  return res.end(pagina);
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------
const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', BASE);
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (DEMO) {
    // Nada de SQL, semente de arquivo ou controle do provedor pela internet.
    if (url.pathname.startsWith('/_teste') || url.pathname.startsWith('/provedor/_teste') || url.pathname.startsWith('/google/_teste')) {
      return json(res, 404, { erro: 'indisponível na demonstração' });
    }
    // O que só o site usa (e-mail, API do pagamento, administração do login) não atende quem vem de fora.
    // Do Google falso, só a tela de consentimento atende o navegador.
    const soDoSite = ['/resend/', '/provedor/v1/', '/provedor/checkout/', '/auth/v1/admin/', '/auth/v1/invite',
      '/google/token', '/google/revoke', '/google/userinfo', '/google/calendar/'];
    if (!interno(req) && soDoSite.some((p) => url.pathname.startsWith(p))) {
      return json(res, 404, { erro: 'indisponível na demonstração' });
    }
    if (url.pathname === '/caixa' && req.method === 'GET') return caixa(req, res, url);
    if (url.pathname === '/' && req.method === 'GET') { res.writeHead(302, { location: '/caixa' }); return res.end(); }
  }
  try {
    const corpo = await ler(req);
    if (url.pathname.startsWith('/auth/v1')) return await auth(req, res, url, corpo);
    if (url.pathname.startsWith('/storage/v1')) return await storage(req, res, url, corpo);
    if (url.pathname.startsWith('/s3/')) return await s3(req, res, url, corpo);
    if (url.pathname === '/resend/emails') return await resend(req, res, corpo);
    if (url.pathname.startsWith('/provedor')) return await provedor.tratar(req, res, url, corpo, json);
    if (url.pathname.startsWith('/google')) return await google.tratar(req, res, url, corpo, json);
    if (url.pathname.startsWith('/_teste')) return await utilitarios(req, res, url, corpo);
    if (url.pathname.startsWith('/rest/v1')) {
      const { payload, token } = claimsDe(req);
      if (!payload) return json(res, 401, { code: 'PGRST301', message: token ? 'JWT expired' : 'No API key found in request', details: null, hint: null });
      const dados = corpo.length ? JSON.parse(corpo.toString('utf8')) : null;
      estado.requisicoes.push(`${payload.role} ${req.method} ${url.pathname}${url.search}`.slice(0, 300));
      if (estado.requisicoes.length > 1000) estado.requisicoes.splice(0, estado.requisicoes.length - 1000);
      const r = await rest.tratar({
        metodo: req.method,
        caminho: url.pathname.replace(/^\/rest\/v1/, ''),
        busca: url.searchParams,
        cabecalhos: req.headers,
        corpo: dados,
        claims: payload,
      });
      return json(res, r.status, r.corpo, r.cabecalhos);
    }
    return json(res, 404, { erro: 'rota desconhecida no ambiente de teste' });
  } catch (e) {
    const r = respostaDeErro(e);
    if (r.status >= 500) console.error('ERRO', req.method, url.pathname, e);
    return json(res, r.status, r.corpo);
  }
});

await semear(sql, hashSenha);
await exclusivo(() => rest.carregarCatalogo(db));

servidor.listen(PORTA, '127.0.0.1', async () => {
  let pg = '';
  // Na demonstração não há socket: o Postgres sem senha não fica aberto nem para a própria máquina.
  if (!DEMO) {
    try {
      const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
      const socket = new PGLiteSocketServer({ db, port: PORTA_PG, host: '127.0.0.1' });
      await socket.start();
      pg = `postgresql://postgres:postgres@127.0.0.1:${PORTA_PG}/postgres`;
    } catch (e) {
      console.error('Postgres por socket indisponível:', e.message);
    }
  }
  if (DEMO) {
    console.log(`ambiente de teste no ar (demonstração): ${BASE} -> 127.0.0.1:${PORTA}`);
    return;
  }
  const env = [
    `NEXT_PUBLIC_SUPABASE_URL=${BASE}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${CHAVE_ANON}`,
    `SUPABASE_SERVICE_ROLE_KEY=${CHAVE_SERVICO}`,
    `DATABASE_URL=${pg}`,
  ].join('\n');
  // Só a instância principal grava o arquivo que o app lê; as temporárias usam outro nome.
  fs.writeFileSync(path.join(AQUI, PORTA === 54321 ? 'env.gerado' : `env-${PORTA}.gerado`), `${env}\n`);
  console.log(`ambiente de teste no ar: ${BASE}  (postgres: ${pg || 'sem socket'})`);
});
