import { NextResponse } from 'next/server';
import { redesPermitidasParaFatura } from '@/lib/assinaturaChamador';
import { conferirFatura } from '@/lib/assinaturasServidor';
import { identificarChamador } from '@/lib/chamadorApi';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST { fatura_id } — a pessoa voltou do provedor: confere agora se o
 * pagamento entrou, sem esperar o webhook. No máximo uma consulta a cada
 * 15 s por fatura. Devolve { mudou } para a tela saber se recarrega.
 */
export async function POST(req: Request) {
  const chamador = await identificarChamador(req);
  if (!chamador) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const corpo = (await req.json().catch(() => null)) as { fatura_id?: unknown } | null;
  const faturaId = Number(corpo?.fatura_id);
  if (!Number.isSafeInteger(faturaId) || faturaId <= 0) return NextResponse.json({ error: 'Fatura não encontrada.' }, { status: 404 });

  try {
    const redes = await redesPermitidasParaFatura(chamador, faturaId);
    if (!redes.size) return NextResponse.json({ error: 'Fatura não encontrada.' }, { status: 404 });
    const mudou = await conferirFatura(chamador.admin, faturaId, redes);
    return NextResponse.json({ mudou });
  } catch (erro) {
    await registrarFalha({ origem: 'api/assinatura/conferir' }, erro);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}
