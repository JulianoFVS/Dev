import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { gerarTokenAnamnese, hashTokenAnamnese } from '@/lib/anamneseLinks';

const LINK_VALIDADE_HORAS = 72;

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const admin = createSupabaseAdmin();
    const { data: caller, error: callerErr } = await admin.auth.getUser(token);
    if (callerErr || !caller?.user) {
      return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { paciente_id, modelo_id, clinica_id } = body as {
      paciente_id?: string | number;
      modelo_id?: string;
      clinica_id?: string | number | null;
    };

    if (!paciente_id || !modelo_id) {
      return NextResponse.json({ error: 'paciente_id e modelo_id são obrigatórios.' }, { status: 400 });
    }

    const { data: paciente, error: pacErr } = await admin
      .from('pacientes')
      .select('id, clinica_id')
      .eq('id', paciente_id)
      .maybeSingle();

    if (pacErr || !paciente) {
      return NextResponse.json({ error: 'Paciente não encontrado.' }, { status: 404 });
    }

    const clinicaAlvo = clinica_id ?? paciente.clinica_id;
    if (clinicaAlvo) {
      const { data: prof } = await admin
        .from('profissionais')
        .select('id, is_super_admin')
        .eq('user_id', caller.user.id)
        .maybeSingle();

      if (!prof?.is_super_admin) {
        const { data: vinculo } = await admin
          .from('profissionais_clinicas')
          .select('clinica_id')
          .eq('profissional_id', prof?.id)
          .eq('clinica_id', clinicaAlvo)
          .maybeSingle();

        if (!vinculo) {
          return NextResponse.json({ error: 'Sem permissão para esta clínica.' }, { status: 403 });
        }
      }
    }

    const plainToken = gerarTokenAnamnese();
    const tokenHash = hashTokenAnamnese(plainToken);
    const expiresAt = new Date(Date.now() + LINK_VALIDADE_HORAS * 60 * 60 * 1000).toISOString();

    const { error: insertErr } = await admin.from('anamnese_links').insert({
      paciente_id,
      clinica_id: clinicaAlvo ?? null,
      modelo_id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || '';
    const url = `${origin}/anamnese/${plainToken}`;

    return NextResponse.json({ url, expires_at: expiresAt });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
