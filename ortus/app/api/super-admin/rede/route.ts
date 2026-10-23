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

export async function PATCH(req: Request) {
    const auth = await autorizar(req);
    if ('erro' in auth && auth.erro) return auth.erro;
    const { supabaseAdmin } = auth as { supabaseAdmin: ReturnType<typeof createClient> };

    const body = await req.json().catch(() => ({}));
    const id = body?.id;
    const nome = typeof body?.nome === 'string' ? body.nome.trim() : '';
    if (id == null || id === '' || !nome) {
        return NextResponse.json({ error: 'Informe a rede e o novo nome.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('redes').update({ nome }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
    const auth = await autorizar(req);
    if ('erro' in auth && auth.erro) return auth.erro;
    const { supabaseAdmin } = auth as { supabaseAdmin: ReturnType<typeof createClient> };

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
