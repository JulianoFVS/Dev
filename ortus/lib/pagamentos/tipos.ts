/**
 * Contrato do provedor de pagamento.
 *
 * O Ortus nunca recebe número de cartão, CVV ou chave Pix: a pessoa paga na
 * página do provedor. Daqui só saem a cobrança (valor lido do banco) e a
 * leitura do estado do pagamento.
 */

/** Estado do pagamento na língua do Ortus — é o que as telas mostram. */
export type EstadoPagamento = 'pendente' | 'aprovado' | 'recusado' | 'estornado' | 'contestado' | 'cancelado';

export type PagamentoLido = {
  /** Identificador do pagamento no provedor. */
  id: string;
  /** Referência que o Ortus mandou na cobrança: `pedido_<32 hex>` ou `fatura_<id>`. */
  referencia: string | null;
  estado: EstadoPagamento;
  /** Estado e detalhe como o provedor escreveu (ficam na trilha). */
  estadoProvedor: string;
  detalhe: string | null;
  valorCentavos: number;
  moeda: string;
  /** Momento do estado atual (aprovação, estorno…), em ISO. */
  quando: string | null;
  /** pix, cartao_credito, cartao_debito… */
  meio: string | null;
  /** Pagamento feito em ambiente de teste do provedor (não é dinheiro de verdade). */
  teste: boolean;
};

export type Falha = { ok: false; erro: string; status?: number };
export type Resultado<T> = ({ ok: true } & T) | Falha;

export type NovaCobranca = {
  /** Até 64 caracteres: letras, números, hífen e sublinhado. */
  referencia: string;
  titulo: string;
  valorCentavos: number;
  pagador: { email: string; nome?: string | null };
  /** Para onde o provedor devolve a pessoa depois de pagar (ou desistir). */
  urlRetorno: string;
  /** Endereço público do webhook. null = o provedor não avisa (fica só a conferência). */
  urlAviso: string | null;
  validadeHoras: number;
  /** Repetir a chamada com a mesma chave não cria outra cobrança. */
  chaveIdempotencia: string;
};

export type CobrancaCriada = { ref: string; url: string; expiraEm: string };

export type AvisoConferido =
  /** pagamentoId null = aviso legítimo, mas de outro assunto (nada a fazer). */
  | { ok: true; pagamentoId: string | null }
  | { ok: false; motivo: string };

export interface ProvedorPagamento {
  nome: string;
  /** O que falta configurar para cobrar. null = pronto. */
  pendencia(): string | null;
  criarCobranca(dados: NovaCobranca): Promise<Resultado<{ cobranca: CobrancaCriada }>>;
  lerPagamento(id: string): Promise<Resultado<{ pagamento: PagamentoLido }>>;
  buscarPorReferencia(referencia: string): Promise<Resultado<{ pagamentos: PagamentoLido[] }>>;
  /** Confere a assinatura do webhook. O corpo nunca é usado como verdade: só indica qual pagamento reler. */
  conferirAviso(entrada: { url: URL; cabecalhos: Headers; corpo: unknown }): AvisoConferido;
}
