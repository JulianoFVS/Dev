import { supabase } from '@/lib/supabase';
import type { EstadoAssinatura, SituacaoAssinatura, UsoDoPlano } from '@/lib/assinaturas';

/**
 * Situação da assinatura no navegador.
 *
 * A casca pinta a faixa a partir do que ficou guardado nesta sessão (por
 * clínica) e confirma no servidor em seguida — nunca espera o servidor para
 * desenhar. O que fica guardado é só o estado; valores e faturas não. O
 * `sessionStorage` é limpo no logout (lib/sessao.ts).
 */

/** Avisa a faixa para conferir de novo (pagamento concluído, gravação recusada com 402). */
export const EVENTO_ASSINATURA = 'ortus:assinatura';

const chave = (clinicaId: string) => `ortus_assinatura:${clinicaId}`;

export function situacaoGuardada(clinicaId: string): SituacaoAssinatura | null {
  if (typeof window === 'undefined') return null;
  try {
    const bruto = sessionStorage.getItem(chave(clinicaId));
    return bruto ? (JSON.parse(bruto) as SituacaoAssinatura) : null;
  } catch {
    return null;
  }
}

function guardar(clinicaId: string, s: SituacaoAssinatura) {
  try {
    sessionStorage.setItem(chave(clinicaId), JSON.stringify({
      estado: s.estado,
      pode_gravar: s.pode_gravar,
      admin: s.admin,
      bloqueio_em: s.bloqueio_em ?? null,
    }));
  } catch {
    /* sem espaço ou sem permissão: a faixa só deixa de pintar antes da resposta */
  }
}

/**
 * Pergunta ao banco. Devolve null quando não deu para saber (sem internet,
 * função ainda não instalada): nesse caso a tela não inventa bloqueio.
 */
export async function buscarSituacao(clinicaId: string, detalhe = false): Promise<SituacaoAssinatura | null> {
  const id = Number(clinicaId);
  if (!Number.isSafeInteger(id)) return null;
  const { data, error } = await supabase.rpc('assinatura_situacao', { p_clinica: id, p_detalhe: detalhe });
  if (error || !data) return null;
  const situacao = data as SituacaoAssinatura;
  // Na tela Assinatura (detalhe), o administrador vê também quanto do plano está em uso.
  if (detalhe && situacao.admin) {
    situacao.uso = await buscarUsoDoPlano(clinicaId);
  }
  guardar(clinicaId, situacao);
  return situacao;
}

/** Limites do plano e uso da rede da clínica (null para quem não administra ou se não deu para saber). */
export async function buscarUsoDoPlano(clinicaId: string): Promise<UsoDoPlano | null> {
  const id = Number(clinicaId);
  if (!Number.isSafeInteger(id)) return null;
  const { data, error } = await supabase.rpc('assinatura_uso_do_plano', { p_clinica: id });
  if (error || !data) return null;
  return data as UsoDoPlano;
}

export function avisarMudancaNaAssinatura() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_ASSINATURA));
}

const GRAVIDADE: Record<EstadoAssinatura, number> = { bloqueada: 5, suspensa: 4, cancelada: 4, em_atraso: 2, ativa: 0, sem_cobranca: 0 };

/** A situação mais grave da lista (no empate, a primeira). A faixa e a tela Assinatura usam a mesma regra. */
export function piorSituacao(lista: (SituacaoAssinatura | null)[]): SituacaoAssinatura | null {
  let escolhida: SituacaoAssinatura | null = null;
  for (const s of lista) {
    if (s && (!escolhida || GRAVIDADE[s.estado] > GRAVIDADE[escolhida.estado])) escolhida = s;
  }
  return escolhida;
}

/**
 * Em "todas as clínicas": uma clínica por rede para perguntar a situação (no
 * máximo 5). Dentro da rede prefere a clínica em que a pessoa não é convidada,
 * porque é nela que o banco a reconhece como administradora.
 */
export function clinicaPorRede(
  clinics: { id: string | number; rede_id?: string | null; convidado?: boolean }[],
  limite = 5,
): { id: string; convidado: boolean }[] {
  const porRede = new Map<string, { id: string; convidado: boolean }>();
  for (const c of clinics) {
    const rede = c.rede_id || `clinica:${c.id}`;
    const atual = porRede.get(rede);
    if (!atual || (atual.convidado && !c.convidado)) porRede.set(rede, { id: String(c.id), convidado: c.convidado === true });
  }
  return [...porRede.values()].slice(0, limite);
}
