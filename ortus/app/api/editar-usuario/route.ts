import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, user_id, email, password, nome, cargo, nivel_acesso, clinicas } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        return NextResponse.json({ error: 'Chave Mestra não configurada no servidor.' }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // --- LÓGICA DE ATUALIZAÇÃO DO LOGIN (AUTH) ---
    if (user_id) {
        // 1. Busca o usuário atual para comparar dados
        const { data: { user }, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(user_id);
        
        if (fetchError) {
            console.error('Erro ao buscar usuario Auth:', fetchError);
            // Se não achou no Auth, talvez tenha sido deletado. Segue para atualizar só o banco.
        } 
        else if (user) {
            const updates: any = {};
            
            // Só atualiza email se for DIFERENTE do atual
            if (email && user.email !== email) {
                updates.email = email;
                updates.email_confirm = true; // Garante que o novo email já venha confirmado
            }

            // Só atualiza senha se foi digitada
            if (password && password.trim().length > 0) {
                updates.password = password;
            }

            // Sempre tenta atualizar o metadado (nome)
            updates.user_metadata = { ...user.user_metadata, nome_completo: nome };

            // Se tiver algo para mudar, executa
            if (Object.keys(updates).length > 0) {
                const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
                    user_id,
                    updates
                );
                
                if (authError) {
                    console.error('Erro Auth:', authError);
                    // Tradução amigável de erros comuns
                    let msg = authError.message;
                    if (msg.includes('email already registered')) msg = 'Este email já está em uso por outro usuário.';
                    if (msg.includes('password')) msg = 'A senha é muito fraca ou inválida.';
                    if (msg.includes('same as current')) msg = 'O novo email é igual ao atual.';
                    
                    return NextResponse.json({ error: 'Falha no Login: ' + msg }, { status: 400 });
                }
            }
        }
    }

    // --- LÓGICA DE ATUALIZAÇÃO DO PERFIL (BANCO) ---
    const { error: dbError } = await supabaseAdmin
      .from('profissionais')
      .update({ 
        nome, 
        cargo, 
        nivel_acesso,
        email // Mantém o visual atualizado
      })
      .eq('id', id);

    if (dbError) return NextResponse.json({ error: 'Erro no Banco: ' + dbError.message }, { status: 400 });

    // --- LÓGICA DE VÍNCULOS ---
    if (clinicas) {
        await supabaseAdmin.from('profissionais_clinicas').delete().eq('profissional_id', id);
        if (clinicas.length > 0) {
            const vinculos = clinicas.map((cid: number) => ({ profissional_id: id, clinica_id: cid }));
            await supabaseAdmin.from('profissionais_clinicas').insert(vinculos);
        }
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Erro Fatal API:', error);
    return NextResponse.json({ error: 'Erro interno: ' + error.message }, { status: 500 });
  }
}