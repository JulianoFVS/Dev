import { enderecoDoServico } from '@/lib/servicosExternos';

/**
 * Envio de e-mail pela Resend (servidor).
 *
 * Regra da casa: e-mail só "saiu" quando a Resend respondeu 2xx. Chave
 * ausente, remetente ausente ou recusa da Resend voltam como `ok: false`
 * com o motivo — quem chama decide o que mostrar, mas nunca trata como
 * enviado.
 *
 * Variáveis: RESEND_API_KEY e RESEND_FROM_EMAIL (remetente num domínio
 * verificado na Resend, ex.: "Ortus <nao-responda@seudominio.com.br>").
 */

export type ResultadoEmail = { ok: true; id: string | null } | { ok: false; erro: string; status?: number };

export type PedidoEmail = {
  para: string | string[];
  assunto: string;
  texto: string;
  html?: string;
  /** Endereço que recebe a resposta (ex.: o e-mail da clínica no lembrete). */
  responderPara?: string | null;
  /** Rótulo para as estatísticas da Resend: "convite", "lembrete", "cobranca"… */
  categoria?: string;
};

const EMAIL_VALIDO = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

export function emailValido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length <= 254 && EMAIL_VALIDO.test(valor.trim());
}

/** Remetente configurado, ou '' quando falta. Sem remetente padrão: domínio não verificado a Resend recusa. */
function remetente(): string {
  return (process.env.RESEND_FROM_EMAIL || '').trim();
}

export function resendConfigurado(): boolean {
  return Boolean((process.env.RESEND_API_KEY || '').trim() && remetente());
}

/** O que falta para o e-mail funcionar, em português, ou null quando está tudo configurado. */
export function pendenciaDoEmail(): string | null {
  if (!(process.env.RESEND_API_KEY || '').trim()) return 'RESEND_API_KEY não configurada';
  if (!remetente()) return 'RESEND_FROM_EMAIL não configurado';
  return null;
}

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A Resend devolve `{ name, message, statusCode }`. Fica só a mensagem, sem repetir o destinatário. */
async function motivoDaRecusa(resposta: Response): Promise<string> {
  const bruto = await resposta.text().catch(() => '');
  let mensagem = bruto;
  try {
    const dados = JSON.parse(bruto) as { message?: unknown; name?: unknown };
    if (typeof dados.message === 'string' && dados.message) mensagem = dados.message;
    else if (typeof dados.name === 'string') mensagem = dados.name;
  } catch {
    /* corpo não é JSON: usa o texto */
  }
  mensagem = mensagem.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail]').slice(0, 240).trim();
  return mensagem ? `A Resend recusou o envio (${resposta.status}): ${mensagem}` : `A Resend recusou o envio (${resposta.status}).`;
}

export async function enviarEmail(pedido: PedidoEmail): Promise<ResultadoEmail> {
  const pendencia = pendenciaDoEmail();
  if (pendencia) return { ok: false, erro: `E-mail não configurado: ${pendencia}.` };

  const destinatarios = (Array.isArray(pedido.para) ? pedido.para : [pedido.para]).map((p) => String(p || '').trim()).filter(Boolean);
  if (destinatarios.length === 0) return { ok: false, erro: 'Destinatário vazio.' };
  const invalido = destinatarios.find((p) => !emailValido(p));
  if (invalido) return { ok: false, erro: 'Endereço de e-mail inválido.' };

  const corpo: Record<string, unknown> = {
    from: remetente(),
    to: destinatarios,
    subject: pedido.assunto.slice(0, 200),
    text: pedido.texto,
    html: pedido.html || `<p>${escapar(pedido.texto).replace(/\n/g, '<br/>')}</p>`,
  };
  if (pedido.responderPara && emailValido(pedido.responderPara)) corpo.reply_to = pedido.responderPara.trim();
  if (pedido.categoria) corpo.tags = [{ name: 'categoria', value: pedido.categoria.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 50) }];

  try {
    const resposta = await fetch(`${enderecoDoServico('RESEND', 'https://api.resend.com')}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${(process.env.RESEND_API_KEY || '').trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resposta.ok) return { ok: false, erro: await motivoDaRecusa(resposta), status: resposta.status };
    const dados = (await resposta.json().catch(() => ({}))) as { id?: unknown };
    return { ok: true, id: typeof dados.id === 'string' ? dados.id : null };
  } catch (e) {
    const motivo = e instanceof Error && e.name === 'TimeoutError' ? 'a Resend não respondeu em 15 s' : 'falha de rede ao falar com a Resend';
    return { ok: false, erro: `E-mail não enviado: ${motivo}.` };
  }
}
