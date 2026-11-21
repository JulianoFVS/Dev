// Google falso do ambiente local: OAuth (consentimento, token, renovação,
// revogação, e-mail da conta) e o pedaço da Calendar API v3 que o Ortus usa
// (criar, alterar, cancelar e listar eventos, com syncToken).
//
// Montado em /google. Os três endereços do Google (accounts, oauth2 e
// www.googleapis) viram caminhos debaixo desta base:
//   /o/oauth2/v2/auth  → tela de consentimento (navegador)
//   /token, /revoke, /userinfo, /calendar/v3/... → só o servidor do site
// Só aceita client_id que começa com "teste-".
//
// Controles de teste em /google/_teste/*: estado, falha (liga/desliga erro
// 503 em tudo) e externo (cria um compromisso direto "no Google").
import crypto from 'node:crypto';

export function criarGoogleFalso({ base }) {
  const codigos = new Map();
  const acessos = new Map();
  const refreshs = new Map();
  const agendas = new Map();
  const config = { falhar: false };
  let seq = 0;
  let versao = 0;

  const agora = () => new Date().toISOString();
  const token = (prefixo) => `${prefixo}${crypto.randomBytes(18).toString('base64url')}`;
  const agendaDe = (email) => {
    if (!agendas.has(email)) agendas.set(email, new Map());
    return agendas.get(email);
  };
  const contaDe = (req) => {
    const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const a = acessos.get(t);
    return a && a.expira > Date.now() ? a.email : null;
  };
  const html = (res, status, corpo) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google (teste)</title><body style="font-family:system-ui;max-width:420px;margin:12vh auto;padding:0 16px;color:#202124">${corpo}</body></html>`);
  };
  const escapar = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function evento(email, dados, id = `evt${++seq}`) {
    const e = {
      id,
      status: 'confirmed',
      summary: dados.summary || '',
      description: dados.description || '',
      start: dados.start,
      end: dados.end,
      transparency: dados.transparency || 'opaque',
      extendedProperties: dados.extendedProperties || undefined,
      updated: agora(),
      versao: ++versao,
    };
    agendaDe(email).set(id, e);
    return e;
  }
  const publico = (e) => { const { versao: _v, ...resto } = e; return resto; };

  return {
    /** Para os testes: os eventos de uma conta. */
    eventos: (email) => Array.from(agendaDe(email).values()).map(publico),

    async tratar(req, res, url, corpo, json) {
      const caminho = url.pathname.replace(/^\/google/, '');
      const texto = corpo?.length ? corpo.toString('utf8') : '';
      const form = () => Object.fromEntries(new URLSearchParams(texto));
      const dados = () => { try { return texto ? JSON.parse(texto) : {}; } catch { return {}; } };

      // ------------------------------------------------ controles de teste
      if (caminho === '/_teste/estado') {
        return json(res, 200, { contas: Array.from(agendas.keys()), eventos: Object.fromEntries(Array.from(agendas.entries()).map(([k, v]) => [k, Array.from(v.values()).map(publico)])), falhar: config.falhar, tokens: refreshs.size });
      }
      if (caminho === '/_teste/falha') {
        config.falhar = url.searchParams.get('ligar') === '1';
        return json(res, 200, { falhar: config.falhar });
      }
      if (caminho === '/_teste/externo' && req.method === 'POST') {
        const d = dados();
        if (!d.email || !d.inicio || !d.fim) return json(res, 400, { erro: 'email, inicio e fim' });
        return json(res, 200, publico(evento(d.email, { summary: d.summary || 'Compromisso pessoal', start: { dateTime: d.inicio }, end: { dateTime: d.fim } })));
      }

      // ------------------------------------------------------- consentimento
      if (caminho === '/o/oauth2/v2/auth' && req.method === 'GET') {
        const p = url.searchParams;
        const clientId = p.get('client_id') || '';
        const redirect = p.get('redirect_uri') || '';
        if (!clientId.startsWith('teste-') || !/^https?:\/\//.test(redirect)) {
          return html(res, 400, '<h2>Erro 400: invalid_request</h2><p>Cliente OAuth desconhecido neste Google de teste.</p>');
        }
        const conta = (p.get('conta') || 'profissional@google.test').trim().toLowerCase();
        if (p.get('auto') === '1') {
          const code = token('code-');
          codigos.set(code, { email: conta, clientId, redirect, criado: Date.now() });
          const volta = new URL(redirect);
          volta.searchParams.set('code', code);
          if (p.get('state')) volta.searchParams.set('state', p.get('state'));
          res.writeHead(302, { location: volta.toString() });
          return res.end();
        }
        const aceitar = new URL(url.toString());
        aceitar.searchParams.set('auto', '1');
        const recusar = new URL(redirect);
        recusar.searchParams.set('error', 'access_denied');
        if (p.get('state')) recusar.searchParams.set('state', p.get('state'));
        return html(res, 200, `
          <p style="font-size:13px;color:#5f6368">Google · ambiente de teste do Ortus</p>
          <h2 style="font-weight:500">O Ortus quer acessar a sua Agenda do Google</h2>
          <p>Conta: <strong>${escapar(conta)}</strong></p>
          <p style="color:#5f6368">Criar, alterar e apagar os eventos das consultas e ler os horários ocupados.</p>
          <p style="display:flex;gap:12px;margin-top:28px">
            <a href="${escapar(recusar.toString())}" style="padding:10px 18px;border-radius:6px;border:1px solid #dadce0;color:#1a73e8;text-decoration:none">Cancelar</a>
            <a href="${escapar(aceitar.toString())}" style="padding:10px 18px;border-radius:6px;background:#1a73e8;color:#fff;text-decoration:none">Permitir</a>
          </p>`);
      }

      if (config.falhar) return json(res, 503, { error: { code: 503, message: 'backendError (teste)' } });

      // --------------------------------------------------------------- OAuth
      if (caminho === '/token' && req.method === 'POST') {
        const f = { ...form(), ...dados() };
        if (!String(f.client_id || '').startsWith('teste-')) return json(res, 401, { error: 'invalid_client' });
        if (f.grant_type === 'authorization_code') {
          const c = codigos.get(f.code);
          codigos.delete(f.code);
          if (!c || c.redirect !== f.redirect_uri || Date.now() - c.criado > 10 * 60_000) return json(res, 400, { error: 'invalid_grant' });
          const access = token('ya29.teste-');
          const refresh = token('1//teste-');
          acessos.set(access, { email: c.email, expira: Date.now() + 3600_000, refresh });
          refreshs.set(refresh, c.email);
          return json(res, 200, { access_token: access, refresh_token: refresh, expires_in: 3600, token_type: 'Bearer', scope: 'https://www.googleapis.com/auth/calendar.events openid email' });
        }
        if (f.grant_type === 'refresh_token') {
          const email = refreshs.get(f.refresh_token);
          if (!email) return json(res, 400, { error: 'invalid_grant' });
          const access = token('ya29.teste-');
          acessos.set(access, { email, expira: Date.now() + 3600_000, refresh: f.refresh_token });
          return json(res, 200, { access_token: access, expires_in: 3600, token_type: 'Bearer' });
        }
        return json(res, 400, { error: 'unsupported_grant_type' });
      }
      if (caminho === '/revoke' && req.method === 'POST') {
        const t = form().token || url.searchParams.get('token') || '';
        // Como no Google: revogar o refresh token derruba os tokens de acesso dele.
        refreshs.delete(t);
        acessos.delete(t);
        for (const [chave, a] of acessos) if (a.refresh === t) acessos.delete(chave);
        return json(res, 200, {});
      }
      if (caminho === '/userinfo' && req.method === 'GET') {
        const email = contaDe(req);
        if (!email) return json(res, 401, { error: 'invalid_token' });
        return json(res, 200, { email, email_verified: true });
      }

      // ------------------------------------------------------- Calendar v3
      const m = caminho.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
      if (m) {
        const email = contaDe(req);
        if (!email) return json(res, 401, { error: { code: 401, message: 'Invalid Credentials' } });
        const agenda = agendaDe(email);
        const id = m[2] ? decodeURIComponent(m[2]) : null;
        if (!id && req.method === 'POST') {
          const d = dados();
          if (!d.start?.dateTime || !d.end?.dateTime) return json(res, 400, { error: { code: 400, message: 'Missing time' } });
          return json(res, 200, publico(evento(email, d)));
        }
        if (id && req.method === 'PATCH') {
          const e = agenda.get(id);
          if (!e || e.status === 'cancelled') return json(res, 404, { error: { code: 404, message: 'Not Found' } });
          Object.assign(e, dados(), { status: 'confirmed', updated: agora(), versao: ++versao });
          return json(res, 200, publico(e));
        }
        if (id && req.method === 'DELETE') {
          const e = agenda.get(id);
          if (!e || e.status === 'cancelled') return json(res, 410, { error: { code: 410, message: 'Resource has been deleted' } });
          e.status = 'cancelled';
          e.updated = agora();
          e.versao = ++versao;
          res.writeHead(204);
          return res.end();
        }
        if (!id && req.method === 'GET') {
          const p = url.searchParams;
          const sync = p.get('syncToken');
          let itens = Array.from(agenda.values());
          if (sync) {
            itens = itens.filter((e) => e.versao > Number(sync));
          } else {
            const de = p.get('timeMin') ? new Date(p.get('timeMin')).getTime() : -Infinity;
            const ate = p.get('timeMax') ? new Date(p.get('timeMax')).getTime() : Infinity;
            itens = itens.filter((e) => e.status !== 'cancelled' && new Date(e.end.dateTime).getTime() > de && new Date(e.start.dateTime).getTime() < ate);
          }
          return json(res, 200, { kind: 'calendar#events', items: itens.map(publico), nextSyncToken: String(versao) });
        }
      }
      return json(res, 404, { error: { code: 404, message: `Not Found: ${caminho}` } });
    },
  };
}
