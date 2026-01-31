'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { DollarSign, TrendingUp, TrendingDown, Calendar, ArrowRight, Wallet, Activity } from 'lucide-react';

export default function Financeiro() {
  // CORREÇÃO: <any[]>
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [resumo, setResumo] = useState({ entrada: 0, saida: 0, saldo: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    setLoading(true);
    const { data: entradas } = await supabase
      .from('agendamentos')
      .select('id, valor_final, data_hora, procedimento, pacientes(nome)')
      .eq('status', 'concluido')
      .order('data_hora', { ascending: false });

    // CORREÇÃO: (e: any) para acessar pacientes.nome
    const listaEntradas = (entradas || []).map((e: any) => ({
        id: e.id,
        tipo: 'entrada',
        // Aqui corrigimos o acesso ao nome do paciente
        descricao: `${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome} - ${e.procedimento}`,
        valor: Number(e.valor_final || 0),
        data: e.data_hora,
        origem: 'agendamento'
    }));

    const listaSaidas: any[] = []; 
    const todas = [...listaEntradas, ...listaSaidas].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    
    setTransacoes(todas);
    calcularResumo(todas);
    setLoading(false);
  }

  function calcularResumo(lista: any[]) {
      const ent = lista.filter(t => t.tipo === 'entrada').reduce((acc, curr) => acc + curr.valor, 0);
      const sai = lista.filter(t => t.tipo === 'saida').reduce((acc, curr) => acc + curr.valor, 0);
      setResumo({ entrada: ent, saida: sai, saldo: ent - sai });
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
      <div className="flex justify-between items-end"><div><h1 className="text-3xl font-black text-slate-800 tracking-tight">Financeiro</h1><p className="text-slate-500 font-medium">Fluxo de caixa e faturamento.</p></div><div className="text-sm font-bold text-slate-400 uppercase bg-slate-100 px-3 py-1 rounded-lg">{new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</div></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group"><div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><TrendingUp size={80} className="text-green-500"/></div><p className="text-sm font-bold text-slate-400 uppercase mb-1 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500"></div> Entradas</p><p className="text-3xl font-black text-slate-800">R$ {resumo.entrada.toFixed(2)}</p></div><div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm relative overflow-hidden group"><div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><TrendingDown size={80} className="text-red-500"/></div><p className="text-sm font-bold text-slate-400 uppercase mb-1 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-red-500"></div> Saídas</p><p className="text-3xl font-black text-slate-800">R$ {resumo.saida.toFixed(2)}</p></div><div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl shadow-slate-200 relative overflow-hidden text-white"><div className="absolute right-0 top-0 p-3 opacity-10"><Wallet size={80} className="text-white"/></div><p className="text-sm font-bold text-slate-400 uppercase mb-1">Saldo Líquido</p><p className="text-3xl font-black text-white">R$ {resumo.saldo.toFixed(2)}</p></div></div>
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"><div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center"><h3 className="font-bold text-slate-700 flex items-center gap-2"><Activity size={18} className="text-blue-600"/> Histórico de Transações</h3></div><div className="divide-y divide-slate-100">{loading ? <div className="p-10 text-center text-slate-400">Carregando...</div> : transacoes.length === 0 ? <div className="p-10 text-center text-slate-400">Nenhuma movimentação registrada.</div> : transacoes.map((t: any) => (<div key={t.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors"><div className="flex items-center gap-4"><div className={`p-3 rounded-xl ${t.tipo === 'entrada' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{t.tipo === 'entrada' ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}</div><div><p className="font-bold text-slate-700">{t.descricao}</p><p className="text-xs text-slate-400 font-medium">{new Date(t.data).toLocaleDateString('pt-BR')} às {new Date(t.data).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})} • via {t.origem}</p></div></div><span className={`font-black text-lg ${t.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>{t.tipo === 'entrada' ? '+' : '-'} R$ {t.valor.toFixed(2)}</span></div>))}</div></div>
    </div>
  );
}