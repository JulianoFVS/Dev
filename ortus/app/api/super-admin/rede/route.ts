import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

async function autorizar(req: Request) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        return { erro: NextResponse.json({ error: 'Variáveis de ambiente do Supabase ausentes.' }, { status: 500 }) };
    }

    const supabaseAdmin = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return { erro: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };

    const { data: caller, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller?.user) {
        return { erro: NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 }) };
    }

    const { data: perfilCaller } = await supabaseAdmin
        .from('profissionais')
        .select('id, is_super_admin')
        .eq('user_id', caller.user.id)
        .single();

    if (!perfilCaller?.is_super_admin) {
        return { erro: NextResponse.json({ error: 'Acesso negado: apenas super administradores.' }, { status: 403 }) };
    }

    return { supabaseAdmin };
}

function texto(valor: unknown) {
    return typeof valor === 'string' && valor.trim() ? valor.trim() : null;
}

export async function GET(req: Request) {
    const auth = await autorizar(req);
    if ('erro' in auth) return auth.erro;
    const { supabaseAdmin } = auth;

    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Informe a rede.' }, { status: 400 });

    const { data: rede, error: redeErr } = await supabaseAdmin.from('redes').select('id, nome').eq('id', id).maybeSingle();
    if (redeErr || !rede) return NextResponse.json({ error: redeErr?.message || 'Rede não encontrada.' }, { status: 404 });

    const { data: clinica } = await supabaseAdmin
        .from('clinicas')
        .select('id, nome, telefone, email, cep, rua, numero, complemento, bairro, cidade, uf, logo_url')
        .eq('rede_id', id)
        .order('is_matriz', { ascending: false })
        .limit(1)
        .maybeSingle();

    let dono: { id: string | number; nome: string; userId: string; email: string } | null = null;
    if (clinica?.id != null) {
        const { data: vinculo } = await supabaseAdmin
            .from('profissionais_clinicas')
            .select('profissional_id')
            .eq('clinica_id', clinica.id)
            .limit(1)
            .maybeSingle();
        if (vinculo?.profissional_id != null) {
            const { data: prof } = await supabaseAdmin
                .from('profissionais')
                .select('id, nome, user_id')
                .eq('id', vinculo.profissional_id)
                .maybeSingle();
            if (prof) {
                let email = '';
                if (prof.user_id) {
                    const { data: user } = await supabaseAdmin.auth.admin.getUserById(prof.user_id);
                    email = user?.user?.email || '';
                }
                dono = { id: prof.id, nome: prof.nome || '', userId: prof.user_id || '', email };
            }
        }
    }

    return NextResponse.json({ rede, clinica, dono });
}

export async function PATCH(req: Request) {
    const auth = await autorizar(req);
    if ('erro' in auth) return auth.erro;
    const { supabaseAdmin } = auth;

    const body = await req.json().catch(() => ({}));
    const id = body?.id;
    const nome = typeof body?.nome === 'string' ? body.nome.trim() : '';
    if (id == null || id === '' || !nome) {
        return NextResponse.json({ error: 'Informe a rede e o novo nome.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('redes').update({ nome }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const clinica = body?.clinica;
    if (clinica && typeof clinica === 'object') {
        const clinicaId = clinica.id;
        const nomeClinica = typeof clinica.nome === 'string' ? clinica.nome.trim() : '';
        if (clinicaId == null || clinicaId === '' || !nomeClinica) {
            return NextResponse.json({ error: 'Informe a clínica.' }, { status: 400 });
        }
        const { error: clinicaErr } = await supabaseAdmin.from('clinicas').update({
            nome: nomeClinica,
            telefone: texto(clinica.telefone),
            email: texto(clinica.email),
            cep: texto(clinica.cep),
            rua: texto(clinica.rua),
            numero: texto(clinica.numero),
            complemento: texto(clinica.complemento),
            bairro: texto(clinica.bairro),
            cidade: texto(clinica.cidade),
            uf: texto(clinica.uf),
            ...(typeof clinica.logo_url === 'string' ? { logo_url: clinica.logo_url || null } : {}),
        }).eq('id', clinicaId).eq('rede_id', id);
        if (clinicaErr) return NextResponse.json({ error: clinicaErr.message }, { status: 400 });
    }

    const dono = body?.dono;
    if (dono && typeof dono === 'object' && dono.id != null && dono.id !== '') {
        const nomeDono = typeof dono.nome === 'string' ? dono.nome.trim() : '';
        if (nomeDono) {
            const { error: donoErr } = await supabaseAdmin.from('profissionais').update({ nome: nomeDono }).eq('id', dono.id);
            if (donoErr) return NextResponse.json({ error: donoErr.message }, { status: 400 });
        }
        const email = typeof dono.email === 'string' ? dono.email.trim().toLowerCase() : '';
        if (email && dono.userId && dono.emailAlterado) {
            const { error: emailErr } = await supabaseAdmin.auth.admin.updateUserById(String(dono.userId), { email });
            if (emailErr) return NextResponse.json({ error: emailErr.message }, { status: 400 });
        }
    }

    if (typeof body?.logo_url === 'string' && body?.clinicaId != null) {
        const { error: logoErr } = await supabaseAdmin.from('clinicas').update({ logo_url: body.logo_url || null }).eq('id', body.clinicaId).eq('rede_id', id);
        if (logoErr) return NextResponse.json({ error: logoErr.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
    const auth = await autorizar(req);
    if ('erro' in auth) return auth.erro;
    const { supabaseAdmin } = auth;

    const body = await req.json().catch(() => ({}));
    const id = body?.id;
    if (id == null || id === '') {
        return NextResponse.json({ error: 'Informe a rede.' }, { status: 400 });
    }

    const { count } = await supabaseAdmin
        .from('clinicas')
        .select('id', { count: 'exact', head: true })
        .eq('rede_id', id);

    if ((count || 0) > 0) {
        return NextResponse.json({ error: 'Esta rede tem clínicas vinculadas. Remova as clínicas antes de apagar a rede.' }, { status: 409 });
    }

    const { error } = await supabaseAdmin.from('redes').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
}
