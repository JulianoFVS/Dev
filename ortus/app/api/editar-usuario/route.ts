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
    const { id, user_id, email, password, nome, cargo, nivel_acesso, clinicas } = body;

    // 1. Atualizar Tabela Profissionais
    const { error: profError } = await supabaseAdmin
        .from('profissionais')
        .update({ nome, cargo, nivel_acesso })
        .eq('id', id);

    if (profError) throw profError;

    // 2. Atualizar Auth (Email/Senha) se fornecidos
    const updates: any = {};
    if (email) updates.email = email;
    if (password) updates.password = password;

    if (Object.keys(updates).length > 0 && user_id) {
        const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user_id, updates);
        if (authError) throw authError;
    }

    // 3. Atualizar Clínicas (Remove tudo e insere de novo - método simples)
    if (clinicas) {
        await supabaseAdmin.from('profissionais_clinicas').delete().eq('profissional_id', id);
        if (clinicas.length > 0) {
            const vinculos = clinicas.map((clinica_id: any) => ({
                profissional_id: id,
                clinica_id: clinica_id
            }));
            await supabaseAdmin.from('profissionais_clinicas').insert(vinculos);
        }
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Erro ao editar usuário:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}