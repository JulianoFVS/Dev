const fs = require('fs');
const path = require('path');

console.log('💰 Instalando Financeiro Pro (Anual, Personalizado e Extrato)...');

const financeiroPro = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  DollarSign, TrendingUp, TrendingDown, Filter, Calendar, 
  Search, Download, ChevronDown, ChevronUp, ArrowUpCircle, ArrowDownCircle 
} from 'lucide-react';

export default function Financeiro() {
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [resumo, setResumo] = useState({ entradas: 0, saidas: 0, saldo: 0 });
  const [loading, setLoading] = useState(false);
  
  // Filtros
  const [modo, setModo] = useState<'mes' | 'ano' | 'periodo'>('mes');
  const [mes, setMes] = useState(new Date().getMonth());
  const [ano, setAno] = useState(new Date().getFullYear());
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);

  // Nova Despesa
  const [novaDespesa, setNovaDespesa] = useState({ descricao: '', valor: '', data: new Date().toISOString().split('T')[0] });

  useEffect(() => { carregarDados(); }, [modo, mes, ano, dataInicio, dataFim]);

  async function carregarDados() {
    setLoading(true);
    let inicioISO, fimISO;

    // 1. Definir o range de datas baseado no modo
    if (modo === 'mes') {
        const i = new Date(ano, mes, 1);
        const f = new Date(ano, mes + 1, 0);
        inicioISO = new Date(i.setHours(0,0,0,0)).toISOString();
        fimISO = new Date(f.setHours(23,59,59,999)).toISOString();
    } else if (modo === 'ano') {
        const i = new Date(ano, 0, 1);
        const f = new Date(ano, 12, 0);
        inicioISO = new Date(i.setHours(0,0,0,0)).toISOString();
        fimISO = new Date(f.setHours(23,59,59,999)).toISOString();
    } else {
        inicioISO = new Date(new Date(dataInicio).setHours(0,0,0,0)).toISOString();
        fimISO = new Date(new Date(dataFim).setHours(23,59,59,999)).toISOString();
    }

    // 2. Buscar Entradas (Consultas)
    const { data: entradas } = await supabase
        .from('agendamentos')
        .select('id, procedimento, valor, data_hora, pacientes(nome)')
        .eq('status', 'concluido')
        .gte('data_hora', inicioISO)
        .lte('data_hora', fimISO);

    // 3. Buscar Saídas (Despesas)
    const { data: saidas } = await supabase
        .from('despesas')
        .select('*')
        .gte('data', inicioISO)
        .lte('data', fimISO);

    // 4. Unificar e Padronizar (Extrato)
    const listaEntradas = entradas?.map(e => ({
        id: e.id,
        tipo: 'entrada',
        descricao: \`\${e.pacientes?.nome} - \${e.procedimento}\`,
        valor: Number(e.valor),
        data: e.data_hora,
        origem: 'agendamento'
    })) || [];

    const listaSaidas = saidas?.map(s => ({
        id: s.id,
        tipo: 'saida',
        descricao: s.descricao,
        valor: Number(s.valor),
        data: s.data, // Despesa salva como YYYY-MM-DD
        origem: 'despesa'
    })) || [];

    // Juntar e ordenar por data (mais recente primeiro)
    const tudo = [...listaEntradas, ...listaSaidas].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    
    // Calcular Totais
    const totalEnt = listaEntradas.reduce((acc, item) => acc + item.valor, 0);
    const totalSai = listaSaidas.reduce((acc, item) => acc + item.valor, 0);

    setTransacoes(tudo);
    setResumo({ entradas: totalEnt, saidas: totalSai, saldo: totalEnt - totalSai });
    setLoading(false);
  }

  async function adicionarDespesa(e: any) {
    e.preventDefault();
    if (!novaDespesa.descricao || !novaDespesa.valor) return;
    await supabase.from('despesas').insert([{ 
        descricao: novaDespesa.descricao, 
        valor: parseFloat(novaDespesa.valor),
        data: novaDespesa.data 
    }]);
    setNovaDespesa({ ...novaDespesa, descricao: '', valor: '' });
    carregarDados();
  }

  async function excluirItem(id: number, origem: string) {
    if (!confirm('Tem certeza?')) return;
    if (origem === 'despesa') {
        await supabase.from('despesas').delete().eq('id', id);
    } else {
        // Se for agendamento, apenas volta status para pendente ou remove valor
        await supabase.from('agendamentos').update({ status: 'agendado', cor: 'blue' }).eq('id', id);
    }
    carregarDados();
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20 max-w-6xl mx-auto">
      
      {/* 1. CABEÇALHO E FILTROS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4 border-b border-slate-100 pb-4">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <DollarSign className="text-teal-600"/> Gestão Financeira
            </h2>
            
            {/* Seletor de Modo */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
                <button onClick={() => setModo('mes')} className={\`px-4 py-1.5 rounded-md text-sm font-bold transition-all \${modo === 'mes' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}\`}>Mensal</button>
                <button onClick={() => setModo('ano')} className={\`px-4 py-1.5 rounded-md text-sm font-bold transition-all \${modo === 'ano' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}\`}>Anual</button>
                <button onClick={() => setModo('periodo')} className={\`px-4 py-1.5 rounded-md text-sm font-bold transition-all \${modo === 'periodo' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}\`}>Período</button>
            </div>
        </div>

        {/* Controles Dinâmicos */}
        <div className="flex justify-center md:justify-end gap-2">
            {(modo === 'mes' || modo === 'ano') && (
                <select value={ano} onChange={e => setAno(Number(e.target.value))} className="p-2 border border-slate-200 rounded-lg bg-white outline-none font-medium">
                    <option value={2025}>2025</option><option value={2026}>2026</option>
                </select>
            )}
            
            {modo === 'mes' && (
                <select value={mes} onChange={e => setMes(Number(e.target.value))} className="p-2 border border-slate-200 rounded-lg bg-white outline-none font-medium">
                    {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
            )}

            {modo === 'periodo' && (
                <div className="flex gap-2 items-center">
                    <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="p-2 border border-slate-200 rounded-lg text-sm text-slate-600"/>
                    <span className="text-slate-400">até</span>
                    <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="p-2 border border-slate-200 rounded-lg text-sm text-slate-600"/>
                </div>
            )}
        </div>
      </div>

      {/* 2. CARDS DE RESUMO (BIG NUMBERS) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-100 shadow-sm">
            <p className="text-green-700 font-bold text-sm flex items-center gap-2 uppercase tracking-wide"><TrendingUp size={18}/> Receitas</p>
            <p className="text-3xl font-bold text-green-800 mt-2">R$ {resumo.entradas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-rose-50 p-6 rounded-2xl border border-red-100 shadow-sm">
            <p className="text-red-700 font-bold text-sm flex items-center gap-2 uppercase tracking-wide"><TrendingDown size={18}/> Despesas</p>
            <p className="text-3xl font-bold text-red-800 mt-2">R$ {resumo.saidas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-slate-500 font-bold text-sm uppercase tracking-wide">Saldo Líquido</p>
            <p className={\`text-3xl font-bold mt-2 \${resumo.saldo >= 0 ? 'text-teal-600' : 'text-red-600'}\`}>
                R$ {resumo.saldo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
            </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 3. LANÇAR DESPESA RÁPIDA */}
        <div className="lg:col-span-1">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 sticky top-4">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><ArrowDownCircle size={18} className="text-red-500"/> Lançar Despesa</h3>
                <form onSubmit={adicionarDespesa} className="space-y-3">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase">Descrição</label>
                        <input value={novaDespesa.descricao} onChange={e => setNovaDespesa({...novaDespesa, descricao: e.target.value})} className="w-full p-2 border rounded-lg outline-none focus:border-red-400" placeholder="Ex: Conta de Luz" required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Valor</label>
                            <input type="number" value={novaDespesa.valor} onChange={e => setNovaDespesa({...novaDespesa, valor: e.target.value})} className="w-full p-2 border rounded-lg outline-none focus:border-red-400" placeholder="0.00" required />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Data</label>
                            <input type="date" value={novaDespesa.data} onChange={e => setNovaDespesa({...novaDespesa, data: e.target.value})} className="w-full p-2 border rounded-lg outline-none focus:border-red-400" required />
                        </div>
                    </div>
                    <button type="submit" className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-2 rounded-lg transition-colors flex justify-center items-center gap-2">
                        <TrendingDown size={18}/> Registrar Saída
                    </button>
                </form>
            </div>
        </div>

        {/* 4. EXTRATO DISCRIMINATÓRIO (TABELA) */}
        <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2"><Filter size={16}/> Extrato Detalhado</h3>
                    <span className="text-xs text-slate-400 font-medium">{transacoes.length} lançamentos</span>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-4 py-3">Data</th>
                                <th className="px-4 py-3">Descrição</th>
                                <th className="px-4 py-3 text-right">Valor</th>
                                <th className="px-4 py-3 text-center">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {transacoes.length === 0 && (
                                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">Nenhum registro neste período.</td></tr>
                            )}
                            {transacoes.map((t) => (
                                <tr key={t.tipo + t.id} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                                        {new Date(t.data).toLocaleDateString('pt-BR')}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-700">
                                        {t.descricao}
                                        {t.tipo === 'entrada' && <span className="ml-2 text-[10px] bg-teal-50 text-teal-600 px-1.5 py-0.5 rounded border border-teal-100">Consulta</span>}
                                    </td>
                                    <td className={\`px-4 py-3 text-right font-bold \${t.tipo === 'entrada' ? 'text-green-600' : 'text-red-500'}\`}>
                                        {t.tipo === 'entrada' ? '+' : '-'} R$ {t.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button onClick={() => excluirItem(t.id, t.origem)} className="text-slate-300 hover:text-red-500 transition-colors p-1">
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}
`;

fs.writeFileSync(path.join('app', 'financeiro', 'page.tsx'), financeiroPro.trim());
console.log('✅ Financeiro Pro Instalado com Sucesso!');