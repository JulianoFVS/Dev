'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useClinica } from '@/app/context/ClinicaContext';
import { fetchUserClinicas } from '@/lib/clinicScoped';
import {
    BarChart3, TrendingUp, TrendingDown, Calendar, Users, DollarSign,
    Loader2, Activity, CheckCircle, XCircle, Clock, ArrowUpRight, ArrowDownRight, Printer
} from 'lucide-react';

type Agendamento = {
    id: string; data_hora: string; procedimento: string; status: string;
    valor_final: number; paciente_id: string; clinica_id: number;
    pacientes?: { nome: string };
};

export default function Relatorios() {
    const { activeClinicId, loading: clinicLoading } = useClinica();
    const [loading, setLoading] = useState(true);
    const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
    const [pacientesTotal, setPacientesTotal] = useState(0);
    const [despesas, setDespesas] = useState<any[]>([]);

    const [periodo, setPeriodo] = useState<'mes' | '3meses' | '6meses' | 'ano'>('mes');

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

        const [agRes, pacRes, despRes] = await Promise.all([
            supabase.from('agendamentos').select('id, data_hora, procedimento, status, valor_final, paciente_id, clinica_id, pacientes(nome)')
                .gte('data_hora', inicioISO).in('clinica_id', filtrosIds).order('data_hora', { ascending: false }),
            supabase.from('pacientes').select('*', { count: 'exact', head: true }).in('clinica_id', filtrosIds),
            supabase.from('despesas').select('*').gte('data', inicioISO.split('T')[0]).in('clinica_id', filtrosIds),
        ]);

        setAgendamentos((agRes.data || []) as unknown as Agendamento[]);
        setPacientesTotal(pacRes.count || 0);
        setDespesas(despRes.data || []);
        setLoading(false);
    }

    // ===== Métricas calculadas =====
    const metricas = useMemo(() => {
        const concluidos = agendamentos.filter(a => a.status === 'concluido');
        const cancelados = agendamentos.filter(a => a.status === 'cancelado');
        const faltou = agendamentos.filter(a => a.status === 'faltou');
        const fiados = agendamentos.filter(a => a.status === 'fiado');
        const total = agendamentos.length;

        const faturamento = concluidos.reduce((s, a) => s + (a.valor_final || 0), 0);
        const fiado = fiados.reduce((s, a) => s + (a.valor_final || 0), 0);
        const despesaTotal = despesas.filter(d => d.tipo === 'saida').reduce((s, d) => s + (d.valor || 0), 0);
        const receitaManual = despesas.filter(d => d.tipo === 'entrada').reduce((s, d) => s + (d.valor || 0), 0);
        const receitaTotal = faturamento + receitaManual;
        const lucro = receitaTotal - despesaTotal;

        const taxaComparecimento = total > 0 ? Math.round(((concluidos.length + fiados.length) / total) * 100) : 0;
        const taxaCancelamento = total > 0 ? Math.round(((cancelados.length + faltou.length) / total) * 100) : 0;

        // Procedimentos mais realizados
        const procMap: Record<string, { count: number; valor: number }> = {};
        concluidos.forEach(a => {
            const key = a.procedimento || 'Não especificado';
            if (!procMap[key]) procMap[key] = { count: 0, valor: 0 };
            procMap[key].count++;
            procMap[key].valor += a.valor_final || 0;
        });
        const topProcedimentos = Object.entries(procMap).sort((a, b) => b[1].count - a[1].count).slice(0, 8);

        // Faturamento por mês (para gráfico de barras simples)
        const fatMensal: Record<string, number> = {};
        concluidos.forEach(a => {
            const mesKey = a.data_hora.slice(0, 7);
            fatMensal[mesKey] = (fatMensal[mesKey] || 0) + (a.valor_final || 0);
        });
        const meses = Object.keys(fatMensal).sort();
        const maxFat = Math.max(...Object.values(fatMensal), 1);

        // Pacientes únicos atendidos
        const pacientesUnicos = new Set(concluidos.map(a => a.paciente_id)).size;

        return {
            total, concluidos: concluidos.length, cancelados: cancelados.length + faltou.length,
            fiados: fiados.length, faturamento, fiado, despesaTotal, receitaTotal, lucro,
            taxaComparecimento, taxaCancelamento, topProcedimentos, fatMensal, meses, maxFat,
            pacientesUnicos, receitaManual,
        };
    }, [agendamentos, despesas]);

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
                <div className="flex items-center gap-2">
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

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KPI icon={<DollarSign size={20}/>} iconBg="bg-emerald-50 text-emerald-600" label="Receita Total" value={fmt(metricas.receitaTotal)} sub={`${metricas.concluidos} consultas concluídas`} trend="up"/>
                <KPI icon={<TrendingDown size={20}/>} iconBg="bg-rose-50 text-rose-600" label="Despesas" value={fmt(metricas.despesaTotal)} sub={`${despesas.filter(d => d.tipo === 'saida').length} lançamentos`} trend="down"/>
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
                    {metricas.fiado > 0 && <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700 font-semibold">⚠️ Valor a receber acumulado no período</div>}
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
