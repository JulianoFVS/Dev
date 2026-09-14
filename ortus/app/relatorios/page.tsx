'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { clinicScope, readRouteCache, writeRouteCache } from '@/lib/routeListCache';
import { carregarConfig } from '@/lib/configClinica';
import CustomSelect from '@/components/ui/CustomSelect';
import {
    TrendingUp, TrendingDown, Wallet, Users,
    CheckCircle, XCircle, Clock, Printer, Tag, BarChart3,
} from 'lucide-react';
import { printDocument, printTable, escapePrintHtml } from '@/lib/printDocument';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { bentoChartBar, bentoChartFill } from '@/lib/bentoUi';

const cardShell = 'rounded-[1.35rem] bg-white sm:rounded-[1.5rem]';
const pillPeriodo = (ativo: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium transition-colors ${ativo ? 'bg-neutral-900 text-white' : 'border border-black/10 bg-white text-neutral-600 hover:bg-neutral-50'}`;

type Agendamento = {
    id: string; data_hora: string; procedimento: string; status: string;
    valor_final: number; paciente_id: string; clinica_id: number;
    profissional_id?: number | null;
    pacientes?: { nome: string } | { nome: string }[];
    profissionais?: { nome: string };
};

type ReportType = 'resumo' | 'financeiro' | 'comparecimento' | 'fiados' | 'procedimentos';

const REL_CACHE_KEY = 'ortus:relatorios:v1';

type RelSnapshot = {
    agendamentos: Agendamento[];
    pacientesTotal: number;
    despesas: any[];
    profissionais: { id: number; nome: string }[];
    meta: Record<string, unknown>;
};

function relScope(clinicId: string | 'all' | null, periodo: string) {
    return `${clinicScope(clinicId)}:${periodo}`;
}

function readRelBoot(): RelSnapshot | null {
    if (typeof localStorage === 'undefined') return null;
    const cid = localStorage.getItem('ortus_clinica_id');
    const clinicId = !cid || cid === 'all' || cid === 'todas' ? 'all' : cid;
    return readRouteCache<RelSnapshot>(REL_CACHE_KEY, relScope(clinicId, 'mes'));
}

const REPORT_OPTIONS: { value: ReportType; label: string }[] = [
    { value: 'resumo', label: 'Resumo geral' },
    { value: 'financeiro', label: 'Financeiro' },
    { value: 'comparecimento', label: 'Comparecimento' },
    { value: 'fiados', label: 'Fiados em aberto' },
    { value: 'procedimentos', label: 'Procedimentos' },
];

function nomePaciente(p?: Agendamento['pacientes']) {
    if (!p) return 'Paciente';
    if (Array.isArray(p)) return p[0]?.nome || 'Paciente';
    return p.nome || 'Paciente';
}

function despesaCancelada(d: { id: string | number; status?: string }, meta: Record<string, unknown>) {
    const m = meta[`man_${d.id}`] as { status?: string } | undefined;
    return (m?.status || d.status) === 'cancelado';
}

export default function Relatorios() {
    const { activeClinicId, activeClinic, clinics, loading: clinicLoading } = useClinica();
    const boot = readRelBoot();
    const jaCarregou = useRef(!!boot);
    const [loading, setLoading] = useState(() => !boot);
    const [agendamentos, setAgendamentos] = useState<Agendamento[]>(() => boot?.agendamentos ?? []);
    const [pacientesTotal, setPacientesTotal] = useState(() => boot?.pacientesTotal ?? 0);
    const [despesas, setDespesas] = useState<any[]>(() => boot?.despesas ?? []);
    const [profissionais, setProfissionais] = useState<{ id: number; nome: string }[]>(() => boot?.profissionais ?? []);
    const [meta, setMeta] = useState<Record<string, unknown>>(() => boot?.meta ?? {});
    const fetchGen = useRef(0);

    const [periodo, setPeriodo] = useState<'mes' | '3meses' | '6meses' | 'ano'>('mes');
    const [filtroProfissional, setFiltroProfissional] = useState('todos');
    const [filtroStatus, setFiltroStatus] = useState('todos');
    const [filtroCategoria, setFiltroCategoria] = useState('todos');
    const [tipoRelatorio, setTipoRelatorio] = useState<ReportType>('resumo');

    useEffect(() => {
        if (clinicLoading) return;
        const snap = readRouteCache<RelSnapshot>(REL_CACHE_KEY, relScope(activeClinicId, periodo));
        if (snap) {
            setAgendamentos(snap.agendamentos);
            setPacientesTotal(snap.pacientesTotal);
            setDespesas(snap.despesas);
            setProfissionais(snap.profissionais);
            setMeta(snap.meta);
            setLoading(false);
        }
        carregar({ silent: !!snap });
    }, [clinicLoading, activeClinicId, periodo]);

    async function carregar(opts?: { silent?: boolean }) {
        const gen = ++fetchGen.current;
        const scope = relScope(activeClinicId, periodo);
        if (!opts?.silent) setLoading(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (gen === fetchGen.current) setLoading(false); return; }

        let filtrosIds = clinics.map((c) => Number(c.id)).filter((n) => Number.isFinite(n));
        if (activeClinicId && activeClinicId !== 'all') {
            filtrosIds = filtrosIds.filter(id => id === Number(activeClinicId));
        }
        if (filtrosIds.length === 0) { if (gen === fetchGen.current) setLoading(false); return; }

        const agora = new Date();
        let dataInicio: Date;
        if (periodo === 'mes') dataInicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
        else if (periodo === '3meses') dataInicio = new Date(agora.getFullYear(), agora.getMonth() - 2, 1);
        else if (periodo === '6meses') dataInicio = new Date(agora.getFullYear(), agora.getMonth() - 5, 1);
        else dataInicio = new Date(agora.getFullYear(), 0, 1);

        const inicioISO = dataInicio.toISOString();
        const cidMeta = activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : String(filtrosIds[0]);

        const [agRes, pacRes, despRes, metaRes] = await Promise.all([
            supabase.from('agendamentos').select('id, data_hora, procedimento, status, valor_final, paciente_id, clinica_id, profissional_id, pacientes(nome), profissionais(nome)')
                .gte('data_hora', inicioISO).in('clinica_id', filtrosIds).order('data_hora', { ascending: false }),
            supabase.from('pacientes').select('*', { count: 'exact', head: true }).in('clinica_id', filtrosIds),
            supabase.from('despesas').select('*').gte('data', inicioISO.split('T')[0]).in('clinica_id', filtrosIds),
            carregarConfig<Record<string, unknown>>(cidMeta, 'lancamentos_meta', 'ortus_lancamentos_meta', {}),
        ]);

        if (gen !== fetchGen.current) return;

        const nextAg = (agRes.data || []) as unknown as Agendamento[];
        let nextProf: { id: number; nome: string }[] = [];
        const profIds = [...new Set((agRes.data || []).map((a: { profissional_id?: number }) => a.profissional_id).filter(Boolean))] as number[];
        if (profIds.length > 0) {
            const { data: profData } = await supabase.from('profissionais').select('id, nome').in('id', profIds).order('nome');
            nextProf = (profData || []) as { id: number; nome: string }[];
        }

        if (gen !== fetchGen.current) return;

        const snapshot: RelSnapshot = {
            agendamentos: nextAg,
            pacientesTotal: pacRes.count || 0,
            despesas: despRes.data || [],
            profissionais: nextProf,
            meta: metaRes || {},
        };
        writeRouteCache(REL_CACHE_KEY, scope, snapshot);

        setAgendamentos(snapshot.agendamentos);
        setPacientesTotal(snapshot.pacientesTotal);
        setDespesas(snapshot.despesas);
        setProfissionais(snapshot.profissionais);
        setMeta(snapshot.meta);
        jaCarregou.current = true;
        setLoading(false);
    }

    const categoriasDisponiveis = useMemo(() => {
        const cats = new Set<string>();
        despesas.filter(d => !despesaCancelada(d, meta)).forEach(d => { if (d.categoria) cats.add(d.categoria); });
        cats.add('Atendimento');
        cats.add('Fiado / A Receber');
        return [...cats].sort();
    }, [despesas, meta]);

    const agendamentosFiltrados = useMemo(() => {
        return agendamentos.filter(a => {
            if (filtroProfissional !== 'todos' && String(a.profissional_id) !== filtroProfissional) return false;
            if (filtroStatus !== 'todos' && a.status !== filtroStatus) return false;
            if (filtroCategoria !== 'todos') {
                const catAg = a.status === 'fiado' ? 'Fiado / A Receber' : 'Atendimento';
                if (catAg !== filtroCategoria) return false;
            }
            return true;
        });
    }, [agendamentos, filtroProfissional, filtroStatus, filtroCategoria]);

    const despesasAtivas = useMemo(() => {
        return despesas.filter(d => {
            if (despesaCancelada(d, meta)) return false;
            if (filtroCategoria !== 'todos' && d.categoria !== filtroCategoria) return false;
            return true;
        });
    }, [despesas, meta, filtroCategoria]);

    const metricas = useMemo(() => {
        const concluidos = agendamentosFiltrados.filter(a => a.status === 'concluido');
        const cancelados = agendamentosFiltrados.filter(a => a.status === 'cancelado');
        const faltou = agendamentosFiltrados.filter(a => a.status === 'faltou');
        const fiados = agendamentosFiltrados.filter(a => a.status === 'fiado');
        const total = agendamentosFiltrados.length;

        const faturamento = concluidos.reduce((s, a) => s + (a.valor_final || 0), 0);
        const fiado = fiados.reduce((s, a) => s + (a.valor_final || 0), 0);
        const despesaTotal = despesasAtivas.filter(d => d.tipo === 'saida').reduce((s, d) => s + (d.valor || 0), 0);
        const receitaManual = despesasAtivas.filter(d => d.tipo === 'entrada').reduce((s, d) => s + (d.valor || 0), 0);
        const receitaTotal = faturamento + receitaManual;
        const lucro = receitaTotal - despesaTotal;

        const taxaComparecimento = total > 0 ? Math.round(((concluidos.length + fiados.length) / total) * 100) : 0;
        const taxaCancelamento = total > 0 ? Math.round(((cancelados.length + faltou.length) / total) * 100) : 0;

        const procMap: Record<string, { count: number; valor: number }> = {};
        concluidos.forEach(a => {
            const key = a.procedimento || 'Não especificado';
            if (!procMap[key]) procMap[key] = { count: 0, valor: 0 };
            procMap[key].count++;
            procMap[key].valor += a.valor_final || 0;
        });
        const topProcedimentos = Object.entries(procMap).sort((a, b) => b[1].count - a[1].count).slice(0, 8);

        const catMap: Record<string, { entrada: number; saida: number }> = {};
        concluidos.forEach(a => {
            const cat = 'Atendimento';
            if (!catMap[cat]) catMap[cat] = { entrada: 0, saida: 0 };
            catMap[cat].entrada += a.valor_final || 0;
        });
        fiados.forEach(a => {
            const cat = 'Fiado / A Receber';
            if (!catMap[cat]) catMap[cat] = { entrada: 0, saida: 0 };
            catMap[cat].entrada += a.valor_final || 0;
        });
        despesasAtivas.forEach(d => {
            const cat = d.categoria || 'Geral';
            if (!catMap[cat]) catMap[cat] = { entrada: 0, saida: 0 };
            if (d.tipo === 'entrada') catMap[cat].entrada += d.valor || 0;
            else catMap[cat].saida += d.valor || 0;
        });
        const categoriasBreakdown = Object.entries(catMap).sort((a, b) => (b[1].entrada + b[1].saida) - (a[1].entrada + a[1].saida));

        const fatMensal: Record<string, number> = {};
        concluidos.forEach(a => {
            const mesKey = a.data_hora.slice(0, 7);
            fatMensal[mesKey] = (fatMensal[mesKey] || 0) + (a.valor_final || 0);
        });
        const meses = Object.keys(fatMensal).sort();
        const maxFat = Math.max(...Object.values(fatMensal), 1);

        const pacientesUnicos = new Set(concluidos.map(a => a.paciente_id)).size;

        const fiadosEmAberto = fiados
            .sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime())
            .map(a => ({
                id: a.id,
                paciente: nomePaciente(a.pacientes),
                procedimento: a.procedimento,
                valor: a.valor_final || 0,
                data: a.data_hora,
                profissional: a.profissionais?.nome,
            }));

        return {
            total, concluidos: concluidos.length, cancelados: cancelados.length + faltou.length,
            fiados: fiados.length, faturamento, fiado, despesaTotal, receitaTotal, lucro,
            taxaComparecimento, taxaCancelamento, topProcedimentos, fatMensal, meses, maxFat,
            pacientesUnicos, receitaManual, categoriasBreakdown, fiadosEmAberto,
        };
    }, [agendamentosFiltrados, despesasAtivas]);

    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtMes = (m: string) => {
        const [y, mo] = m.split('-');
        const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        return `${nomes[parseInt(mo) - 1]}/${y.slice(2)}`;
    };

    const periodoLabel = periodo === 'mes' ? 'Este mês' : periodo === '3meses' ? 'Últimos 3 meses' : periodo === '6meses' ? 'Últimos 6 meses' : 'Este ano';
    const reportTitle = REPORT_OPTIONS.find(r => r.value === tipoRelatorio)?.label || 'Relatório';

    function imprimirRelatorio() {
        let bodyHtml = '';

        if (tipoRelatorio === 'resumo' || tipoRelatorio === 'financeiro') {
            bodyHtml += `
              <div class="ortus-kpis">
                <div class="ortus-kpi entrada"><div class="lbl">Receita Total</div><div class="val">${escapePrintHtml(fmt(metricas.receitaTotal))}</div></div>
                <div class="ortus-kpi saida"><div class="lbl">Despesas</div><div class="val">${escapePrintHtml(fmt(metricas.despesaTotal))}</div></div>
                <div class="ortus-kpi saldo"><div class="lbl">Lucro Líquido</div><div class="val">${escapePrintHtml(fmt(metricas.lucro))}</div></div>
                <div class="ortus-kpi info"><div class="lbl">Pacientes Atendidos</div><div class="val">${metricas.pacientesUnicos}</div></div>
              </div>`;
        }

        if (tipoRelatorio === 'resumo' || tipoRelatorio === 'financeiro') {
            const rows = metricas.categoriasBreakdown.map(([nome, v]) => [
                `<strong>${escapePrintHtml(nome)}</strong>`,
                `<span class="entrada">${escapePrintHtml(fmt(v.entrada))}</span>`,
                `<span class="saida">${escapePrintHtml(fmt(v.saida))}</span>`,
                `<strong>${escapePrintHtml(fmt(v.entrada - v.saida))}</strong>`,
            ]);
            bodyHtml += `<div class="ortus-section-title">Resumo por Categoria</div>${printTable(['Categoria', 'Entradas', 'Saídas', 'Saldo'], rows, { numCols: [1, 2, 3] })}`;
        }

        if (tipoRelatorio === 'resumo' || tipoRelatorio === 'comparecimento') {
            bodyHtml += `
              <div class="ortus-section-title">Comparecimento</div>
              <div class="ortus-kpis">
                <div class="ortus-kpi info"><div class="lbl">Taxa de Comparecimento</div><div class="val">${metricas.taxaComparecimento}%</div></div>
                <div class="ortus-kpi saida"><div class="lbl">Cancelamentos / Faltas</div><div class="val">${metricas.taxaCancelamento}%</div></div>
                <div class="ortus-kpi neutral"><div class="lbl">Total de Agendamentos</div><div class="val">${metricas.total}</div></div>
                <div class="ortus-kpi entrada"><div class="lbl">Ticket Médio</div><div class="val">${escapePrintHtml(metricas.concluidos > 0 ? fmt(metricas.faturamento / metricas.concluidos) : 'R$ 0,00')}</div></div>
              </div>`;
        }

        if (tipoRelatorio === 'resumo' || tipoRelatorio === 'fiados') {
            bodyHtml += `<div class="ortus-section-title">Fiados em Aberto</div><p><strong>Total pendente:</strong> ${escapePrintHtml(fmt(metricas.fiado))} (${metricas.fiados} atendimento${metricas.fiados !== 1 ? 's' : ''})</p>`;
            if (metricas.fiadosEmAberto.length > 0) {
                bodyHtml += printTable(
                    ['Paciente', 'Procedimento', 'Data', 'Valor'],
                    metricas.fiadosEmAberto.map(f => [
                        escapePrintHtml(f.paciente),
                        escapePrintHtml(`${f.procedimento}${f.profissional ? ` · ${f.profissional}` : ''}`),
                        escapePrintHtml(new Date(f.data).toLocaleDateString('pt-BR')),
                        `<span class="saida">${escapePrintHtml(fmt(f.valor))}</span>`,
                    ]),
                    { numCols: [3] },
                );
            } else {
                bodyHtml += '<p>Nenhum fiado pendente no período.</p>';
            }
        }

        if (tipoRelatorio === 'resumo' || tipoRelatorio === 'procedimentos') {
            bodyHtml += `<div class="ortus-section-title">Procedimentos Mais Realizados</div>`;
            if (metricas.topProcedimentos.length === 0) {
                bodyHtml += '<p>Nenhum procedimento concluído no período.</p>';
            } else {
                bodyHtml += printTable(
                    ['#', 'Procedimento', 'Qtd', 'Faturamento'],
                    metricas.topProcedimentos.map(([nome, data], i) => [
                        String(i + 1),
                        escapePrintHtml(nome),
                        `${data.count}x`,
                        `<span class="entrada">${escapePrintHtml(fmt(data.valor))}</span>`,
                    ]),
                    { numCols: [3] },
                );
            }
        }

        if (tipoRelatorio === 'financeiro' && metricas.meses.length > 1) {
            bodyHtml += `<div class="ortus-section-title">Faturamento Mensal</div>${printTable(
                ['Mês', 'Valor'],
                metricas.meses.map(m => [escapePrintHtml(fmtMes(m)), `<span class="entrada">${escapePrintHtml(fmt(metricas.fatMensal[m]))}</span>`]),
                { numCols: [1] },
            )}`;
        }

        printDocument({
            title: reportTitle,
            documentTitle: `${reportTitle} — ORTUS`,
            accentColor: '#0891b2',
            period: periodoLabel,
            bodyHtml,
            autoPrint: true,
        });
    }

    const kpiLoading = loading && !jaCarregou.current;
    const ticketMedio = metricas.concluidos > 0 ? metricas.faturamento / metricas.concluidos : 0;
    const showResumo = tipoRelatorio === 'resumo';
    const showFinanceiro = showResumo || tipoRelatorio === 'financeiro';
    const showComparecimento = showResumo || tipoRelatorio === 'comparecimento';
    const showFiados = showResumo || tipoRelatorio === 'fiados';
    const showProcedimentos = showResumo || tipoRelatorio === 'procedimentos';

    return (
        <div className="w-full space-y-3 px-2.5 py-2.5 pb-12 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Relatórios</h1>
                    <p className="mt-1 text-sm text-neutral-500 sm:text-base">
                        {activeClinic ? getClinicLabel(activeClinic) : 'Todas as clínicas'} · desempenho financeiro e operacional
                    </p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                    <button
                        type="button"
                        onClick={imprimirRelatorio}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
                        title="Imprimir relatório"
                    >
                        <Printer size={16} />
                        <span className="hidden sm:inline">Imprimir</span>
                    </button>
                </div>
            </div>

            <div className={`${cardShell} flex flex-col gap-3 p-3 sm:p-4`}>
                <div className="flex flex-wrap gap-2">
                    {(['mes', '3meses', '6meses', 'ano'] as const).map((p) => (
                        <button key={p} type="button" onClick={() => setPeriodo(p)} className={pillPeriodo(periodo === p)}>
                            {p === 'mes' ? 'Este mês' : p === '3meses' ? '3 meses' : p === '6meses' ? '6 meses' : 'Ano'}
                        </button>
                    ))}
                </div>
                <div className="grid grid-cols-1 gap-2 border-t border-black/5 pt-3 sm:grid-cols-3 sm:gap-3">
                    <CustomSelect
                        value={filtroProfissional}
                        onChange={setFiltroProfissional}
                        options={[{ value: 'todos', label: 'Todos os profissionais' }, ...profissionais.map(p => ({ value: String(p.id), label: p.nome }))]}
                        size="sm"
                    />
                    <CustomSelect
                        value={filtroStatus}
                        onChange={setFiltroStatus}
                        options={[
                            { value: 'todos', label: 'Todos os status' },
                            { value: 'concluido', label: 'Concluído' },
                            { value: 'fiado', label: 'Fiado' },
                            { value: 'agendado', label: 'Agendado' },
                            { value: 'cancelado', label: 'Cancelado' },
                            { value: 'faltou', label: 'Faltou' },
                        ]}
                        size="sm"
                    />
                    <CustomSelect
                        value={filtroCategoria}
                        onChange={setFiltroCategoria}
                        options={[{ value: 'todos', label: 'Todas as categorias' }, ...categoriasDisponiveis.map(c => ({ value: c, label: c }))]}
                        size="sm"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
                <section className={`${cardShell} p-4 sm:p-5`}>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-emerald-100 p-2 text-emerald-700"><TrendingUp size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Entradas</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500">Receita total</p>
                    {kpiLoading ? (
                        <div className="mt-2 h-8 w-28 animate-pulse rounded-xl bg-neutral-100" />
                    ) : (
                        <>
                            <p className="mt-1 text-xl font-semibold text-neutral-900 sm:text-2xl">{fmt(metricas.receitaTotal)}</p>
                            <p className="mt-1 text-[11px] text-neutral-500">{metricas.concluidos} consultas concluídas</p>
                        </>
                    )}
                </section>
                <section className={`${cardShell} p-4 sm:p-5`}>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-red-100 p-2 text-red-600"><TrendingDown size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600">Saídas</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500">Despesas</p>
                    {kpiLoading ? (
                        <div className="mt-2 h-8 w-28 animate-pulse rounded-xl bg-neutral-100" />
                    ) : (
                        <>
                            <p className="mt-1 text-xl font-semibold text-neutral-900 sm:text-2xl">{fmt(metricas.despesaTotal)}</p>
                            <p className="mt-1 text-[11px] text-neutral-500">{despesasAtivas.filter(d => d.tipo === 'saida').length} lançamentos</p>
                        </>
                    )}
                </section>
                <section className={`${cardShell} border border-amber-200/80 p-4 sm:p-5`}>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-amber-100 p-2 text-amber-700"><Clock size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Pendente</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500">Fiado em aberto</p>
                    {kpiLoading ? (
                        <div className="mt-2 h-8 w-28 animate-pulse rounded-xl bg-neutral-100" />
                    ) : (
                        <>
                            <p className="mt-1 text-xl font-semibold text-amber-800 sm:text-2xl">{fmt(metricas.fiado)}</p>
                            <p className="mt-1 text-[11px] text-neutral-500">{metricas.fiados} pendente{metricas.fiados !== 1 ? 's' : ''}</p>
                        </>
                    )}
                </section>
                <section className="rounded-[1.35rem] border border-neutral-800 bg-neutral-950 p-4 text-white sm:rounded-[1.5rem] sm:p-5">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-white/10 p-2 text-[#c8f053]"><Wallet size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Resultado</span>
                    </div>
                    <p className="text-xs font-medium text-white/60">Lucro líquido</p>
                    {kpiLoading ? (
                        <div className="mt-2 h-8 w-28 animate-pulse rounded-xl bg-white/10" />
                    ) : (
                        <>
                            <p className={`mt-1 text-xl font-semibold sm:text-2xl ${metricas.lucro >= 0 ? 'text-white' : 'text-red-400'}`}>{fmt(metricas.lucro)}</p>
                            <p className="mt-1 text-[11px] text-white/50">
                                {metricas.pacientesUnicos} pacientes · {pacientesTotal} cadastrados
                            </p>
                        </>
                    )}
                </section>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {REPORT_OPTIONS.map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => setTipoRelatorio(opt.value)}
                        className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                            tipoRelatorio === opt.value
                                ? 'bg-neutral-900 text-white'
                                : 'border border-black/10 bg-white text-neutral-600 hover:bg-neutral-50'
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            <div className={`${cardShell} overflow-hidden`}>
                <div className="flex flex-col gap-3 border-b border-black/5 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
                    <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[#f3f4f1] p-2 text-neutral-700"><BarChart3 size={18} /></span>
                        <h3 className="text-base font-semibold text-neutral-900 sm:text-lg">{reportTitle}</h3>
                    </div>
                    {showComparecimento && !kpiLoading && (
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                            <Users size={14} className="text-neutral-400" />
                            Ticket médio{' '}
                            <span className="font-semibold text-neutral-800">{metricas.concluidos > 0 ? fmt(ticketMedio) : 'R$ 0,00'}</span>
                        </div>
                    )}
                </div>

                <div className="divide-y divide-black/5">
                    {kpiLoading ? (
                        <div className="space-y-2 p-4">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex h-16 animate-pulse items-center gap-3 rounded-2xl bg-neutral-50 px-3" />
                            ))}
                        </div>
                    ) : (
                        <>
                            {showComparecimento && (
                                <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3 sm:p-5 md:gap-6">
                                    <div className="flex items-center gap-4">
                                        <div className="relative h-16 w-16 shrink-0 sm:h-20 sm:w-20">
                                            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden>
                                                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e5e5e5" strokeWidth="3" />
                                                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#171717" strokeWidth="3" strokeDasharray={`${metricas.taxaComparecimento}, 100`} strokeLinecap="round" />
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-base font-semibold text-neutral-900 sm:text-lg">{metricas.taxaComparecimento}%</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-neutral-900">Comparecimento</p>
                                            <ul className="mt-1 space-y-0.5 text-xs text-neutral-600">
                                                <li className="flex items-center gap-1.5"><CheckCircle size={12} className="text-emerald-600" /> {metricas.concluidos + metricas.fiados} compareceram</li>
                                                <li className="flex items-center gap-1.5"><XCircle size={12} className="text-neutral-500" /> {metricas.cancelados} cancelaram/faltaram</li>
                                            </ul>
                                        </div>
                                    </div>
                                    <div className="flex flex-col justify-center border-black/5 sm:border-l sm:pl-5">
                                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Agendamentos</p>
                                        <p className="mt-1 text-2xl font-semibold text-neutral-900">{metricas.total}</p>
                                        <p className="mt-0.5 text-xs text-neutral-500">No período filtrado</p>
                                    </div>
                                    <div className="flex flex-col justify-center border-black/5 sm:border-l sm:pl-5">
                                        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Receitas manuais</p>
                                        <p className="mt-1 text-2xl font-semibold text-neutral-900">{fmt(metricas.receitaManual)}</p>
                                        {metricas.receitaManual > 0 && (
                                            <p className="mt-0.5 text-xs text-neutral-500">Fora do faturamento de consultas</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {showFinanceiro && (
                                <>
                                    {metricas.categoriasBreakdown.length === 0 ? (
                                        <div className="p-8 text-center text-sm text-neutral-400">Nenhum lançamento no período.</div>
                                    ) : (
                                        metricas.categoriasBreakdown.map(([nome, v]) => {
                                            const saldo = v.entrada - v.saida;
                                            return (
                                                <div key={nome} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <span className="shrink-0 rounded-full bg-[#f3f4f1] p-2 text-neutral-700"><Tag size={16} /></span>
                                                        <div className="min-w-0">
                                                            <p className="truncate text-sm font-medium text-neutral-900">{nome}</p>
                                                            <p className="text-[11px] text-neutral-500">
                                                                <span className="text-emerald-700">+ {fmt(v.entrada)}</span>
                                                                {' · '}
                                                                <span className="text-red-600">− {fmt(v.saida)}</span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span className={`shrink-0 text-sm font-semibold ${saldo >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(saldo)}</span>
                                                </div>
                                            );
                                        })
                                    )}
                                    {metricas.meses.length > 1 && (
                                        <div className="border-t border-black/5 p-4 sm:p-5">
                                            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Faturamento mensal</p>
                                            <div className="flex h-32 items-end gap-1.5 sm:h-36 sm:gap-2">
                                                {metricas.meses.map(m => {
                                                    const val = metricas.fatMensal[m];
                                                    const pct = Math.max((val / metricas.maxFat) * 100, 4);
                                                    return (
                                                        <div key={m} className="group flex flex-1 flex-col items-center gap-1">
                                                            <div className="text-[9px] font-medium text-neutral-600 opacity-0 transition-opacity group-hover:opacity-100">{fmt(val)}</div>
                                                            <div className={`w-full min-h-[4px] ${bentoChartBar}`} style={{ height: `${pct}%` }} />
                                                            <div className="mt-1 text-[9px] font-medium text-neutral-500">{fmtMes(m)}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {showFiados && (
                                <>
                                    {metricas.fiadosEmAberto.length === 0 ? (
                                        <div className="p-8 text-center text-sm text-neutral-400">Nenhum fiado pendente no período.</div>
                                    ) : (
                                        metricas.fiadosEmAberto.map(f => (
                                            <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <span className="shrink-0 rounded-full bg-amber-100 p-2 text-amber-700"><Clock size={16} /></span>
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium text-neutral-900">{f.paciente}</p>
                                                        <p className="truncate text-[11px] text-neutral-500">
                                                            {f.procedimento}{f.profissional ? ` · ${f.profissional}` : ''}
                                                        </p>
                                                        <p className="text-[10px] text-neutral-400">{new Date(f.data).toLocaleDateString('pt-BR')}</p>
                                                    </div>
                                                </div>
                                                <span className="shrink-0 text-sm font-semibold text-amber-800">{fmt(f.valor)}</span>
                                            </div>
                                        ))
                                    )}
                                </>
                            )}

                            {showProcedimentos && (
                                <>
                                    {metricas.topProcedimentos.length === 0 ? (
                                        <div className="p-8 text-center text-sm text-neutral-400">Nenhum procedimento concluído no período.</div>
                                    ) : (
                                        metricas.topProcedimentos.map(([nome, data], i) => {
                                            const maxCount = metricas.topProcedimentos[0][1].count;
                                            const pct = Math.round((data.count / maxCount) * 100);
                                            return (
                                                <div key={nome} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                                                    <span className="w-6 shrink-0 text-right text-xs font-semibold text-neutral-400">{i + 1}.</span>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="mb-1.5 flex justify-between gap-2">
                                                            <span className="truncate text-sm font-medium text-neutral-900">{nome}</span>
                                                            <span className="shrink-0 text-xs font-medium text-neutral-500">{data.count}x · {fmt(data.valor)}</span>
                                                        </div>
                                                        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                                                            <div className={bentoChartFill} style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
