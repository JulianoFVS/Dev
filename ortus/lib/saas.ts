/**
 * Painel SaaS — tipos e formatadores.
 *
 * Todas as informações vêm das RPCs `saas_*`, que exigem `is_super_admin()`
 * no banco. Nada aqui deve ser usado como fonte de autorização: a checagem
 * de acesso é feita na página e, de novo, em cada função do Supabase.
 */

export type StatusFinanceiroSaaS =
  | 'em_dia'
  | 'em_aberto'
  | 'inadimplente'
  | 'suspensa'
  | 'sem_fatura';

export type StatusFaturaSaaS = 'aberta' | 'paga' | 'cancelada' | 'estornada' | 'contestada';

export type StatusConviteSaaS = 'pendente' | 'aceito' | 'recusado' | 'cancelado' | 'expirado';

export type RedeSaaS = {
  id: string;
  nome: string;
  plano: string | null;
  ativa: boolean;
  valor_mensal_centavos: number;
  dia_vencimento: number;
  cnpj: string | null;
  contato_nome: string | null;
  contato_email: string | null;
  contato_telefone: string | null;
  observacao: string | null;
  created_at: string | null;
  status_financeiro: StatusFinanceiroSaaS;
  clinicas: number;
  profissionais: number;
  faturas_abertas: number;
  vencido_centavos: number;
  proximo_vencimento: string | null;
  armazenamento_bytes: number;
};

export type TotaisSaaS = {
  redes: number;
  redes_ativas: number;
  redes_inadimplentes: number;
  clinicas: number;
  clinicas_sem_rede: number;
  profissionais: number;
  vinculos: number;
  faturas_abertas: number;
  vencido_centavos: number;
  recebido_centavos: number;
};

export type ClinicaSemRedeSaaS = {
  id: number;
  nome: string;
  is_matriz: boolean | null;
};

export type VisaoGeralSaaS = {
  redes: RedeSaaS[];
  totais: TotaisSaaS;
  sem_rede: ClinicaSemRedeSaaS[];
};

export type ReferenciaClinicaSaaS = { id: number; nome: string };
export type ReferenciaRedeSaaS = { id: string; nome: string };

export type ClinicaDaRedeSaaS = {
  id: number;
  nome: string;
  is_matriz: boolean | null;
  cidade: string | null;
  uf: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  logo_url: string | null;
  limite_armazenamento_mb: number | null;
  armazenamento_bytes: number;
  profissionais: number;
  pacientes: number;
};

export type ProfissionalDaRedeSaaS = {
  id: number;
  user_id: string | null;
  nome: string;
  cargo: string | null;
  nivel_acesso: string | null;
  is_super_admin: boolean | null;
  ativo: boolean | null;
  email: string | null;
  telefone: string | null;
  created_at: string | null;
  clinicas_rede: ReferenciaClinicaSaaS[];
  outras_redes: ReferenciaRedeSaaS[];
  clinicas_fora_da_rede: ReferenciaClinicaSaaS[];
};

export type FaturaSaaS = {
  id: number;
  competencia: string;
  vencimento: string;
  valor_centavos: number;
  status: StatusFaturaSaaS;
  pago_em: string | null;
  metodo: string | null;
  observacao: string | null;
  /** manual = lançada no painel; automatica = rotina do mês; checkout = 1ª mensalidade da assinatura. */
  origem?: 'manual' | 'automatica' | 'checkout' | null;
  pagamento_status?: 'pendente' | 'aprovado' | 'recusado' | 'estornado' | 'contestado' | 'cancelado' | null;
  pagamento_detalhe?: string | null;
  pagamento_em?: string | null;
  estornado_em?: string | null;
  contestado_em?: string | null;
  tem_link?: boolean;
};

/** Estado da assinatura de uma rede, como o banco calcula (assinatura_estado). */
export type EstadoAssinaturaSaaS = 'sem_cobranca' | 'ativa' | 'em_atraso' | 'bloqueada' | 'suspensa' | 'cancelada';

export type ResumoAssinaturaRedeSaaS = {
  estado: EstadoAssinaturaSaaS;
  cobranca_automatica: boolean;
  divida_desde: string | null;
  bloqueio_suspenso_ate: string | null;
  proxima_cobranca: string | null;
  ultimo_pagamento_em: string | null;
};

export type ResumoAssinaturasSaaS = {
  redes: Record<string, ResumoAssinaturaRedeSaaS>;
  totais: {
    cobranca_automatica: number;
    em_atraso: number;
    modo_consulta: number;
    compras_aguardando: number;
    compras_com_erro: number;
    pagamentos_revisar: number;
    avisos_com_erro: number;
    recebido_30d_centavos: number;
  };
};

export type PagamentoEventoSaaS = {
  id: number;
  criado_em: string;
  atualizado_em?: string;
  vezes: number;
  origem?: string;
  pagamento_ref: string;
  referencia?: string | null;
  estado: 'pendente' | 'aprovado' | 'recusado' | 'estornado' | 'contestado' | 'cancelado';
  detalhe: string | null;
  valor_centavos: number | null;
  meio: string | null;
  alvo: 'pedido' | 'fatura' | 'desconhecido';
  pedido_id?: string | null;
  fatura_id: number | null;
  rede_id?: string | null;
  rede_nome?: string | null;
  resultado?: 'aplicado' | 'ignorado' | 'revisar';
  motivo: string | null;
  resolvido_em?: string | null;
  resolucao?: string | null;
};

export type AvisoCobrancaSaaS = {
  id: number;
  criado_em: string;
  tipo: 'fatura_gerada' | 'fatura_atrasada' | 'acesso_bloqueado' | 'acesso_reaberto';
  rede_id?: string;
  rede_nome?: string | null;
  fatura_id?: number | null;
  enviado_em?: string | null;
  destinatarios?: number | null;
  tentativas: number;
  erro: string | null;
};

export type PedidoAssinaturaSaaS = {
  id: string;
  criado_em: string;
  status: 'aguardando_pagamento' | 'pago' | 'provisionado' | 'expirado' | 'estornado' | 'contestado' | 'cancelado';
  plano_nome: string;
  valor_centavos: number;
  clinica_nome?: string;
  responsavel_nome: string;
  email: string;
  pagamento_status?: string | null;
  pagamento_detalhe?: string | null;
  pagamento_meio: string | null;
  pagamento_em: string | null;
  rede_id?: string | null;
  provisionado_em: string | null;
  provisionamento_erro?: string | null;
  provisionamento_tentativas?: number;
  email_acesso_em: string | null;
  email_acesso_erro: string | null;
};

export type AssinaturaRedeSaaS = {
  estado: EstadoAssinaturaSaaS;
  plano: string | null;
  plano_nome: string | null;
  valor_centavos: number;
  dia_vencimento: number;
  ativa: boolean;
  cobranca_automatica: boolean;
  inicio: string | null;
  divida_desde: string | null;
  bloqueio_em: string | null;
  bloqueada_em: string | null;
  bloqueio_suspenso_ate: string | null;
  cancelada_em: string | null;
  cancelamento_motivo: string | null;
  tolerancia_dias: number;
  proxima_cobranca: string | null;
  hoje: string;
  planos: { codigo: string; nome: string; valor_centavos: number; publico: boolean }[];
  pagamentos: PagamentoEventoSaaS[];
  avisos: AvisoCobrancaSaaS[];
  pedido: PedidoAssinaturaSaaS | null;
};

export type PendenciasAssinaturaSaaS = {
  pedidos: PedidoAssinaturaSaaS[];
  revisar: PagamentoEventoSaaS[];
  avisos_com_erro: AvisoCobrancaSaaS[];
};

/** Por que um pagamento ficou para conferência humana (pagamento_aplicar). */
export const MOTIVO_REVISAR: Record<string, string> = {
  valor_divergente: 'Valor pago diferente do cobrado',
  duplicado: 'Pagamento em duplicidade',
  sem_alvo: 'Pagamento sem compra ou fatura correspondente',
  fatura_cancelada: 'Pago depois de a fatura ser cancelada',
  estorno_parcial: 'Estorno parcial',
  // O e-mail ganhou conta por outro caminho (convite, outra compra) antes do pagamento: não nasce outra conta.
  email_em_uso: 'E-mail da compra já tinha conta: estornar o pagamento',
  contestacao_atualizada: 'Contestação mudou de fase: conferir no Mercado Pago',
  pagamento_de_teste: 'Pagamento de teste no servidor de produção: conferir a credencial do Mercado Pago',
};

/** Por que a conta de uma compra paga não foi criada (assinatura_pedidos.provisionamento_erro). */
export const MOTIVO_CONTA_NAO_CRIADA: Record<string, string> = {
  email_em_uso: 'o e-mail da compra já tem conta no Ortus',
  falha_no_login: 'o serviço de login não criou o usuário',
  falha_ao_criar_clinica: 'o banco não criou a rede e a clínica',
  erro_inesperado: 'erro inesperado no servidor (ver Operação → falhas)',
};

export type ConviteSaaS = {
  id: number;
  email: string | null;
  status: StatusConviteSaaS;
  criado_em: string | null;
  convidante: string | null;
  clinica_ids: number[] | null;
};

export type RedeComercialSaaS = {
  id: string;
  nome: string;
  plano: string | null;
  ativa: boolean;
  valor_mensal_centavos: number;
  dia_vencimento: number;
  cnpj: string | null;
  contato_nome: string | null;
  contato_email: string | null;
  contato_telefone: string | null;
  observacao: string | null;
  created_at: string | null;
  status_financeiro: StatusFinanceiroSaaS;
};

export type RedeDetalheSaaS = {
  rede: RedeComercialSaaS;
  clinicas: ClinicaDaRedeSaaS[];
  profissionais: ProfissionalDaRedeSaaS[];
  faturas: FaturaSaaS[];
  convites: ConviteSaaS[];
};

export type DadosRedeSaaS = {
  nome: string;
  plano: string;
  ativa: boolean;
  valor_mensal_centavos: number;
  dia_vencimento: number;
  cnpj: string | null;
  contato_nome: string | null;
  contato_email: string | null;
  contato_telefone: string | null;
  observacao: string | null;
};

export type OrdenacaoSaaS =
  | 'nome_asc'
  | 'nome_desc'
  | 'clinicas_desc'
  | 'vencido_desc'
  | 'vencimento_asc'
  | 'recentes';

type MetaStatus = {
  label: string;
  chip: string;
  ponto: string;
};

export const STATUS_FINANCEIRO_META: Record<StatusFinanceiroSaaS, MetaStatus> = {
  em_dia: {
    label: 'Em dia',
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    ponto: 'bg-emerald-500',
  },
  em_aberto: {
    label: 'Em aberto',
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
    ponto: 'bg-amber-500',
  },
  inadimplente: {
    label: 'Inadimplente',
    chip: 'border-rose-200 bg-rose-50 text-rose-700',
    ponto: 'bg-rose-500',
  },
  suspensa: {
    label: 'Suspensa',
    chip: 'border-neutral-200 bg-neutral-100 text-neutral-500',
    ponto: 'bg-neutral-400',
  },
  sem_fatura: {
    label: 'Sem fatura',
    chip: 'border-neutral-200 bg-white text-neutral-500',
    ponto: 'bg-neutral-300',
  },
};

export const STATUS_FATURA_META: Record<StatusFaturaSaaS, MetaStatus> = {
  aberta: {
    label: 'Aberta',
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
    ponto: 'bg-amber-500',
  },
  paga: {
    label: 'Paga',
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    ponto: 'bg-emerald-500',
  },
  cancelada: {
    label: 'Cancelada',
    chip: 'border-neutral-200 bg-neutral-100 text-neutral-500',
    ponto: 'bg-neutral-400',
  },
  estornada: {
    label: 'Estornada',
    chip: 'border-rose-200 bg-rose-50 text-rose-700',
    ponto: 'bg-rose-500',
  },
  contestada: {
    label: 'Contestada',
    chip: 'border-rose-200 bg-rose-50 text-rose-700',
    ponto: 'bg-rose-500',
  },
};

/** Mesmos códigos do catálogo `planos_saas`. Os três primeiros são os da página pública. */
export const PLANOS_SAAS: { value: string; label: string }[] = [
  { value: 'basico', label: 'Básico' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'clinica', label: 'Clínica' },
  { value: 'essencial', label: 'Essencial' },
  { value: 'rede', label: 'Rede multiunidade' },
  { value: 'enterprise', label: 'Enterprise' },
];

const ROTULOS_PLANO: Record<string, string> = Object.fromEntries(
  PLANOS_SAAS.map((plano) => [plano.value, plano.label]),
);

export const OPCOES_ORDENACAO: { value: OrdenacaoSaaS; label: string }[] = [
  { value: 'nome_asc', label: 'Nome (A–Z)' },
  { value: 'nome_desc', label: 'Nome (Z–A)' },
  { value: 'clinicas_desc', label: 'Mais clínicas' },
  { value: 'vencido_desc', label: 'Maior valor vencido' },
  { value: 'vencimento_asc', label: 'Vencimento mais próximo' },
  { value: 'recentes', label: 'Criadas recentemente' },
];

export const OPCOES_DIA_VENCIMENTO: { value: string; label: string }[] = Array.from(
  { length: 28 },
  (_, indice) => ({ value: String(indice + 1), label: `Dia ${indice + 1}` }),
);

export const OPCOES_STATUS_FATURA: { value: StatusFaturaSaaS; label: string }[] = [
  { value: 'aberta', label: 'Aberta' },
  { value: 'paga', label: 'Paga' },
  { value: 'cancelada', label: 'Cancelada' },
];

const MESES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function rotuloPlano(plano?: string | null): string {
  if (!plano) return 'Sem plano';
  return ROTULOS_PLANO[plano] ?? plano.charAt(0).toUpperCase() + plano.slice(1);
}

export function rotuloNivelAcesso(nivel?: string | null): string {
  if (!nivel) return 'Colaborador';
  const mapa: Record<string, string> = {
    admin: 'Administrador',
    usuario: 'Usuário',
    user: 'Usuário',
    recepcao: 'Recepção',
    dentista: 'Dentista',
  };
  return mapa[nivel] ?? nivel.charAt(0).toUpperCase() + nivel.slice(1).replace(/_/g, ' ');
}

export function pluralizar(valor: number, singular: string, plural: string): string {
  return `${valor} ${valor === 1 ? singular : plural}`;
}

export function moeda(centavos?: number | null): string {
  const valor = typeof centavos === 'number' && Number.isFinite(centavos) ? centavos / 100 : 0;
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarBytes(bytes?: number | null): string {
  const total = typeof bytes === 'number' && Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  if (total <= 0) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  const indice = Math.min(unidades.length - 1, Math.floor(Math.log(total) / Math.log(1024)));
  const valor = total / 1024 ** indice;
  const casas = valor >= 10 || indice === 0 ? 0 : 1;
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })} ${unidades[indice]}`;
}

export function formatarData(valor?: string | null): string {
  if (!valor) return '—';
  const data = valor.includes('T') ? new Date(valor) : new Date(`${valor}T12:00:00`);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatarDataHora(valor?: string | null): string {
  if (!valor) return '—';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatarCompetencia(valor?: string | null): string {
  if (!valor) return '—';
  const partes = valor.slice(0, 10).split('-');
  const ano = Number(partes[0]);
  const mes = Number(partes[1]);
  if (!ano || !mes || mes < 1 || mes > 12) return '—';
  return `${MESES_PT[mes - 1]}/${ano}`;
}

export function iniciais(nome?: string | null): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '—';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export function normalizarBusca(valor?: string | null): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function paraISOData(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

let formatoBrasilia: Intl.DateTimeFormat | null = null;

/** Hoje no dia de Brasília (o mesmo `hoje_br()` do banco), seja qual for o fuso do navegador. */
export function hojeISO(): string {
  try {
    formatoBrasilia ??= new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const partes = formatoBrasilia.formatToParts(new Date());
    const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
    const iso = `${parte('year')}-${parte('month')}-${parte('day')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  } catch {
    /* navegador sem o fuso: fica o dia local */
  }
  return paraISOData(new Date());
}

export function competenciaAtualISO(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
}

export function vencimentoSugerido(diaVencimento: number): string {
  const hoje = new Date();
  const dia = Number.isFinite(diaVencimento)
    ? Math.min(28, Math.max(1, Math.floor(diaVencimento)))
    : 10;
  const hojeZerado = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let alvo = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
  if (alvo.getTime() < hojeZerado.getTime()) {
    alvo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, dia);
  }
  return paraISOData(alvo);
}

/** Dias desde o vencimento, contados no dia de Brasília (0 se ainda não venceu). */
export function diasAtraso(vencimento?: string | null): number {
  if (!vencimento) return 0;
  const [a, m, d] = vencimento.slice(0, 10).split('-').map(Number);
  const [ha, hm, hd] = hojeISO().split('-').map(Number);
  if (!a || !m || !d) return 0;
  const diferenca = Math.round((Date.UTC(ha, hm - 1, hd) - Date.UTC(a, m - 1, d)) / 86_400_000);
  return diferenca > 0 ? diferenca : 0;
}

/** Em dívida (aberta, estornada ou contestada) e com vencimento antes de hoje. */
export function faturaVencida(fatura: Pick<FaturaSaaS, 'status' | 'vencimento'>): boolean {
  return faturaEmDivida(fatura) && diasAtraso(fatura.vencimento) > 0;
}

/** Fatura que ainda conta como dívida: aberta, estornada ou contestada. */
export function faturaEmDivida(fatura: Pick<FaturaSaaS, 'status'>): boolean {
  return fatura.status === 'aberta' || fatura.status === 'estornada' || fatura.status === 'contestada';
}

export function percentualArmazenamento(
  usadoBytes: number | null | undefined,
  limiteMb: number | null | undefined,
): number | null {
  const usado = typeof usadoBytes === 'number' && Number.isFinite(usadoBytes) ? usadoBytes : 0;
  const limite =
    typeof limiteMb === 'number' && Number.isFinite(limiteMb) ? limiteMb * 1024 * 1024 : 0;
  if (limite <= 0) return null;
  return Math.min(100, Math.max(0, (usado / limite) * 100));
}

export function centavosParaDigitacao(centavos?: number | null): string {
  const valor = typeof centavos === 'number' && Number.isFinite(centavos) ? centavos / 100 : 0;
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function digitarMoeda(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 12);
  if (!digitos) return '';
  return centavosParaDigitacao(Number(digitos));
}

export function digitosParaCentavos(texto: string): number {
  const digitos = texto.replace(/\D/g, '');
  if (!digitos) return 0;
  const valor = Number(digitos);
  return Number.isFinite(valor) ? valor : 0;
}

export function mascaraCnpj(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 14);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 5) return `${digitos.slice(0, 2)}.${digitos.slice(2)}`;
  if (digitos.length <= 8) {
    return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5)}`;
  }
  if (digitos.length <= 12) {
    return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8)}`;
  }
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

export function mensagemDeErro(erro: unknown, padrao: string): string {
  if (typeof erro === 'string' && erro.trim()) return erro.trim();

  if (erro && typeof erro === 'object') {
    const alvo = erro as { message?: unknown; code?: unknown };
    const codigo = typeof alvo.code === 'string' ? alvo.code : '';
    const mensagem = typeof alvo.message === 'string' ? alvo.message.trim() : '';

    if (codigo === '42501') return 'Acesso restrito aos donos da plataforma.';
    if (codigo === 'P0002') return mensagem || 'Registro não encontrado.';
    if (mensagem) {
      if (/failed to fetch|networkerror|load failed|network error/i.test(mensagem)) {
        return 'Falha de conexão com o servidor. Verifique sua internet e tente novamente.';
      }
      if (/jwt expired|invalid jwt|token.*expired/i.test(mensagem)) {
        return 'Sua sessão expirou. Entre novamente para continuar.';
      }
      return mensagem;
    }
  }

  if (erro instanceof Error && erro.message) return erro.message;
  return padrao;
}
