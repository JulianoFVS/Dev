'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { DollarSign, TrendingUp, TrendingDown, Calendar, ArrowRight, Wallet, Activity } from 'lucide-react';

export default function Financeiro() {
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [resumo, setResumo] = useState({ entrada: 0, saida: 0, saldo: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    setLoading(true);
    const { data: entradas } = await supabase.from('agendamentos').select('id, valor_final, data_hora, procedimento, pacientes(nome)').eq('status', 'concluido').order('data_hora', { ascending: false });
    const listaEntradas = (entradas || []).map((e: any) => ({
        id: e.id, tipo: 'entrada',
        descricao: `${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome} - ${e.procedimento}`,
        valor: Number(e.valor_final || 0), data: e.data_hora, origem: 'agendamento'
    }));
    const todas = [...listaEntradas].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    setTransacoes(todas);
    const ent = todas.filter(t => t.tipo === 'entrada').reduce((acc, curr) => acc + curr.valor, 0);
    setResumo({ entrada: ent, saida: 0, saldo: ent });
    setLoading(false);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
      <div className="flex justify-between items-end"><div><h1 className="text-3xl font-black text-slate-800 tracking-tight">Financeiro</h1></div></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="bg-white p-6 rounded-2xl border shadow-sm"><p className="text-sm font-bold text-slate-400">Entradas</p><p className="text-3xl font-black text-slate-800">R$ {resumo.entrada.toFixed(2)}</p></div><div className="bg-white p-6 rounded-2xl border shadow-sm"><p className="text-sm font-bold text-slate-400">Saídas</p><p className="text-3xl font-black text-slate-800">R$ 0.00</p></div><div className="bg-slate-900 p-6 rounded-2xl shadow-xl text-white"><p className="text-sm font-bold opacity-80">Saldo</p><p className="text-3xl font-black">R$ {resumo.saldo.toFixed(2)}</p></div></div>
      <div className="bg-white rounded-3xl border shadow-sm overflow-hidden"><div className="p-6 border-b bg-slate-50"><h3 className="font-bold text-slate-700">Histórico</h3></div><div className="divide-y">{transacoes.map((t:any) => (<div key={t.id} className="p-5 flex justify-between"><div className="flex gap-4"><div><p className="font-bold">{t.descricao}</p><p className="text-xs text-slate-400">{new Date(t.data).toLocaleDateString()}</p></div></div><span className="font-black text-green-600">+ R$ {t.valor.toFixed(2)}</span></div>))}</div></div>
    </div>
  );
}