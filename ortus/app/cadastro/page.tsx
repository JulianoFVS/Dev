import { redirect } from 'next/navigation';

/**
 * O cadastro de uma clínica nova é a própria assinatura: a pessoa identifica
 * a clínica, paga, e a conta de administrador nasce do pagamento confirmado.
 * Este endereço fica só para não quebrar link antigo.
 */
export default async function Cadastro({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parametros = await searchParams;
  const plano = typeof parametros.plano === 'string' ? parametros.plano : '';
  redirect(plano ? `/checkout?plano=${encodeURIComponent(plano)}` : '/checkout');
}
