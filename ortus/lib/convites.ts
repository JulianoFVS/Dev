import { supabase } from '@/lib/supabase';

/**
 * Convites de equipe entre redes.
 *
 * Toda a escrita (convidar / responder / cancelar) passa por funções RPC
 * SECURITY DEFINER do Supabase. Este módulo apenas tipa os contratos e
 * normaliza os erros para que as telas possam exibir mensagens em PT-BR.
 */

export type ConviteStatus = 'pendente' | 'aceito' | 'recusado' | 'cancelado' | 'expirado';

export type ConviteClinica = {
    id: number | string;
    nome: string;
};

export type ConviteEquipe = {
    id: number;
    rede_id: string | null;
    clinica_ids: Array<number | string>;
    convidado_user_id: string | null;
    convidado_profissional_id: number | string | null;
    convidado_email: string;
    convidado_nome: string | null;
    convidante_profissional_id: number | string | null;
    convidante_nome: string | null;
    cargo: string | null;
    mensagem: string | null;
    status: ConviteStatus;
    criado_em: string;
    respondido_em: string | null;
    expires_at: string;
};

export type MeuConvite = {
    id: number;
    status: ConviteStatus;
    criado_em: string;
    expires_at: string;
    convidante_nome: string | null;
    cargo: string | null;
    mensagem: string | null;
    clinicas: ConviteClinica[];
    rede_nome: string | null;
};

export type ConviteEnviado = {
    id: number;
    rede_id: string | null;
    clinicas: Array<number | string>;
};

export type ConviteRespondido = {
    status: 'aceito' | 'recusado';
    clinicas?: Array<number | string>;
};

export type ConviteCancelado = {
    status: 'cancelado';
};

export type EnviarConviteParams = {
    email: string;
    clinicaIds: number[];
    cargo?: string | null;
    mensagem?: string | null;
};

export class ErroConvite extends Error {
    readonly code?: string;

    constructor(message: string, code?: string) {
        super(message);
        this.name = 'ErroConvite';
        this.code = code;
    }
}

function codigoDoErro(error: unknown): string | undefined {
    if (typeof error === 'object' && error !== null && 'code' in error) {
        const code = (error as { code?: unknown }).code;
        return typeof code === 'string' ? code : undefined;
    }
    return undefined;
}

function normalizarErro(error: unknown): ErroConvite {
    if (error instanceof ErroConvite) return error;

    const code = codigoDoErro(error);
    let mensagem = '';
    if (typeof error === 'object' && error !== null && 'message' in error) {
        const bruta = (error as { message?: unknown }).message;
        if (typeof bruta === 'string') mensagem = bruta.trim();
    }

    if (!mensagem || /failed to fetch|networkerror|load failed/i.test(mensagem)) {
        return new ErroConvite('Não foi possível conectar ao servidor. Tente novamente.', code);
    }

    return new ErroConvite(mensagem, code);
}

async function chamarRpc<T>(nome: string, parametros: Record<string, unknown> = {}): Promise<T> {
    try {
        const { data, error } = await supabase.rpc(nome, parametros);
        if (error) throw normalizarErro(error);
        return data as T;
    } catch (error) {
        throw normalizarErro(error);
    }
}

/** Erro P0002 de `equipe_convidar`: o e-mail ainda não tem conta Ortus. */
export function conviteErroSemConta(error: unknown): boolean {
    const normalizado = normalizarErro(error);
    return normalizado.code === 'P0002' || /Nenhuma conta Ortus usa este e-mail/i.test(normalizado.message);
}

export function mensagemErroConvite(error: unknown, fallback = 'Não foi possível concluir a operação com convites.'): string {
    const mensagem = normalizarErro(error).message;
    return mensagem && mensagem !== 'Não foi possível conectar ao servidor. Tente novamente.' ? mensagem : fallback;
}

export async function enviarConviteEquipe(params: EnviarConviteParams): Promise<ConviteEnviado> {
    return chamarRpc<ConviteEnviado>('equipe_convidar', {
        p_email: params.email,
        p_clinica_ids: params.clinicaIds,
        p_cargo: params.cargo ?? null,
        p_mensagem: params.mensagem ?? null,
    });
}

export async function responderConviteEquipe(id: number, aceitar: boolean): Promise<ConviteRespondido> {
    return chamarRpc<ConviteRespondido>('equipe_responder_convite', {
        p_id: id,
        p_aceitar: aceitar,
    });
}

export async function cancelarConviteEquipe(id: number): Promise<ConviteCancelado> {
    return chamarRpc<ConviteCancelado>('equipe_cancelar_convite', { p_id: id });
}

function normalizarStatus(valor: unknown): ConviteStatus {
    return valor === 'pendente' || valor === 'aceito' || valor === 'recusado' || valor === 'cancelado' || valor === 'expirado'
        ? valor
        : 'pendente';
}

function normalizarMeusConvites(data: unknown): MeuConvite[] {
    if (!Array.isArray(data)) return [];
    return (data as MeuConvite[]).map((row) => ({
        ...row,
        status: normalizarStatus(row.status),
        clinicas: Array.isArray(row.clinicas) ? row.clinicas : [],
    }));
}

/** Convites recebidos pelo usuário logado (pendentes + respondidos). */
export async function listarMeusConvites(): Promise<MeuConvite[]> {
    const data = await chamarRpc<MeuConvite[] | null>('meus_convites');
    return normalizarMeusConvites(data);
}

function normalizarConvitesEquipe(data: unknown): ConviteEquipe[] {
    if (!Array.isArray(data)) return [];
    return (data as ConviteEquipe[]).map((row) => ({
        ...row,
        clinica_ids: Array.isArray(row.clinica_ids) ? row.clinica_ids : [],
        status: normalizarStatus(row.status),
        convidado_email: row.convidado_email || '',
    }));
}

/**
 * Convites enviados para as clínicas informadas (visão do admin).
 *
 * `clinica_ids` é um array BIGINT e o PostgREST filtra interseção com
 * `.overlaps` (operador `ov`). Se o operador não estiver disponível no
 * projeto, caímos para a consulta simples protegida pela RLS e filtramos
 * a interseção no cliente.
 */
export async function listarConvitesEquipe(
    clinicaIds: number[],
    opts?: { todas?: boolean },
): Promise<ConviteEquipe[]> {
    const ids = Array.from(new Set(clinicaIds.filter((id) => Number.isFinite(id))));
    const todas = !!opts?.todas;

    if (!todas && ids.length === 0) return [];

    const consultaBase = () => supabase
        .from('convites_equipe')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(50);

    try {
        if (!todas && ids.length > 0) {
            try {
                const { data, error } = await supabase
                    .from('convites_equipe')
                    .select('*')
                    .overlaps('clinica_ids', ids)
                    .order('criado_em', { ascending: false })
                    .limit(50);
                if (!error) return normalizarConvitesEquipe(data);
            } catch {
                // Segue para o fallback abaixo.
            }
        }

        const { data, error } = await consultaBase();
        if (error) throw normalizarErro(error);

        const lista = normalizarConvitesEquipe(data);
        if (todas || ids.length === 0) return lista;

        const idsPermitidos = new Set(ids.map((id) => String(id)));
        return lista.filter((convite) =>
            convite.clinica_ids.some((id) => idsPermitidos.has(String(id))),
        );
    } catch (error) {
        throw normalizarErro(error);
    }
}

export function obterStatusConvite(convite: Pick<MeuConvite, 'status' | 'expires_at'>): ConviteStatus {
    if (convite.status !== 'pendente') return convite.status;
    const expiraEm = new Date(convite.expires_at).getTime();
    return Number.isFinite(expiraEm) && expiraEm <= Date.now() ? 'expirado' : 'pendente';
}

export function rotuloStatusConvite(status: ConviteStatus): string {
    switch (status) {
        case 'aceito': return 'Aceito';
        case 'recusado': return 'Recusado';
        case 'cancelado': return 'Cancelado';
        case 'expirado': return 'Expirado';
        default: return 'Pendente';
    }
}

export function formatarDataConvite(valor: string | null | undefined, comHora = false): string {
    if (!valor) return '—';
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return '—';
    return data.toLocaleString('pt-BR', comHora
        ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function nomesClinicasConvite(clinicas: ConviteClinica[] | null | undefined): string {
    if (!clinicas || clinicas.length === 0) return 'Unidade não informada';
    const nomes = clinicas.map((clinica) => (clinica.nome || '').trim()).filter(Boolean);
    return nomes.length > 0 ? nomes.join(', ') : 'Unidade não informada';
}
