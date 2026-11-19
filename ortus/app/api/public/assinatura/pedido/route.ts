import { NextResponse } from 'next/server';
import { situacaoDoPedido } from '@/lib/assinaturasServidor';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET ?id=<uuid> — em que pé está a compra.
 *
 * Quem tem o identificador (só a pessoa que comprou e o provedor) vê: estado,
 * plano, valor, nome da clínica e o e-mail mascarado. Nada além disso.
 * Enquanto o pagamento não aparece, a rota pergunta ao provedor (no máximo a
 * cada 15 s por compra); se o pagamento já foi aprovado e a conta ainda não
 * existe, cria. É o que faz a conta nascer mesmo com o webhook perdido.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Compra não encontrada.' }, { status: 404 });
  try {
    const situacao = await situacaoDoPedido(createSupabaseAdmin(), id.toLowerCase());
    if (!situacao) return NextResponse.json({ error: 'Compra não encontrada.' }, { status: 404 });
    return NextResponse.json(situacao, { headers: { 'cache-control': 'no-store' } });
  } catch (erro) {
    await registrarFalha({ origem: 'api/public/assinatura/pedido' }, erro);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}
