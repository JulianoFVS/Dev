/** Envio de e-mail via Resend (servidor). */

export type ResultadoEmail = { ok: boolean; erro?: string };

export async function enviarEmailResend(
  para: string,
  assunto: string,
  corpoTexto: string,
  corpoHtml?: string,
): Promise<ResultadoEmail> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'Ortus <noreply@ortus.app>';

  if (!apiKey) {
    return { ok: false, erro: 'Resend não configurado (RESEND_API_KEY)' };
  }
  if (!para?.trim()) {
    return { ok: false, erro: 'E-mail destinatário vazio' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [para.trim()],
        subject: assunto,
        text: corpoTexto,
        html: corpoHtml || corpoTexto.replace(/\n/g, '<br/>'),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, erro: err.slice(0, 200) };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, erro: e.message || String(e) };
  }
}

export function resendConfigurado(): boolean {
  return !!process.env.RESEND_API_KEY;
}
