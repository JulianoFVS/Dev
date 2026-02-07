'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    TrendingUp, TrendingDown, Wallet, Activity, Plus, 
    Printer, ArrowUpCircle, ArrowDownCircle, Loader2, X, Save, Calendar, AlertCircle
} from 'lucide-react';

export default function Financeiro() {
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [transacoesFiltradas, setTransacoesFiltradas] = useState<any[]>([]);
  const [resumo, setResumo] = useState({ entrada: 0, saida: 0, saldo: 0 });
  const [loading, setLoading] = useState(true);
  
  // MODAL
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  
  // FILTROS DE DATA
  const [modoData, setModoData] = useState<'mes' | 'periodo'>('mes');
  const [mesSelecionado, setMesSelecionado] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const [tipoFiltro, setTipoFiltro] = useState('todos');

  // FORMULÁRIO NOVO LANÇAMENTO
  const [novoLancamento, setNovoLancamento] = useState({ 
      tipo: 'saida', 
      descricao: '', 
      valor: '', 
      data: new Date().toISOString().split('T')[0], 
      categoria: 'geral' 
  });

  // Inicializa datas padrão
  useEffect(() => {
      const hoje = new Date();
      setDataInicio(new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10));
      setDataFim(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10));
  }, []);

  // Recarrega quando muda o filtro de data
  useEffect(() => { 
      if (dataInicio && dataFim) carregarDados(); 
  }, [mesSelecionado, dataInicio, dataFim, modoData]);

  // Filtra localmente (Entrada/Saída)
  useEffect(() => { 
      if (tipoFiltro === 'todos') setTransacoesFiltradas(transacoes);
      else setTransacoesFiltradas(transacoes.filter(t => t.tipo === tipoFiltro));
  }, [tipoFiltro, transacoes]);

  async function carregarDados() {
    setLoading(true);
    
    // RECUPERA A CLÍNICA ATUAL
    const clinicaId = localStorage.getItem('ortus_clinica_id');
    const filtrarClinica = clinicaId && clinicaId !== 'todas';

    let inicio = '';
    let fim = '';

    if (modoData === 'mes') {
        const [ano, mes] = mesSelecionado.split('-');
        const ultimoDia = new Date(parseInt(ano), parseInt(mes), 0).getDate();
        inicio = `${mesSelecionado}-01`;
        fim = `${mesSelecionado}-${ultimoDia}`;
    } else {
        inicio = dataInicio;
        fim = dataFim;
    }

    const inicioFull = `${inicio}T00:00:00`;
    const fimFull = `${fim}T23:59:59`;

    try {
        // 1. BUSCAR AGENDAMENTOS (ENTRADAS)
        let qAg = supabase
            .from('agendamentos')
            .select('id, valor_final, data_hora, procedimento, pacientes(nome)')
            .eq('status', 'concluido') 
            .gte('data_hora', inicioFull)
            .lte('data_hora', fimFull);
        
        if (filtrarClinica) qAg = qAg.eq('clinica_id', clinicaId);

        const { data: agendamentos } = await qAg;

        // 2. BUSCAR LANÇAMENTOS MANUAIS
        let qMan = supabase
            .from('despesas')
            .select('*')
            .gte('data', inicio)
            .lte('data', fim);
        
        if (filtrarClinica) qMan = qMan.eq('clinica_id', clinicaId);

        const { data: manuais } = await qMan;

        // 3. PROCESSAR DADOS
        const listaAgendamentos = (agendamentos || []).map((e: any) => ({
            id: 'ag_' + e.id, 
            tipo: 'entrada',
            descricao: `${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome} - ${e.procedimento}`,
            valor: parseFloat(e.valor_final || '0'), 
            data: e.data_hora, 
            categoria: 'Atendimento'
        }));

        const listaManuais = (manuais || []).map((s: any) => ({
            id: 'man_' + s.id, 
            tipo: s.tipo || 'saida', 
            descricao: s.descricao,
            valor: parseFloat(s.valor || '0'), 
            data: s.data, 
            categoria: s.categoria || 'Geral'
        }));

        const todas = [...listaAgendamentos, ...listaManuais].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
        
        setTransacoes(todas);
        setTransacoesFiltradas(todas);
        
        // 4. CALCULAR TOTAIS
        const totalEntrada = todas.filter(t => t.tipo === 'entrada').reduce((acc, curr) => acc + (curr.valor || 0), 0);
        const totalSaida = todas.filter(t => t.tipo === 'saida').reduce((acc, curr) => acc + (curr.valor || 0), 0);
        
        setResumo({ 
            entrada: totalEntrada, 
            saida: totalSaida, 
            saldo: totalEntrada - totalSaida 
        });

    } catch (err) {
        console.error('Erro ao carregar:', err);
    }
    setLoading(false);
  }

  async function salvarLancamento(e: any) {
      e.preventDefault(); 
      setSalvando(true);

      const clinicaId = localStorage.getItem('ortus_clinica_id');
      
      // BLOQUEIA LANÇAMENTO EM "TODAS" PARA EVITAR DADOS SEM DONO
      if (!clinicaId || clinicaId === 'todas') {
          alert('⚠️ Para lançar uma nova despesa/receita, por favor selecione uma Unidade Específica no menu lateral.');
          setSalvando(false);
          return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      const payload = { 
          descricao: novoLancamento.descricao, 
          valor: parseFloat(novoLancamento.valor), 
          data: novoLancamento.data, 
          categoria: novoLancamento.categoria, 
          tipo: novoLancamento.tipo,
          clinica_id: clinicaId, // Salva com o ID da clínica atual
          user_id: user?.id 
      };

      const { error } = await supabase.from('despesas').insert([payload]);
      
      if (error) {
          alert('Erro no banco: ' + error.message);
      } else {
          setModalAberto(false); 
          setNovoLancamento({ ...novoLancamento, descricao: '', valor: '' }); 
          carregarDados(); 
      }
      setSalvando(false);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20 print:p-0 print:max-w-none">
      <style jsx global>{` @media print { .no-print { display: none !important; } body { background: white; } .print-border { border: 1px solid #ddd; } } `}</style>

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 no-print bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Gestão Financeira</h1>
            <div className="flex gap-2 mt-2">
                <button onClick={() => setModoData('mes')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${modoData === 'mes' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Por Mês</button>
                <button onClick={() => setModoData('periodo')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${modoData === 'periodo' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>Personalizado</button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
              {modoData === 'mes' ? (
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <Calendar size={18} className="text-slate-400"/>
                      <input type="month" value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)} className="bg-transparent text-slate-700 font-bold text-sm outline-none cursor-pointer"/>
                  </div>
              ) : (
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="bg-transparent text-slate-600 font-bold text-xs outline-none"/>
                      <span className="text-slate-300">até</span>
                      <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="bg-transparent text-slate-600 font-bold text-xs outline-none"/>
                  </div>
              )}
              
              <button onClick={() => window.print()} className="bg-white border border-slate-200 text-slate-600 p-2.5 rounded-xl hover:bg-slate-50 hover:text-blue-600 transition-colors" title="Imprimir Relatório"><Printer size={20}/></button>
              <button onClick={() => setModalAberto(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 text-sm shadow-lg shadow-blue-200 transition-all active:scale-95"><Plus size={18}/> Novo Lançamento</button>
          </div>
      </div>

      {/* CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm print-border">
              <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-green-50 text-green-600 rounded-2xl no-print"><TrendingUp size={24}/></div>
                  <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-1 rounded-lg border border-green-100">+ Entradas</span>
              </div>
              <div><p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Faturamento</p><p className="text-3xl font-black text-slate-800 mt-1">R$ {resumo.entrada.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p></div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm print-border">
              <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-red-50 text-red-600 rounded-2xl no-print"><TrendingDown size={24}/></div>
                  <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-1 rounded-lg border border-red-100">- Saídas</span>
              </div>
              <div><p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Despesas</p><p className="text-3xl font-black text-slate-800 mt-1">R$ {resumo.saida.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p></div>
          </div>

          <div className="bg-slate-900 p-6 rounded-3xl shadow-xl shadow-slate-200 relative overflow-hidden text-white print:bg-white print:text-black print-border">
              <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-white/10 text-white rounded-2xl no-print"><Wallet size={24}/></div>
                  <span className="text-xs font-bold text-white/90 bg-white/10 px-2 py-1 rounded-lg print:text-black print:border">= Resultado</span>
              </div>
              <div>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Saldo Líquido</p>
                  <p className={`text-3xl font-black mt-1 ${resumo.saldo >= 0 ? 'text-white print:text-black' : 'text-red-400'}`}>R$ {resumo.saldo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
              </div>
          </div>
      </div>

      {/* EXTRATO */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden print-border">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg no-print"><Activity size={18}/></div>
                  <h3 className="font-bold text-slate-700">Extrato de Movimentações</h3>
              </div>
              
              <div className="flex bg-slate-200 p-1 rounded-xl no-print">
                  <button onClick={() => setTipoFiltro('todos')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tipoFiltro === 'todos' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>Tudo</button>
                  <button onClick={() => setTipoFiltro('entrada')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tipoFiltro === 'entrada' ? 'bg-white shadow text-green-600' : 'text-slate-500 hover:text-slate-700'}`}>Entradas</button>
                  <button onClick={() => setTipoFiltro('saida')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tipoFiltro === 'saida' ? 'bg-white shadow text-red-600' : 'text-slate-500 hover:text-slate-700'}`}>Saídas</button>
              </div>
          </div>
          
          <div className="divide-y divide-slate-100">
              {loading ? (
                  <div className="p-10 text-center text-slate-400 flex flex-col items-center"><Loader2 className="animate-spin mb-2"/> Calculando...</div>
              ) : transacoesFiltradas.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 bg-slate-50/50">Nenhuma movimentação encontrada neste período.</div>
              ) : (
                  transacoesFiltradas.map((t: any) => (
                      <div key={t.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                          <div className="flex items-center gap-4">
                              <div className={`p-3 rounded-2xl flex items-center justify-center shadow-sm no-print transition-colors ${t.tipo === 'entrada' ? 'bg-green-50 text-green-600 group-hover:bg-green-100' : 'bg-red-50 text-red-600 group-hover:bg-red-100'}`}>
                                  {t.tipo === 'entrada' ? <ArrowUpCircle size={24}/> : <ArrowDownCircle size={24}/>}
                              </div>
                              <div>
                                  <p className="font-bold text-slate-700 text-sm md:text-base">{t.descricao}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-wide border border-slate-200">{t.categoria}</span>
                                      <span className="text-xs text-slate-400 font-medium">{new Date(t.data).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</span>
                                  </div>
                              </div>
                          </div>
                          <span className={`font-black text-sm md:text-lg whitespace-nowrap ${t.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                              {t.tipo === 'entrada' ? '+' : '-'} R$ {t.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                          </span>
                      </div>
                  ))
              )}
          </div>
      </div>

      {/* MODAL DE LANÇAMENTO */}
      {modalAberto && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in no-print">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-zoom-in border border-slate-100">
                <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                    <h3 className="font-black text-xl text-slate-800">Novo Lançamento</h3>
                    <button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-red-500 p-1 bg-white rounded-full border border-slate-200 hover:border-red-200 transition-colors"><X size={20}/></button>
                </div>
                
                <form onSubmit={salvarLancamento} className="p-6 space-y-5">
                    
                    {/* AVISO SE FOR TODAS */}
                    <div className="p-3 bg-blue-50 text-blue-700 text-xs font-bold rounded-xl flex items-start gap-2 border border-blue-100">
                        <AlertCircle size={16} className="mt-0.5 flex-none"/>
                        <span>O lançamento será vinculado à clínica selecionada no menu. Certifique-se de estar na unidade correta.</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100 rounded-xl">
                        <button type="button" onClick={() => setNovoLancamento({...novoLancamento, tipo: 'entrada'})} className={`py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${novoLancamento.tipo === 'entrada' ? 'bg-white text-green-600 shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}><ArrowUpCircle size={18}/> Receita</button>
                        <button type="button" onClick={() => setNovoLancamento({...novoLancamento, tipo: 'saida'})} className={`py-3 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${novoLancamento.tipo === 'saida' ? 'bg-white text-red-600 shadow-sm ring-1 ring-black/5' : 'text-slate-400 hover:text-slate-600'}`}><ArrowDownCircle size={18}/> Despesa</button>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Descrição</label>
                        <input required className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 transition-all focus:bg-white" placeholder={novoLancamento.tipo === 'entrada' ? "Ex: Venda de Kit" : "Ex: Conta de Luz"} value={novoLancamento.descricao} onChange={e => setNovoLancamento({...novoLancamento, descricao: e.target.value})} />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Valor (R$)</label>
                            <input required type="number" step="0.01" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 transition-all focus:bg-white" placeholder="0.00" value={novoLancamento.valor} onChange={e => setNovoLancamento({...novoLancamento, valor: e.target.value})} />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Data</label>
                            <input required type="date" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-600 transition-all focus:bg-white" value={novoLancamento.data} onChange={e => setNovoLancamento({...novoLancamento, data: e.target.value})} />
                        </div>
                    </div>
                    
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Categoria</label>
                        <select className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-600 transition-all focus:bg-white cursor-pointer" value={novoLancamento.categoria} onChange={e => setNovoLancamento({...novoLancamento, categoria: e.target.value})}>
                            <option value="geral">Geral</option>
                            <option value="vendas">Vendas</option>
                            <option value="aluguel">Aluguel</option>
                            <option value="fornecedores">Fornecedores</option>
                            <option value="equipe">Equipe</option>
                            <option value="impostos">Impostos</option>
                            <option value="marketing">Marketing</option>
                            <option value="procedimentos">Procedimentos Extras</option>
                        </select>
                    </div>
                    
                    <div className="pt-4 flex gap-3">
                        <button type="button" onClick={() => setModalAberto(false)} className="flex-1 py-3.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
                        <button type="submit" disabled={salvando} className="flex-1 bg-slate-900 text-white rounded-xl font-bold py-3.5 hover:bg-black transition-all shadow-lg flex justify-center items-center gap-2">
                            {salvando ? <Loader2 className="animate-spin"/> : <><Save size={18}/> Salvar Lançamento</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}