import 'server-only';
import crypto from 'node:crypto';
import { limparTexto } from '@/lib/registro';
import { enderecoDoServico } from '@/lib/servicosExternos';
import type {
  AvisoConferido,
  EstadoPagamento,
  NovaCobranca,
  PagamentoLido,
  ProvedorPagamento,
  Resultado,
} from '@/lib/pagamentos/tipos';

/**
 * Mercado Pago — Checkout Pro.
 *
 * A pessoa é levada à página do Mercado Pago e escolhe Pix ou cartão lá.
 * O Ortus cria a cobrança (preferência), recebe o aviso assinado e relê o
 * pagamento pela API antes de acreditar em qualquer coisa.
 *
 * Variáveis: MERCADOPAGO_ACCESS_TOKEN (credencial da aplicação) e
 * MERCADOPAGO_WEBHOOK_SECRET (assinatura secreta em Suas integrações → Webhooks).
 */

const TEMPO_LIMITE_MS = 12_000;

const api = () => enderecoDoServico('PAGAMENTO', 'https://api.mercadopago.com');
const credencial = () => (process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
const segredoDoAviso = () => (process.env.MERCADOPAGO_WEBHOOK_SECRET || '').trim();

/** Estados do Mercado Pago → estados do Ortus. Desconhecido conta como pendente: nunca libera nada. */
export function estadoDoMercadoPago(status: string): EstadoPagamento {
  switch (status) {
    case 'approved':
      return 'aprovado';
    case 'rejected':
      return 'recusado';
    case 'cancelled':
      return 'cancelado';
    case 'refunded':
      return 'estornado';
    case 'charged_back':
    case 'in_mediation':
      return 'contestado';
    default:
      // pending, in_process, authorized e o que vier de novo
      return 'pendente';
  }
}

function meioDe(tipo: unknown, metodo: unknown): string | null {
  if (metodo === 'pix') return 'pix';
  switch (tipo) {
    case 'credit_card':
      return 'cartao_credito';
    case 'debit_card':
      return 'cartao_debito';
    case 'account_money':
      return 'saldo_mercado_pago';
    case 'bank_transfer':
      return 'transferencia';
    case 'ticket':
      return 'boleto';
    default:
      return typeof tipo === 'string' && tipo ? tipo.slice(0, 40) : null;
  }
}

type PagamentoBruto = {
  id?: number | string;
  status?: string;
  status_detail?: string | null;
  external_reference?: string | null;
  transaction_amount?: number | string | null;
  currency_id?: string | null;
  date_approved?: string | null;
  date_last_updated?: string | null;
  date_created?: string | null;
  payment_type_id?: string | null;
  payment_method_id?: string | null;
  live_mode?: boolean | null;
};

function lerBruto(p: PagamentoBruto): PagamentoLido | null {
  if (p?.id == null || !p.status) return null;
  const estado = estadoDoMercadoPago(p.status);
  const valor = Number(p.transaction_amount);
  return {
    id: String(p.id),
    referencia: p.external_reference ? String(p.external_reference) : null,
    estado,
    estadoProvedor: String(p.status).slice(0, 40),
    detalhe: p.status_detail ? String(p.status_detail).slice(0, 80) : null,
    valorCentavos: Number.isFinite(valor) ? Math.round(valor * 100) : -1,
    moeda: String(p.currency_id || '').toUpperCase(),
    quando: (estado === 'aprovado' ? p.date_approved : null) || p.date_last_updated || p.date_created || null,
    meio: meioDe(p.payment_type_id, p.payment_method_id),
    // O Mercado Pago marca live_mode=false no pagamento feito com credencial ou usuário de teste.
    teste: p.live_mode === false,
  };
}

/** Teste aceito como pagamento de verdade? Só fora de produção ou com MERCADOPAGO_ACEITAR_TESTE=1 (ambiente de homologação). */
export function aceitaPagamentoDeTeste(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.MERCADOPAGO_ACEITAR_TESTE === '1';
}

/** Data no formato que a API pede: com milissegundos e o fuso de Brasília. */
function dataComFuso(data: Date): string {
  const local = new Date(data.getTime() - 3 * 3_600_000);
  return `${local.toISOString().slice(0, 23)}-03:00`;
}

async function chamar<T>(
  caminho: string,
  opcoes: { metodo?: 'GET' | 'POST'; corpo?: unknown; chave?: string } = {},
): Promise<Resultado<{ dados: T }>> {
  const token = credencial();
  if (!token) return { ok: false, erro: 'MERCADOPAGO_ACCESS_TOKEN não configurado.' };
  try {
    const resposta = await fetch(`${api()}${caminho}`, {
      method: opcoes.metodo || 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(opcoes.corpo !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(opcoes.chave ? { 'x-idempotency-key': opcoes.chave } : {}),
      },
      body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      cache: 'no-store',
    });
    const texto = await resposta.text();
    let dados: unknown = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = null;
    }
    if (!resposta.ok) {
      const motivo = (dados as { message?: unknown } | null)?.message;
      return {
        ok: false,
        status: resposta.status,
        erro: `O Mercado Pago recusou a chamada (${resposta.status})${motivo ? `: ${limparTexto(motivo, 160)}` : '.'}`,
      };
    }
    return { ok: true, dados: dados as T };
  } catch (erro) {
    const tempo = erro instanceof Error && (erro.name === 'TimeoutError' || erro.name === 'AbortError');
    return { ok: false, erro: tempo ? 'O Mercado Pago não respondeu a tempo.' : 'Não foi possível falar com o Mercado Pago.' };
  }
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const mercadoPago: ProvedorPagamento = {
  nome: 'mercadopago',

  pendencia() {
    if (!credencial()) return 'MERCADOPAGO_ACCESS_TOKEN não configurado.';
    if (!segredoDoAviso()) return 'MERCADOPAGO_WEBHOOK_SECRET não configurado.';
    // Credencial de teste em produção criaria contas com pagamento de mentira.
    if (credencial().startsWith('TEST-') && !aceitaPagamentoDeTeste()) {
      return 'MERCADOPAGO_ACCESS_TOKEN é de teste (TEST-…) e o servidor está em produção. Use a credencial de produção ou, só em homologação, MERCADOPAGO_ACEITAR_TESTE=1.';
    }
    return null;
  },

  async criarCobranca(dados: NovaCobranca) {
    const agora = new Date();
    const expira = new Date(agora.getTime() + dados.validadeHoras * 3_600_000);
    const resposta = await chamar<{ id?: string; init_point?: string; sandbox_init_point?: string }>('/checkout/preferences', {
      metodo: 'POST',
      chave: dados.chaveIdempotencia,
      corpo: {
        items: [
          {
            id: dados.referencia,
            title: dados.titulo.slice(0, 250),
            quantity: 1,
            currency_id: 'BRL',
            unit_price: dados.valorCentavos / 100,
          },
        ],
        payer: { email: dados.pagador.email, ...(dados.pagador.nome ? { name: dados.pagador.nome.slice(0, 120) } : {}) },
        external_reference: dados.referencia,
        back_urls: { success: dados.urlRetorno, pending: dados.urlRetorno, failure: dados.urlRetorno },
        // A volta automática só é aceita pelo Mercado Pago com endereço https.
        ...(dados.urlRetorno.startsWith('https://') ? { auto_return: 'approved' } : {}),
        ...(dados.urlAviso ? { notification_url: dados.urlAviso } : {}),
        statement_descriptor: 'ORTUS',
        // Pix e cartão. Boleto fica de fora: demora dias para compensar.
        payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }], installments: 1 },
        expires: true,
        expiration_date_from: dataComFuso(agora),
        expiration_date_to: dataComFuso(expira),
      },
    });
    if (!resposta.ok) return resposta;
    const { id, init_point: pagina, sandbox_init_point: paginaDeTeste } = resposta.dados || {};
    // Credencial de teste (TEST-…) usa a página de teste; a de produção, a normal.
    const url = credencial().startsWith('TEST-') ? paginaDeTeste || pagina : pagina || paginaDeTeste;
    if (!id || !url) return { ok: false, erro: 'O Mercado Pago não devolveu o endereço de pagamento.' };
    return { ok: true, cobranca: { ref: String(id), url, expiraEm: expira.toISOString() } };
  },

  async lerPagamento(id: string) {
    if (!/^[0-9A-Za-z_-]{1,64}$/.test(id)) return { ok: false, erro: 'Identificador de pagamento inválido.' };
    const resposta = await chamar<PagamentoBruto>(`/v1/payments/${encodeURIComponent(id)}`);
    if (!resposta.ok) return resposta;
    const pagamento = lerBruto(resposta.dados);
    if (!pagamento) return { ok: false, erro: 'O Mercado Pago devolveu um pagamento sem estado.' };
    return { ok: true, pagamento };
  },

  async buscarPorReferencia(referencia: string) {
    const busca = new URLSearchParams({ external_reference: referencia, sort: 'date_created', criteria: 'desc', limit: '20' });
    const resposta = await chamar<{ results?: PagamentoBruto[] }>(`/v1/payments/search?${busca.toString()}`);
    if (!resposta.ok) return resposta;
    const pagamentos = (resposta.dados?.results || [])
      .map(lerBruto)
      .filter((p): p is PagamentoLido => Boolean(p) && p!.referencia === referencia);
    return { ok: true, pagamentos };
  },

  /**
   * Assinatura do webhook: cabeçalho `x-signature: ts=…,v1=…`, onde v1 é o
   * HMAC-SHA256 (hex), com a assinatura secreta, do texto
   *   id:<data.id da URL>;request-id:<x-request-id>;ts:<ts>;
   * Parte ausente sai do texto. `data.id` alfanumérico entra em minúsculas.
   */
  conferirAviso({ url, cabecalhos, corpo }): AvisoConferido {
    const segredo = segredoDoAviso();
    if (!segredo) return { ok: false, motivo: 'assinatura secreta do webhook não configurada' };

    const partes = new Map<string, string>();
    for (const pedaco of (cabecalhos.get('x-signature') || '').split(',')) {
      const corte = pedaco.indexOf('=');
      if (corte > 0) partes.set(pedaco.slice(0, corte).trim(), pedaco.slice(corte + 1).trim());
    }
    const ts = partes.get('ts') || '';
    const v1 = partes.get('v1') || '';
    if (!ts || !v1) return { ok: false, motivo: 'aviso sem assinatura' };

    const noCorpo = (corpo as { data?: { id?: unknown }; type?: unknown } | null) || null;
    const idDaUrl = url.searchParams.get('data.id') || '';
    const idDoCorpo = noCorpo?.data?.id != null ? String(noCorpo.data.id) : '';
    const id = idDaUrl || idDoCorpo;
    const pedido = cabecalhos.get('x-request-id') || '';

    let texto = '';
    if (id) texto += `id:${/^[a-z0-9]+$/i.test(id) ? id.toLowerCase() : id};`;
    if (pedido) texto += `request-id:${pedido};`;
    texto += `ts:${ts};`;
    const esperado = crypto.createHmac('sha256', segredo).update(texto).digest('hex');
    if (!iguais(esperado, v1.toLowerCase())) return { ok: false, motivo: 'assinatura não confere' };

    const tipo = url.searchParams.get('type') || (typeof noCorpo?.type === 'string' ? noCorpo.type : '');
    if (tipo !== 'payment' || !id) return { ok: true, pagamentoId: null };
    return { ok: true, pagamentoId: id };
  },
};
