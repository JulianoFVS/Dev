const fs = require('fs');
const path = require('path');

console.log('🧠 Instalando V46: Backend de Cadastro de Profissionais (API Routes)...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    const dir = path.dirname(caminhoCompleto);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Criado: ${caminhoRelativo}`);
}

// ======================================================
// 1. ROTA CRIAR USUÁRIO (app/api/criar-usuario/route.ts)
// ======================================================
const routeCriar = `
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // Inicializa o cliente ADMIN (necessário para criar usuários)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!, 
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const body = await req.json();
    const { email, password, nome, cargo, nivel_acesso, clinicas } = body;

    if (!email || !password) {
        return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 });
    }

    // 1. Criar Usuário na Autenticação (Auth)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) throw authError;

    // 2. Criar Registro na tabela Profissionais
    const { data: profData, error: profError } = await supabaseAdmin
        .from('profissionais')
        .insert([{
            user_id: authData.user.id,
            nome,
            cargo,
            nivel_acesso: nivel_acesso || 'padrao'
        }])
        .select()
        .single();

    if (profError) {
        // Se falhar no banco, deleta o auth para não ficar órfão (rollback manual)
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw profError;
    }

    // 3. Vincular Clínicas (se houver)
    if (clinicas && clinicas.length > 0 && profData) {
        const vinculos = clinicas.map((clinica_id: any) => ({
            profissional_id: profData.id,
            clinica_id: clinica_id
        }));
        await supabaseAdmin.from('profissionais_clinicas').insert(vinculos);
    }

    return NextResponse.json({ success: true, user: authData.user });

  } catch (error: any) {
    console.error('Erro ao criar usuário:', error);
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 });
  }
}
`;

// ======================================================
// 2. ROTA EDITAR USUÁRIO (app/api/editar-usuario/route.ts)
// ======================================================
const routeEditar = `
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
`;

salvarArquivo('app/api/criar-usuario/route.ts', routeCriar);
salvarArquivo('app/api/editar-usuario/route.ts', routeEditar);