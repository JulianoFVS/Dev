import { NextResponse } from 'next/server';
import { clinicasDoChamador, ehGestor, identificarChamador } from '@/lib/chamadorApi';

const NIVEIS_EQUIPE = new Set(['admin', 'comum', 'padrao']);

export async function POST(req: Request) {
  try {
    const chamador = await identificarChamador(req);
    if (!chamador) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    if (!ehGestor(chamador)) {
        return NextResponse.json({ error: 'Apenas administradores podem editar profissionais.' }, { status: 403 });
    }
    const supabaseAdmin = chamador.admin;
    const superAdmin = chamador.prof.is_super_admin === true;

    const body = await req.json().catch(() => ({}));
    const { id, email, password, nome, cargo, nivel_acesso, clinicas, cpf, cro, telefone, foto_url, conselho, uf, sexo, endereco } = body;

    const { data: alvo } = await supabaseAdmin
        .from('profissionais')
        .select('id, user_id, is_super_admin')
        .eq('id', id)
        .maybeSingle();
    if (!alvo) return NextResponse.json({ error: 'Profissional não encontrado.' }, { status: 404 });
    if (alvo.is_super_admin && !superAdmin) {
        return NextResponse.json({ error: 'Sem permissão para editar este usuário.' }, { status: 403 });
    }

    const minhas = superAdmin ? null : await clinicasDoChamador(chamador);
    if (minhas) {
        const { data: dele } = await supabaseAdmin.from('profissionais_clinicas').select('clinica_id').eq('profissional_id', alvo.id);
        const emComum = (dele || []).some((v) => minhas.has(String(v.clinica_id)));
        if (!emComum && alvo.id !== chamador.prof.id) {
            return NextResponse.json({ error: 'Sem permissão para editar este usuário.' }, { status: 403 });
        }
    }

    const dados: Record<string, unknown> = { nome, cargo, cpf, cro, telefone, foto_url, conselho, uf, sexo, endereco };
    if (nivel_acesso !== undefined) {
        if (!NIVEIS_EQUIPE.has(nivel_acesso)) return NextResponse.json({ error: 'Nível de acesso inválido.' }, { status: 400 });
        dados.nivel_acesso = nivel_acesso;
    }
    const { error: profError } = await supabaseAdmin.from('profissionais').update(dados).eq('id', alvo.id);
    if (profError) throw profError;

    const updates: { email?: string; password?: string } = {};
    if (email) updates.email = email;
    if (password && password.length > 0) {
        if (String(password).length < 8) return NextResponse.json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, { status: 400 });
        updates.password = password;
    }
    if (Object.keys(updates).length > 0 && alvo.user_id) {
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(alvo.user_id, updates);
        if (authError) throw authError;
    }

    if (Array.isArray(clinicas)) {
        const pedidas = clinicas.map(String);
        if (minhas && pedidas.some((c) => !minhas.has(c))) {
            return NextResponse.json({ error: 'Você só pode vincular profissionais às suas clínicas.' }, { status: 403 });
        }
        let apagar = supabaseAdmin.from('profissionais_clinicas').delete().eq('profissional_id', alvo.id);
        if (minhas) apagar = apagar.in('clinica_id', Array.from(minhas));
        await apagar;
        if (pedidas.length > 0) {
            await supabaseAdmin.from('profissionais_clinicas').insert(
                pedidas.map((clinica_id) => ({ profissional_id: alvo.id, clinica_id })),
            );
        }
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Erro API Editar:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
