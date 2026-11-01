import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { clinicasDoChamador, ehGestor, identificarChamador } from '@/lib/chamadorApi';

const NIVEIS_EQUIPE = new Set(['admin', 'comum', 'padrao']);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, password, nome, cargo, nivel_acesso, clinicas, cpf, cro, telefone, conselho, uf, sexo, endereco } = body;

    if (!email || !password) {
        return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 });
    }
    if (String(password).length < 8) {
        return NextResponse.json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, { status: 400 });
    }

    const temToken = (req.headers.get('authorization') || '').startsWith('Bearer ');
    const chamador = temToken ? await identificarChamador(req) : null;
    if (temToken && !chamador) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
    if (chamador && !ehGestor(chamador)) {
        return NextResponse.json({ error: 'Apenas administradores podem cadastrar profissionais.' }, { status: 403 });
    }

    let perfil: Record<string, unknown>;
    let vinculos: string[] = [];
    if (!chamador) {
        // Cadastro público: só cria a conta. Clínica e rede vêm depois, pelo suporte.
        perfil = { nome: String(nome || '').slice(0, 120), cargo: 'Administrador', nivel_acesso: 'admin' };
    } else {
        const nivel = NIVEIS_EQUIPE.has(nivel_acesso) ? nivel_acesso : 'padrao';
        perfil = { nome, cargo, nivel_acesso: nivel, cpf, cro, telefone, conselho, uf, sexo, endereco };
        const pedidas = Array.isArray(clinicas) ? clinicas.map(String) : [];
        if (chamador.prof.is_super_admin) {
            vinculos = pedidas;
        } else {
            const minhas = await clinicasDoChamador(chamador);
            if (pedidas.some((id) => !minhas.has(id))) {
                return NextResponse.json({ error: 'Você só pode vincular profissionais às suas clínicas.' }, { status: 403 });
            }
            vinculos = pedidas;
        }
    }

    const supabaseAdmin = createSupabaseAdmin();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) throw authError;

    const { data: profData, error: profError } = await supabaseAdmin
        .from('profissionais')
        .insert([{ user_id: authData.user.id, ...perfil }])
        .select('id')
        .single();

    if (profError) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw profError;
    }

    if (vinculos.length > 0 && profData) {
        await supabaseAdmin.from('profissionais_clinicas').insert(
            vinculos.map((clinica_id) => ({ profissional_id: profData.id, clinica_id })),
        );
    }

    return NextResponse.json({ success: true, user: { id: authData.user.id, email: authData.user.email } });

  } catch (error: any) {
    console.error('Erro API Criar:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
