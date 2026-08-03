'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useClinica } from '@/app/context/ClinicaContext';
import { fetchUserClinicas } from '@/lib/clinicScoped';
import { carregarConfig } from '@/lib/configClinica';
import CustomSelect from '@/components/ui/CustomSelect';
import {
    BarChart3, TrendingDown, Users, DollarSign,
    Loader2, Activity, CheckCircle, XCircle, Clock, ArrowUpRight, ArrowDownRight, Printer, Filter, Tag
} from 'lucide-react';

type Agendamento = {
    id: string; data_hora: string; procedimento: string; status: string;
    valor_final: number; paciente_id: string; clinica_id: number;
    profissional_id?: number | null;
    pacientes?: { nome: string } | { nome: string }[];
    profissionais?: { nome: string };
};

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
    const { activeClinicId, loading: clinicLoading } = useClinica();
    const [loading, setLoading] = useState(true);
    const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
    const [pacientesTotal, setPacientesTotal] = useState(0);
    const [despesas, setDespesas] = useState<any[]>([]);
    const [profissionais, setProfissionais] = useState<{ id: number; nome: string }[]>([]);
    const [meta, setMeta] = useState<Record<string, unknown>>({});

    const [periodo, setPeriodo] = useState<'mes' | '3meses' | '6meses' | 'ano'>('mes');
    const [filtroProfissional, setFiltroProfissional] = useState('todos');
    const [filtroStatus, setFiltroStatus] = useState('todos');
    const [filtroCategoria, setFiltroCategoria] = useState('todos');

    useEffect(() => { if (!clinicLoading) carregar(); }, [clinicLoading, activeClinicId, periodo]);

    async function carregar() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const clinicas = await fetchUserClinicas();
        let filtrosIds = clinicas.map(c => c.id);
        if (activeClinicId && activeClinicId !== 'all') {
            filtrosIds = filtrosIds.filter(id => id === Number(activeClinicId));
        }
        if (filtrosIds.length === 0) { setLoading(false); return; }

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

        setAgendamentos((agRes.data || []) as unknown as Agendamento[]);
        setPacientesTotal(pacRes.count || 0);
        setDespesas(despRes.data || []);
        setMeta(metaRes || {});

        const profIds = [...new Set((agRes.data || []).map((a: { profissional_id?: number }) => a.profissional_id).filter(Boolean))] as number[];
        if (profIds.length > 0) {
            const { data: profData } = await supabase.from('profissionais').select('id, nome').in('id', profIds).order('nome');
            setProfissionais((profData || []) as { id: number; nome: string }[]);
        } else {
            setProfissionais([]);
        }

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

    if (loading) return <div className="h-[50vh] flex items-center justify-center text-slate-400"><Loader2 className="animate-spin" size={28}/></div>;

    return (
        <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2"><BarChart3 size={24} className="text-cyan-500"/> Relatórios</h1>
                    <p className="text-slate-500 text-sm font-medium">Acompanhe o desempenho da sua clínica.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {(['mes', '3meses', '6meses', 'ano'] as const).map(p => (
                        <button key={p} onClick={() => setPeriodo(p)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${periodo === p ? 'bg-cyan-600 text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-200 hover:border-cyan-300'}`}
                        >
                            {p === 'mes' ? 'Este mês' : p === '3meses' ? '3 meses' : p === '6meses' ? '6 meses' : 'Este ano'}
                        </button>
                    ))}
                    <button onClick={() => window.print()} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1"><Printer size={13}/> Imprimir</button>
                </div>
            </div>

            {/* Filtros avançados */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase shrink-0">
                    <Filter size={14}/> Filtros
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Profissional</label>
                        <CustomSelect
                            value={filtroProfissional}
                            onChange={setFiltroProfissional}
                            options={[{ value: 'todos', label: 'Todos os profissionais' }, ...profissionais.map(p => ({ value: String(p.id), label: p.nome }))]}
                            size="sm"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Status</label>
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
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Categoria</label>
                        <CustomSelect
                            value={filtroCategoria}
                            onChange={setFiltroCategoria}
                            options={[{ value: 'todos', label: 'Todas as categorias' }, ...categoriasDisponiveis.map(c => ({ value: c, label: c }))]}
                            size="sm"
                        />
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPI icon={<DollarSign size={20}/>} iconBg="bg-emerald-50 text-emerald-600" label="Receita Total" value={fmt(metricas.receitaTotal)} sub={`${metricas.concluidos} consultas concluídas`} trend="up"/>
                <KPI icon={<TrendingDown size={20}/>} iconBg="bg-rose-50 text-rose-600" label="Despesas" value={fmt(metricas.despesaTotal)} sub={`${despesasAtivas.filter(d => d.tipo === 'saida').length} lançamentos (exc. cancelados)`} trend="down"/>
                <KPI icon={<Activity size={20}/>} iconBg="bg-cyan-50 text-cyan-600" label="Lucro Líquido" value={fmt(metricas.lucro)} sub={metricas.receitaTotal > 0 ? `Margem ${Math.round((metricas.lucro / metricas.receitaTotal) * 100)}%` : ''} trend={metricas.lucro >= 0 ? 'up' : 'down'}/>
                <KPI icon={<Users size={20}/>} iconBg="bg-indigo-50 text-indigo-600" label="Pacientes Atendidos" value={String(metricas.pacientesUnicos)} sub={`De ${pacientesTotal} cadastrados`}/>
            </div>

            {/* Row 2: Comparecimento + Fiados */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-3">Taxa de Comparecimento</div>
                    <div className="flex items-end gap-4">
                        <div className="relative w-20 h-20">
                            <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e2e8f0" strokeWidth="3"/>
                                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray={`${metricas.taxaComparecimento}, 100`} strokeLinecap="round"/>
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-lg font-black text-slate-800">{metricas.taxaComparecimento}%</span>
                            </div>
                        </div>
                        <div className="text-xs text-slate-500 space-y-1">
                            <div className="flex items-center gap-1.5"><CheckCircle size={12} className="text-emerald-500"/> {metricas.concluidos + metricas.fiados} compareceram</div>
                            <div className="flex items-center gap-1.5"><XCircle size={12} className="text-rose-500"/> {metricas.cancelados} cancelaram/faltaram</div>
                            <div className="flex items-center gap-1.5"><Clock size={12} className="text-slate-400"/> {metricas.total} total</div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-3">Valores em Aberto (Fiados)</div>
                    <div className="text-3xl font-black text-amber-600 mb-2">{fmt(metricas.fiado)}</div>
                    <div className="text-xs text-slate-500">{metricas.fiados} atendimento{metricas.fiados !== 1 ? 's' : ''} pendente{metricas.fiados !== 1 ? 's' : ''} de pagamento</div>
                    {metricas.fiado > 0 && <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 font-semibold">Valor a receber acumulado no período</div>}
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-3">Ticket Médio</div>
                    <div className="text-3xl font-black text-slate-800 mb-2">
                        {metricas.concluidos > 0 ? fmt(metricas.faturamento / metricas.concluidos) : 'R$ 0,00'}
                    </div>
                    <div className="text-xs text-slate-500">Valor médio por consulta concluída</div>
                    {metricas.receitaManual > 0 && <div className="mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-700 font-semibold">+ {fmt(metricas.receitaManual)} em receitas manuais</div>}
                </div>
            </div>

            {/* Fiados em aberto — lista detalhada */}
            {metricas.fiadosEmAberto.length > 0 && (
                <div className="bg-white p-6 rounded-2xl border border-amber-200 shadow-sm">
                    <div className="text-[10px] font-bold text-amber-600 uppercase mb-4 flex items-center gap-2">
                        <Clock size={14}/> Fiados em Aberto ({metricas.fiadosEmAberto.length})
                    </div>
                    <div className="divide-y divide-slate-100">
                        {metricas.fiadosEmAberto.map(f => (
                            <div key={f.id} className="py-3 flex items-center justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-800 text-sm truncate">{f.paciente}</p>
                                    <p className="text-xs text-slate-500 truncate">{f.procedimento}{f.profissional ? ` · ${f.profissional}` : ''}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">{new Date(f.data).toLocaleDateString('pt-BR')}</p>
                                </div>
                                <span className="font-black text-amber-600 whitespace-nowrap">{fmt(f.valor)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Breakdown por categoria */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-[10px] font-bold text-slate-400 uppercase mb-4 flex items-center gap-2">
                    <Tag size={14}/> Resumo por Categoria
                </div>
                {metricas.categoriasBreakdown.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">Nenhum lançamento no período.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[10px] font-bold text-slate-400 uppercase border-b border-slate-100">
                                    <th className="text-left py-2 pr-4">Categoria</th>
                                    <th className="text-right py-2 px-2">Entradas</th>
                                    <th className="text-right py-2 px-2">Saídas</th>
                                    <th className="text-right py-2 pl-2">Saldo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metricas.categoriasBreakdown.map(([nome, v]) => (
                                    <tr key={nome} className="border-b border-slate-50 hover:bg-slate-50/50">
                                        <td className="py-2.5 pr-4 font-bold text-slate-700">{nome}</td>
                                        <td className="py-2.5 px-2 text-right text-emerald-600 font-bold">{fmt(v.entrada)}</td>
                                        <td className="py-2.5 px-2 text-right text-rose-600 font-bold">{fmt(v.saida)}</td>
                                        <td className={`py-2.5 pl-2 text-right font-black ${v.entrada - v.saida >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>{fmt(v.entrada - v.saida)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Faturamento mensal (bar chart via CSS) */}
            {metricas.meses.length > 1 && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-4">Faturamento Mensal (Consultas Concluídas)</div>
                    <div className="flex items-end gap-2 h-40">
                        {metricas.meses.map(m => {
                            const val = metricas.fatMensal[m];
                            const pct = Math.max((val / metricas.maxFat) * 100, 4);
                            return (
                                <div key={m} className="flex-1 flex flex-col items-center gap-1 group">
                                    <div className="text-[9px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">{fmt(val)}</div>
                                    <div className="w-full bg-gradient-to-t from-cyan-500 to-cyan-400 rounded-t-lg transition-all hover:from-cyan-600 hover:to-cyan-500 shadow-sm" style={{ height: `${pct}%` }}/>
                                    <div className="text-[9px] font-bold text-slate-400 mt-1">{fmtMes(m)}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Top Procedimentos */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="text-[10px] font-bold text-slate-400 uppercase mb-4">Procedimentos Mais Realizados</div>
                {metricas.topProcedimentos.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">Nenhum procedimento concluído no período.</p>
                ) : (
                    <div className="space-y-2">
                        {metricas.topProcedimentos.map(([nome, data], i) => {
                            const maxCount = metricas.topProcedimentos[0][1].count;
                            const pct = Math.round((data.count / maxCount) * 100);
                            return (
                                <div key={nome} className="flex items-center gap-3">
                                    <span className="w-6 text-xs font-black text-slate-400 text-right">{i + 1}.</span>
                                    <div className="flex-1">
                                        <div className="flex justify-between mb-1">
                                            <span className="text-sm font-bold text-slate-700 truncate">{nome}</span>
                                            <span className="text-xs font-bold text-slate-500">{data.count}x · {fmt(data.valor)}</span>
                                        </div>
                                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-cyan-400 to-cyan-600 rounded-full transition-all" style={{ width: `${pct}%` }}/>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function KPI({ icon, iconBg, label, value, sub, trend }: { icon: React.ReactNode; iconBg: string; label: string; value: string; sub?: string; trend?: 'up' | 'down' }) {
    return (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <div className={`p-2.5 rounded-xl ${iconBg}`}>{icon}</div>
                {trend === 'up' && <ArrowUpRight size={18} className="text-emerald-500"/>}
                {trend === 'down' && <ArrowDownRight size={18} className="text-rose-500"/>}
            </div>
            <div className="text-[10px] font-bold text-slate-400 uppercase">{label}</div>
            <div className="text-xl font-black text-slate-800 mt-0.5">{value}</div>
            {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
        </div>
    );
}
