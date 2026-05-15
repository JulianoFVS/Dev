import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * API de Administração — Criar Funcionário (Temporary Password Flow)
 *
 * - Usa SERVICE_ROLE_KEY para criar o usuário no Supabase Auth sem afetar a
 *   sessão do administrador que está logado no navegador.
 * - Gera uma senha temporária aleatória e a retorna no payload para que o
 *   admin a comunique pessoalmente ao funcionário.
 * - Marca `precisa_trocar_senha = true` no `profissionais` para forçar
 *   o fluxo de primeiro acesso (/primeiro-acesso) no primeiro login.
 * - Antes de criar, valida que o usuário chamador é admin e que TODAS as
 *   clínicas alvo pertencem à rede dele (isolamento Multi-Tenant).
 */

function gerarSenhaTemporaria(tamanho = 8): string {
    // Evita caracteres ambíguos (0/O, 1/I/l) para facilitar a digitação manual.
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
    try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!url || !serviceKey || !anonKey) {
            return NextResponse.json({ error: 'Variáveis de ambiente do Supabase ausentes.' }, { status: 500 });
        }

        const supabaseAdmin = createClient(url, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // ---- 1. Autenticação do chamador (admin) ----
        const authHeader = req.headers.get('authorization') || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!token) {
            return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
        }

        const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token);
        if (callerErr || !caller?.user) {
            return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
        }

        const { data: perfilCaller, error: perfilErr } = await supabaseAdmin
            .from('profissionais')
            .select('id, nivel_acesso')
            .eq('user_id', caller.user.id)
            .single();

        if (perfilErr || !perfilCaller) {
            return NextResponse.json({ error: 'Perfil profissional do solicitante não encontrado.' }, { status: 403 });
        }
        if (perfilCaller.nivel_acesso !== 'admin') {
            return NextResponse.json({ error: 'Apenas administradores podem criar funcionários.' }, { status: 403 });
        }

        // ---- 2. Parsing do payload ----
        const body = await req.json().catch(() => ({}));
        const { email, nome, cargo, clinicas } = body as {
            email?: string; nome?: string; cargo?: string; clinicas?: Array<string | number>;
        };

        if (!email || !nome) {
            return NextResponse.json({ error: 'Nome e e-mail são obrigatórios.' }, { status: 400 });
        }
        if (!Array.isArray(clinicas) || clinicas.length === 0) {
            return NextResponse.json({ error: 'Selecione pelo menos uma unidade de acesso.' }, { status: 400 });
        }

        // ---- 3. Validação Multi-Tenant: só clínicas que o admin enxerga ----
        const { data: vinculosAdmin } = await supabaseAdmin
            .from('profissionais_clinicas')
            .select('clinica_id')
            .eq('profissional_id', perfilCaller.id);

        const idsPermitidos = new Set((vinculosAdmin || []).map((v: any) => String(v.clinica_id)));
        const idsPedidos = clinicas.map((c) => String(c));
        const fora = idsPedidos.filter((id) => !idsPermitidos.has(id));
        if (fora.length > 0 && idsPermitidos.size > 0) {
            return NextResponse.json(
                { error: 'Você não tem permissão para vincular este usuário a clínicas fora da sua rede.' },
                { status: 403 },
            );
        }

        // ---- 4. Cria o usuário no Auth com senha temporária ----
        const senhaTemporaria = gerarSenhaTemporaria(8);
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: senhaTemporaria,
            email_confirm: true,
            user_metadata: { nome, cargo },
        });

        if (authError || !authData?.user) {
            return NextResponse.json({ error: authError?.message || 'Falha ao criar usuário.' }, { status: 400 });
        }

        // ---- 5. Insere o profissional com flag de troca de senha ----
        const { data: profData, error: profError } = await supabaseAdmin
            .from('profissionais')
            .insert([{
                user_id: authData.user.id,
                nome,
                cargo: cargo || null,
                nivel_acesso: 'padrao',
                precisa_trocar_senha: true,
            }])
            .select()
            .single();

        if (profError || !profData) {
            // Rollback do Auth para não deixar conta órfã.
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            return NextResponse.json({ error: profError?.message || 'Falha ao salvar profissional.' }, { status: 500 });
        }

        // ---- 6. Vínculos com clínicas ----
        const vinculos = idsPedidos.map((clinica_id) => ({
            profissional_id: profData.id,
            clinica_id,
        }));
        const { error: vincErr } = await supabaseAdmin.from('profissionais_clinicas').insert(vinculos);
        if (vincErr) {
            // Não derruba o usuário se o vínculo falhar — apenas retorna aviso.
            return NextResponse.json({
                success: true,
                warning: 'Usuário criado, mas houve erro ao vincular clínicas: ' + vincErr.message,
                email,
                senha_temporaria: senhaTemporaria,
                profissional_id: profData.id,
            });
        }

        return NextResponse.json({
            success: true,
            email,
            senha_temporaria: senhaTemporaria,
            profissional_id: profData.id,
            user_id: authData.user.id,
        });
    } catch (err: any) {
        console.error('Erro em /api/admin/criar-usuario:', err);
        return NextResponse.json({ error: err?.message || 'Erro interno.' }, { status: 500 });
    }
}
