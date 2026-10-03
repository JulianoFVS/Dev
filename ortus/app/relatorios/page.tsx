'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { clinicScope, readRouteCache, writeRouteCache } from '@/lib/routeListCache';
import { carregarConfig } from '@/lib/configClinica';
import CustomSelect from '@/components/ui/CustomSelect';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { printDocument, printTable, escapePrintHtml } from '@/lib/printDocument';
import { AlertCircle, ArrowLeft, ChevronRight, Printer } from 'lucide-react';

const cardShell = 'rounded-[1.35rem] bg-white sm:rounded-[1.5rem]';
const REL_CACHE_KEY = 'ortus:relatorios:v2';
const DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;

type ReportId =
    | 'painel' | 'comparecimento' | 'ocupacao' | 'producao' | 'procedimentos'
    | 'novos' | 'resultado' | 'fluxo' | 'inadimplencia' | 'pagamentos'
    | 'convenio' | 'inativos' | 'planos' | 'proteses' | 'comissoes' | 'carga';

type Ag = {
    id: string | number;
    data_hora: string;
    procedimento?: string | null;
    status?: string | null;
    valor?: number | null;
    desconto?: number | null;
    valor_final?: number | null;
    paciente_id?: string | null;
    profissional_id?: number | null;
    pacientes?: { nome?: string } | { nome?: string }[] | null;
    profissionais?: { nome?: string } | { nome?: string }[] | null;
};

type Despesa = {
    id: string | number;
    descricao?: string | null;
    valor?: number | null;
    data?: string | null;
    categoria?: string | null;
    tipo?: string | null;
    status?: string | null;
};

type Pac = { id: string; nome: string; created_at?: string | null; plano_id?: string | number | null };
type Plano = { id: string | number; nome: string; tipo?: string | null };
type CardLab = {
    id: number;
    paciente_nome?: string | null;
    descricao?: string | null;
    tipo_protese?: string | null;
    data_entrega?: string | null;
    valor?: number | string | null;
    coluna_id?: number | null;
};
type Coluna = { id: number; titulo: string };
type Comissao = {
    id: string | number;
    profissional_id?: number | null;
    descricao?: string | null;
    valor_comissao?: number | null;
    status?: string | null;
};
type Horario = {
    profissional_id: number;
    inicio?: string | null;
    fim?: string | null;
    intervalo_minutos?: number | null;
    dias_semana?: Record<string, boolean> | null;
};
type Visita = { paciente_id: string; data_hora: string };
type Prof = { id: number; nome: string };
type MetaTaxa = { valor_liquido?: number; valor_bruto?: number; taxa_nome?: string; forma_label?: string; status?: string };

type Snap = {
    agendamentos: Ag[];
    despesas: Despesa[];
    pacientes: Pac[];
    planos: Plano[];
    fiados: Ag[];
    visitas: Visita[];
    cards: CardLab[];
    colunas: Coluna[];
    comissoes: Comissao[];
    horarios: Horario[];
    profissionais: Prof[];
    meta: Record<string, unknown>;
};

const VAZIO: Snap = {
    agendamentos: [], despesas: [], pacientes: [], planos: [], fiados: [], visitas: [],
    cards: [], colunas: [], comissoes: [], horarios: [], profissionais: [], meta: {},
};

type Atalho = 'hoje' | '7d' | 'mes' | 'trimestre' | 'ano';
type Modo = 'atalho' | 'intervalo';
type Secao = { titulo: string; nota?: string; colunas: string[]; linhas: string[][] };
type Kpi = { id: ReportId; titulo: string; valor: string; detalhe: string; antes: string; delta: string };

const NOMES: Record<Exclude<ReportId, 'painel'>, string> = {
    comparecimento: 'Comparecimento',
    ocupacao: 'Ocupação',
    producao: 'Produção por profissional',
    procedimentos: 'Procedimentos',
    novos: 'Pacientes novos',
    resultado: 'Faturamento',
    fluxo: 'Fluxo do caixa',
    inadimplencia: 'Inadimplência',
    pagamentos: 'Formas de pagamento',
    convenio: 'Particular e convênio',
    inativos: 'Quem não volta',
    planos: 'Planos',
    proteses: 'Próteses',
    comissoes: 'Comissões',
    carga: 'Carga da agenda',
};

const GRUPOS: { titulo: string; itens: Exclude<ReportId, 'painel'>[] }[] = [
    { titulo: 'Dinheiro', itens: ['resultado', 'inadimplencia', 'pagamentos', 'fluxo'] },
    { titulo: 'Agenda', itens: ['comparecimento', 'ocupacao', 'producao', 'procedimentos', 'carga'] },
    { titulo: 'Pacientes', itens: ['novos', 'inativos', 'convenio', 'planos'] },
    { titulo: 'Laboratório', itens: ['proteses', 'comissoes'] },
];

const USA_PROF = new Set<ReportId>(['comparecimento', 'ocupacao', 'producao', 'procedimentos', 'carga', 'novos']);

function periodoCacheKey(modo: Modo, atalho: Atalho, ini: string, fim: string) {
    return modo === 'intervalo' ? `iv:${ini}_${fim}` : `at:${atalho}`;
}

function relScope(clinicId: string | 'all' | null, key: string) {
    return `${clinicScope(clinicId)}:${key}`;
}

function isoDia(d: Date) {
    const z = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function resolverPeriodo(modo: Modo, atalho: Atalho, ini: string, fim: string) {
    const agora = new Date();
    if (modo === 'intervalo' && ini && fim) {
        const inicio = new Date(`${ini}T00:00:00`);
        const end = new Date(`${fim}T23:59:59`);
        return { inicio, fim: end, label: `${inicio.toLocaleDateString('pt-BR')} – ${end.toLocaleDateString('pt-BR')}` };
    }
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    let label = 'Hoje';
    if (atalho === '7d') { inicio.setDate(inicio.getDate() - 6); label = 'Últimos 7 dias'; }
    else if (atalho === 'mes') { inicio.setDate(1); label = 'Este mês'; }
    else if (atalho === 'trimestre') { inicio.setMonth(Math.floor(agora.getMonth() / 3) * 3, 1); label = 'Este trimestre'; }
    else if (atalho === 'ano') { inicio.setMonth(0, 1); label = 'Este ano'; }
    return { inicio, fim: agora, label };
}

function periodoAnterior(inicio: Date, fim: Date) {
    const ms = Math.max(fim.getTime() - inicio.getTime(), 60_000);
    const prevFim = new Date(inicio.getTime() - 1);
    const prevInicio = new Date(prevFim.getTime() - ms);
    return { inicio: prevInicio, fim: prevFim, label: `${prevInicio.toLocaleDateString('pt-BR')} – ${prevFim.toLocaleDateString('pt-BR')}` };
}

function normalizar(snap: Partial<Snap> | null | undefined): Snap | null {
    if (!snap || !Array.isArray(snap.agendamentos)) return null;
    return { ...VAZIO, ...snap, meta: snap.meta || {} };
}

function readBoot(): Snap | null {
    if (typeof localStorage === 'undefined') return null;
    const cid = localStorage.getItem('ortus_clinica_id');
    const clinicId = !cid || cid === 'all' || cid === 'todas' ? 'all' : cid;
    return normalizar(readRouteCache<Snap>(REL_CACHE_KEY, relScope(clinicId, 'at:mes')));
}

function nomeJoin(v?: { nome?: string } | { nome?: string }[] | null) {
    if (!v) return '';
    return Array.isArray(v) ? v[0]?.nome || '' : v.nome || '';
}

function brl(n: number) {
    return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function num(n: number) {
    return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(n: number) {
    return `${Math.round(Number(n) || 0)}%`;
}

function dataBR(iso?: string | null) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
}

function noIntervalo(iso: string | null | undefined, inicio: Date, fim: Date) {
    if (!iso) return false;
    const t = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).getTime();
    return t >= inicio.getTime() && t <= fim.getTime();
}

function metaDe(meta: Record<string, unknown>, chave: string): MetaTaxa {
    return (meta[chave] as MetaTaxa) || {};
}

function cancelada(d: Despesa, meta: Record<string, unknown>) {
    const m = metaDe(meta, `man_${d.id}`);
    return (m.status || d.status) === 'cancelado';
}

function liquidoConsulta(a: Ag, meta: Record<string, unknown>) {
    const m = metaDe(meta, `ag_${a.id}`);
    if (m.valor_liquido != null) return Number(m.valor_liquido) || 0;
    return Number(a.valor_final ?? a.valor ?? 0) || 0;
}

function brutoConsulta(a: Ag) {
    const bruto = Number(a.valor ?? 0);
    if (bruto > 0) return bruto;
    return (Number(a.valor_final) || 0) + (Number(a.desconto) || 0);
}

function formaDe(a: Ag, meta: Record<string, unknown>) {
    const m = metaDe(meta, `ag_${a.id}`);
    return m.forma_label || m.taxa_nome || 'Não informada';
}

function presente(s?: string | null) {
    return s === 'concluido' || s === 'fiado';
}

function minutosFaixa(inicio?: string | null, fim?: string | null) {
    const ler = (s: string) => {
        const [h, m] = s.slice(0, 5).split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };
    return Math.max(0, ler(String(fim || '18:00')) - ler(String(inicio || '08:00')));
}

function cadaDia(inicio: Date, fim: Date, fn: (d: Date) => void) {
    const cur = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
    const last = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
    let guard = 0;
    while (cur <= last && guard < 800) {
        fn(new Date(cur));
        cur.setDate(cur.getDate() + 1);
        guard += 1;
    }
}

function horarioDe(horarios: Horario[], profId: string | number) {
    return horarios.find((h) => String(h.profissional_id) === String(profId));
}

function diaAberto(h: Horario | undefined, d: Date) {
    const chave = DIA[d.getDay()];
    if (!h?.dias_semana) return chave !== 'dom' && chave !== 'sab';
    return Boolean(h.dias_semana[chave]);
}

function capacidadeMin(horarios: Horario[], profIds: string[], inicio: Date, fim: Date) {
    let total = 0;
    const ids = profIds.length ? profIds : [...new Set(horarios.map((h) => String(h.profissional_id)))];
    for (const id of ids) {
        const h = horarioDe(horarios, id);
        const minDia = h ? minutosFaixa(h.inicio, h.fim) : 10 * 60;
        cadaDia(inicio, fim, (d) => { if (diaAberto(h, d)) total += minDia; });
    }
    return total;
}

async function ler<T>(q: PromiseLike<{ data: T | null; error: unknown }>): Promise<T extends unknown[] ? T : T[]> {
    try {
        const { data, error } = await q;
        if (error || data == null) return [] as T extends unknown[] ? T : T[];
        return data as T extends unknown[] ? T : T[];
    } catch {
        return [] as T extends unknown[] ? T : T[];
    }
}

function compararTexto(atual: number, anterior: number, formato: (n: number) => string) {
    const diff = atual - anterior;
    const sinal = diff > 0 ? '+' : '';
    const variacao = anterior ? ` · ${sinal}${Math.round((diff / Math.abs(anterior)) * 100)}%` : '';
    return `Antes ${formato(anterior)}${variacao}`;
}

function deltaPct(atual: number, anterior: number) {
    if (!anterior) return '';
    const p = Math.round(((atual - anterior) / Math.abs(anterior)) * 100);
    if (!Number.isFinite(p) || p === 0) return '';
    return `${p > 0 ? '+' : ''}${p}%`;
}

export default function Relatorios() {
    const { activeClinicId, activeClinic, clinics, loading: clinicLoading } = useClinica();
    const boot = readBoot();
    const jaCarregou = useRef(!!boot);
    const fetchGen = useRef(0);
    const [loading, setLoading] = useState(!boot);
    const [dados, setDados] = useState<Snap>(() => boot ?? VAZIO);
    const [modo, setModo] = useState<Modo>('atalho');
    const [atalho, setAtalho] = useState<Atalho>('mes');
    const [dataInicio, setDataInicio] = useState('');
    const [dataFim, setDataFim] = useState('');
    const [comparar, setComparar] = useState(true);
    const [filtroProf, setFiltroProf] = useState('todos');
    const [tipo, setTipo] = useState<ReportId>('painel');

    const cacheKey = periodoCacheKey(modo, atalho, dataInicio, dataFim);
    const periodo = resolverPeriodo(modo, atalho, dataInicio, dataFim);
    const anterior = periodoAnterior(periodo.inicio, periodo.fim);
    const idsKey = clinics.map((c) => String(c.id)).join(',');
    const clinicaVista = useRef(activeClinicId);

    useEffect(() => {
        if (clinicLoading || !activeClinicId) return;
        if (modo === 'intervalo' && (!dataInicio || !dataFim)) return;
        const snap = normalizar(readRouteCache<Snap>(REL_CACHE_KEY, relScope(activeClinicId, cacheKey)));
        const trocouClinica = clinicaVista.current !== activeClinicId;
        clinicaVista.current = activeClinicId;
        if (snap) {
            setDados(snap);
            setLoading(false);
        } else if (trocouClinica) {
            setDados(VAZIO);
        }
        carregar(!!snap);
    }, [clinicLoading, activeClinicId, modo, atalho, dataInicio, dataFim, cacheKey, idsKey]);

    async function carregar(silent: boolean) {
        const gen = ++fetchGen.current;
        if (clinicLoading || !activeClinicId) return;
        if (!silent) setLoading(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (gen === fetchGen.current) setLoading(false); return; }

        let ids = clinics.map((c) => c.id).filter((id) => id != null && String(id) !== '');
        if (activeClinicId !== 'all') ids = ids.filter((id) => String(id) === String(activeClinicId));
        if (ids.length === 0) {
            if (gen === fetchGen.current) { setDados(VAZIO); setLoading(false); }
            return;
        }

        const range = resolverPeriodo(modo, atalho, dataInicio, dataFim);
        const prev = periodoAnterior(range.inicio, range.fim);
        const historico = new Date(range.inicio);
        historico.setDate(historico.getDate() - 180);
        const fetchInicio = prev.inicio < historico ? prev.inicio : historico;
        const cidMeta = activeClinicId !== 'all' ? String(activeClinicId) : String(ids[0]);

        const [agendamentos, despesas, pacientes, planos, fiados, visitas, cards, colunas, comissoes, horarios, meta] = await Promise.all([
            ler<Ag[]>(supabase.from('agendamentos').select('id, data_hora, procedimento, status, valor, desconto, valor_final, paciente_id, profissional_id, pacientes(nome), profissionais(nome)').gte('data_hora', fetchInicio.toISOString()).lte('data_hora', range.fim.toISOString()).in('clinica_id', ids)),
            ler<Despesa[]>(supabase.from('despesas').select('id, descricao, valor, data, categoria, tipo, status').gte('data', isoDia(fetchInicio)).lte('data', isoDia(range.fim)).in('clinica_id', ids)),
            ler<Pac[]>(supabase.from('pacientes').select('id, nome, created_at, plano_id').in('clinica_id', ids)),
            ler<Plano[]>(supabase.from('planos').select('id, nome, tipo').in('clinica_id', ids)),
            ler<Ag[]>(supabase.from('agendamentos').select('id, data_hora, procedimento, status, valor, desconto, valor_final, paciente_id, profissional_id, pacientes(nome), profissionais(nome)').eq('status', 'fiado').in('clinica_id', ids)),
            ler<Visita[]>(supabase.from('agendamentos').select('paciente_id, data_hora').eq('status', 'concluido').in('clinica_id', ids).order('data_hora', { ascending: false }).limit(5000)),
            ler<CardLab[]>(supabase.from('kanban_cartoes').select('id, paciente_nome, descricao, tipo_protese, data_entrega, valor, coluna_id').in('clinica_id', ids).limit(2000)),
            ler<Coluna[]>(supabase.from('kanban_colunas').select('id, titulo').in('clinica_id', ids)),
            ler<Comissao[]>(supabase.from('comissoes_lancamentos').select('id, profissional_id, descricao, valor_comissao, status').in('clinica_id', ids).limit(2000)),
            ler<Horario[]>(supabase.from('profissionais_horarios').select('profissional_id, inicio, fim, intervalo_minutos, dias_semana').in('clinica_id', ids)),
            carregarConfig<Record<string, unknown>>(cidMeta, 'lancamentos_meta', 'ortus_lancamentos_meta', {}).catch(() => ({})),
        ]);

        if (gen !== fetchGen.current) return;

        const profIds = new Set<number>();
        [...agendamentos, ...fiados].forEach((a) => { if (a.profissional_id) profIds.add(Number(a.profissional_id)); });
        comissoes.forEach((c) => { if (c.profissional_id) profIds.add(Number(c.profissional_id)); });
        horarios.forEach((h) => { if (h.profissional_id) profIds.add(Number(h.profissional_id)); });
        let profissionais: Prof[] = [];
        if (profIds.size > 0) {
            const { data } = await supabase.from('profissionais').select('id, nome').in('id', [...profIds]);
            profissionais = (data || []) as Prof[];
        }

        if (gen !== fetchGen.current) return;

        const snapshot: Snap = {
            agendamentos, despesas, pacientes, planos, fiados, visitas, cards, colunas, comissoes, horarios, profissionais,
            meta: meta || {},
        };
        writeRouteCache(REL_CACHE_KEY, relScope(activeClinicId, cacheKey), snapshot);
        setDados(snapshot);
        jaCarregou.current = true;
        setLoading(false);
    }

    const profNome = useMemo(() => {
        const map = new Map<string, string>();
        dados.profissionais.forEach((p) => map.set(String(p.id), p.nome));
        dados.agendamentos.forEach((a) => {
            if (a.profissional_id && !map.has(String(a.profissional_id))) {
                const nome = nomeJoin(a.profissionais);
                if (nome) map.set(String(a.profissional_id), nome);
            }
        });
        return map;
    }, [dados]);

    const aplicaProf = USA_PROF.has(tipo) ? filtroProf : 'todos';

    const modelo = useMemo(() => {
        const meta = dados.meta;
        const ag = dados.agendamentos.filter((a) => noIntervalo(a.data_hora, periodo.inicio, periodo.fim) && (aplicaProf === 'todos' || String(a.profissional_id) === aplicaProf));
        const agPrev = dados.agendamentos.filter((a) => noIntervalo(a.data_hora, anterior.inicio, anterior.fim) && (aplicaProf === 'todos' || String(a.profissional_id) === aplicaProf));
        const desp = dados.despesas.filter((d) => noIntervalo(d.data, periodo.inicio, periodo.fim) && !cancelada(d, meta));
        const despPrev = dados.despesas.filter((d) => noIntervalo(d.data, anterior.inicio, anterior.fim) && !cancelada(d, meta));

        const fat = (lista: Ag[], saidas: Despesa[]) => {
            const consultas = lista.filter((a) => a.status === 'concluido').reduce((s, a) => s + liquidoConsulta(a, meta), 0);
            const manuais = saidas.filter((d) => d.tipo === 'entrada').reduce((s, d) => s + (Number(d.valor) || 0), 0);
            return aplicaProf === 'todos' ? consultas + manuais : consultas;
        };
        const ticketDe = (lista: Ag[]) => {
            const ok = lista.filter((a) => a.status === 'concluido');
            const soma = ok.reduce((s, a) => s + liquidoConsulta(a, meta), 0);
            return ok.length ? soma / ok.length : 0;
        };
        const presenca = (lista: Ag[]) => {
            const p = lista.filter((a) => presente(a.status)).length;
            const f = lista.filter((a) => a.status === 'faltou' || a.status === 'falta').length;
            const c = lista.filter((a) => a.status === 'cancelado').length;
            const base = p + f + c;
            return { p, f, c, taxa: base ? (p / base) * 100 : 0, total: lista.length };
        };
        const ocupar = (lista: Ag[], ini: Date, fim: Date) => {
            const ids = [...new Set(lista.map((a) => a.profissional_id).filter(Boolean).map(String))];
            const baseIds = aplicaProf !== 'todos' ? [aplicaProf] : (ids.length ? ids : dados.horarios.map((h) => String(h.profissional_id)));
            const cap = capacidadeMin(dados.horarios, baseIds, ini, fim);
            let ocupado = 0;
            lista.forEach((a) => {
                if (a.status === 'cancelado') return;
                const h = a.profissional_id ? horarioDe(dados.horarios, a.profissional_id) : undefined;
                ocupado += h?.intervalo_minutos && h.intervalo_minutos > 0 ? h.intervalo_minutos : 30;
            });
            const taxa = cap > 0 ? Math.min(100, (ocupado / cap) * 100) : 0;
            return { ocupado, cap, taxa, estimada: dados.horarios.length === 0 };
        };
        const novosDe = (ini: Date, fim: Date, lista: Ag[]) => {
            return dados.pacientes.filter((p) => {
                if (!noIntervalo(p.created_at, ini, fim)) return false;
                if (aplicaProf === 'todos') return true;
                return lista.some((a) => String(a.paciente_id) === String(p.id));
            }).length;
        };

        const fatAtual = fat(ag, desp);
        const fatAntes = fat(agPrev, despPrev);
        const ticketAtual = ticketDe(ag);
        const ticketAntes = ticketDe(agPrev);
        const compAtual = presenca(ag);
        const compAntes = presenca(agPrev);
        const ocAtual = ocupar(ag, periodo.inicio, periodo.fim);
        const ocAntes = ocupar(agPrev, anterior.inicio, anterior.fim);
        const novosAtual = novosDe(periodo.inicio, periodo.fim, ag);
        const novosAntes = novosDe(anterior.inicio, anterior.fim, agPrev);
        const aberto = dados.fiados.reduce((s, a) => s + (Number(a.valor_final ?? a.valor) || 0), 0);

        const kpis: Kpi[] = [
            { id: 'resultado', titulo: 'Faturamento', valor: brl(fatAtual), detalhe: '', antes: compararTexto(fatAtual, fatAntes, brl), delta: deltaPct(fatAtual, fatAntes) },
            { id: 'producao', titulo: 'Ticket médio', valor: brl(ticketAtual), detalhe: '', antes: compararTexto(ticketAtual, ticketAntes, brl), delta: deltaPct(ticketAtual, ticketAntes) },
            { id: 'comparecimento', titulo: 'Comparecimento', valor: pct(compAtual.taxa), detalhe: '', antes: compararTexto(compAtual.taxa, compAntes.taxa, pct), delta: deltaPct(compAtual.taxa, compAntes.taxa) },
            { id: 'inadimplencia', titulo: 'Inadimplência', valor: brl(aberto), detalhe: '', antes: '', delta: '' },
            { id: 'ocupacao', titulo: 'Ocupação', valor: pct(ocAtual.taxa), detalhe: '', antes: compararTexto(ocAtual.taxa, ocAntes.taxa, pct), delta: deltaPct(ocAtual.taxa, ocAntes.taxa) },
            { id: 'novos', titulo: 'Pacientes novos', valor: String(novosAtual), detalhe: '', antes: compararTexto(novosAtual, novosAntes, (n) => String(Math.round(n))), delta: deltaPct(novosAtual, novosAntes) },
        ];

        const secoes = montarSecoes(tipo, {
            ag, agPrev, desp, meta, pacientes: dados.pacientes, planos: dados.planos, fiados: dados.fiados,
            visitas: dados.visitas, cards: dados.cards, colunas: dados.colunas, comissoes: dados.comissoes,
            horarios: dados.horarios, profNome, inicio: periodo.inicio, fim: periodo.fim,
            prevInicio: anterior.inicio, prevFim: anterior.fim, aplicaProf, kpis, ocAtual,
        });

        return { kpis, secoes };
    }, [dados, periodo.inicio, periodo.fim, anterior.inicio, anterior.fim, aplicaProf, tipo, profNome]);

    const kpiLoading = loading && !jaCarregou.current;
    const titulo = tipo === 'painel' ? 'Relatórios' : NOMES[tipo];

    function imprimir() {
        const body = modelo.secoes.map((s) => {
            const nota = s.nota ? `<p>${escapePrintHtml(s.nota)}</p>` : '';
            const tabela = s.linhas.length
                ? printTable(s.colunas, s.linhas.map((row) => row.map((cell) => escapePrintHtml(cell))))
                : '<p>Nada neste recorte.</p>';
            return `<div class="ortus-section-title">${escapePrintHtml(s.titulo)}</div>${nota}${tabela}`;
        }).join('');
        printDocument({
            title: titulo,
            documentTitle: `${titulo} — ORTUS`,
            clinicName: activeClinic ? getClinicLabel(activeClinic) : 'Clínicas do usuário',
            period: periodo.label,
            brandKicker: 'Relatórios · leitura',
            bodyHtml: body || '<p>Nada neste recorte.</p>',
        });
    }

    const pill = (ativo: boolean) =>
        `rounded-full px-3 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${ativo ? 'bg-neutral-900 text-white' : 'border border-black/10 bg-white text-neutral-600 hover:bg-neutral-50'}`;

    return (
        <div className="w-full space-y-3 px-2.5 py-2.5 pb-12 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    {tipo !== 'painel' && (
                        <button type="button" onClick={() => setTipo('painel')} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-900">
                            <ArrowLeft size={16} /> Relatórios
                        </button>
                    )}
                    <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">{titulo}</h1>
                    <p className="mt-1 text-sm text-neutral-500 sm:text-base">
                        {activeClinic ? getClinicLabel(activeClinic) : 'Todas as suas clínicas'} · {periodo.label}
                    </p>
                </div>
                {tipo !== 'painel' && (
                    <button type="button" onClick={imprimir} className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
                        <Printer size={16} /> <span className="hidden sm:inline">PDF</span>
                    </button>
                )}
            </div>

            {activeClinicId === 'all' && (
                <div className="flex items-start gap-2 rounded-[1.15rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span>Estes números somam todas as clínicas da sua conta. Selecione uma unidade no menu para ver só ela.</span>
                </div>
            )}

            <section className={`${cardShell} space-y-3 p-3 sm:p-4`}>
                <div className="flex flex-wrap gap-2">
                    {([
                        ['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Mês'], ['trimestre', 'Trimestre'], ['ano', 'Ano'],
                    ] as const).map(([id, label]) => (
                        <button key={id} type="button" onClick={() => { setModo('atalho'); setAtalho(id); }} className={pill(modo === 'atalho' && atalho === id)}>{label}</button>
                    ))}
                    <button type="button" onClick={() => setModo('intervalo')} className={pill(modo === 'intervalo')}>Intervalo</button>
                </div>
                {modo === 'intervalo' && (
                    <div className="flex flex-wrap items-center gap-2 rounded-full border border-black/10 bg-[#f8f8f6] px-3 py-2">
                        <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="bg-transparent text-xs font-medium text-neutral-700 outline-none sm:text-sm" />
                        <span className="text-neutral-400">até</span>
                        <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="bg-transparent text-xs font-medium text-neutral-700 outline-none sm:text-sm" />
                    </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button type="button" onClick={() => setComparar((v) => !v)} className={pill(comparar)}>
                        Comparar
                    </button>
                    {USA_PROF.has(tipo) && (
                        <div className="min-w-0 sm:w-64">
                            <CustomSelect
                                value={filtroProf}
                                onChange={setFiltroProf}
                                options={[{ value: 'todos', label: 'Todos os profissionais' }, ...dados.profissionais.map((p) => ({ value: String(p.id), label: p.nome }))]}
                                size="md"
                            />
                        </div>
                    )}
                </div>
            </section>

            {tipo === 'painel' ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {GRUPOS.map((grupo) => (
                        <section key={grupo.titulo} className={`${cardShell} overflow-hidden`}>
                            <h2 className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400 sm:px-5">{grupo.titulo}</h2>
                            <div>
                                {grupo.itens.map((id) => {
                                    const kpi = modelo.kpis.find((k) => k.id === id);
                                    return (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => setTipo(id)}
                                            className="flex w-full items-center gap-3 border-t border-black/5 px-4 py-3.5 text-left transition-colors hover:bg-[#f8f8f6] sm:px-5"
                                        >
                                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900 sm:text-[15px]">{NOMES[id]}</span>
                                            {kpi && kpiLoading ? <span className="h-4 w-16 animate-pulse rounded-md bg-neutral-100" /> : null}
                                            {kpi && !kpiLoading ? (
                                                <span className="flex shrink-0 items-baseline gap-2">
                                                    <span className="text-sm font-semibold tabular-nums text-neutral-900">{kpi.valor}</span>
                                                    {comparar && kpi.delta ? <span className="text-[11px] tabular-nums text-neutral-400">{kpi.delta}</span> : null}
                                                </span>
                                            ) : null}
                                            <ChevronRight size={16} className="shrink-0 text-neutral-300" />
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            ) : (
                <div className="space-y-3">
                    {kpiLoading ? (
                        <div className={`${cardShell} h-40 animate-pulse bg-neutral-50`} />
                    ) : modelo.secoes.map((s) => (
                        <section key={s.titulo} className={`${cardShell} overflow-hidden`}>
                            <div className="border-b border-black/5 px-4 py-4 sm:px-5">
                                <h2 className="text-base font-semibold text-neutral-900">{s.titulo}</h2>
                                {s.nota && <p className="mt-1 text-xs text-neutral-500">{s.nota}</p>}
                            </div>
                            {s.linhas.length === 0 ? (
                                <p className="px-4 py-10 text-center text-sm text-neutral-400">Nada neste recorte.</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-[640px] w-full text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-black/5 text-[11px] uppercase tracking-wide text-neutral-400">
                                                {s.colunas.map((c) => <th key={c} className="px-4 py-3 font-semibold sm:px-5">{c}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {s.linhas.map((row, i) => (
                                                <tr key={i} className="border-b border-black/5 last:border-0">
                                                    {row.map((cell, j) => (
                                                        <td key={j} className={`px-4 py-3 text-neutral-800 sm:px-5 ${j > 0 ? 'tabular-nums' : ''}`}>{cell}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    ))}
                </div>
            )}

        </div>
    );
}

function montarSecoes(tipo: ReportId, ctx: {
    ag: Ag[]; agPrev: Ag[]; desp: Despesa[]; meta: Record<string, unknown>;
    pacientes: Pac[]; planos: Plano[]; fiados: Ag[]; visitas: Visita[];
    cards: CardLab[]; colunas: Coluna[]; comissoes: Comissao[]; horarios: Horario[];
    profNome: Map<string, string>; inicio: Date; fim: Date; prevInicio: Date; prevFim: Date;
    aplicaProf: string; kpis: Kpi[]; ocAtual: { ocupado: number; cap: number; taxa: number; estimada: boolean };
}): Secao[] {
    const { ag, desp, meta, profNome } = ctx;
    const nomeProf = (id?: number | null) => (id ? profNome.get(String(id)) || 'Profissional' : 'Sem profissional');
    const nomePac = (a: Ag) => nomeJoin(a.pacientes) || 'Paciente';

    if (tipo === 'painel') {
        return [{
            titulo: 'Indicadores',
            colunas: ['Indicador', 'Valor', 'Detalhe', 'Comparação'],
            linhas: ctx.kpis.map((k) => [k.titulo, k.valor, k.detalhe, k.antes]),
        }];
    }

    if (tipo === 'comparecimento') {
        const grupos = [
            ['Presentes', ag.filter((a) => presente(a.status)).length],
            ['Faltas', ag.filter((a) => a.status === 'faltou' || a.status === 'falta').length],
            ['Cancelados', ag.filter((a) => a.status === 'cancelado').length],
            ['Ainda previstos', ag.filter((a) => !presente(a.status) && a.status !== 'faltou' && a.status !== 'falta' && a.status !== 'cancelado').length],
        ];
        const lista = [...ag].sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime()).slice(0, 120);
        return [
            { titulo: 'Resumo', colunas: ['Situação', 'Quantidade'], linhas: grupos.map(([n, q]) => [String(n), String(q)]) },
            {
                titulo: 'Lista nominal',
                nota: lista.length < ag.length ? `Mostrando ${lista.length} de ${ag.length}.` : undefined,
                colunas: ['Data', 'Paciente', 'Procedimento', 'Profissional', 'Situação'],
                linhas: lista.map((a) => [dataBR(a.data_hora), nomePac(a), a.procedimento || '—', nomeProf(a.profissional_id), rotuloStatus(a.status)]),
            },
        ];
    }

    if (tipo === 'ocupacao' || tipo === 'carga') {
        const ids = [...new Set([
            ...ag.map((a) => a.profissional_id).filter(Boolean).map(String),
            ...ctx.horarios.map((h) => String(h.profissional_id)),
        ])].filter((id) => ctx.aplicaProf === 'todos' || id === ctx.aplicaProf);
        const linhas = ids.map((id) => {
            const cap = capacidadeMin(ctx.horarios, [id], ctx.inicio, ctx.fim);
            let ocupado = 0;
            let qtd = 0;
            ag.forEach((a) => {
                if (String(a.profissional_id) !== id || a.status === 'cancelado') return;
                qtd += 1;
                const h = horarioDe(ctx.horarios, id);
                ocupado += h?.intervalo_minutos && h.intervalo_minutos > 0 ? h.intervalo_minutos : 30;
            });
            const livres = Math.max(0, cap - ocupado);
            const taxa = cap > 0 ? Math.min(100, (ocupado / cap) * 100) : 0;
            return [nomeProf(Number(id)), String(qtd), num(ocupado / 60), num(livres / 60), pct(taxa)];
        });
        const porDia: string[][] = [];
        cadaDia(ctx.inicio, ctx.fim, (d) => {
            const chave = isoDia(d);
            const doDia = ag.filter((a) => a.status !== 'cancelado' && isoDia(new Date(a.data_hora)) === chave);
            if (doDia.length === 0 && porDia.length > 40) return;
            const min = doDia.reduce((s, a) => s + (horarioDe(ctx.horarios, a.profissional_id || 0)?.intervalo_minutos || 30), 0);
            porDia.push([d.toLocaleDateString('pt-BR'), String(doDia.length), num(min / 60)]);
        });
        return [
            {
                titulo: tipo === 'carga' ? 'Carga por profissional' : 'Ocupação por profissional',
                nota: ctx.ocAtual.estimada ? 'Nenhum horário de atendimento cadastrado. A capacidade assume 10 horas em dias úteis e 30 minutos por consulta.' : 'Horas livres são a capacidade do horário cadastrado menos as consultas não canceladas.',
                colunas: ['Profissional', 'Consultas', 'Horas marcadas', 'Horas livres', 'Taxa'],
                linhas,
            },
            { titulo: 'Por dia', colunas: ['Dia', 'Consultas', 'Horas'], linhas: porDia.slice(0, 62) },
        ];
    }

    if (tipo === 'producao') {
        const mapa = new Map<string, { vis: number; fat: number; faltas: number }>();
        ag.forEach((a) => {
            const id = String(a.profissional_id || 0);
            const row = mapa.get(id) || { vis: 0, fat: 0, faltas: 0 };
            if (a.status === 'concluido') { row.vis += 1; row.fat += liquidoConsulta(a, meta); }
            if (a.status === 'faltou' || a.status === 'falta') row.faltas += 1;
            mapa.set(id, row);
        });
        return [{
            titulo: 'Produção',
            colunas: ['Profissional', 'Consultas', 'Faltas', 'Faturamento', 'Ticket'],
            linhas: [...mapa.entries()].map(([id, r]) => [nomeProf(Number(id) || null), String(r.vis), String(r.faltas), brl(r.fat), brl(r.vis ? r.fat / r.vis : 0)]),
        }];
    }

    if (tipo === 'procedimentos') {
        const mapa = new Map<string, { qtd: number; valor: number }>();
        ag.filter((a) => a.status === 'concluido').forEach((a) => {
            const k = a.procedimento || 'Não especificado';
            const row = mapa.get(k) || { qtd: 0, valor: 0 };
            row.qtd += 1;
            row.valor += liquidoConsulta(a, meta);
            mapa.set(k, row);
        });
        const total = [...mapa.values()].reduce((s, r) => s + r.valor, 0) || 1;
        const linhas = [...mapa.entries()].sort((a, b) => b[1].valor - a[1].valor).map(([nome, r]) => [
            nome, String(r.qtd), brl(r.valor), brl(r.qtd ? r.valor / r.qtd : 0), pct((r.valor / total) * 100),
        ]);
        return [{ titulo: 'Ranking', colunas: ['Procedimento', 'Qtd', 'Valor', 'Ticket', 'Participação'], linhas }];
    }

    if (tipo === 'novos') {
        const novos = ctx.pacientes.filter((p) => noIntervalo(p.created_at, ctx.inicio, ctx.fim) && (ctx.aplicaProf === 'todos' || ag.some((a) => String(a.paciente_id) === String(p.id))));
        const retornos = ag.filter((a) => a.status === 'concluido' && ctx.pacientes.some((p) => String(p.id) === String(a.paciente_id) && p.created_at && new Date(p.created_at) < ctx.inicio));
        const porPac = new Map<string, number[]>();
        ctx.visitas.forEach((v) => {
            if (!v.paciente_id) return;
            const arr = porPac.get(v.paciente_id) || [];
            arr.push(new Date(v.data_hora).getTime());
            porPac.set(v.paciente_id, arr);
        });
        const concluidos = ag.filter((a) => a.status === 'concluido' && a.paciente_id);
        const pacientesPeriodo = new Set(concluidos.map((a) => String(a.paciente_id)));
        let voltaram = 0;
        pacientesPeriodo.forEach((id) => {
            const vezes = (porPac.get(id) || []).sort((a, b) => a - b);
            const noPeriodo = concluidos.find((a) => String(a.paciente_id) === id);
            if (!noPeriodo) return;
            const t = new Date(noPeriodo.data_hora).getTime();
            if (vezes.some((x) => x < t && t - x <= 90 * 86400000)) voltaram += 1;
        });
        const taxa = pacientesPeriodo.size ? (voltaram / pacientesPeriodo.size) * 100 : 0;
        return [
            { titulo: 'Resumo', nota: 'Retorno em 90 dias: o paciente já tinha outra consulta concluída nos 90 dias anteriores.', colunas: ['Medida', 'Valor'], linhas: [
                ['Novos cadastros', String(novos.length)],
                ['Consultas de quem já era paciente', String(retornos.length)],
                ['Taxa de retorno em 90 dias', pct(taxa)],
            ] },
            { titulo: 'Novos', colunas: ['Paciente', 'Cadastro'], linhas: novos.slice(0, 80).map((p) => [p.nome, dataBR(p.created_at)]) },
        ];
    }

    if (tipo === 'resultado') {
        const ok = ag.filter((a) => a.status === 'concluido');
        const bruto = ok.reduce((s, a) => s + brutoConsulta(a), 0);
        const descontos = ok.reduce((s, a) => s + (Number(a.desconto) || 0), 0);
        const liquido = ok.reduce((s, a) => s + liquidoConsulta(a, meta), 0);
        const taxas = Math.max(0, ok.reduce((s, a) => s + Math.max(0, (Number(a.valor_final ?? a.valor) || 0) - liquidoConsulta(a, meta)), 0));
        const entradasMan = desp.filter((d) => d.tipo === 'entrada').reduce((s, d) => s + (Number(d.valor) || 0), 0);
        const grupos = new Map<string, number>();
        desp.filter((d) => d.tipo !== 'entrada').forEach((d) => {
            const k = d.categoria || 'Geral';
            grupos.set(k, (grupos.get(k) || 0) + (Number(d.valor) || 0));
        });
        const saidas = [...grupos.values()].reduce((s, n) => s + n, 0);
        return [
            {
                titulo: 'Resultado',
                nota: 'Esta leitura não edita lançamento. Para lançar, receber ou cancelar, use o Financeiro.',
                colunas: ['Conta', 'Valor'],
                linhas: [
                    ['Bruto das consultas', brl(bruto)],
                    ['Descontos', brl(descontos)],
                    ['Taxas de cartão', brl(taxas)],
                    ['Líquido das consultas', brl(liquido)],
                    ['Entradas manuais', brl(entradasMan)],
                    ['Despesas', brl(saidas)],
                    ['Resultado', brl(liquido + entradasMan - saidas)],
                ],
            },
            { titulo: 'Despesas por grupo', colunas: ['Grupo', 'Valor'], linhas: [...grupos.entries()].sort((a, b) => b[1] - a[1]).map(([g, v]) => [g, brl(v)]) },
        ];
    }

    if (tipo === 'fluxo') {
        const curto = ctx.fim.getTime() - ctx.inicio.getTime() <= 45 * 86400000;
        const mapa = new Map<string, { real: number; prev: number }>();
        const chave = (iso: string) => (curto ? iso.slice(0, 10) : iso.slice(0, 7));
        ag.forEach((a) => {
            const k = chave(a.data_hora);
            const row = mapa.get(k) || { real: 0, prev: 0 };
            if (a.status === 'concluido') row.real += liquidoConsulta(a, meta);
            else if (a.status !== 'cancelado' && a.status !== 'faltou' && a.status !== 'falta') row.prev += Number(a.valor_final ?? a.valor) || 0;
            mapa.set(k, row);
        });
        return [{
            titulo: curto ? 'Por dia' : 'Por mês',
            nota: 'Realizado é consulta concluída. Previsto é o que ainda está na agenda ou em fiado, dentro do período.',
            colunas: ['Quando', 'Realizado', 'Previsto'],
            linhas: [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, r]) => [curto ? dataBR(k) : k, brl(r.real), brl(r.prev)]),
        }];
    }

    if (tipo === 'inadimplencia') {
        const faixas = [
            { nome: '0–30 dias', min: 0, max: 30 },
            { nome: '31–60 dias', min: 31, max: 60 },
            { nome: '61–90 dias', min: 61, max: 90 },
            { nome: '90+ dias', min: 91, max: 100000 },
        ];
        const itens = ctx.fiados.map((a) => {
            const dias = Math.max(0, Math.floor((Date.now() - new Date(a.data_hora).getTime()) / 86400000));
            return { a, dias, valor: Number(a.valor_final ?? a.valor) || 0 };
        }).sort((a, b) => b.dias - a.dias);
        return [
            {
                titulo: 'Por idade',
                nota: 'O saldo em aberto considera todo fiado da clínica, mesmo de antes do período escolhido.',
                colunas: ['Faixa', 'Quantidade', 'Valor'],
                linhas: faixas.map((f) => {
                    const grupo = itens.filter((i) => i.dias >= f.min && i.dias <= f.max);
                    return [f.nome, String(grupo.length), brl(grupo.reduce((s, i) => s + i.valor, 0))];
                }),
            },
            {
                titulo: 'Por paciente',
                colunas: ['Paciente', 'Procedimento', 'Desde', 'Dias', 'Valor'],
                linhas: itens.slice(0, 80).map((i) => [nomePac(i.a), i.a.procedimento || '—', dataBR(i.a.data_hora), String(i.dias), brl(i.valor)]),
            },
        ];
    }

    if (tipo === 'pagamentos') {
        const mapa = new Map<string, { qtd: number; bruto: number; liquido: number }>();
        ag.filter((a) => a.status === 'concluido').forEach((a) => {
            const k = formaDe(a, meta);
            const row = mapa.get(k) || { qtd: 0, bruto: 0, liquido: 0 };
            row.qtd += 1;
            row.bruto += Number(a.valor_final ?? a.valor) || 0;
            row.liquido += liquidoConsulta(a, meta);
            mapa.set(k, row);
        });
        const total = [...mapa.values()].reduce((s, r) => s + r.liquido, 0) || 1;
        return [{
            titulo: 'Mix',
            nota: 'A forma só aparece quando foi registrada na taxa da maquininha. O restante fica como não informado.',
            colunas: ['Forma', 'Qtd', 'Bruto', 'Taxa', 'Líquido', 'Participação'],
            linhas: [...mapa.entries()].sort((a, b) => b[1].liquido - a[1].liquido).map(([nome, r]) => [
                nome, String(r.qtd), brl(r.bruto), brl(Math.max(0, r.bruto - r.liquido)), brl(r.liquido), pct((r.liquido / total) * 100),
            ]),
        }];
    }

    if (tipo === 'convenio') {
        const planoDe = (id?: string | null) => ctx.planos.find((p) => String(p.id) === String(ctx.pacientes.find((x) => String(x.id) === String(id))?.plano_id));
        const mapa = new Map<string, { qtd: number; valor: number }>();
        ag.filter((a) => a.status === 'concluido').forEach((a) => {
            const plano = planoDe(a.paciente_id);
            const k = !plano ? 'Sem plano' : plano.tipo === 'convenio' ? `Convênio · ${plano.nome}` : `Particular · ${plano.nome}`;
            const row = mapa.get(k) || { qtd: 0, valor: 0 };
            row.qtd += 1;
            row.valor += liquidoConsulta(a, meta);
            mapa.set(k, row);
        });
        return [{ titulo: 'Produção por plano', colunas: ['Origem', 'Consultas', 'Líquido'], linhas: [...mapa.entries()].sort((a, b) => b[1].valor - a[1].valor).map(([n, r]) => [n, String(r.qtd), brl(r.valor)]) }];
    }

    if (tipo === 'inativos') {
        const ultima = new Map<string, number>();
        ctx.visitas.forEach((v) => {
            const t = new Date(v.data_hora).getTime();
            if (!ultima.has(v.paciente_id) || t > (ultima.get(v.paciente_id) || 0)) ultima.set(v.paciente_id, t);
        });
        const agora = Date.now();
        const linhasPac = ctx.pacientes.map((p) => {
            const t = ultima.get(String(p.id));
            const dias = t ? Math.floor((agora - t) / 86400000) : null;
            return { nome: p.nome, dias, quando: t ? dataBR(new Date(t).toISOString()) : 'Nunca' };
        });
        const faixa = (min: number, max?: number) => linhasPac.filter((p) => p.dias != null && p.dias >= min && (max == null || p.dias <= max)).length;
        return [
            { titulo: 'Há quanto tempo não voltam', colunas: ['Faixa', 'Pacientes'], linhas: [
                ['30 a 89 dias', String(faixa(30, 89))],
                ['90 a 179 dias', String(faixa(90, 179))],
                ['180 a 364 dias', String(faixa(180, 364))],
                ['365 dias ou mais', String(faixa(365))],
                ['Nunca consultaram', String(linhasPac.filter((p) => p.dias == null).length)],
            ] },
            {
                titulo: '90 dias ou mais',
                colunas: ['Paciente', 'Última consulta', 'Dias'],
                linhas: linhasPac.filter((p) => p.dias == null || p.dias >= 90).sort((a, b) => (b.dias ?? 99999) - (a.dias ?? 99999)).slice(0, 80).map((p) => [p.nome, p.quando, p.dias == null ? '—' : String(p.dias)]),
            },
        ];
    }

    if (tipo === 'planos') {
        const mapa = new Map<string, number>();
        ctx.pacientes.forEach((p) => {
            const plano = ctx.planos.find((x) => String(x.id) === String(p.plano_id));
            const k = plano?.nome || 'Sem plano';
            mapa.set(k, (mapa.get(k) || 0) + 1);
        });
        return [{ titulo: 'Carteira', colunas: ['Plano', 'Pacientes'], linhas: [...mapa.entries()].sort((a, b) => b[1] - a[1]).map(([n, q]) => [n, String(q)]) }];
    }

    if (tipo === 'proteses') {
        const tituloCol = (id?: number | null) => ctx.colunas.find((c) => c.id === id)?.titulo || 'Sem etapa';
        const mapa = new Map<string, { qtd: number; valor: number; atraso: number }>();
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        ctx.cards.forEach((c) => {
            const etapa = tituloCol(c.coluna_id);
            const row = mapa.get(etapa) || { qtd: 0, valor: 0, atraso: 0 };
            row.qtd += 1;
            row.valor += Number(c.valor) || 0;
            const entrega = c.data_entrega ? new Date(`${c.data_entrega.slice(0, 10)}T00:00:00`) : null;
            if (entrega && entrega < hoje && !/final|entreg/i.test(etapa)) row.atraso += 1;
            mapa.set(etapa, row);
        });
        const atrasados = ctx.cards.filter((c) => {
            const etapa = tituloCol(c.coluna_id);
            const entrega = c.data_entrega ? new Date(`${c.data_entrega.slice(0, 10)}T00:00:00`) : null;
            return entrega && entrega < hoje && !/final|entreg/i.test(etapa);
        });
        return [
            { titulo: 'Por etapa', nota: 'O custo da prótese não fica neste cartão. Aqui entra o valor cobrado e o atraso da entrega.', colunas: ['Etapa', 'Peças', 'Atrasadas', 'Valor cobrado'], linhas: [...mapa.entries()].map(([n, r]) => [n, String(r.qtd), String(r.atraso), brl(r.valor)]) },
            { titulo: 'Atrasadas', colunas: ['Paciente', 'Peça', 'Entrega', 'Valor'], linhas: atrasados.slice(0, 60).map((c) => [c.paciente_nome || '—', c.tipo_protese || c.descricao || '—', dataBR(c.data_entrega), brl(Number(c.valor) || 0)]) },
        ];
    }

    if (tipo === 'comissoes') {
        const mapa = new Map<string, { pagar: number; pago: number }>();
        ctx.comissoes.forEach((c) => {
            const id = String(c.profissional_id || 0);
            const row = mapa.get(id) || { pagar: 0, pago: 0 };
            const valor = Number(c.valor_comissao) || 0;
            if (c.status === 'pago') row.pago += valor;
            else if (c.status !== 'cancelado') row.pagar += valor;
            mapa.set(id, row);
        });
        return [{
            titulo: 'A pagar',
            nota: 'Só entram comissões que o sistema já lançou. A baixa continua fora desta tela.',
            colunas: ['Profissional', 'A pagar', 'Já pago'],
            linhas: [...mapa.entries()].map(([id, r]) => [nomeProf(Number(id) || null), brl(r.pagar), brl(r.pago)]),
        }];
    }

    return [];
}

function rotuloStatus(s?: string | null) {
    if (s === 'concluido') return 'Presente';
    if (s === 'fiado') return 'Presente · fiado';
    if (s === 'faltou' || s === 'falta') return 'Falta';
    if (s === 'cancelado') return 'Cancelado';
    return 'Previsto';
}
