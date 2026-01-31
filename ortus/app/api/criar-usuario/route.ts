import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, nome, cargo, clinicas, nivel_acesso } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // DIAGNÓSTICO: Se faltar a chave, avisa no console do VS Code
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ ERRO CRÍTICO: Variáveis de ambiente faltando!');
      console.log('URL:', supabaseUrl ? 'OK' : 'Faltando');
      console.log('KEY:', supabaseServiceKey ? 'OK (Carregada)' : 'Faltando (Verifique .env.local)');
      
      return NextResponse.json({ 
        error: 'Erro interno de configuração: Chave de API não encontrada. Verifique o terminal do servidor.' 
      }, { status: 500 });
    }

    // Conecta com PODER TOTAL (Service Role)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 1. Cria o Login (Auth User)
    const { data: user, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { nome_completo: nome } // Salva o nome no Auth também
    });

    if (authError) {
      console.error('Erro ao criar Auth:', authError);
      return NextResponse.json({ error: 'Erro ao criar login: ' + authError.message }, { status: 400 });
    }

    if (!user.user) {
        return NextResponse.json({ error: 'Erro: Usuário não foi retornado.' }, { status: 500 });
    }

    // 2. Cria o Perfil Profissional vinculado ao Login
    const { data: prof, error: dbError } = await supabaseAdmin
      .from('profissionais')
      .insert([{ 
        nome, 
        cargo, 
        nivel_acesso: nivel_acesso || 'padrao', 
        user_id: user.user.id // O ELO DE LIGAÇÃO
      }])
      .select()
      .single();

    if (dbError) {
      // Se der erro no banco, tenta limpar o usuário criado para não ficar "órfão"
      await supabaseAdmin.auth.admin.deleteUser(user.user.id);
      return NextResponse.json({ error: 'Erro ao criar perfil: ' + dbError.message }, { status: 400 });
    }

    // 3. Vincula às Clínicas
    if (clinicas && clinicas.length > 0) {
      const vinculos = clinicas.map((id: number) => ({
        profissional_id: prof.id,
        clinica_id: id
      }));
      await supabaseAdmin.from('profissionais_clinicas').insert(vinculos);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Erro geral:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}