import { NextResponse } from 'next/server';
import { criarPedido, type EntradaDoPedido } from '@/lib/assinaturasServidor';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';
import { recusarPedidoDeFora, resumoDaOrigem } from '@/lib/rotaPublica';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST — começa a compra de uma assinatura.
 *
 * Corpo: { plano, clinica, responsavel, email, telefone?, aceite: true }.
 * O valor NÃO vem do navegador: é lido do catálogo pelo código do plano.
 * Nenhum dado de cartão passa por aqui — a resposta traz o endereço da
 * página do provedor, onde a pessoa escolhe Pix ou cartão.
 */
export async function POST(req: Request) {
  // Só a página do próprio Ortus abre compra: corpo JSON e mesma origem.
  const deFora = recusarPedidoDeFora(req);
  if (deFora) return deFora;

  let corpo: EntradaDoPedido;
  try {
    const bruto = await req.text();
    if (bruto.length > 4000) return NextResponse.json({ error: 'Pedido grande demais.' }, { status: 413 });
    corpo = JSON.parse(bruto) as EntradaDoPedido;
  } catch {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
  if (!corpo || typeof corpo !== 'object') return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });

  try {
    const resposta = await criarPedido(createSupabaseAdmin(), corpo, resumoDaOrigem(req));
    if (!resposta.ok) {
      return NextResponse.json({ error: resposta.erro, ...(resposta.campo ? { campo: resposta.campo } : {}) }, { status: resposta.status });
    }
    return NextResponse.json({ pedido: resposta.pedido, url: resposta.url, pago: resposta.pago });
  } catch (erro) {
    await registrarFalha({ origem: 'api/public/assinatura/checkout' }, erro);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}
