import { NextResponse } from 'next/server';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';
import { ehChamadaDoAgendador } from '@/lib/rotinas';
import { rodarVigia } from '@/lib/vigia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET — vigia da operação. Só o agendador chama: `Authorization: Bearer
 * $CRON_SECRET` (401 sem ele). Na VM, a cada 15 minutos; na Vercel, uma vez
 * por dia (vercel.json).
 *
 * Confere o batimento das rotinas contra a tolerância de cada uma, as falhas
 * do servidor da última hora, o gateway do WhatsApp (no modo servidor) e a
 * Resend. Abre e fecha alertas em `alertas_operacao`, avisa os donos por
 * e-mail quando um alerta abre e quando volta ao normal, apaga falhas com mais
 * de 30 dias e execuções com mais de 90, e grava o próprio batimento.
 *
 *   200  conferiu (com ou sem alerta aberto).
 *   503  o banco não respondeu: nada foi gravado.
 *   500  parou no meio (o motivo vai para as falhas do servidor).
 */
export async function GET(request: Request) {
  if (!ehChamadaDoAgendador(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', detalhe: 'Esta rota é exclusiva do agendador (CRON_SECRET).' },
      { status: 401 },
    );
  }
  try {
    const { status, corpo } = await rodarVigia();
    return NextResponse.json(corpo, { status });
  } catch (erro) {
    await registrarFalha({ origem: 'api/saude/vigia', extra: { etapa: 'inesperado' } }, erro);
    return NextResponse.json({ ok: false, error: ERRO_INTERNO }, { status: 500 });
  }
}
