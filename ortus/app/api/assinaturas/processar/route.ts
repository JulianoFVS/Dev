import { NextResponse } from 'next/server';
import { processarAssinaturas, type ResumoAssinaturas } from '@/lib/assinaturasServidor';
import { ehChamadaDoAgendador, executarRotina } from '@/lib/rotinas';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET — rotina diária das assinaturas.
 *
 * Só o agendador chama: `Authorization: Bearer $CRON_SECRET` (401 sem ele).
 *
 * Faz, nesta ordem: passagem dos dias (em dia → em atraso → modo de consulta
 * e a volta), fatura do mês (uma por competência), conferência das cobranças
 * abertas com o provedor, criação das contas pagas que ficaram pelo caminho e
 * envio dos avisos de cobrança. Pode rodar várias vezes no dia: nada duplica.
 *
 *   ?simular=true   só conta o que existe, sem mudar nada.
 *
 * A resposta traz só contagens.
 */
export async function GET(request: Request) {
  if (!ehChamadaDoAgendador(request)) {
    return NextResponse.json(
      { error: 'Unauthorized', detalhe: 'Esta rota é exclusiva do agendador (CRON_SECRET).' },
      { status: 401 },
    );
  }
  const simular = new URL(request.url).searchParams.get('simular') === 'true';
  const admin = createSupabaseAdmin();

  const resultado = await executarRotina<ResumoAssinaturas>(admin, 'assinaturas', () => processarAssinaturas(admin, { simular }));
  const resumo = resultado.resumo as Partial<ResumoAssinaturas> & { erro?: string };
  const avisos: string[] = [];
  if (resumo.provedor_configurado === false) avisos.push('Provedor de pagamento não configurado: nenhuma cobrança foi conferida.');
  if (resumo.resend_configurado === false && (resumo.avisos_pendentes ?? 0) > 0) {
    avisos.push('Resend não configurada: os avisos de cobrança continuam na fila, nada foi marcado como enviado.');
  }
  return NextResponse.json(
    { processado_em: new Date().toISOString(), ok: resultado.ok, ...resumo, ...(avisos.length ? { avisos } : {}) },
    { status: resultado.ok ? 200 : 500 },
  );
}
