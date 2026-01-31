'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Users, Calendar, DollarSign, ArrowRight, TrendingUp, Activity, Clock, CheckCircle } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({ pacientes: 0, agendamentos: 0, faturamento: 0 });
  const [proximos, setProximos] = useState<any[]>([]); // Tipagem Any
  const [loading, setLoading] = useState(true);
  const [usuario, setUsuario] = useState<any>(null); // Tipagem Any para aceitar User ou Null

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    const { data: { user } } = await supabase.auth.getUser();
    setUsuario(user);

    if (user) {
        const hoje = new Date().toISOString().split('T')[0];
        
        const { count: countPac } = await supabase.from('pacientes').select('*', { count: 'exact', head: true });
        const { count: countAg } = await supabase.from('agendamentos').select('*', { count: 'exact', head: true }).gte('data_hora', `${hoje}T00:00:00`).lte('data_hora', `${hoje}T23:59:59`);
        
        const { data: agendamentos } = await supabase.from('agendamentos').select('valor_final').eq('status', 'concluido');
        const totalFat = agendamentos?.reduce((acc: any, curr: any) => acc + (curr.valor_final || 0), 0) || 0;

        setStats({ pacientes: countPac || 0, agendamentos: countAg || 0, faturamento: totalFat });

        const { data: prox } = await supabase.from('agendamentos').select('*, pacientes(nome)').gte('data_hora', new Date().toISOString()).order('data_hora', { ascending: true }).limit(4);
        setProximos(prox || []);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4"><div><h1 className="text-3xl font-black text-slate-800 tracking-tight">Olá, Dr(a).</h1><p className="text-slate-500 font-medium">Aqui está o resumo da sua clínica hoje.</p></div><div className="text-right hidden md:block"><p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Link href="/agenda" className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 p-8 text-white shadow-xl shadow-blue-200 transition-all hover:shadow-2xl hover:scale-[1.01]"><div className="relative z-10"><div className="mb-4 inline-flex rounded-xl bg-white/20 p-3 backdrop-blur-sm group-hover:bg-white/30 transition-colors"><Calendar size={28} className="text-white" /></div><h3 className="text-2xl font-bold">Acessar Agenda</h3><p className="mt-2 text-blue-100 font-medium max-w-sm">Gerencie consultas, marque como concluído e lance valores.</p><div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur-sm transition-colors group-hover:bg-white group-hover:text-blue-700">Ver Grade <ArrowRight size={16} /></div></div><Calendar className="absolute -bottom-6 -right-6 h-48 w-48 text-white/5 rotate-12 group-hover:rotate-0 transition-transform duration-500" /></Link><Link href="/pacientes" className="group relative overflow-hidden rounded-3xl bg-white border border-slate-100 p-8 text-slate-800 shadow-xl shadow-slate-200/50 transition-all hover:shadow-2xl hover:border-blue-200"><div className="relative z-10"><div className="mb-4 inline-flex rounded-xl bg-blue-50 p-3 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors"><Users size={28} /></div><h3 className="text-2xl font-bold">Prontuários</h3><p className="mt-2 text-slate-500 font-medium max-w-sm">Consulte o histórico completo e dados de cada paciente.</p><div className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-blue-600 group-hover:underline">Ir para Pacientes <ArrowRight size={16} /></div></div><Activity className="absolute -bottom-4 -right-4 h-40 w-40 text-slate-50 group-hover:text-blue-50 transition-colors duration-500" /></Link></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4"><div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><Users size={24}/></div><div><p className="text-sm font-bold text-slate-400 uppercase">Pacientes</p><p className="text-2xl font-black text-slate-800">{stats.pacientes}</p></div></div><div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4"><div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Calendar size={24}/></div><div><p className="text-sm font-bold text-slate-400 uppercase">Agendamentos Hoje</p><p className="text-2xl font-black text-slate-800">{stats.agendamentos}</p></div></div><div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4"><div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><DollarSign size={24}/></div><div><p className="text-sm font-bold text-slate-400 uppercase">Faturamento Mês</p><p className="text-2xl font-black text-slate-800">R$ {stats.faturamento.toFixed(2)}</p></div></div></div>
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"><div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center"><h3 className="font-bold text-slate-700 flex items-center gap-2"><Clock size={20} className="text-blue-500"/> Próximos Atendimentos</h3><Link href="/agenda" className="text-xs font-bold text-blue-600 hover:underline">Ver todos</Link></div><div className="divide-y divide-slate-50">{proximos.length === 0 ? (<div className="p-8 text-center text-slate-400">Nenhum agendamento futuro encontrado.</div>) : (proximos.map((ag: any) => (<div key={ag.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"><div className="flex items-center gap-4"><div className="flex flex-col items-center justify-center w-12 h-12 bg-blue-50 text-blue-700 rounded-xl font-bold text-xs border border-blue-100"><span>{new Date(ag.data_hora).getDate()}</span><span className="text-[9px] uppercase">{new Date(ag.data_hora).toLocaleString('pt-BR', { month: 'short' }).replace('.','')}</span></div><div><p className="font-bold text-slate-700">{ag.pacientes?.nome}</p><p className="text-xs text-slate-500">{ag.procedimento} • {new Date(ag.data_hora).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p></div></div><div className="flex items-center gap-2"><span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase ${ag.status === 'concluido' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{ag.status}</span></div></div>)))}</div></div>
    </div>
  );
}