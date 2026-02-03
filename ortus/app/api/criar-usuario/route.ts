import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, 
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    // Recebe TODOS os campos agora
    const { email, password, nome, cargo, nivel_acesso, clinicas, cpf, cro, telefone, foto_url } = body;

    if (!email || !password) {
        return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 });
    }

    // 1. Cria Login no Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) throw authError;

    // 2. Cria Dados no Banco (Completo)
    const { data: profData, error: profError } = await supabaseAdmin
        .from('profissionais')
        .insert([{
            user_id: authData.user.id,
            nome,
            cargo,
            nivel_acesso: nivel_acesso || 'padrao',
            cpf,
            cro,
            telefone,
            foto_url
        }])
        .select()
        .single();

    if (profError) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id); // Desfaz se der erro
        throw profError;
    }

    // 3. Vínculos
    if (clinicas && clinicas.length > 0 && profData) {
        const vinculos = clinicas.map((clinica_id: any) => ({
            profissional_id: profData.id,
            clinica_id: clinica_id
        }));
        await supabaseAdmin.from('profissionais_clinicas').insert(vinculos);
    }

    return NextResponse.json({ success: true, user: authData.user });

  } catch (error: any) {
    console.error('Erro API Criar:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}