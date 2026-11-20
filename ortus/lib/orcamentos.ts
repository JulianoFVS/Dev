/**
 * Orçamentos: tipos, rótulos e regras puras (sem banco).
 *
 * Ciclo: rascunho → enviado ou em aberto → aprovado ou recusado.
 * - "Enviado": mandado ao paciente (WhatsApp, impresso) e esperando resposta.
 * - "Em aberto": apresentado e parado, sem virar tratamento e sem recusa.
 * - "Expirado": a validade passou sem aprovação nem recusa. É calculado na
 *   leitura (statusEfetivo), sem rotina no servidor; o orçamento vencido sai
 *   do funil "em andamento" no dia seguinte ao da validade.
 */

export type StatusOrcamento = 'rascunho' | 'enviado' | 'em_aberto' | 'aprovado' | 'recusado' | 'expirado';

export type PacienteDoOrcamento = {
  id: string;
  nome: string | null;
  telefone: string | null;
  responsavel_telefone?: string | null;
};

export type Orcamento = {
  id: string;
  clinica_id: number;
  paciente_id: string;
  profissional_id: number | null;
  comercial_id: number | null;
  status: StatusOrcamento;
  validade: string | null;
  valor_total: number;
  desconto: number;
  observacoes: string | null;
  status_desde: string;
  enviado_em: string | null;
  aprovado_em: string | null;
  recusado_em: string | null;
  motivo_recusa: string | null;
  proximo_contato: string | null;
  ultimo_contato_em: string | null;
  criado_por: number | null;
  created_at: string;
  updated_at: string;
  pacientes?: PacienteDoOrcamento | null;
};

export type OrcamentoItem = {
  id: string;
  clinica_id: number;
  orcamento_id: string;
  tratamento_base_id: number | null;
  procedimento: string;
  dente: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  ordem: number;
  tratamento_id: string | null;
};

export type MotivoContato =
  | 'orcamento'
  | 'avaliacao_sem_orcamento'
  | 'faltou_sem_retorno'
  | 'cancelou_sem_retorno'
  | 'outro';

export type CanalContato = 'ligacao' | 'whatsapp' | 'presencial' | 'outro';

export type ContatoComercial = {
  id: string;
  clinica_id: number;
  paciente_id: string;
  orcamento_id: string | null;
  motivo: MotivoContato;
  canal: CanalContato;
  resumo: string | null;
  proximo_contato: string | null;
  feito_por: number | null;
  created_at: string;
};

export const ROTULO_STATUS_ORCAMENTO: Record<StatusOrcamento, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  em_aberto: 'Em aberto',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  expirado: 'Expirado',
};

/** Cores dos chips de status (neutras, no padrão do app). */
export const COR_STATUS_ORCAMENTO: Record<StatusOrcamento, string> = {
  rascunho: 'bg-neutral-100 text-neutral-700',
  enviado: 'bg-sky-50 text-sky-800',
  em_aberto: 'bg-amber-50 text-amber-800',
  aprovado: 'bg-emerald-50 text-emerald-800',
  recusado: 'bg-red-50 text-red-700',
  expirado: 'bg-neutral-100 text-neutral-500',
};

export const ROTULO_CANAL: Record<CanalContato, string> = {
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  presencial: 'Presencial',
  outro: 'Outro',
};

export const ROTULO_MOTIVO: Record<MotivoContato, string> = {
  orcamento: 'Orçamento',
  avaliacao_sem_orcamento: 'Avaliação sem orçamento',
  faltou_sem_retorno: 'Faltou e não remarcou',
  cancelou_sem_retorno: 'Cancelou e não remarcou',
  outro: 'Outro',
};

/** Ainda pode virar tratamento: aparece no funil "em andamento". */
export const STATUS_EM_ANDAMENTO: StatusOrcamento[] = ['rascunho', 'enviado', 'em_aberto'];

/** Apresentado ao paciente e ainda sem resposta (o que o comercial acompanha). */
export const STATUS_APRESENTADO: StatusOrcamento[] = ['enviado', 'em_aberto'];

/** Validade padrão de um orçamento novo, em dias. */
export const VALIDADE_PADRAO_DIAS = 30;

/** Sem contato há tantos dias, o orçamento apresentado volta ao funil de oportunidades. */
export const DIAS_SEM_CONTATO = 7;

export function numero(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(String(valor ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Arredonda para centavos (evita 0.1 + 0.2). */
export function centavos(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function somarItens(itens: Pick<OrcamentoItem, 'quantidade' | 'valor_unitario'>[]): number {
  return centavos(itens.reduce((soma, item) => soma + numero(item.quantidade) * numero(item.valor_unitario), 0));
}

/** Valor final do orçamento: soma dos itens menos o desconto, nunca negativo. */
export function valorFinal(itens: Pick<OrcamentoItem, 'quantidade' | 'valor_unitario'>[], desconto: number): number {
  return Math.max(0, centavos(somarItens(itens) - numero(desconto)));
}

/** Data (AAAA-MM-DD) somada de dias, sem fuso: a conta é feita ao meio-dia UTC. */
export function somarDias(dia: string, dias: number): string {
  const [a, m, d] = dia.split('-').map(Number);
  const data = new Date(Date.UTC(a, (m || 1) - 1, d || 1, 12));
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

/** Status que vale na tela: em andamento com a validade vencida vira "expirado". */
export function statusEfetivo(orc: Pick<Orcamento, 'status' | 'validade'>, hoje: string): StatusOrcamento {
  if (STATUS_EM_ANDAMENTO.includes(orc.status) && orc.validade && orc.validade < hoje) return 'expirado';
  return orc.status;
}

export function emAndamento(orc: Pick<Orcamento, 'status' | 'validade'>, hoje: string): boolean {
  return STATUS_EM_ANDAMENTO.includes(statusEfetivo(orc, hoje));
}

/** Dias desde a última novidade: mudança de status ou contato registrado. */
export function diasParado(
  orc: Pick<Orcamento, 'status_desde' | 'ultimo_contato_em' | 'created_at'>,
  agora: Date = new Date(),
): number {
  const marcos = [orc.status_desde, orc.ultimo_contato_em, orc.created_at]
    .filter(Boolean)
    .map((v) => new Date(String(v)).getTime())
    .filter((v) => Number.isFinite(v));
  if (marcos.length === 0) return 0;
  const ultimo = Math.max(...marcos);
  return Math.max(0, Math.floor((agora.getTime() - ultimo) / 86_400_000));
}

/** O próximo contato combinado já chegou. */
export function ligarHoje(orc: Pick<Orcamento, 'status' | 'validade' | 'proximo_contato'>, hoje: string): boolean {
  return emAndamento(orc, hoje) && Boolean(orc.proximo_contato) && String(orc.proximo_contato) <= hoje;
}

export function formatarDinheiro(valor: number): string {
  return numero(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarDia(dia: string | null | undefined): string {
  if (!dia) return '—';
  const [a, m, d] = String(dia).slice(0, 10).split('-');
  if (!a || !m || !d) return '—';
  return `${d}/${m}/${a}`;
}

/** Primeiro nome, para mensagens e cartões. */
export function primeiroNome(nome: string | null | undefined): string {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

/** Telefone para contato: o do paciente ou, sem ele, o do responsável. */
export function telefoneDoPaciente(p: PacienteDoOrcamento | null | undefined): string | null {
  return (p?.telefone && String(p.telefone).trim()) || (p?.responsavel_telefone && String(p.responsavel_telefone).trim()) || null;
}

/**
 * UUID estável derivado de um texto (SHA-256), usado para o tratamento que
 * nasce de um item aprovado: aprovar de novo, depois de uma falha no meio,
 * encontra o mesmo tratamento em vez de criar outro.
 */
export async function uuidDerivado(base: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
