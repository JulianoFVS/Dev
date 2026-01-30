'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Calendar, DollarSign, Activity, ChevronRight, TrendingUp } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const [stats, setStats] = useState({ pacientes: 0, hoje: 0, faturamento: 0 });

  useEffect(() => {
    async function getStats() {
      // Total Pacientes
      const { count: totalPacientes } = await supabase.from('pacientes').select('*', { count: 'exact', head: true });
      
      // Agendamentos Hoje
      const hoje = new Date().toISOString().split('T')[0];
      const { count: totalHoje } = await supabase.from('agendamentos')
        .select('*', { count: 'exact', head: true })
        .gte('data_hora', `${hoje}T00:00:00`)
        .lte('data_hora', `${hoje}T23:59:59`)
        .neq('status', 'cancelado');

      // Faturamento (Soma dos 'concluidos' do mês atual)
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const fimMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString();
      
      const { data: faturamentoData } = await supabase.from('agendamentos')
        .select('valor')
        .eq('status', 'concluido')
        .gte('data_hora', inicioMes)
        .lte('data_hora', fimMes);

      const totalFat = faturamentoData?.reduce((acc, item) => acc + (Number(item.valor) || 0), 0) || 0;

      setStats({ 
        pacientes: totalPacientes || 0, 
        hoje: totalHoje || 0,
        faturamento: totalFat
      });
    }
    getStats();
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Painel Principal</h1>
        <p className="text-slate-500">Visão geral do desempenho da clínica este mês.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-xl"><Users size={24} /></div>
          <div><p className="text-sm text-slate-400 font-medium">Pacientes Ativos</p><p className="text-2xl font-bold text-slate-800">{stats.pacientes}</p></div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 bg-teal-50 text-teal-600 rounded-xl"><Calendar size={24} /></div>
          <div><p className="text-sm text-slate-400 font-medium">Agenda Hoje</p><p className="text-2xl font-bold text-slate-800">{stats.hoje}</p></div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 bg-green-50 text-green-600 rounded-xl"><DollarSign size={24} /></div>
          <div>
            <p className="text-sm text-slate-400 font-medium">Faturamento (Mês)</p>
            <p className="text-2xl font-bold text-green-600">R$ {stats.faturamento.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/agenda" className="bg-gradient-to-br from-teal-600 to-teal-800 p-8 rounded-3xl text-white shadow-lg hover:scale-[1.02] transition-transform cursor-pointer relative overflow-hidden">
            <div className="relative z-10">
                <h3 className="text-2xl font-bold mb-2">Acessar Agenda</h3>
                <p className="opacity-80 mb-6">Gerencie consultas, marque como concluído e lance valores.</p>
                <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg backdrop-blur-sm font-medium">Ver Grade <ChevronRight size={16}/></div>
            </div>
            <Calendar className="absolute -bottom-4 -right-4 text-teal-500/30 w-40 h-40" />
        </Link>
        <Link href="/pacientes" className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:border-teal-200 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden">
            <div className="relative z-10">
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Prontuários</h3>
                <p className="text-slate-500 mb-6">Consulte o histórico completo e dados de cada paciente.</p>
                <div className="inline-flex items-center gap-2 text-teal-600 font-bold group-hover:gap-3 transition-all">Ir para Pacientes <ChevronRight size={16}/></div>
            </div>
            <Activity className="absolute -bottom-4 -right-4 text-slate-100 w-40 h-40" />
        </Link>
      </div>
    </div>
  );
}