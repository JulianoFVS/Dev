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

    // 2. BUSCA APENAS AS CLÍNICAS VINCULADAS AO PROFISSIONAL (multi-tenant)
    let clinicas: any[] = [];
    if (prof?.id) {
        const { data: vinculos, error: erroVinc } = await supabaseAdmin
            .from('profissionais_clinicas')
            .select('clinicas(id, nome, endereco, rede_id, redes(id, nome))')
            .eq('profissional_id', prof.id);

        if (erroVinc) {
            console.error('Erro ao buscar vínculos:', erroVinc);
            return NextResponse.json({ error: 'Erro ao buscar unidades do usuário.' }, { status: 500 });
        }

        clinicas = (vinculos || [])
            .map((v: any) => v.clinicas)
            .filter(Boolean)
            .sort((a: any, b: any) => (a.nome || '').localeCompare(b.nome || ''));
    }

    return NextResponse.json({
        clinicas,
        usuario: prof || { nome: 'Usuário' }
    });

  } catch (error: any) {
    console.error('Erro Crítico API:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}