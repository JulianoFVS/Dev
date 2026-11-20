import { NextResponse } from 'next/server';
import { identificarChamador, clinicasDoChamador } from '@/lib/chamadorApi';
import { carregarConfigGoogle, desconectar, ErroGoogle, iniciarConexao, processarFilaGoogle } from '@/lib/googleAgenda';
import { desktopAtivo } from '@/lib/local/ponte';
import { origemDoApp, origemParaEmail } from '@/lib/origemApp';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

type RouteParams = { params: Promise<{ acao: string }> };

/**
 * Google Agenda do profissional logado.
 *
 * GET  /api/google/status       → { integracao, conectado, email, bloquear_horarios, ultimo_erro }
 * POST /api/google/conectar     → { url } (endereço do consentimento do Google)
 * POST /api/google/desconectar  → revoga e apaga a conexão
 * POST /api/google/preferencias { bloquear_horarios }
 * POST /api/google/empurrar     → envia já o que está na fila das clínicas de
 *      quem chama (a tela chama depois de salvar e depois do "tentar de novo",
 *      que é a função google_tentar_de_novo; o resto fica com a rotina rápida).
 *
 * No aplicativo de computador o servidor local não tem a chave do Supabase:
 * a conexão é feita pelo site ({ desktop: true, site }) e o envio fica com a
 * rotina rápida do servidor, que pega o que o aplicativo sincronizou.
 */
export async function GET(req: Request, { params }: RouteParams) {
  const { acao } = await params;
  if (acao !== 'status') return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 });
  if (desktopAtivo()) return NextResponse.json({ desktop: true, site: origemParaEmail() || null });
  try {
    const chamador = await identificarChamador(req);
    if (!chamador) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    const cfg = await carregarConfigGoogle(chamador.admin).catch(() => null);
    const { data: con } = await chamador.admin.from('google_conexoes')
      .select('email_google, bloquear_horarios, ativo, ultimo_erro, created_at')
      .eq('profissional_id', chamador.prof.id)
      .maybeSingle();
    return NextResponse.json({
      integracao: Boolean(cfg?.ativo),
      conectado: Boolean(con),
      ativo: Boolean(con?.ativo),
      email: con?.email_google ?? null,
      bloquear_horarios: con?.bloquear_horarios ?? true,
      ultimo_erro: con?.ultimo_erro ?? null,
      conectado_em: con?.created_at ?? null,
    });
  } catch (erro) {
    await registrarFalha({ origem: 'api/google/status' }, erro);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  const { acao } = await params;
  if (desktopAtivo()) {
    if (acao === 'empurrar') return NextResponse.json({ ok: true, processados: 0, enviados: 0, removidos: 0, falhas: 0 });
    return NextResponse.json({ error: 'No aplicativo de computador, ligue ou desligue o Google Agenda pelo site do Ortus.' }, { status: 409 });
  }
  try {
    const chamador = await identificarChamador(req);
    if (!chamador) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (acao === 'conectar') {
      const url = await iniciarConexao(chamador.admin, {
        profissionalId: chamador.prof.id,
        usuarioId: chamador.userId,
        origem: origemDoApp(req),
        volta: '/perfil',
      });
      return NextResponse.json({ url });
    }

    if (acao === 'desconectar') {
      await desconectar(chamador.admin, chamador.prof.id);
      return NextResponse.json({ ok: true });
    }

    if (acao === 'preferencias') {
      const bloquear = corpo.bloquear_horarios === true;
      const { error } = await chamador.admin.from('google_conexoes')
        .update({ bloquear_horarios: bloquear, sync_token: null, ultima_leitura_em: null, updated_at: new Date().toISOString() })
        .eq('profissional_id', chamador.prof.id);
      if (error) throw error;
      if (!bloquear) await chamador.admin.from('google_bloqueios').delete().eq('profissional_id', chamador.prof.id);
      return NextResponse.json({ ok: true });
    }

    if (acao === 'empurrar') {
      const clinicas = Array.from(await clinicasDoChamador(chamador)).map((c) => Number(c)).filter(Number.isFinite);
      if (clinicas.length === 0) return NextResponse.json({ ok: true, processados: 0 });
      const r = await processarFilaGoogle(chamador.admin, { clinicaIds: clinicas, limite: 20, prazoMs: 8000 });
      return NextResponse.json({ ok: true, ...r });
    }

    return NextResponse.json({ error: 'Não encontrado.' }, { status: 404 });
  } catch (erro) {
    if (erro instanceof ErroGoogle) return NextResponse.json({ error: erro.message }, { status: 409 });
    await registrarFalha({ origem: `api/google/${acao}` }, erro);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}
