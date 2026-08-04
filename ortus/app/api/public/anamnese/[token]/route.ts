import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { hashTokenAnamnese } from '@/lib/anamneseLinks';
import { CONFIG_KEYS } from '@/lib/configKeys';
import { MODELOS_PADRAO, type ModeloAnamnese } from '@/lib/anamnese';

type RouteParams = { params: Promise<{ token: string }> };

async function buscarLink(admin: ReturnType<typeof createSupabaseAdmin>, token: string) {
  const tokenHash = hashTokenAnamnese(token);
  const { data: link, error } = await admin
    .from('anamnese_links')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !link) return { error: 'Link inválido ou expirado.', status: 404 as const };
  if (link.usado_em) return { error: 'Este formulário já foi preenchido.', status: 410 as const };
  if (new Date(link.expires_at) < new Date()) return { error: 'Link expirado.', status: 410 as const };

  return { link };
}

async function buscarModelo(admin: ReturnType<typeof createSupabaseAdmin>, clinicaId: number | null, modeloId: string): Promise<ModeloAnamnese | null> {
  if (clinicaId) {
    const { data } = await admin
      .from('configuracoes_clinica')
      .select('valor')
      .eq('clinica_id', clinicaId)
      .eq('chave', CONFIG_KEYS.anamnese_modelos)
      .maybeSingle();

    const modelos = (data?.valor as ModeloAnamnese[] | undefined) || [];
    const encontrado = modelos.find((m) => m.id === modeloId);
    if (encontrado) return encontrado;
  }
  return MODELOS_PADRAO.find((m) => m.id === modeloId) || null;
}

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const { token } = await params;
    const admin = createSupabaseAdmin();
    const result = await buscarLink(admin, token);
    if ('error' in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { link } = result;
    const modelo = await buscarModelo(admin, link.clinica_id ? Number(link.clinica_id) : null, link.modelo_id);
    if (!modelo) {
      return NextResponse.json({ error: 'Modelo de anamnese não encontrado.' }, { status: 404 });
    }

    const { data: paciente } = await admin
      .from('pacientes')
      .select('nome')
      .eq('id', link.paciente_id)
      .maybeSingle();

    return NextResponse.json({
      paciente_nome: paciente?.nome || 'Paciente',
      modelo: { id: modelo.id, nome: modelo.nome, perguntas: modelo.perguntas },
      expires_at: link.expires_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const { token } = await params;
    const admin = createSupabaseAdmin();
    const result = await buscarLink(admin, token);
    if ('error' in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { link } = result;
    const body = await req.json().catch(() => ({}));
    const { respostas } = body as { respostas?: Record<string, unknown> };

    if (!respostas || typeof respostas !== 'object') {
      return NextResponse.json({ error: 'Respostas inválidas.' }, { status: 400 });
    }

    const modelo = await buscarModelo(admin, link.clinica_id ? Number(link.clinica_id) : null, link.modelo_id);
    if (!modelo) {
      return NextResponse.json({ error: 'Modelo de anamnese não encontrado.' }, { status: 404 });
    }

    const hoje = new Date().toISOString().slice(0, 10);
    const { error: anamErr } = await admin.from('paciente_anamneses').insert({
      paciente_id: link.paciente_id,
      legacy_id: `link-${Date.now()}`,
      modelo_id: modelo.id,
      modelo_nome: modelo.nome,
      data: hoje,
      preenchido_por: 'paciente',
      respostas,
      perguntas_snapshot: modelo.perguntas,
    });

    if (anamErr) {
      return NextResponse.json({ error: anamErr.message }, { status: 500 });
    }

    await admin
      .from('anamnese_links')
      .update({ usado_em: new Date().toISOString() })
      .eq('id', link.id);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
