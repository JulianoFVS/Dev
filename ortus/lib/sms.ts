/** Envio de SMS via Twilio (servidor) ou link sms: (cliente). */

export type ResultadoSms = { ok: boolean; metodo: 'twilio' | 'cliente' | 'nenhum'; erro?: string };

function normalizarTelefoneBr(telefone: string): string {
  const digits = telefone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`;
  if (digits.length >= 10) return `+55${digits}`;
  return '';
}

/** Abre app de SMS no dispositivo (fallback sem gateway). */
export function abrirSmsCliente(telefone: string | null | undefined, mensagem: string): boolean {
  const e164 = normalizarTelefoneBr(telefone || '');
  if (!e164) return false;
  const numero = e164.replace('+', '');
  if (typeof window !== 'undefined') {
    window.open(`sms:+${numero}?body=${encodeURIComponent(mensagem)}`, '_blank');
  }
  return true;
}

/** Envia SMS via API Twilio (server-side). Requer TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER. */
export async function enviarSmsTwilio(telefone: string, mensagem: string): Promise<ResultadoSms> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    return { ok: false, metodo: 'nenhum', erro: 'Twilio não configurado' };
  }

  const to = normalizarTelefoneBr(telefone);
  if (!to) return { ok: false, metodo: 'nenhum', erro: 'Telefone inválido' };

  const body = new URLSearchParams({ To: to, From: from, Body: mensagem });
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, metodo: 'twilio', erro: err.slice(0, 200) };
    }
    return { ok: true, metodo: 'twilio' };
  } catch (e: any) {
    return { ok: false, metodo: 'twilio', erro: e.message || String(e) };
  }
}

export function smsTwilioConfigurado(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}
