/**
 * Assinatura — tipos e rótulos usados pelas telas (checkout, Assinatura, faixa
 * de aviso e painel SaaS). Nada aqui decide acesso: quem decide é o banco
 * (`assinatura_estado`, `clinica_aceita_escrita`).
 */

export type EstadoAssinatura = 'sem_cobranca' | 'ativa' | 'em_atraso' | 'bloqueada' | 'suspensa' | 'cancelada';
export type EstadoPagamento = 'pendente' | 'aprovado' | 'recusado' | 'estornado' | 'contestado' | 'cancelado';
export type StatusFatura = 'aberta' | 'paga' | 'cancelada' | 'estornada' | 'contestada';
export type StatusPedido = 'aguardando_pagamento' | 'pago' | 'provisionado' | 'expirado' | 'estornado' | 'contestado' | 'cancelado';

export type PlanoPublico = {
  codigo: string;
  nome: string;
  descricao: string | null;
  valor_centavos: number;
  recursos: string[];
  destaque: boolean;
};

/** Vitrine de reserva: aparece enquanto a lista do servidor não chega. O preço cobrado é sempre o do banco. */
export const PLANOS_VITRINE: PlanoPublico[] = [
  { codigo: 'basico', nome: 'Básico', descricao: 'Para quem atende sozinho.', valor_centavos: 9700, recursos: ['1 profissional', 'Agenda', 'Prontuário simples'], destaque: false },
  { codigo: 'profissional', nome: 'Profissional', descricao: 'Para consultórios com equipe pequena.', valor_centavos: 19700, recursos: ['Até 3 profissionais', 'Financeiro completo', 'Anamnese personalizada', 'Suporte prioritário'], destaque: true },
  { codigo: 'clinica', nome: 'Clínica', descricao: 'Para clínicas com várias cadeiras ou unidades.', valor_centavos: 29700, recursos: ['Profissionais ilimitados', 'Multiclínicas', 'Gestão avançada'], destaque: false },
];

export type FaturaDaAssinatura = {
  id: number;
  competencia: string;
  vencimento: string;
  valor_centavos: number;
  status: StatusFatura;
  pago_em?: string | null;
  metodo?: string | null;
  origem?: string | null;
  pagamento_status: EstadoPagamento | null;
  pagamento_detalhe: string | null;
};

/** Resposta de `assinatura_situacao`. Quem não administra a rede recebe só os três primeiros campos. */
export type SituacaoAssinatura = {
  estado: EstadoAssinatura;
  pode_gravar: boolean;
  admin: boolean;
  rede_id?: string;
  rede_nome?: string;
  plano?: string | null;
  plano_nome?: string | null;
  valor_centavos?: number;
  dia_vencimento?: number;
  cobranca_automatica?: boolean;
  inicio?: string | null;
  divida_desde?: string | null;
  bloqueio_em?: string | null;
  bloqueio_suspenso_ate?: string | null;
  tolerancia_dias?: number;
  proxima_cobranca?: string | null;
  fatura_pendente?: Pick<FaturaDaAssinatura, 'id' | 'competencia' | 'vencimento' | 'valor_centavos' | 'status' | 'pagamento_status' | 'pagamento_detalhe'> | null;
  hoje?: string;
  faturas?: FaturaDaAssinatura[];
  /** Quanto do plano está em uso (só para o administrador da matriz). */
  uso?: UsoDoPlano | null;
};

/** Limites do plano e quanto já está ocupado (limite null = sem limite). */
export type UsoDoPlano = {
  plano: string | null;
  plano_nome: string | null;
  limite_profissionais: number | null;
  profissionais: number;
  limite_unidades: number | null;
  unidades: number;
};

/** "1 de 1 profissional" / "2 de 3 profissionais"; null quando o plano não limita. */
export function textoDoLimite(usados: number, limite: number | null, singular: string, plural: string): string | null {
  if (!limite) return null;
  // Rede que mudou para um plano menor continua com quem já tinha; só não entra mais ninguém.
  return `${usados} de ${limite} ${limite === 1 ? singular : plural}${usados > limite ? ' (acima do plano)' : ''}`;
}

type Meta = { rotulo: string; chip: string; ponto: string };

export const ESTADO_ASSINATURA_META: Record<EstadoAssinatura, Meta> = {
  sem_cobranca: { rotulo: 'Cobrança manual', chip: 'border-neutral-200 bg-white text-neutral-600', ponto: 'bg-neutral-300' },
  ativa: { rotulo: 'Em dia', chip: 'border-emerald-200 bg-emerald-50 text-emerald-700', ponto: 'bg-emerald-500' },
  em_atraso: { rotulo: 'Em atraso', chip: 'border-amber-200 bg-amber-50 text-amber-800', ponto: 'bg-amber-500' },
  bloqueada: { rotulo: 'Modo de consulta', chip: 'border-rose-200 bg-rose-50 text-rose-700', ponto: 'bg-rose-500' },
  suspensa: { rotulo: 'Suspensa', chip: 'border-neutral-300 bg-neutral-100 text-neutral-600', ponto: 'bg-neutral-500' },
  cancelada: { rotulo: 'Cancelada', chip: 'border-neutral-300 bg-neutral-100 text-neutral-600', ponto: 'bg-neutral-500' },
};

export const STATUS_FATURA_ASSINATURA_META: Record<StatusFatura, Meta> = {
  aberta: { rotulo: 'Em aberto', chip: 'border-amber-200 bg-amber-50 text-amber-800', ponto: 'bg-amber-500' },
  paga: { rotulo: 'Paga', chip: 'border-emerald-200 bg-emerald-50 text-emerald-700', ponto: 'bg-emerald-500' },
  cancelada: { rotulo: 'Cancelada', chip: 'border-neutral-200 bg-neutral-100 text-neutral-500', ponto: 'bg-neutral-400' },
  estornada: { rotulo: 'Estornada', chip: 'border-rose-200 bg-rose-50 text-rose-700', ponto: 'bg-rose-500' },
  contestada: { rotulo: 'Contestada', chip: 'border-rose-200 bg-rose-50 text-rose-700', ponto: 'bg-rose-500' },
};

export const ESTADO_PAGAMENTO_META: Record<EstadoPagamento, Meta> = {
  pendente: { rotulo: 'Pagamento pendente', chip: 'border-amber-200 bg-amber-50 text-amber-800', ponto: 'bg-amber-500' },
  aprovado: { rotulo: 'Pagamento confirmado', chip: 'border-emerald-200 bg-emerald-50 text-emerald-700', ponto: 'bg-emerald-500' },
  recusado: { rotulo: 'Pagamento recusado', chip: 'border-rose-200 bg-rose-50 text-rose-700', ponto: 'bg-rose-500' },
  estornado: { rotulo: 'Pagamento estornado', chip: 'border-rose-200 bg-rose-50 text-rose-700', ponto: 'bg-rose-500' },
  contestado: { rotulo: 'Pagamento contestado', chip: 'border-rose-200 bg-rose-50 text-rose-700', ponto: 'bg-rose-500' },
  cancelado: { rotulo: 'Pagamento cancelado', chip: 'border-neutral-200 bg-neutral-100 text-neutral-500', ponto: 'bg-neutral-400' },
};

export const STATUS_PEDIDO_META: Record<StatusPedido, Meta> = {
  aguardando_pagamento: { rotulo: 'Aguardando pagamento', chip: 'border-amber-200 bg-amber-50 text-amber-800', ponto: 'bg-amber-500' },
  pago: { rotulo: 'Pago, criando a conta', chip: 'border-sky-200 bg-sky-50 text-sky-700', ponto: 'bg-sky-500' },
  provisionado: { rotulo: 'Conta criada', chip: 'border-emerald-200 bg-emerald-50 text-emerald-700', ponto: 'bg-emerald-500' },
  expirado: { rotulo: 'Expirado', chip: 'border-neutral-200 bg-neutral-100 text-neutral-500', ponto: 'bg-neutral-400' },
  estornado: { rotulo: 'Estornado', chip: 'border-rose-200 bg-rose-50 text-rose-700', ponto: 'bg-rose-500' },
  contestado: { rotulo: 'Contestado', chip: 'border-rose-200 bg-rose-50 text-rose-700', ponto: 'bg-rose-500' },
  cancelado: { rotulo: 'Cancelado', chip: 'border-neutral-200 bg-neutral-100 text-neutral-500', ponto: 'bg-neutral-400' },
};

const MOTIVOS: Record<string, string> = {
  cc_rejected_insufficient_amount: 'Saldo ou limite insuficiente no cartão.',
  cc_rejected_bad_filled_card_number: 'O número do cartão não confere.',
  cc_rejected_bad_filled_date: 'A validade do cartão não confere.',
  cc_rejected_bad_filled_security_code: 'O código de segurança não confere.',
  cc_rejected_bad_filled_other: 'Algum dado do cartão não confere.',
  cc_rejected_call_for_authorize: 'O banco pede que você autorize esta compra com ele antes de tentar de novo.',
  cc_rejected_card_disabled: 'O cartão está desabilitado. Fale com o banco ou use outro cartão.',
  cc_rejected_high_risk: 'O pagamento não passou na análise de segurança. Tente outro meio de pagamento.',
  cc_rejected_blacklist: 'O pagamento não pôde ser processado com este cartão.',
  cc_rejected_duplicated_payment: 'Já existe um pagamento igual a este. Confira antes de tentar de novo.',
  cc_rejected_max_attempts: 'Muitas tentativas com este cartão. Use outro cartão ou o Pix.',
  cc_rejected_other_reason: 'O banco recusou o pagamento.',
  pending_waiting_transfer: 'Aguardando o pagamento do Pix.',
  pending_waiting_payment: 'Aguardando o pagamento.',
  pending_contingency: 'O pagamento está sendo processado.',
  pending_review_manual: 'O pagamento está em análise.',
  expired: 'O prazo para pagar terminou.',
  by_collector: 'O pagamento foi cancelado.',
  by_payer: 'O pagamento foi cancelado por quem pagava.',
  partially_refunded: 'Parte do valor foi devolvida.',
};

/** Explicação do provedor em português, quando há uma. Código desconhecido não é mostrado cru. */
export function motivoDoPagamento(detalhe?: string | null): string | null {
  if (!detalhe) return null;
  return MOTIVOS[detalhe] ?? null;
}

export function rotuloMeio(meio?: string | null): string {
  switch (meio) {
    case 'pix':
      return 'Pix';
    case 'cartao_credito':
      return 'Cartão de crédito';
    case 'cartao_debito':
      return 'Cartão de débito';
    case 'saldo_mercado_pago':
      return 'Saldo do Mercado Pago';
    case 'transferencia':
      return 'Transferência';
    case 'boleto':
      return 'Boleto';
    default:
      return meio ? meio.charAt(0).toUpperCase() + meio.slice(1).replace(/_/g, ' ') : '—';
  }
}

export function reais(centavos?: number | null): string {
  const valor = typeof centavos === 'number' && Number.isFinite(centavos) ? centavos / 100 : 0;
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "2026-11-18" → "18/11/2026", sem passar por Date (não escorrega de dia com o fuso). */
export function dataCurta(iso?: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : '—';
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export function mesDaCompetencia(iso?: string | null): string {
  if (!iso) return '—';
  const [a, m] = iso.slice(0, 10).split('-');
  const mes = Number(m);
  return a && mes >= 1 && mes <= 12 ? `${MESES[mes - 1]} de ${a}` : '—';
}

/** Dias entre duas datas ISO (b - a), inteiros. */
export function diasEntre(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const [ay, am, ad] = a.slice(0, 10).split('-').map(Number);
  const [by, bm, bd] = b.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Faixa de aviso da casca: o que dizer, e para quem. null = nada a dizer. */
export function avisoDaAssinatura(s: SituacaoAssinatura | null): { tom: 'aviso' | 'bloqueio'; texto: string; acao: boolean } | null {
  if (!s) return null;
  if (s.estado === 'bloqueada') {
    return {
      tom: 'bloqueio',
      texto: s.admin
        ? 'Assinatura com fatura vencida: o sistema está em modo de consulta. Tudo pode ser lido; para voltar a gravar, pague a fatura.'
        : 'O sistema está em modo de consulta por pendência na assinatura. Tudo pode ser lido; avise o administrador da clínica para voltar a gravar.',
      acao: s.admin,
    };
  }
  if (s.estado === 'suspensa' || s.estado === 'cancelada') {
    return {
      tom: 'bloqueio',
      texto: s.estado === 'cancelada'
        ? 'A assinatura desta clínica foi encerrada. O sistema está em modo de consulta: tudo pode ser lido, nada é gravado.'
        : 'O acesso desta clínica está suspenso pelo suporte do Ortus. O sistema está em modo de consulta: tudo pode ser lido, nada é gravado.',
      acao: false,
    };
  }
  if (s.estado === 'em_atraso' && s.admin) {
    const ate = s.bloqueio_em ? ` A partir de ${dataCurta(s.bloqueio_em)} o sistema entra em modo de consulta.` : '';
    return { tom: 'aviso', texto: `Há uma fatura do Ortus vencida.${ate}`, acao: true };
  }
  return null;
}
