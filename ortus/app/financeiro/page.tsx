'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    TrendingUp, TrendingDown, Wallet, Activity, Plus, 
    Printer, Filter, ArrowUpCircle, ArrowDownCircle, Loader2, X, Save, Calendar, Search
} from 'lucide-react';

export default function Financeiro() {
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [transacoesFiltradas, setTransacoesFiltradas] = useState<any[]>([]);
  const [resumo, setResumo] = useState({ entrada: 0, saida: 0, saldo: 0 });
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  
  // MODOS DE VISUALIZAÇÃO
  const [modoData, setModoData] = useState<'mes' | 'periodo'>('mes');
  const [mesSelecionado, setMesSelecionado] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().slice(0, 8) + '01');
  const [dataFim, setDataFim] = useState(new Date().toISOString().slice(0, 10));

  const [tipoFiltro, setTipoFiltro] = useState('todos'); // todos, entrada, saida

  // FORMULÁRIO (Agora tem TIPO)
  const [novaMovimentacao, setNovaMovimentacao] = useState({ 
      tipo: 'saida', // entrada ou saida
      descricao: '', valor: '', data: new Date().toISOString().split('T')[0], categoria: 'geral' 
  });

  useEffect(() => { carregarDados(); }, [modoData, mesSelecionado, dataInicio, dataFim]);
  useEffect(() => { 
      if (tipoFiltro === 'todos') setTransacoesFiltradas(transacoes);
      else setTransacoesFiltradas(transacoes.filter(t => t.tipo === tipoFiltro));
  }, [tipoFiltro, transacoes]);

  async function carregarDados() {
    setLoading(true);
    let inicio, fim;

    if (modoData === 'mes') {
        inicio = `${mesSelecionado}-01 00:00:00`;
        fim = `${mesSelecionado}-31 23:59:59`;
    } else {
        inicio = `${dataInicio} 00:00:00`;
        fim = `${dataFim} 23:59:59`;
    }

    // 1. Agendamentos (Sempre Entradas)
    const { data: agendamentos } = await supabase.from('agendamentos').select('id, valor_final, data_hora, procedimento, pacientes(nome)').eq('status', 'concluido').gte('data_hora', inicio).lte('data_hora', fim);
    
    // 2. Movimentações Manuais (Entradas e Saídas na tabela despesas)
    const { data: manuais } = await supabase.from('despesas').select('*').gte('data', inicio.split(' ')[0]).lte('data', fim.split(' ')[0]);

    const listaAgendamentos = (agendamentos || []).map((e: any) => ({
        id: 'ag_' + e.id, tipo: 'entrada',
        descricao: `Consulta: ${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome}`,
        valor: Number(e.valor_final || 0), data: e.data_hora, categoria: 'Agenda'
    }));

    const listaManuais = (manuais || []).map((s: any) => ({
        id: 'man_' + s.id, 
        tipo: s.tipo || 'saida', // Padrão saida se nulo
        descricao: s.descricao,
        valor: Number(s.valor || 0), data: s.data, categoria: s.categoria || 'Geral'
    }));

    const todas = [...listaAgendamentos, ...listaManuais].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    
    setTransacoes(todas);
    setTransacoesFiltradas(todas);
    
    const totalEntrada = todas.filter(t => t.tipo === 'entrada').reduce((acc, curr) => acc + curr.valor, 0);
    const totalSaida = todas.filter(t => t.tipo === 'saida').reduce((acc, curr) => acc + curr.valor, 0);
    setResumo({ entrada: totalEntrada, saida: totalSaida, saldo: totalEntrada - totalSaida });
    
    setLoading(false);
  }

  async function salvarMovimentacao(e: any) {
      e.preventDefault(); setSalvando(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      const payload = { 
          descricao: novaMovimentacao.descricao, 
          valor: parseFloat(novaMovimentacao.valor), 
          data: novaMovimentacao.data, 
          categoria: novaMovimentacao.categoria, 
          tipo: novaMovimentacao.tipo,
          user_id: user?.id 
      };

      await supabase.from('despesas').insert([payload]);
      setModalAberto(false); 
      setNovaMovimentacao({ ...novaMovimentacao, descricao: '', valor: '' }); 
      carregarDados();
      setSalvando(false);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20 print:p-0 print:max-w-none">
      <style jsx global>{` @media print { .no-print { display: none !important; } body { background: white; } .print-border { border: 1px solid #ddd; } } `}</style>

      {/* CONTROLE SUPERIOR */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 no-print bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Financeiro</h1>
            <div className="flex gap-2 mt-2">
                <button onClick={() => setModoData('mes')} className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${modoData === 'mes' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>Por Mês</button>
                <button onClick={() => setModoData('periodo')} className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${modoData === 'periodo' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>Por Período</button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
              {modoData === 'mes' ? (
                  <input type="month" value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-700 font-bold text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"/>
              ) : (
                  <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                      <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="bg-transparent text-slate-600 font-bold text-xs outline-none"/>
                      <span className="text-slate-400">-</span>
                      <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="bg-transparent text-slate-600 font-bold text-xs outline-none"/>
                  </div>
              )}
              
              <button onClick={() => window.print()} className="bg-white border border-slate-200 text-slate-600 p-2.5 rounded-xl hover:bg-slate-50" title="Imprimir"><Printer size={20}/></button>
              <button onClick={() => setModalAberto(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 text-sm shadow-lg shadow-blue-200 transition-all active:scale-95"><Plus size={18}/> Novo Lançamento</button>
          </div>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm print-border"><div className="flex justify-between items-start mb-4"><div className="p-3 bg-green-50 text-green-600 rounded-2xl no-print"><TrendingUp size={24}/></div><span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">+ Receitas</span></div><div><p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Total Entradas</p><p className="text-3xl font-black text-slate-800 mt-1">R$ {resumo.entrada.toFixed(2)}</p></div></div>
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm print-border"><div className="flex justify-between items-start mb-4"><div className="p-3 bg-red-50 text-red-600 rounded-2xl no-print"><TrendingDown size={24}/></div><span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg">- Despesas</span></div><div><p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Total Saídas</p><p className="text-3xl font-black text-slate-800 mt-1">R$ {resumo.saida.toFixed(2)}</p></div></div>
          <div className="bg-slate-900 p-6 rounded-3xl shadow-xl shadow-slate-200 relative overflow-hidden text-white print:bg-white print:text-black print-border"><div className="flex justify-between items-start mb-4"><div className="p-3 bg-white/10 text-white rounded-2xl no-print"><Wallet size={24}/></div><span className="text-xs font-bold text-white/80 bg-white/10 px-2 py-1 rounded-lg print:text-black print:border">Caixa</span></div><div><p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Saldo Líquido</p><p className={`text-3xl font-black mt-1 ${resumo.saldo >= 0 ? 'text-white print:text-black' : 'text-red-400'}`}>R$ {resumo.saldo.toFixed(2)}</p></div></div>
      </div>

      {/* EXTRATO */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden print-border">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div className="flex items-center gap-4">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2"><Activity size={18} className="text-blue-600 no-print"/> Extrato Detalhado</h3>
                  <div className="flex bg-slate-200 p-1 rounded-lg no-print">
                      <button onClick={() => setTipoFiltro('todos')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${tipoFiltro === 'todos' ? 'bg-white shadow text-black' : 'text-slate-500'}`}>Tudo</button>
                      <button onClick={() => setTipoFiltro('entrada')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${tipoFiltro === 'entrada' ? 'bg-white shadow text-green-600' : 'text-slate-500'}`}>Entradas</button>
                      <button onClick={() => setTipoFiltro('saida')} className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${tipoFiltro === 'saida' ? 'bg-white shadow text-red-600' : 'text-slate-500'}`}>Saídas</button>
                  </div>
              </div>
          </div>
          
          <div className="divide-y divide-slate-100">
              {loading ? (<div className="p-10 text-center text-slate-400 flex flex-col items-center"><Loader2 className="animate-spin mb-2"/> Atualizando...</div>) : transacoesFiltradas.length === 0 ? (<div className="p-12 text-center text-slate-400">Nenhum lançamento neste período.</div>) : (transacoesFiltradas.map((t: any) => (
                  <div key={t.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-2xl flex items-center justify-center shadow-sm no-print ${t.tipo === 'entrada' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>{t.tipo === 'entrada' ? <ArrowUpCircle size={24}/> : <ArrowDownCircle size={24}/>}</div>
                          <div><p className="font-bold text-slate-700 text-sm md:text-base">{t.descricao}</p><div className="flex items-center gap-2 mt-0.5"><span className="text-xs font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{t.categoria}</span><span className="text-xs text-slate-400 font-medium">{new Date(t.data).toLocaleDateString('pt-BR')}</span></div></div>
                      </div>
                      <span className={`font-black text-sm md:text-lg whitespace-nowrap ${t.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>{t.tipo === 'entrada' ? '+' : '-'} R$ {t.valor.toFixed(2)}</span>
                  </div>
              )))}
          </div>
      </div>

      {/* MODAL DE LANÇAMENTO */}
      {modalAberto && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in no-print">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-zoom-in border border-slate-100">
                <div className="p-6 border-b bg-slate-50 flex justify-between items-center"><h3 className="font-black text-xl text-slate-800">Novo Lançamento</h3><button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-red-500 p-1"><X size={20}/></button></div>
                <form onSubmit={salvarMovimentacao} className="p-6 space-y-4">
                    
                    {/* SELETOR DE TIPO */}
                    <div className="flex bg-slate-100 p-1 rounded-xl mb-4">
                        <button type="button" onClick={() => setNovaMovimentacao({...novaMovimentacao, tipo: 'entrada'})} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${novaMovimentacao.tipo === 'entrada' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400'}`}><ArrowUpCircle size={16}/> Receita</button>
                        <button type="button" onClick={() => setNovaMovimentacao({...novaMovimentacao, tipo: 'saida'})} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${novaMovimentacao.tipo === 'saida' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400'}`}><ArrowDownCircle size={16}/> Despesa</button>
                    </div>

                    <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Descrição</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder={novaMovimentacao.tipo === 'entrada' ? "Ex: Venda de Produto" : "Ex: Conta de Luz"} value={novaMovimentacao.descricao} onChange={e => setNovaMovimentacao({...novaMovimentacao, descricao: e.target.value})} /></div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Valor (R$)</label><input required type="number" step="0.01" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="0.00" value={novaMovimentacao.valor} onChange={e => setNovaMovimentacao({...novaMovimentacao, valor: e.target.value})} /></div>
                        <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Data</label><input required type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-600" value={novaMovimentacao.data} onChange={e => setNovaMovimentacao({...novaMovimentacao, data: e.target.value})} /></div>
                    </div>
                    
                    <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Categoria</label><select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-600" value={novaMovimentacao.categoria} onChange={e => setNovaMovimentacao({...novaMovimentacao, categoria: e.target.value})}><option value="geral">Geral</option><option value="vendas">Vendas</option><option value="aluguel">Aluguel</option><option value="fornecedores">Fornecedores</option><option value="equipe">Equipe</option><option value="impostos">Impostos</option><option value="marketing">Marketing</option></select></div>
                    
                    <div className="pt-4 flex gap-3"><button type="button" onClick={() => setModalAberto(false)} className="flex-1 py-3.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button><button type="submit" disabled={salvando} className="flex-1 bg-slate-900 text-white rounded-xl font-bold py-3.5 hover:bg-black transition-all shadow-lg flex justify-center items-center gap-2">{salvando ? <Loader2 className="animate-spin"/> : <><Save size={18}/> Salvar</>}</button></div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}