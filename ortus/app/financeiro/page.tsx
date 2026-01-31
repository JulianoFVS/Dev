'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { DollarSign, TrendingUp, TrendingDown, Filter, Printer, ArrowDownCircle, ArrowUpCircle, Trash2, RefreshCw, Loader2 } from 'lucide-react';

export default function Financeiro() {
  const [transacoes, setTransacoes] = useState([]);
  const [resumo, setResumo] = useState({ entradas: 0, saidas: 0, saldo: 0 });
  const [loading, setLoading] = useState(false);
  const [mes, setMes] = useState(new Date().getMonth());
  const [ano, setAno] = useState(new Date().getFullYear());
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);
  const [modo, setModo] = useState('mes');
  const relatorioRef = useRef(null);

  const [novoLancamento, setNovoLancamento] = useState({ descricao: '', valor: '', data: new Date().toISOString().split('T')[0], tipo: 'saida' });

  useEffect(() => { carregarDados(); }, [mes, ano, modo, dataInicio, dataFim]);

  async function carregarDados() {
    setLoading(true);
    let inicioISO, fimISO;

    if (modo === 'mes') {
        const i = new Date(ano, mes, 1);
        const f = new Date(ano, mes + 1, 0);
        inicioISO = new Date(i.setHours(0,0,0,0)).toISOString();
        fimISO = new Date(f.setHours(23,59,59,999)).toISOString();
    } else {
        inicioISO = new Date(new Date(dataInicio).setHours(0,0,0,0)).toISOString();
        fimISO = new Date(new Date(dataFim).setHours(23,59,59,999)).toISOString();
    }

    const { data: agendamentos } = await supabase.from('agendamentos').select('id, procedimento, valor_final, data_hora, pacientes(nome)').eq('status', 'concluido').gte('data_hora', inicioISO).lte('data_hora', fimISO);
    const { data: manuais } = await supabase.from('despesas').select('*').gte('data', inicioISO).lte('data', fimISO);

    const listaAgendamentos = agendamentos?.map((e) => ({ 
        id: e.id, 
        tipo: 'entrada', 
        descricao: `${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome} - ${e.procedimento}`, 
        valor: Number(e.valor_final || 0), 
        data: e.data_hora, origem: 'agendamento' 
    })) || [];

    const listaManuais = manuais?.map((s) => ({ 
        id: s.id, 
        tipo: s.tipo_transacao || 'saida', 
        descricao: s.descricao, 
        valor: Number(s.valor), 
        data: s.data, origem: 'manual' 
    })) || [];

    const tudo = [...listaAgendamentos, ...listaManuais].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    const totalEnt = tudo.filter(t => t.tipo === 'entrada').reduce((acc, item) => acc + item.valor, 0);
    const totalSai = tudo.filter(t => t.tipo === 'saida').reduce((acc, item) => acc + item.valor, 0);

    setTransacoes(tudo);
    setResumo({ entradas: totalEnt, saidas: totalSai, saldo: totalEnt - totalSai });
    setLoading(false);
  }

  async function salvarLancamento(e) {
    e.preventDefault();
    if (!novoLancamento.descricao || !novoLancamento.valor) return;
    await supabase.from('despesas').insert([{ descricao: novoLancamento.descricao, valor: parseFloat(novoLancamento.valor), data: novoLancamento.data, tipo_transacao: novoLancamento.tipo }]);
    setNovoLancamento({ ...novoLancamento, descricao: '', valor: '' });
    carregarDados();
  }

  async function excluirItem(id, origem) {
    if (!confirm('Tem certeza?')) return;
    if (origem === 'manual') await supabase.from('despesas').delete().eq('id', id);
    else await supabase.from('agendamentos').update({ status: 'agendado', cor: 'blue' }).eq('id', id);
    carregarDados();
  }

  function imprimir() {
    const conteudo = relatorioRef.current?.innerHTML;
    if (!conteudo) return;
    const janela = window.open('', '', 'height=800,width=800');
    janela.document.write('<html><head><title>Relatório</title><script src="https://cdn.tailwindcss.com"></script></head><body class="p-10 bg-white">');
    janela.document.write('<div class="mb-8 text-center"><h1 class="text-3xl font-bold">Relatório Financeiro</h1></div>');
    janela.document.write(`<div class="grid grid-cols-3 gap-4 mb-8"><div class="p-4 border rounded"><p>ENTRADAS</p><p class="text-2xl font-bold text-green-600">R$ ${resumo.entradas.toFixed(2)}</p></div><div class="p-4 border rounded"><p>SAÍDAS</p><p class="text-2xl font-bold text-red-600">R$ ${resumo.saidas.toFixed(2)}</p></div><div class="p-4 border rounded"><p>SALDO</p><p class="text-2xl font-bold">R$ ${resumo.saldo.toFixed(2)}</p></div></div>`);
    janela.document.write(conteudo);
    janela.document.close();
    setTimeout(() => janela.print(), 500);
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20 max-w-6xl mx-auto">
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><DollarSign className="text-blue-600"/> Financeiro</h2>
            <div className="flex bg-slate-100 p-1 rounded-lg">
                <button onClick={() => setModo('mes')} className={`px-3 py-1 text-xs font-bold rounded transition-all ${modo === 'mes' ? 'bg-white shadow text-blue-700' : 'text-slate-500'}`}>Mês</button>
                <button onClick={() => setModo('periodo')} className={`px-3 py-1 text-xs font-bold rounded transition-all ${modo === 'periodo' ? 'bg-white shadow text-blue-700' : 'text-slate-500'}`}>Período</button>
            </div>
        </div>
        <div className="flex gap-2 items-center">
             {modo === 'mes' ? (
                 <>
                    <select value={mes} onChange={e => setMes(Number(e.target.value))} className="p-2 border rounded-lg bg-slate-50 font-semibold text-slate-700 outline-none">{['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
                    <select value={ano} onChange={e => setAno(Number(e.target.value))} className="p-2 border rounded-lg bg-slate-50 font-semibold text-slate-700 outline-none"><option value={2025}>2025</option><option value={2026}>2026</option></select>
                 </>
             ) : (
                 <div className="flex gap-2"><input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="p-2 border rounded-lg text-sm"/><input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="p-2 border rounded-lg text-sm"/></div>
             )}
             <button onClick={carregarDados} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-lg hover:bg-blue-50 transition-colors"><RefreshCw size={18}/></button>
             <button onClick={imprimir} className="p-2 text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors"><Printer size={18}/></button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 shadow-sm"><p className="text-blue-700 font-bold text-xs uppercase tracking-wider flex items-center gap-2"><TrendingUp size={16}/> Receitas</p><p className="text-3xl font-extrabold text-blue-800 mt-2">R$ {resumo.entradas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p></div>
        <div className="bg-red-50 p-6 rounded-2xl border border-red-100 shadow-sm"><p className="text-red-700 font-bold text-xs uppercase tracking-wider flex items-center gap-2"><TrendingDown size={16}/> Despesas</p><p className="text-3xl font-extrabold text-red-800 mt-2">R$ {resumo.saidas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p></div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><p className="text-slate-500 font-bold text-xs uppercase tracking-wider">Saldo Líquido</p><p className={`text-3xl font-extrabold mt-2 ${resumo.saldo >= 0 ? 'text-slate-800' : 'text-red-600'}`}>R$ {resumo.saldo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 sticky top-4">
                <h3 className="font-bold text-slate-800 mb-4 text-lg">Lançamento</h3>
                <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                    <button onClick={() => setNovoLancamento({...novoLancamento, tipo: 'entrada'})} className={`flex-1 py-1.5 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 ${novoLancamento.tipo === 'entrada' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><ArrowUpCircle size={16}/> Entrada</button>
                    <button onClick={() => setNovoLancamento({...novoLancamento, tipo: 'saida'})} className={`flex-1 py-1.5 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 ${novoLancamento.tipo === 'saida' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><ArrowDownCircle size={16}/> Saída</button>
                </div>
                <form onSubmit={salvarLancamento} className="space-y-3">
                    <input value={novoLancamento.descricao} onChange={e => setNovoLancamento({...novoLancamento, descricao: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-400 font-medium" placeholder="Descrição" required />
                    <div className="grid grid-cols-2 gap-3">
                        <input type="number" value={novoLancamento.valor} onChange={e => setNovoLancamento({...novoLancamento, valor: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-400 font-bold" placeholder="R$ 0,00" required />
                        <input type="date" value={novoLancamento.data} onChange={e => setNovoLancamento({...novoLancamento, data: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-400 text-sm font-medium" required />
                    </div>
                    <button type="submit" className={`w-full text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2 ${novoLancamento.tipo === 'entrada' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}>Confirmar</button>
                </form>
            </div>
        </div>
        <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center"><h3 className="font-bold text-slate-700 flex items-center gap-2"><Filter size={16}/> Extrato</h3><span className="text-xs text-slate-400 font-bold">{transacoes.length} lançamentos</span></div>
                <div className="overflow-x-auto" ref={relatorioRef}>
                    <table className="w-full text-sm text-left"><tbody className="divide-y divide-slate-100">{transacoes.map((t) => (<tr key={t.tipo + t.id} className="hover:bg-slate-50 transition-colors group"><td className="px-4 py-4 text-slate-500 font-medium whitespace-nowrap w-24">{new Date(t.data).toLocaleDateString('pt-BR')}</td><td className="px-4 py-4 font-semibold text-slate-700">{t.descricao} {t.origem === 'agendamento' && <span className="ml-2 text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100 uppercase tracking-wide">Consulta</span>}</td><td className={`px-4 py-4 text-right font-bold w-32 ${t.tipo === 'entrada' ? 'text-blue-600' : 'text-red-600'}`}>{t.tipo === 'entrada' ? '+' : '-'} R$ {t.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td><td className="px-4 py-4 text-center w-12"><button onClick={() => excluirItem(t.id, t.origem)} className="text-slate-300 hover:text-red-500 transition-colors p-2"><Trash2 size={16} /></button></td></tr>))}</tbody></table>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}