const URL_BASE = (process.env.WHATSAPP_GATEWAY_URL || 'http://127.0.0.1:3920').replace(/\/$/, '');
const SEGREDO = process.env.WHATSAPP_GATEWAY_SECRET || '';

export function whatsappGatewayConfigurado() {
  return Boolean(SEGREDO);
}

export async function chamarWhatsappGateway(caminho: string, init?: { method?: string; body?: unknown }) {
  if (!SEGREDO) {
    return { ok: false as const, status: 503, dados: { erro: 'Gateway do WhatsApp não configurado.' } };
  }
  try {
    const resposta = await fetch(`${URL_BASE}${caminho}`, {
      method: init?.method || 'GET',
      headers: {
        'content-type': 'application/json',
        'x-ortus-whatsapp-secret': SEGREDO,
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
    const dados = await resposta.json().catch(() => ({}));
    return { ok: resposta.ok, status: resposta.status, dados };
  } catch {
    return {
      ok: false as const,
      status: 503,
      dados: { erro: 'O serviço do WhatsApp não está rodando. Suba com npm run whatsapp.' },
    };
  }
}
