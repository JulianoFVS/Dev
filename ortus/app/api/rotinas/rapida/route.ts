import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ehChamadaDoAgendador, executarRotina } from '@/lib/rotinas';
import { lerBloqueiosGoogle, processarFilaGoogle } from '@/lib/googleAgenda';
import { avisarSuportePendentes } from '@/lib/suporteAviso';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Rotina rápida (a cada 2 minutos na VM e na demonstração; uma vez por dia
 * na Vercel Hobby, que não deixa menos que isso):
 * - envia ao Google Agenda o que está na fila (inclusive o que veio do
 *   desktop e o que falhou antes);
 * - lê os compromissos marcados direto no Google (bloqueios);
 * - avisa o suporte da Ortus das mensagens que ninguém viu.
 * Só o agendador chama: Authorization: Bearer $CRON_SECRET.
 */
async function rodar(req: Request) {
  if (!ehChamadaDoAgendador(req)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  const admin = createSupabaseAdmin();
  const inicio = Date.now();
  const resposta = await executarRotina(admin, 'rapida', async () => {
    const fila = await processarFilaGoogle(admin, { limite: 200, prazoMs: 25_000 });
    const bloqueios = await lerBloqueiosGoogle(admin, { intervaloMin: 5, prazoMs: Math.max(5_000, 45_000 - (Date.now() - inicio)) });
    const suporte = await avisarSuportePendentes(admin);
    return {
      ok: fila.falhas === 0 && bloqueios.falhas === 0 && suporte.falhas === 0,
      resumo: {
        google_processados: fila.processados,
        google_enviados: fila.enviados,
        google_removidos: fila.removidos,
        google_falhas: fila.falhas,
        google_ignorado: fila.ignorado ?? null,
        bloqueios_conexoes: bloqueios.conexoes,
        bloqueios_gravados: bloqueios.gravados,
        bloqueios_apagados: bloqueios.apagados,
        suporte_avisadas: suporte.avisadas,
        suporte_olhando: suporte.olhando,
      },
    };
  });
  return NextResponse.json(resposta);
}

export const GET = rodar;
export const POST = rodar;
