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
 * Retorna apenas as clínicas que o usuário logado tem vínculo direto
 * em `profissionais_clinicas`. Deduplica por id e ordena por nome.
 *
 * Se o usuário é `is_super_admin`, devolve todas as clínicas (uso
 * exclusivo do backoffice; não chame em telas de tenant).
 */
export async function fetchUserClinicas(opts?: { includeAllForSuperAdmin?: boolean }): Promise<ClinicaSlim[]> {
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

    if (opts?.includeAllForSuperAdmin && prof?.is_super_admin) {
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
