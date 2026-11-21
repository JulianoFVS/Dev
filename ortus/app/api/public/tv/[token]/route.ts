import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ token: string }> };

const TOKEN = /^[A-Za-z0-9_-]{30,80}$/;
const JANELA_MS = 60_000;
/** A TV pergunta a cada 2,5 s (24 por minuto). Bem acima disso é abuso: 429. */
const MAX_POR_JANELA = 90;
const visitas = new Map<string, number[]>();

function excedeu(chave: string): boolean {
  const agora = Date.now();
  const lista = (visitas.get(chave) || []).filter((t) => agora - t < JANELA_MS);
  lista.push(agora);
  visitas.set(chave, lista);
  if (visitas.size > 5000) visitas.clear();
  return lista.length > MAX_POR_JANELA;
}

function semCache(corpo: unknown, status = 200) {
  return NextResponse.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * GET /api/public/tv/[token]?depois=ISO
 *
 * A tela da TV da clínica. Sem login: vale o token do link, guardado só em
 * hash. Devolve as chamadas das últimas 12 horas (ou só as que vieram
 * depois de `depois`), com o nome curto que o banco montou — nunca o nome
 * completo, telefone ou dado clínico.
 *
 * Respostas: 200 { clinica, voz, chamadas, agora } · 404 (link inválido ou
 * revogado) · 429 · 500.
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { token } = await params;
    if (!TOKEN.test(token || '')) return semCache({ error: 'Link inválido ou revogado.' }, 404);
    const hash = createHash('sha256').update(token).digest('hex');
    if (excedeu(hash)) return semCache({ error: 'Muitos pedidos. A tela tenta de novo sozinha.' }, 429);

    const admin = createSupabaseAdmin();
    const { data: tv } = await admin
      .from('chamadas_tv')
      .select('id, clinica_id, ativo, revogado_em, clinicas(nome)')
      .eq('token_hash', hash)
      .maybeSingle();
    if (!tv || !tv.ativo || tv.revogado_em) return semCache({ error: 'Link inválido ou revogado.' }, 404);

    const url = new URL(req.url);
    const depoisPedido = url.searchParams.get('depois');
    const depoisData = depoisPedido ? new Date(depoisPedido) : null;
    const limite = new Date(Date.now() - 12 * 3600_000);
    const desde = depoisData && Number.isFinite(depoisData.getTime()) && depoisData > limite ? depoisData : limite;

    const [{ data: chamadas, error }, { data: config }] = await Promise.all([
      admin
        .from('chamadas')
        .select('id, senha, nome_exibicao, local, created_at')
        .eq('clinica_id', tv.clinica_id)
        .gt('created_at', desde.toISOString())
        .order('created_at', { ascending: false })
        .limit(8),
      admin
        .from('configuracoes_clinica')
        .select('valor')
        .eq('clinica_id', tv.clinica_id)
        .eq('chave', 'chamada_tv')
        .maybeSingle(),
    ]);
    if (error) throw error;

    const clinica = Array.isArray(tv.clinicas) ? tv.clinicas[0] : tv.clinicas;
    return semCache({
      clinica: (clinica as { nome?: string } | null)?.nome || 'Clínica',
      voz: (config?.valor as { voz?: boolean } | null)?.voz !== false,
      chamadas: (chamadas || []).reverse(),
      agora: new Date().toISOString(),
    });
  } catch (erro) {
    await registrarFalha({ origem: 'api/public/tv' }, erro);
    return semCache({ error: ERRO_INTERNO }, 500);
  }
}
