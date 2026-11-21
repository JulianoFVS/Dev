// Mercado Pago falso do ambiente local.
//
// Imita o que o Ortus usa do Checkout Pro: criar preferência, ler pagamento,
// buscar por referência e o webhook assinado (x-signature: ts=…,v1=…, HMAC do
// texto "id:<id>;request-id:<x-request-id>;ts:<ts>;"). A página /provedor/pagar
// faz o papel da tela do Mercado Pago, com botões para cada desfecho.
//
// Controles de teste em /provedor/_teste/* (pagar sem navegador, mudar o estado
// de um pagamento, reenviar o aviso, desligar o webhook, assinar errado).
import crypto from 'node:crypto';

export function criarProvedorFalso({ base, segredo = 'segredo-do-webhook-local', token = 'TEST-token-local-0001' }) {
  const preferencias = new Map();
  const porChave = new Map();
  const pagamentos = new Map();
  const avisos = [];
  const config = { webhook: true, assinatura: 'certa', recusarPreferencia: false };
  let seq = 91000000;
  let seqAviso = 5000;

  const agora = () => new Date().toISOString();
  const autorizado = (req) => String(req.headers.authorization || '') === `Bearer ${token}`;

  function novoPagamento(pref, { status = 'approved', status_detail, valor, tipo = 'pix' } = {}) {
    const id = ++seq;
    const aprovado = status === 'approved';
    const pg = {
      id,
      status,
      status_detail: status_detail ?? (aprovado ? 'accredited' : status === 'rejected' ? 'cc_rejected_other_reason' : status === 'pending' ? 'pending_waiting_transfer' : null),
      external_reference: pref.external_reference,
      transaction_amount: valor ?? pref.items[0].unit_price,
      currency_id: 'BRL',
      date_created: agora(),
      date_approved: aprovado ? agora() : null,
      date_last_updated: agora(),
      payment_type_id: tipo === 'pix' ? 'bank_transfer' : 'credit_card',
      payment_method_id: tipo === 'pix' ? 'pix' : 'visa',
      payer: { email: pref.payer?.email || null },
      preference_id: pref.id,
    };
    pagamentos.set(String(id), pg);
    return pg;
  }

  async function avisar(pg, { assinatura = config.assinatura, forcar = false } = {}) {
    const pref = preferencias.get(pg.preference_id);
    if (!config.webhook && !forcar) return { enviado: false, motivo: 'webhook desligado no teste' };
    if (!pref?.notification_url) return { enviado: false, motivo: 'preferência sem notification_url' };
    const destino = new URL(pref.notification_url);
    destino.searchParams.set('data.id', String(pg.id));
    destino.searchParams.set('type', 'payment');
    const ts = String(Date.now());
    const pedido = crypto.randomUUID();
    let v1 = crypto.createHmac('sha256', segredo).update(`id:${pg.id};request-id:${pedido};ts:${ts};`).digest('hex');
    if (assinatura === 'errada') v1 = (v1[0] === '0' ? '1' : '0') + v1.slice(1);
    const registro = { para: destino.pathname, pagamento: String(pg.id), estado: pg.status, assinatura, em: agora(), status: 0, resposta: null };
    try {
      const r = await fetch(destino, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-request-id': pedido,
          ...(assinatura === 'sem' ? {} : { 'x-signature': `ts=${ts},v1=${v1}` }),
        },
        body: JSON.stringify({
          action: 'payment.updated', api_version: 'v1', data: { id: String(pg.id) }, date_created: agora(),
          id: ++seqAviso, live_mode: false, type: 'payment', user_id: '1',
        }),
      });
      registro.status = r.status;
      registro.resposta = await r.json().catch(() => null);
    } catch (e) {
      registro.resposta = { erro: e.message };
    }
    avisos.push(registro);
    return { enviado: true, ...registro };
  }

  function acharPreferencia({ pref, referencia }) {
    if (pref) return preferencias.get(pref) || null;
    const todas = [...preferencias.values()].filter((p) => p.external_reference === referencia);
    return todas[todas.length - 1] || null;
  }

  const html = (res, status, corpo) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
    res.end(corpo);
  };

  function paginaDePagamento(pref) {
    const valor = Number(pref.items[0].unit_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const botao = (acao, rotulo, cor) => `<button name="acao" value="${acao}" style="display:block;width:100%;margin:8px 0;padding:14px;border:0;border-radius:8px;background:${cor};color:#fff;font:600 15px system-ui;cursor:pointer">${rotulo}</button>`;
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pagamento (provedor de teste)</title></head>
<body style="margin:0;background:#eef2f7;font-family:system-ui">
<main style="max-width:420px;margin:0 auto;padding:24px 16px">
<p style="font:600 12px system-ui;letter-spacing:.08em;color:#64748b">PROVEDOR DE PAGAMENTO — AMBIENTE DE TESTE</p>
<h1 style="font:600 20px system-ui;margin:8px 0">${pref.items[0].title.replace(/</g, '&lt;')}</h1>
<p style="font:600 28px system-ui;margin:4px 0 16px">${valor}</p>
<form method="post" action="/provedor/pagar/acao">
<input type="hidden" name="pref" value="${pref.id}">
${botao('pix', 'Pagar com Pix (aprovar)', '#0f766e')}
${botao('cartao', 'Pagar com cartão (aprovar)', '#1d4ed8')}
${botao('recusar', 'Cartão recusado', '#b91c1c')}
${botao('pendente', 'Deixar pendente (Pix não pago)', '#a16207')}
</form>
<p style="font:13px system-ui;color:#64748b">Nenhum dado de cartão é pedido: esta página só simula o desfecho.</p>
</main></body></html>`;
  }

  return {
    estado: () => ({ preferencias: [...preferencias.values()], pagamentos: [...pagamentos.values()], avisos, config }),

    async tratar(req, res, url, corpo, json) {
      const caminho = url.pathname.replace(/^\/provedor/, '');
      const texto = corpo?.length ? corpo.toString('utf8') : '';
      const dados = () => { try { return texto ? JSON.parse(texto) : {}; } catch { return {}; } };

      // ---------------- API do Mercado Pago ----------------
      if (caminho === '/checkout/preferences' && req.method === 'POST') {
        if (!autorizado(req)) return json(res, 401, { message: 'invalid_token', error: 'unauthorized', status: 401 });
        if (config.recusarPreferencia) return json(res, 500, { message: 'internal_error', error: 'internal_error', status: 500 });
        const chave = String(req.headers['x-idempotency-key'] || '');
        if (chave && porChave.has(chave)) return json(res, 201, preferencias.get(porChave.get(chave)));
        const d = dados();
        if (!d.items?.[0]?.unit_price || !d.external_reference) return json(res, 400, { message: 'items e external_reference são obrigatórios', status: 400 });
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(d.external_reference)) return json(res, 400, { message: 'external_reference inválida', status: 400 });
        const id = `pref-${crypto.randomBytes(8).toString('hex')}`;
        const pref = {
          id,
          items: d.items,
          payer: d.payer || null,
          external_reference: d.external_reference,
          back_urls: d.back_urls || {},
          notification_url: d.notification_url || null,
          expiration_date_to: d.expiration_date_to || null,
          payment_methods: d.payment_methods || null,
          init_point: `${base}/provedor/pagar?pref=${id}`,
          sandbox_init_point: `${base}/provedor/pagar?pref=${id}`,
          date_created: agora(),
        };
        preferencias.set(id, pref);
        if (chave) porChave.set(chave, id);
        return json(res, 201, pref);
      }
      if (caminho === '/v1/payments/search' && req.method === 'GET') {
        if (!autorizado(req)) return json(res, 401, { message: 'invalid_token', status: 401 });
        const ref = url.searchParams.get('external_reference') || '';
        const achados = [...pagamentos.values()].filter((p) => p.external_reference === ref).reverse();
        return json(res, 200, { paging: { total: achados.length, limit: 20, offset: 0 }, results: achados });
      }
      const umPagamento = caminho.match(/^\/v1\/payments\/([^/]+)$/);
      if (umPagamento && req.method === 'GET') {
        if (!autorizado(req)) return json(res, 401, { message: 'invalid_token', status: 401 });
        const pg = pagamentos.get(umPagamento[1]);
        if (!pg) return json(res, 404, { message: 'Payment not found', error: 'not_found', status: 404 });
        return json(res, 200, pg);
      }

      // ---------------- página que faz o papel do checkout ----------------
      if (caminho === '/pagar' && req.method === 'GET') {
        const pref = preferencias.get(url.searchParams.get('pref') || '');
        if (!pref) return html(res, 404, '<p>Cobrança não encontrada.</p>');
        return html(res, 200, paginaDePagamento(pref));
      }
      if (caminho === '/pagar/acao' && req.method === 'POST') {
        const form = new URLSearchParams(texto);
        const pref = preferencias.get(form.get('pref') || '');
        if (!pref) return html(res, 404, '<p>Cobrança não encontrada.</p>');
        const acao = form.get('acao');
        const pg = novoPagamento(pref, {
          status: acao === 'recusar' ? 'rejected' : acao === 'pendente' ? 'pending' : 'approved',
          status_detail: acao === 'recusar' ? 'cc_rejected_insufficient_amount' : undefined,
          tipo: acao === 'pix' || acao === 'pendente' ? 'pix' : 'cartao',
        });
        await avisar(pg);
        const volta = new URL(pref.back_urls[pg.status === 'approved' ? 'success' : pg.status === 'pending' ? 'pending' : 'failure'] || `${base}/`);
        for (const [k, v] of Object.entries({
          collection_id: pg.id, collection_status: pg.status, payment_id: pg.id, status: pg.status,
          external_reference: pg.external_reference, payment_type: pg.payment_type_id, preference_id: pref.id,
        })) volta.searchParams.set(k, String(v));
        res.writeHead(303, { location: volta.toString() });
        return res.end();
      }

      // ---------------- controles de teste ----------------
      if (caminho === '/_teste/estado' && req.method === 'GET') return json(res, 200, this.estado());
      if (caminho === '/_teste/estado' && req.method === 'DELETE') {
        preferencias.clear(); porChave.clear(); pagamentos.clear(); avisos.length = 0;
        Object.assign(config, { webhook: true, assinatura: 'certa', recusarPreferencia: false });
        return json(res, 200, { ok: true });
      }
      if (caminho === '/_teste/config' && req.method === 'POST') {
        Object.assign(config, dados());
        return json(res, 200, config);
      }
      if (caminho === '/_teste/pagar' && req.method === 'POST') {
        const d = dados();
        const pref = acharPreferencia(d);
        if (!pref) return json(res, 404, { erro: 'preferência não encontrada' });
        const pg = novoPagamento(pref, d);
        const aviso = d.avisar === false ? { enviado: false, motivo: 'pedido do teste' } : await avisar(pg, { assinatura: d.assinatura });
        return json(res, 200, { pagamento: pg, aviso });
      }
      if (caminho === '/_teste/mudar' && req.method === 'POST') {
        const d = dados();
        const pg = pagamentos.get(String(d.id));
        if (!pg) return json(res, 404, { erro: 'pagamento não encontrado' });
        pg.status = d.status;
        pg.status_detail = d.status_detail ?? (d.status === 'refunded' ? 'refunded' : d.status === 'charged_back' ? 'settled' : pg.status_detail);
        pg.date_last_updated = agora();
        const aviso = d.avisar === false ? { enviado: false } : await avisar(pg, { assinatura: d.assinatura });
        return json(res, 200, { pagamento: pg, aviso });
      }
      if (caminho === '/_teste/avisar' && req.method === 'POST') {
        const d = dados();
        const pg = pagamentos.get(String(d.id));
        if (!pg && !d.inexistente) return json(res, 404, { erro: 'pagamento não encontrado' });
        // `inexistente`: aviso assinado de um pagamento que o provedor não conhece (teste do painel do provedor).
        const alvo = pg || { id: d.id, status: 'approved', preference_id: [...preferencias.keys()].pop() };
        return json(res, 200, await avisar(alvo, { assinatura: d.assinatura, forcar: true }));
      }
      return json(res, 404, { message: `provedor falso: rota não implementada (${req.method} ${caminho})`, status: 404 });
    },
  };
}
