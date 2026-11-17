import { supabase } from '@/lib/supabase';
import { dados as tabelas } from '@/lib/local/consulta';
import { listar, modoDados } from '@/lib/local/cliente';

/**
 * Helpers de Multi-Tenant: garantem que toda busca de clínicas seja
 * estritamente filtrada pelo `auth.user.id` logado, via INNER JOIN
 * duplo (clinicas → profissionais_clinicas → profissionais).
 *
 * Use estes helpers em vez de `tabelas.from('clinicas').select('*')`,
 * que vazaria clínicas de outras redes.
 */

export type ClinicaSlim = {
    id: string | number;
    nome: string;
    endereco?: string | null;
    rede_id?: string | number | null;
};

/**
 * Cache curtíssimo por usuário.
 *
 * Várias telas (agenda, dashboard, seleção de clínica) pedem a mesma lista
 * logo na montagem. Sem cache, cada navegação repete 2–3 round-trips.
 * A chave inclui o id do usuário, o TTL é curto e qualquer evento de
 * mudança de clínica limpa tudo — então nunca fica "preso" a dado velho.
 */
const TTL_CLINICAS_MS = 20_000;
type CacheClinicas = { userId: string; em: number; dados: ClinicaSlim[] };
let cacheClinicas: CacheClinicas | null = null;
let emVooClinicas: { userId: string; promessa: Promise<ClinicaSlim[]> } | null = null;

/** Limpa o cache de clínicas (chame após criar/remover vínculo ou clínica). */
export function invalidarClinicasCache() {
    cacheClinicas = null;
    emVooClinicas = null;
}

if (typeof window !== 'undefined') {
    const limpar = () => invalidarClinicasCache();
    window.addEventListener('ortus:clinica-changed', limpar);
    window.addEventListener('ortus:active-clinic-changed', limpar);
    window.addEventListener('ortus:equipe-changed', limpar);
}

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
    // No desktop o banco local é a fonte; a nuvem pode estar fora do ar.
    if ((await modoDados()) === 'local') {
        return clinicasLocais(opts);
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        invalidarClinicasCache();
        return [];
    }

    const userId = session.user.id;
    const podeCachear = !opts?.restrictSuperAdminToVinculos;
    if (podeCachear && cacheClinicas && cacheClinicas.userId === userId && Date.now() - cacheClinicas.em < TTL_CLINICAS_MS) {
        return cacheClinicas.dados;
    }
    if (podeCachear && emVooClinicas && emVooClinicas.userId === userId) {
        return emVooClinicas.promessa;
    }

    const promessa = buscarClinicasDoUsuario(userId, opts);
    if (podeCachear) {
        emVooClinicas = { userId, promessa };
        promessa
            .then((dados) => {
                cacheClinicas = { userId, em: Date.now(), dados };
            })
            .catch(() => undefined)
            .finally(() => {
                if (emVooClinicas?.promessa === promessa) emVooClinicas = null;
            });
    }
    return promessa;
}

/** Clínicas permitidas, lidas do SQLite (desktop). */
async function clinicasLocais(opts?: { restrictSuperAdminToVinculos?: boolean }): Promise<ClinicaSlim[]> {
    try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        const perfil = userId
            ? (await listar<{ id: number; is_super_admin: boolean | null }>('profissionais', {
                filtros: [{ col: 'user_id', op: 'eq', valor: userId }],
                limite: 1,
            }))[0]
            : null;

        const todas = await listar<ClinicaSlim>('clinicas', { ordem: [{ col: 'nome', asc: true }] });
        if (perfil?.is_super_admin && !opts?.restrictSuperAdminToVinculos) {
            return todas.map((c) => ({ id: c.id, nome: c.nome, endereco: c.endereco ?? null, rede_id: c.rede_id ?? null }));
        }
        if (!perfil?.id) return [];

        const vinculos = await listar<{ clinica_id: number }>('profissionais_clinicas', {
            filtros: [{ col: 'profissional_id', op: 'eq', valor: perfil.id }],
        });
        const ids = new Set(vinculos.map((v) => String(v.clinica_id)));
        return todas
            .filter((c) => ids.has(String(c.id)))
            .map((c) => ({ id: c.id, nome: c.nome, endereco: c.endereco ?? null, rede_id: c.rede_id ?? null }));
    } catch {
        return [];
    }
}

async function buscarClinicasDoUsuario(
    userId: string,
    opts?: { restrictSuperAdminToVinculos?: boolean },
): Promise<ClinicaSlim[]> {
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
    const { data: prof, error: profErr } = await tabelas.from('profissionais')
        .select('id, is_super_admin')
        .eq('user_id', userId)
        .maybeSingle();
    logErro('profissionais.select', profErr);

    // Super admin → visão global por padrão (a menos que opte por vínculos)
    if (prof?.is_super_admin && !opts?.restrictSuperAdminToVinculos) {
        const { data, error } = await tabelas.from('clinicas')
            .select('id, nome, endereco, rede_id')
            .order('nome');
        logErro('clinicas.select (super admin)', error);
        return (data || []) as ClinicaSlim[];
    }

    if (!prof?.id) return [];

    const { data: vinculos, error: vincErr } = await tabelas.from('profissionais_clinicas')
        .select('clinica_id')
        .eq('profissional_id', prof.id);
    logErro('profissionais_clinicas.select', vincErr);

    const ids = Array.from(new Set((vinculos || []).map((v: any) => v.clinica_id))).filter((x) => x !== null && x !== undefined);
    if (ids.length === 0) return [];

    const { data, error } = await tabelas.from('clinicas')
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
    if ((await modoDados()) === 'local') {
        return equipeLocal();
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return [];

    const { data: prof } = await tabelas.from('profissionais')
        .select('id, is_super_admin')
        .eq('user_id', session.user.id)
        .maybeSingle();

    if (!prof?.id) return [];

    // Super admin: visão global.
    if (prof.is_super_admin) {
        const { data: todos } = await tabelas.from('profissionais')
            .select('id, nome, cargo, nivel_acesso, user_id, precisa_trocar_senha, telefone, foto_url, conselho, cro')
            .order('nome');
        const { data: todosVinc } = await tabelas.from('profissionais_clinicas')
            .select('profissional_id, clinicas(id, nome)');
        return montarEquipe(todos || [], todosVinc || []);
    }

    // 1) clínicas do usuário
    const { data: minhasClins } = await tabelas.from('profissionais_clinicas')
        .select('clinica_id')
        .eq('profissional_id', prof.id);
    const idsClin = Array.from(new Set((minhasClins || []).map((v: any) => v.clinica_id)));
    if (idsClin.length === 0) return [];

    // 2) todos os vínculos dessas clínicas (= colegas + clínicas em comum)
    const { data: vinculos } = await tabelas.from('profissionais_clinicas')
        .select('profissional_id, clinicas(id, nome)')
        .in('clinica_id', idsClin as any);

    const idsProf = Array.from(new Set((vinculos || []).map((v: any) => v.profissional_id)));
    if (idsProf.length === 0) return [];

    // 3) dados dos profissionais
    const { data: profs } = await tabelas.from('profissionais')
        .select('id, nome, cargo, nivel_acesso, user_id, precisa_trocar_senha, telefone, foto_url, conselho, cro')
        .in('id', idsProf as any)
        .order('nome');

    return montarEquipe(profs || [], vinculos || []);
}

/** Equipe visível, lida do SQLite (desktop). */
async function equipeLocal(): Promise<ProfissionalEquipe[]> {
    try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        const eu = userId
            ? (await listar<{ id: number; is_super_admin: boolean | null }>('profissionais', {
                filtros: [{ col: 'user_id', op: 'eq', valor: userId }],
                limite: 1,
            }))[0]
            : null;
        if (!eu?.id) return [];

        const clinicas = await listar<{ id: number; nome: string }>('clinicas', { ordem: [{ col: 'nome', asc: true }] });
        const nomeClinica = new Map(clinicas.map((c) => [String(c.id), c]));

        let vinculos: Array<{ profissional_id: number; clinica_id: number }>;
        if (eu.is_super_admin) {
            vinculos = await listar('profissionais_clinicas');
        } else {
            const meus = await listar<{ clinica_id: number }>('profissionais_clinicas', {
                filtros: [{ col: 'profissional_id', op: 'eq', valor: eu.id }],
            });
            const ids = meus.map((v) => v.clinica_id);
            if (ids.length === 0) return [];
            vinculos = await listar('profissionais_clinicas', {
                filtros: [{ col: 'clinica_id', op: 'in', valor: ids }],
            });
        }

        const idsProf = Array.from(new Set(vinculos.map((v) => v.profissional_id)));
        if (idsProf.length === 0) return [];
        const profs = await listar<ProfissionalEquipe>('profissionais', {
            filtros: [{ col: 'id', op: 'in', valor: idsProf }],
            ordem: [{ col: 'nome', asc: true }],
        });

        const porProf = new Map<string, Array<{ id: any; nome: string }>>();
        for (const vinculo of vinculos) {
            const clinica = nomeClinica.get(String(vinculo.clinica_id));
            if (!clinica) continue;
            const chave = String(vinculo.profissional_id);
            const lista = porProf.get(chave) || [];
            if (!lista.some((c) => String(c.id) === String(clinica.id))) lista.push(clinica);
            porProf.set(chave, lista);
        }

        return profs.map((p) => ({ ...p, clinicas: porProf.get(String(p.id)) || [] }));
    } catch {
        return [];
    }
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
