import { NextResponse } from 'next/server';
import { listarPlanosPublicos } from '@/lib/assinaturasServidor';
import { pagamentoDisponivel } from '@/lib/pagamentos';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import type { PlanoPublico } from '@/lib/assinaturas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — planos à venda e se a assinatura pela internet está disponível.
 *
 * `disponivel: false` quando falta configurar o provedor de pagamento ou o
 * catálogo: a página pública deixa de oferecer "Assinar" e mostra o contato.
 * Não diz o que falta — isso é assunto do painel, não de visitante.
 */
export async function GET() {
  let planos: PlanoPublico[] = [];
  try {
    planos = await listarPlanosPublicos(createSupabaseAdmin());
  } catch {
    planos = [];
  }
  return NextResponse.json(
    { disponivel: pagamentoDisponivel() && planos.length > 0, planos },
    { headers: { 'cache-control': 'no-store' } },
  );
}
