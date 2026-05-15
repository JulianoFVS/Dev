import { supabase } from '@/lib/supabase';

/**
 * Helpers de Multi-Tenant: garantem que toda busca de clínicas seja
 * estritamente filtrada pelo `auth.user.id` logado, via INNER JOIN
 * duplo (clinicas → profissionais_clinicas → profissionais).
 *
 * Use estes helpers em vez de `supabase.from('clinicas').select('*')`,
 * que vazaria clínicas de outras redes.
 */

export type ClinicaSlim = {
    id: string | number;
    nome: string;
    endereco?: string | null;
    rede_id?: string | number | null;
};

/**
 * Retorna as clínicas que o usuário logado pode acessar:
 *  - usuário comum: apenas as vinculadas via `profissionais_clinicas`.
 *  - super admin: todas (visão global do dono do SaaS).
 *
 * Use `restrictSuperAdminToVinculos: true` se quiser que mesmo um super
 * admin veja apenas seus próprios vínculos (raro — útil em telas que
 * representam um tenant específico).
 */
export async function fetchUserClinicas(opts?: { restrictSuperAdminToVinculos?: boolean }): Promise<ClinicaSlim[]> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return [];

    const logErro = (etapa: string, error: any) => {
        if (!error) return;
        console.error(
            `[clinicScoped] Falha em "${etapa}":\n` +
            `  message: ${error.message}\n` +
            `  details: ${error.details}\n` +
            `  hint:    ${error.hint}\n` +
            `  code:    ${error.code}`,
            error,
        );
    };

    // Estratégia em 3 etapas — compatível com as policies de RLS sem
    // depender de embeds aninhados.
    const { data: prof, error: profErr } = await supabase
        .from('profissionais')
        .select('id, is_super_admin')
        .eq('user_id', session.user.id)
        .maybeSingle();
    logErro('profissionais.select', profErr);

    // Super admin → visão global por padrão (a menos que opte por vínculos)
    if (prof?.is_super_admin && !opts?.restrictSuperAdminToVinculos) {
        const { data, error } = await supabase
            .from('clinicas')
            .select('id, nome, endereco, rede_id')
            .order('nome');
        logErro('clinicas.select (super admin)', error);
        return (data || []) as ClinicaSlim[];
    }

    if (!prof?.id) return [];

    const { data: vinculos, error: vincErr } = await supabase
        .from('profissionais_clinicas')
        .select('clinica_id')
        .eq('profissional_id', prof.id);
    logErro('profissionais_clinicas.select', vincErr);

    const ids = Array.from(new Set((vinculos || []).map((v: any) => v.clinica_id))).filter((x) => x !== null && x !== undefined);
    if (ids.length === 0) return [];

    const { data, error } = await supabase
        .from('clinicas')
        .select('id, nome, endereco, rede_id')
        .in('id', ids as any)
        .order('nome');
    logErro('clinicas.select (in ids)', error);
    return (data || []) as ClinicaSlim[];
}

/**
 * Lista IDs (string) das clínicas permitidas ao usuário logado.
 * Útil para `.in('clinica_id', ids)` em queries de pacientes/agenda/etc.
 */
export async function fetchUserClinicaIds(): Promise<string[]> {
    const lista = await fetchUserClinicas();
    return lista.map((c) => String(c.id));
}

/**
 * Retorna a equipe (profissionais) visível ao usuário logado:
 *  - super admin: TODOS os profissionais.
 *  - demais usuários: profissionais que compartilham pelo menos UMA
 *    clínica com o usuário logado.
 *
 * Cada profissional vem com a lista deduplicada de clínicas em que
 * está vinculado (limitada às clínicas visíveis ao próprio usuário,
 * para evitar revelar a estrutura de outras redes).
 */
export type ProfissionalEquipe = {
    id: any;
    nome: string;
    cargo?: string | null;
    nivel_acesso?: string | null;
    user_id?: string | null;
    precisa_trocar_senha?: boolean | null;
    telefone?: string | null;
    foto_url?: string | null;
    conselho?: string | null;
    cro?: string | null;
    clinicas: Array<{ id: any; nome: string }>;
};

export async function fetchUserEquipe(): Promise<ProfissionalEquipe[]> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return [];

    const { data: prof } = await supabase
        .from('profissionais')
        .select('id, is_super_admin')
        .eq('user_id', session.user.id)
        .maybeSingle();

    if (!prof?.id) return [];

    // Super admin: visão global.
    if (prof.is_super_admin) {
        const { data: todos } = await supabase
            .from('profissionais')
            .select('id, nome, cargo, nivel_acesso, user_id, precisa_trocar_senha, telefone, foto_url, conselho, cro')
            .order('nome');
        const { data: todosVinc } = await supabase
            .from('profissionais_clinicas')
            .select('profissional_id, clinicas(id, nome)');
        return montarEquipe(todos || [], todosVinc || []);
    }

    // 1) clínicas do usuário
    const { data: minhasClins } = await supabase
        .from('profissionais_clinicas')
        .select('clinica_id')
        .eq('profissional_id', prof.id);
    const idsClin = Array.from(new Set((minhasClins || []).map((v: any) => v.clinica_id)));
    if (idsClin.length === 0) return [];

    // 2) todos os vínculos dessas clínicas (= colegas + clínicas em comum)
    const { data: vinculos } = await supabase
        .from('profissionais_clinicas')
        .select('profissional_id, clinicas(id, nome)')
        .in('clinica_id', idsClin as any);

    const idsProf = Array.from(new Set((vinculos || []).map((v: any) => v.profissional_id)));
    if (idsProf.length === 0) return [];

    // 3) dados dos profissionais
    const { data: profs } = await supabase
        .from('profissionais')
        .select('id, nome, cargo, nivel_acesso, user_id, precisa_trocar_senha, telefone, foto_url, conselho, cro')
        .in('id', idsProf as any)
        .order('nome');

    return montarEquipe(profs || [], vinculos || []);
}

function montarEquipe(profs: any[], vinculos: any[]): ProfissionalEquipe[] {
    const mapClinPorProf = new Map<string, Map<string, any>>();
    vinculos.forEach((v: any) => {
        if (!v.clinicas) return;
        const profKey = String(v.profissional_id);
        const clinKey = String(v.clinicas.id);
        const inner = mapClinPorProf.get(profKey) || new Map<string, any>();
        if (!inner.has(clinKey)) inner.set(clinKey, v.clinicas);
        mapClinPorProf.set(profKey, inner);
    });
    return profs.map((p: any) => ({
        ...p,
        clinicas: Array.from((mapClinPorProf.get(String(p.id)) || new Map()).values()),
    }));
}
