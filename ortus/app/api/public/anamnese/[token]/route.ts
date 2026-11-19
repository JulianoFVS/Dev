import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { hashTokenAnamnese } from '@/lib/anamneseLinks';
import { CONFIG_KEYS } from '@/lib/configKeys';
import { MODELOS_PADRAO, type ModeloAnamnese } from '@/lib/anamnese';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';

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
    // O modelo vem da clínica do PACIENTE, não da coluna do link (que já foi gravável pela API).
    const { data: paciente } = await admin
      .from('pacientes')
      .select('nome, clinica_id')
      .eq('id', link.paciente_id)
      .maybeSingle();
    const modelo = await buscarModelo(admin, paciente?.clinica_id ? Number(paciente.clinica_id) : null, link.modelo_id);
    if (!modelo) {
      return NextResponse.json({ error: 'Modelo de anamnese não encontrado.' }, { status: 404 });
    }

    return NextResponse.json({
      paciente_nome: paciente?.nome || 'Paciente',
      modelo: { id: modelo.id, nome: modelo.nome, perguntas: modelo.perguntas },
      expires_at: link.expires_at,
    });
  } catch (err) {
    await registrarFalha({ origem: 'api/public/anamnese' }, err);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
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

    if (!respostas || typeof respostas !== 'object' || Array.isArray(respostas)) {
      return NextResponse.json({ error: 'Respostas inválidas.' }, { status: 400 });
    }
    if (JSON.stringify(respostas).length > 64_000) {
      return NextResponse.json({ error: 'Respostas longas demais.' }, { status: 413 });
    }

    const { data: pacienteDoLink } = await admin.from('pacientes').select('clinica_id').eq('id', link.paciente_id).maybeSingle();
    const modelo = await buscarModelo(admin, pacienteDoLink?.clinica_id ? Number(pacienteDoLink.clinica_id) : null, link.modelo_id);
    if (!modelo) {
      return NextResponse.json({ error: 'Modelo de anamnese não encontrado.' }, { status: 404 });
    }

    const { data: reservado } = await admin
      .from('anamnese_links')
      .update({ usado_em: new Date().toISOString() })
      .eq('id', link.id)
      .is('usado_em', null)
      .select('id')
      .maybeSingle();
    if (!reservado) {
      return NextResponse.json({ error: 'Este formulário já foi preenchido.' }, { status: 410 });
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
      await admin.from('anamnese_links').update({ usado_em: null }).eq('id', link.id);
      await registrarFalha({ origem: 'api/public/anamnese', extra: { etapa: 'gravar' } }, anamErr);
      return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    await registrarFalha({ origem: 'api/public/anamnese' }, err);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}
