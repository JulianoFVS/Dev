import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // Cliente com permissão total (Service Role)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { userId } = await req.json();

    if (!userId) {
        return NextResponse.json({ error: 'ID do usuário obrigatório' }, { status: 400 });
    }

    // 1. Verifica quem é o usuário e seu nível
    const { data: prof, error: profError } = await supabaseAdmin
        .from('profissionais')
        .select('id, nome, nivel_acesso')
        .eq('user_id', userId)
        .single();

    if (profError || !prof) {
        return NextResponse.json({ error: 'Perfil profissional não encontrado' }, { status: 404 });
    }

    let listaClinicas = [];

    // 2. Lógica de Busca
    if (prof.nivel_acesso === 'admin') {
        // ADMIN: Busca TODAS as clínicas do sistema
        const { data: todas } = await supabaseAdmin
            .from('clinicas')
            .select('id, nome, endereco')
            .order('nome');
        listaClinicas = todas || [];
    } else {
        // COMUM: Busca apenas as vinculadas
        const { data: vinculos } = await supabaseAdmin
            .from('profissionais_clinicas')
            .select('clinica_id, clinicas(id, nome, endereco)')
            .eq('profissional_id', prof.id);
        
        listaClinicas = vinculos?.map((v: any) => v.clinicas) || [];
    }

    return NextResponse.json({ clinicas: listaClinicas, usuario: prof });

  } catch (error: any) {
    console.error('Erro API Listar:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}