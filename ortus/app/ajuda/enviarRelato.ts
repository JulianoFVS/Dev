import { supabase } from '@/lib/supabase';
import type { PedidoRelato } from '@/lib/relatos';

export type ResultadoEnvio = { ok: true } | { ok: false; erro: string };

const SESSAO_EXPIRADA = 'Sua sessão expirou. Entre de novo e envie o relato.';

/** A rota responde { ok: true, ... } ou { error: string }. Qualquer outra coisa conta como falha. */
function lerResposta(valor: unknown): { ok: boolean; erro: string } {
  if (!valor || typeof valor !== 'object') return { ok: false, erro: '' };
  const registro = valor as Record<string, unknown>;
  return { ok: registro.ok === true, erro: typeof registro.error === 'string' ? registro.error.trim() : '' };
}

function mensagemDaFalha(status: number, doServidor: string): string {
  if (status === 401) return SESSAO_EXPIRADA;
  // 400 e 429 chegam com o motivo exato (campo que faltou, minutos de espera): vale o texto da rota.
  if (doServidor) return doServidor;
  if (status === 429) return 'Muitos relatos em pouco tempo. Espere alguns minutos e tente de novo.';
  if (status === 400) return 'Confira os campos e tente de novo.';
  return 'Não foi possível enviar o relato. Tente de novo em instantes.';
}

/**
 * Envia o relato para a fila do suporte (POST /api/relatos).
 * Nunca lança: devolve o texto que a tela mostra quando não deu certo.
 * A resposta também diz se o e-mail interno saiu; isso não interessa a quem relata e fica de fora.
 */
export async function enviarRelato(pedido: PedidoRelato): Promise<ResultadoEnvio> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { ok: false, erro: SESSAO_EXPIRADA };

    const resposta = await fetch('/api/relatos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(pedido),
    });
    const corpo: unknown = await resposta.json().catch(() => null);
    const lido = lerResposta(corpo);
    if (resposta.ok && lido.ok) return { ok: true };
    return { ok: false, erro: mensagemDaFalha(resposta.status, lido.erro) };
  } catch {
    return { ok: false, erro: 'Não foi possível falar com o servidor. Confira a internet e tente de novo.' };
  }
}
