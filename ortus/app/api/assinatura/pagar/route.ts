import { NextResponse } from 'next/server';
import { redesPermitidasParaFatura } from '@/lib/assinaturaChamador';
import { linkDePagamentoDaFatura } from '@/lib/assinaturasServidor';
import { identificarChamador } from '@/lib/chamadorApi';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * POST { fatura_id } — abre o pagamento de uma mensalidade.
 *
 * Só o administrador da rede dona da fatura (e o dono da plataforma). O valor
 * é o da fatura no banco. Devolve o endereço da página do provedor; se já
 * existe uma cobrança válida para a fatura, devolve a mesma (não cria outra).
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
    if (!chamador.email) return NextResponse.json({ error: 'Sua conta não tem e-mail para identificar o pagamento.' }, { status: 409 });
    const r = await linkDePagamentoDaFatura(chamador.admin, faturaId, redes, { email: chamador.email, nome: chamador.prof.nome });
    return NextResponse.json(r.corpo, { status: r.status });
  } catch (erro) {
    await registrarFalha({ origem: 'api/assinatura/pagar' }, erro);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}
