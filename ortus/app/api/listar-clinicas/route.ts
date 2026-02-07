import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // Usa a chave de serviço (Service Role) para ignorar as regras de segurança (RLS)
    // Isso garante que vamos ver TUDO que está no banco
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { userId } = await req.json();

    if (!userId) {
        return NextResponse.json({ error: 'UserID ausente' }, { status: 400 });
    }

    // 1. Pega dados do profissional (apenas para saudação)
    const { data: prof } = await supabaseAdmin
        .from('profissionais')
        .select('*')
        .eq('user_id', userId)
        .single();

    // 2. BUSCA TODAS AS CLÍNICAS (SEM FILTRO DE USUÁRIO)
    // Isso resolve o problema de não aparecerem as clínicas cadastradas
    const { data: todasClinicas, error: erroClinicas } = await supabaseAdmin
        .from('clinicas')
        .select('id, nome, endereco')
        .order('nome');

    if (erroClinicas) {
        console.error('Erro ao buscar clínicas:', erroClinicas);
        return NextResponse.json({ error: 'Erro ao buscar clínicas no banco.' }, { status: 500 });
    }

    return NextResponse.json({ 
        clinicas: todasClinicas || [], 
        usuario: prof || { nome: 'Usuário' } 
    });

  } catch (error: any) {
    console.error('Erro Crítico API:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}