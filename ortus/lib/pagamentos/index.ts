import 'server-only';
import { mercadoPago } from '@/lib/pagamentos/mercadopago';
import type { ProvedorPagamento } from '@/lib/pagamentos/tipos';
import { origemParaEmail } from '@/lib/origemApp';

export type { EstadoPagamento, PagamentoLido, ProvedorPagamento } from '@/lib/pagamentos/tipos';

/**
 * Provedor de pagamento em uso. Hoje só existe o Mercado Pago; a escolha fica
 * em PAGAMENTO_PROVEDOR para trocar sem mexer em quem chama.
 */
export function provedorDePagamento(): ProvedorPagamento | null {
  const nome = (process.env.PAGAMENTO_PROVEDOR || 'mercadopago').trim().toLowerCase();
  if (nome === 'mercadopago') return mercadoPago;
  return null;
}

/**
 * O que falta para cobrar pela internet. null = pronto.
 * Enquanto houver pendência, a página pública não oferece assinatura.
 */
export function pendenciaDoPagamento(): string | null {
  const provedor = provedorDePagamento();
  if (!provedor) return 'PAGAMENTO_PROVEDOR desconhecido (use mercadopago).';
  const falta = provedor.pendencia();
  if (falta) return falta;
  if (!origemParaEmail()) return 'NEXT_PUBLIC_APP_URL não configurada (o provedor precisa do endereço público para o retorno e o webhook).';
  return null;
}

export function pagamentoDisponivel(): boolean {
  return pendenciaDoPagamento() === null;
}
