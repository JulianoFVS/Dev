import { NextResponse } from 'next/server';
import { buildPresetAccessMap, presetIdFromCargo } from '@/lib/permissionPresets';
import type { ModuleName } from '@/lib/types/permissions';
import { MODULES } from '@/lib/modules';
import { clinicasQueAdministra, ehSuperAdmin, identificarChamador } from '@/lib/chamadorApi';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';
import { enviarEmail } from '@/lib/email';
import { emailAcessoCriado } from '@/lib/emailModelos';
import { origemParaEmail } from '@/lib/origemApp';

/**
 * API de Administração — Criar Funcionário (senha temporária)
 *
 * - Usa a service role para criar o usuário no Supabase Auth sem mexer na
 *   sessão do administrador que está logado no navegador.
 * - Gera uma senha temporária e a devolve UMA vez, para o administrador
 *   entregar pessoalmente. `precisa_trocar_senha = true` força a troca no
 *   primeiro acesso (/primeiro-acesso).
 * - Só cria em clínicas que o chamador ADMINISTRA: nível `admin` e vínculo
 *   que não veio de convite. Quem foi convidado para uma clínica de outra
 *   rede trabalha nela, mas não contrata gente em nome dela.
 */

function gerarSenhaTemporaria(tamanho = 10): string {
    // Sem caracteres ambíguos (0/O, 1/I/l), para facilitar a digitação manual.
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const buf = new Uint32Array(tamanho);
    globalThis.crypto.getRandomValues(buf);
    let out = '';
    for (let i = 0; i < tamanho; i++) out += alfabeto[buf[i] % alfabeto.length];
    return out;
}

export async function POST(req: Request) {
    try {
        const chamador = await identificarChamador(req);
        if (!chamador) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
        const supabaseAdmin = chamador.admin;

        const body = await req.json().catch(() => ({}));
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        const nome = typeof body?.nome === 'string' ? body.nome.trim().slice(0, 120) : '';
        const cargo = typeof body?.cargo === 'string' ? body.cargo.trim().slice(0, 80) : '';
        const clinicas: unknown = body?.clinicas;

        if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
            return NextResponse.json({ error: 'Nome e e-mail válido são obrigatórios.' }, { status: 400 });
        }
        if (!Array.isArray(clinicas) || clinicas.length === 0) {
            return NextResponse.json({ error: 'Selecione pelo menos uma unidade de acesso.' }, { status: 400 });
        }
        const idsPedidos = [...new Set(clinicas.map((c) => String(c)))];
        if (idsPedidos.some((id) => !/^\d{1,12}$/.test(id))) {
            return NextResponse.json({ error: 'Unidade inválida.' }, { status: 400 });
        }

        if (!ehSuperAdmin(chamador)) {
            const administradas = await clinicasQueAdministra(chamador);
            if (administradas.size === 0) {
                return NextResponse.json({ error: 'Apenas administradores podem criar funcionários.' }, { status: 403 });
            }
            if (idsPedidos.some((id) => !administradas.has(id))) {
                return NextResponse.json(
                    { error: 'Você só pode cadastrar funcionários nas clínicas que administra.' },
                    { status: 403 },
                );
            }
        }

        // Limite do plano antes de criar o login: com a equipe completa, nada é criado e o
        // administrador recebe a frase do plano (o banco confere de novo no vínculo).
        const { data: unidades } = await supabaseAdmin.from('clinicas').select('rede_id').in('id', idsPedidos.map(Number));
        for (const rede of [...new Set((unidades || []).map((u) => u.rede_id).filter(Boolean))]) {
            const { data: uso } = await supabaseAdmin.rpc('plano_uso_rede', { p_rede: rede });
            const u = uso as { plano_nome?: string | null; limite_profissionais?: number | null; profissionais?: number } | null;
            if (u?.limite_profissionais && (u.profissionais ?? 0) >= u.limite_profissionais) {
                const { data: frase } = await supabaseAdmin.rpc('plano_frase_profissionais', { p_plano: u.plano_nome ?? null, p_limite: u.limite_profissionais });
                return NextResponse.json({ error: String(frase || 'A equipe já está completa no plano desta clínica.') }, { status: 409 });
            }
        }

        const senhaTemporaria = gerarSenhaTemporaria();
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: senhaTemporaria,
            email_confirm: true,
            user_metadata: { nome, cargo },
        });
        if (authError || !authData?.user) {
            const jaExiste = /already|registered|exists/i.test(authError?.message || '');
            return NextResponse.json(
                { error: jaExiste ? 'Já existe uma conta com este e-mail. Use o convite de equipe.' : 'Não foi possível criar o acesso.' },
                { status: jaExiste ? 409 : 400 },
            );
        }

        const { data: profData, error: profError } = await supabaseAdmin
            .from('profissionais')
            .insert([{ user_id: authData.user.id, nome, cargo: cargo || null, nivel_acesso: 'comum', precisa_trocar_senha: true }])
            .select('id')
            .single();
        if (profError || !profData) {
            // Desfaz o login para não sobrar conta sem perfil.
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            await registrarFalha({ origem: 'api/admin/criar-usuario', extra: { etapa: 'perfil' } }, profError);
            return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
        }

        const { error: vincErr } = await supabaseAdmin
            .from('profissionais_clinicas')
            .insert(idsPedidos.map((clinica_id) => ({ profissional_id: profData.id, clinica_id: Number(clinica_id) })));
        if (vincErr) {
            // Sem vínculo a pessoa entraria num sistema vazio. Desfaz tudo.
            await supabaseAdmin.from('profissionais').delete().eq('id', profData.id);
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            // Limite do plano (outro cadastro ocupou a última vaga no meio do caminho): a frase do banco é para pessoas.
            if (vincErr.code === 'P0001' && /^O plano /.test(vincErr.message || '')) {
                return NextResponse.json({ error: vincErr.message }, { status: 409 });
            }
            await registrarFalha({ origem: 'api/admin/criar-usuario', extra: { etapa: 'vinculo' } }, vincErr);
            return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
        }

        // Módulos padrão do cargo. Se falhar, a pessoa entra sem módulos e o
        // administrador ajusta em Equipe — o aviso volta na resposta.
        const presetMap = buildPresetAccessMap(presetIdFromCargo(cargo));
        const { error: permErr } = await supabaseAdmin
            .from('permissoes_modulos')
            .upsert(
                idsPedidos.flatMap((clinica_id) =>
                    MODULES.map((modulo) => ({
                        profissional_id: profData.id,
                        clinica_id: Number(clinica_id),
                        modulo: modulo.id as ModuleName,
                        pode_acessar: presetMap[modulo.id],
                    })),
                ),
                { onConflict: 'profissional_id,clinica_id,modulo' },
            );
        if (permErr) await registrarFalha({ origem: 'api/admin/criar-usuario', extra: { etapa: 'permissoes' } }, permErr);

        // Aviso para a pessoa: a conta existe e quem entrega a senha é o administrador.
        // A senha temporária nunca vai por e-mail.
        const { data: clinicasCriadas } = await supabaseAdmin.from('clinicas').select('nome').in('id', idsPedidos.map(Number));
        const aviso = await enviarEmail({
            para: email,
            ...emailAcessoCriado({
                nome,
                clinicas: (clinicasCriadas || []).map((c) => String(c.nome || '')).filter(Boolean),
                administradorNome: chamador.prof.nome,
                origem: origemParaEmail(),
            }),
            categoria: 'acesso_criado',
        });
        if (!aviso.ok) await registrarFalha({ origem: 'api/admin/criar-usuario', extra: { etapa: 'email' } }, new Error(aviso.erro));

        return NextResponse.json({
            success: true,
            email_enviado: aviso.ok,
            ...(aviso.ok ? {} : { email_erro: aviso.erro }),
            ...(permErr ? { warning: 'Acesso criado, mas as permissões padrão não foram gravadas. Ajuste em Equipe.' } : {}),
            email,
            senha_temporaria: senhaTemporaria,
            profissional_id: profData.id,
            user_id: authData.user.id,
        });
    } catch (err) {
        await registrarFalha({ origem: 'api/admin/criar-usuario' }, err);
        return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
    }
}
