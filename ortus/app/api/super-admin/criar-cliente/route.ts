import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * API B2B — Onboarding de novo cliente (Tenant).
 *
 * Acesso restrito a profissionais com `is_super_admin = true`. Realiza um
 * fluxo composto (lógica transacional manual com rollback em cascata) para
 * provisionar todo o tenant em um único request:
 *   redes → clinicas (matriz) → auth.users → profissionais → profissionais_clinicas
 *
 * Caso qualquer passo falhe, todos os passos anteriores são desfeitos para
 * não deixar registros órfãos.
 */

function gerarSenhaTemporaria(tamanho = 8): string {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let out = '';
    const cripto = globalThis.crypto;
    if (cripto && 'getRandomValues' in cripto) {
        const buf = new Uint32Array(tamanho);
        cripto.getRandomValues(buf);
        for (let i = 0; i < tamanho; i++) out += alfabeto[buf[i] % alfabeto.length];
    } else {
        for (let i = 0; i < tamanho; i++) out += alfabeto[Math.floor(Math.random() * alfabeto.length)];
    }
    return out;
}

export async function POST(req: Request) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
        return NextResponse.json({ error: 'Variáveis de ambiente do Supabase ausentes.' }, { status: 500 });
    }

    const supabaseAdmin = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // -------- 1. Autenticação e autorização --------
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller?.user) {
        return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
    }

    const { data: perfilCaller } = await supabaseAdmin
        .from('profissionais')
        .select('id, is_super_admin')
        .eq('user_id', caller.user.id)
        .single();

    if (!perfilCaller?.is_super_admin) {
        return NextResponse.json({ error: 'Acesso negado: apenas super administradores.' }, { status: 403 });
    }

    // -------- 2. Validação do payload --------
    const body = await req.json().catch(() => ({}));
    const { nomeRede, nomeMatriz, nomeDono, emailDono } = body as {
        nomeRede?: string; nomeMatriz?: string; nomeDono?: string; emailDono?: string;
    };

    const erros: string[] = [];
    if (!nomeRede?.trim()) erros.push('Nome da rede é obrigatório.');
    if (!nomeMatriz?.trim()) erros.push('Nome da matriz é obrigatório.');
    if (!nomeDono?.trim()) erros.push('Nome do dono é obrigatório.');
    if (!emailDono?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailDono)) erros.push('E-mail do dono é inválido.');
    if (erros.length) return NextResponse.json({ error: erros.join(' ') }, { status: 400 });

    // Estado para rollback em cascata
    let redeId: string | number | null = null;
    let clinicaId: string | number | null = null;
    let userId: string | null = null;
    let profissionalId: string | number | null = null;

    async function rollback() {
        try {
            if (profissionalId) {
                await supabaseAdmin.from('profissionais_clinicas').delete().eq('profissional_id', profissionalId);
                await supabaseAdmin.from('profissionais').delete().eq('id', profissionalId);
            }
            if (userId) {
                await supabaseAdmin.auth.admin.deleteUser(userId);
            }
            if (clinicaId) {
                await supabaseAdmin.from('clinicas').delete().eq('id', clinicaId);
            }
            if (redeId) {
                await supabaseAdmin.from('redes').delete().eq('id', redeId);
            }
        } catch (e) {
            console.error('Falha no rollback do onboarding:', e);
        }
    }

    try {
        // -------- 3. Cria rede --------
        const { data: redeData, error: redeErr } = await supabaseAdmin
            .from('redes')
            .insert([{ nome: nomeRede!.trim() }])
            .select('id, nome')
            .single();
        if (redeErr || !redeData) {
            return NextResponse.json({ error: redeErr?.message || 'Falha ao criar rede.' }, { status: 500 });
        }
        redeId = redeData.id;

        // -------- 4. Cria clínica matriz --------
        const { data: clinicaData, error: clinicaErr } = await supabaseAdmin
            .from('clinicas')
            .insert([{ nome: nomeMatriz!.trim(), rede_id: redeId, is_matriz: true }])
            .select('id, nome')
            .single();
        if (clinicaErr || !clinicaData) {
            await rollback();
            return NextResponse.json({ error: clinicaErr?.message || 'Falha ao criar matriz.' }, { status: 500 });
        }
        clinicaId = clinicaData.id;

        // -------- 5. Cria usuário no Auth --------
        const senhaTemporaria = gerarSenhaTemporaria(8);
        const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
            email: emailDono!.trim().toLowerCase(),
            password: senhaTemporaria,
            email_confirm: true,
            user_metadata: { nome: nomeDono!.trim(), tenant_owner: true },
        });
        if (authErr || !authData?.user) {
            await rollback();
            return NextResponse.json({ error: authErr?.message || 'Falha ao criar usuário.' }, { status: 400 });
        }
        userId = authData.user.id;

        // -------- 6. Insere profissional (dono do tenant) --------
        const { data: profData, error: profErr } = await supabaseAdmin
            .from('profissionais')
            .insert([{
                user_id: userId,
                nome: nomeDono!.trim(),
                cargo: 'Dono(a) da Clínica',
                nivel_acesso: 'admin',
                precisa_trocar_senha: true,
                is_super_admin: false,
            }])
            .select('id')
            .single();
        if (profErr || !profData) {
            await rollback();
            return NextResponse.json({ error: profErr?.message || 'Falha ao salvar profissional.' }, { status: 500 });
        }
        profissionalId = profData.id;

        // -------- 7. Vincula profissional à clínica matriz --------
        const { error: vincErr } = await supabaseAdmin
            .from('profissionais_clinicas')
            .insert([{ profissional_id: profissionalId, clinica_id: clinicaId }]);
        if (vincErr) {
            await rollback();
            return NextResponse.json({ error: 'Falha ao vincular dono à matriz: ' + vincErr.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            rede_id: redeId,
            rede_nome: redeData.nome,
            clinica_id: clinicaId,
            clinica_nome: clinicaData.nome,
            email: emailDono!.trim().toLowerCase(),
            senha_temporaria: senhaTemporaria,
        });
    } catch (e: any) {
        console.error('Erro inesperado no onboarding:', e);
        await rollback();
        return NextResponse.json({ error: e?.message || 'Erro interno.' }, { status: 500 });
    }
}
