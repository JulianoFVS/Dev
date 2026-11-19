import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { processarLembretes24h } from '@/lib/lembretesServidor';
import { ehChamadaDoAgendador, executarRotina } from '@/lib/rotinas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET — lembretes de consulta do dia seguinte.
 *
 * Só o agendador chama: `Authorization: Bearer $CRON_SECRET`. Sem o segredo
 * (ou sem a variável configurada) a resposta é 401 e nada é lido.
 *
 *   ?enviar=true       envia por e-mail (Resend) e SMS (Twilio), o que estiver
 *                      configurado, e marca cada envio. Sem isso, só conta.
 *   ?clinica_id=N      limita a uma clínica.
 *   ?agendamento_id=N  limita a um agendamento (prova de ponta a ponta sem
 *                      disparar a fila inteira).
 *
 * A resposta traz contagens e ids. Nome, telefone e e-mail de paciente não
 * saem daqui: a saída do agendador vai para log.
 */
export async function GET(request: Request) {
  if (!ehChamadaDoAgendador(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', detalhe: 'Esta rota é exclusiva do agendador (CRON_SECRET).' },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const enviar = url.searchParams.get('enviar') === 'true';
  const admin = createSupabaseAdmin();

  let itens: unknown[] = [];
  const resultado = await executarRotina(admin, 'lembretes', async () => {
    const r = await processarLembretes24h(admin, {
      enviar,
      clinicaId: url.searchParams.get('clinica_id'),
      agendamentoId: url.searchParams.get('agendamento_id'),
    });
    itens = r.itens;
    return { ok: r.ok, resumo: r.resumo };
  });

  const resumo = resultado.resumo as Record<string, unknown>;
  const semCanal = resumo.resend_configurado === false && resumo.twilio_configurado === false;
  return NextResponse.json(
    {
      processado_em: new Date().toISOString(),
      ok: resultado.ok,
      ...resumo,
      ...(semCanal ? { aviso: 'Nenhum canal de envio configurado (Resend ou Twilio). Nada foi enviado nem marcado.' } : {}),
      lembretes: itens,
    },
    { status: resultado.ok ? 200 : 500 },
  );
}
