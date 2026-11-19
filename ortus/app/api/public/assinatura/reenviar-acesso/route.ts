import { NextResponse } from 'next/server';
import { reenviarAcesso } from '@/lib/assinaturasServidor';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';
import { consumirLimite, recusarPedidoDeFora, resumoDaOrigem } from '@/lib/rotaPublica';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST { pedido } — manda outro link para criar a senha.
 *
 * Só vale para compra com conta criada e cuja senha ainda não foi escolhida
 * (depois disso o caminho é e-mail e senha, ou "Esqueci a senha"). O link vai
 * sempre para o e-mail da compra; a resposta mostra esse e-mail mascarado. Um
 * envio a cada dois minutos, oito no total. Se o e-mail não sair, a resposta
 * diz que não saiu (o motivo fica com o dono, no painel).
 */
export async function POST(req: Request) {
  const deFora = recusarPedidoDeFora(req);
  if (deFora) return deFora;
  const corpo = (await req.json().catch(() => null)) as { pedido?: unknown } | null;
  const id = typeof corpo?.pedido === 'string' ? corpo.pedido : '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Compra não encontrada.' }, { status: 404 });
  try {
    const admin = createSupabaseAdmin();
    if (!(await consumirLimite(admin, `acesso:ip:${resumoDaOrigem(req)}`, 20, 3600))) {
      return NextResponse.json({ error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.' }, { status: 429 });
    }
    const r = await reenviarAcesso(admin, id.toLowerCase());
    return NextResponse.json(r.corpo, { status: r.status });
  } catch (erro) {
    await registrarFalha({ origem: 'api/public/assinatura/reenviar-acesso' }, erro);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}
