import { NextResponse } from 'next/server';
import { identificarChamador } from '@/lib/chamadorApi';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';
import { avisarSuportePendentes } from '@/lib/suporteAviso';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST { conversaId }
 *
 * Chamado pela tela de suporte da clínica logo depois de enviar uma
 * mensagem. Confere que quem chama trabalha na clínica da conversa e, se
 * ninguém da Ortus estiver olhando, avisa os donos por e-mail (ver
 * lib/suporteAviso.ts: espaçamento de 15 minutos e sem o texto).
 *
 * Respostas: 200 { ok, avisado, olhando } · 400 · 401 · 404 · 500.
 */
export async function POST(req: Request) {
  try {
    const chamador = await identificarChamador(req);
    if (!chamador) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const corpo = (await req.json().catch(() => null)) as { conversaId?: unknown } | null;
    const conversaId = typeof corpo?.conversaId === 'string' ? corpo.conversaId : '';
    if (!UUID.test(conversaId)) return NextResponse.json({ error: 'Conversa inválida.' }, { status: 400 });

    const { data: conversa } = await chamador.admin
      .from('suporte_conversas')
      .select('id, clinica_id')
      .eq('id', conversaId)
      .maybeSingle();
    if (!conversa) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });

    // Só quem trabalha na clínica dispara o aviso (o lado da Ortus não precisa avisar a si mesmo).
    const { data: vinculo } = await chamador.admin
      .from('profissionais_clinicas')
      .select('clinica_id')
      .eq('profissional_id', chamador.prof.id)
      .eq('clinica_id', (conversa as { clinica_id: number }).clinica_id)
      .maybeSingle();
    if (!vinculo) return NextResponse.json({ error: 'Conversa não encontrada.' }, { status: 404 });

    const r = await avisarSuportePendentes(chamador.admin, { conversaId });
    return NextResponse.json({ ok: true, avisado: r.avisadas > 0, olhando: r.olhando });
  } catch (erro) {
    await registrarFalha({ origem: 'api/suporte/avisar' }, erro);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}
