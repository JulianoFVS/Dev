const fs = require('fs');
const path = require('path');

console.log('🛠️ Instalando V44: Financeiro Híbrido e Prontuário Estruturado...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Atualizado: ${caminhoRelativo}`);
}

// ======================================================
// 1. FINANCEIRO (Mês/Período + Entradas Manuais)
// ======================================================
const financeiroPage = `
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
        inicio = \`\${mesSelecionado}-01 00:00:00\`;
        fim = \`\${mesSelecionado}-31 23:59:59\`;
    } else {
        inicio = \`\${dataInicio} 00:00:00\`;
        fim = \`\${dataFim} 23:59:59\`;
    }

    // 1. Agendamentos (Sempre Entradas)
    const { data: agendamentos } = await supabase.from('agendamentos').select('id, valor_final, data_hora, procedimento, pacientes(nome)').eq('status', 'concluido').gte('data_hora', inicio).lte('data_hora', fim);
    
    // 2. Movimentações Manuais (Entradas e Saídas na tabela despesas)
    const { data: manuais } = await supabase.from('despesas').select('*').gte('data', inicio.split(' ')[0]).lte('data', fim.split(' ')[0]);

    const listaAgendamentos = (agendamentos || []).map((e: any) => ({
        id: 'ag_' + e.id, tipo: 'entrada',
        descricao: \`Consulta: \${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome}\`,
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
      <style jsx global>{\` @media print { .no-print { display: none !important; } body { background: white; } .print-border { border: 1px solid #ddd; } } \`}</style>

      {/* CONTROLE SUPERIOR */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 no-print bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Financeiro</h1>
            <div className="flex gap-2 mt-2">
                <button onClick={() => setModoData('mes')} className={\`px-3 py-1 text-xs font-bold rounded-lg transition-colors \${modoData === 'mes' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}\`}>Por Mês</button>
                <button onClick={() => setModoData('periodo')} className={\`px-3 py-1 text-xs font-bold rounded-lg transition-colors \${modoData === 'periodo' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}\`}>Por Período</button>
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
          <div className="bg-slate-900 p-6 rounded-3xl shadow-xl shadow-slate-200 relative overflow-hidden text-white print:bg-white print:text-black print-border"><div className="flex justify-between items-start mb-4"><div className="p-3 bg-white/10 text-white rounded-2xl no-print"><Wallet size={24}/></div><span className="text-xs font-bold text-white/80 bg-white/10 px-2 py-1 rounded-lg print:text-black print:border">Caixa</span></div><div><p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Saldo Líquido</p><p className={\`text-3xl font-black mt-1 \${resumo.saldo >= 0 ? 'text-white print:text-black' : 'text-red-400'}\`}>R$ {resumo.saldo.toFixed(2)}</p></div></div>
      </div>

      {/* EXTRATO */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden print-border">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div className="flex items-center gap-4">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2"><Activity size={18} className="text-blue-600 no-print"/> Extrato Detalhado</h3>
                  <div className="flex bg-slate-200 p-1 rounded-lg no-print">
                      <button onClick={() => setTipoFiltro('todos')} className={\`px-3 py-1 rounded-md text-xs font-bold transition-all \${tipoFiltro === 'todos' ? 'bg-white shadow text-black' : 'text-slate-500'}\`}>Tudo</button>
                      <button onClick={() => setTipoFiltro('entrada')} className={\`px-3 py-1 rounded-md text-xs font-bold transition-all \${tipoFiltro === 'entrada' ? 'bg-white shadow text-green-600' : 'text-slate-500'}\`}>Entradas</button>
                      <button onClick={() => setTipoFiltro('saida')} className={\`px-3 py-1 rounded-md text-xs font-bold transition-all \${tipoFiltro === 'saida' ? 'bg-white shadow text-red-600' : 'text-slate-500'}\`}>Saídas</button>
                  </div>
              </div>
          </div>
          
          <div className="divide-y divide-slate-100">
              {loading ? (<div className="p-10 text-center text-slate-400 flex flex-col items-center"><Loader2 className="animate-spin mb-2"/> Atualizando...</div>) : transacoesFiltradas.length === 0 ? (<div className="p-12 text-center text-slate-400">Nenhum lançamento neste período.</div>) : (transacoesFiltradas.map((t: any) => (
                  <div key={t.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                          <div className={\`p-3 rounded-2xl flex items-center justify-center shadow-sm no-print \${t.tipo === 'entrada' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}\`}>{t.tipo === 'entrada' ? <ArrowUpCircle size={24}/> : <ArrowDownCircle size={24}/>}</div>
                          <div><p className="font-bold text-slate-700 text-sm md:text-base">{t.descricao}</p><div className="flex items-center gap-2 mt-0.5"><span className="text-xs font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{t.categoria}</span><span className="text-xs text-slate-400 font-medium">{new Date(t.data).toLocaleDateString('pt-BR')}</span></div></div>
                      </div>
                      <span className={\`font-black text-sm md:text-lg whitespace-nowrap \${t.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}\`}>{t.tipo === 'entrada' ? '+' : '-'} R$ {t.valor.toFixed(2)}</span>
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
                        <button type="button" onClick={() => setNovaMovimentacao({...novaMovimentacao, tipo: 'entrada'})} className={\`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 \${novaMovimentacao.tipo === 'entrada' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400'}\`}><ArrowUpCircle size={16}/> Receita</button>
                        <button type="button" onClick={() => setNovaMovimentacao({...novaMovimentacao, tipo: 'saida'})} className={\`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 \${novaMovimentacao.tipo === 'saida' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400'}\`}><ArrowDownCircle size={16}/> Despesa</button>
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
`;

// ======================================================
// 2. PACIENTE DETALHE (Abas, Edição Controlada, Anamnese Estruturada)
// ======================================================
const pacienteDetailPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
import { User, Phone, Edit, ArrowLeft, Save, Loader2, FileText, Clock, Trash2, Calendar, Pill, AlertTriangle, Stethoscope } from 'lucide-react';
import Link from 'next/link';

export default function PacienteDetalhe() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  
  // MODOS DE TELA
  const [abaAtiva, setAbaAtiva] = useState('dados'); // dados, anamnese, historico
  const [modoEdicao, setModoEdicao] = useState(false); // true = editando
  
  const [form, setForm] = useState<any>({});
  const [ficha, setFicha] = useState<any>({}); // Anamnese Estruturada
  const [historico, setHistorico] = useState<any[]>([]);

  useEffect(() => { if(id) carregar(); }, [id]);

  async function carregar() {
      setLoading(true);
      const { data } = await supabase.from('pacientes').select('*').eq('id', id).single();
      if (data) {
          setForm(data);
          setFicha(data.ficha_medica || {});
      }
      const { data: hist } = await supabase.from('agendamentos').select('*, profissionais(nome)').eq('paciente_id', id).order('data_hora', { ascending: false });
      setHistorico(hist || []);
      setLoading(false);
  }

  async function salvarTudo() {
      const payload = { ...form, ficha_medica: ficha };
      await supabase.from('pacientes').update(payload).eq('id', id);
      setModoEdicao(false);
      alert('Dados salvos com sucesso!');
  }

  const toggleCheck = (campo: string) => {
      setFicha((prev: any) => ({ ...prev, [campo]: !prev[campo] }));
  };

  if (loading) return <div className="h-screen flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> Carregando Prontuário...</div>;

  return (
    <div className="max-w-7xl mx-auto pb-20 space-y-6 animate-in slide-in-from-right-4 duration-500">
        
        {/* HEADER COM NAVEGAÇÃO E AÇÕES */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-4">
                <Link href="/pacientes" className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl hover:bg-slate-100 text-slate-500 transition-colors"><ArrowLeft size={20}/></Link>
                <div>
                    <h1 className="text-2xl font-black text-slate-800">{form.nome}</h1>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wide flex items-center gap-2"><User size={12}/> Prontuário Digital</p>
                </div>
            </div>
            <div className="flex gap-2">
                {modoEdicao ? (
                    <>
                        <button onClick={() => setModoEdicao(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors">Cancelar</button>
                        <button onClick={salvarTudo} className="px-6 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-200 flex items-center gap-2 transition-all active:scale-95"><Save size={18}/> Salvar Alterações</button>
                    </>
                ) : (
                    <button onClick={() => setModoEdicao(true)} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center gap-2 transition-all active:scale-95"><Edit size={18}/> Editar Prontuário</button>
                )}
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* MENU LATERAL (ABAS) */}
            <div className="lg:col-span-1 space-y-2">
                <button onClick={() => setAbaAtiva('dados')} className={\`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all \${abaAtiva === 'dados' ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}\`}><User size={20}/> Dados Pessoais</button>
                <button onClick={() => setAbaAtiva('anamnese')} className={\`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all \${abaAtiva === 'anamnese' ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}\`}><FileText size={20}/> Anamnese</button>
                <button onClick={() => setAbaAtiva('historico')} className={\`w-full text-left px-5 py-4 rounded-xl font-bold flex items-center gap-3 transition-all \${abaAtiva === 'historico' ? 'bg-white shadow-sm border border-blue-100 text-blue-700' : 'text-slate-500 hover:bg-white/50'}\`}><Clock size={20}/> Histórico</button>
            </div>

            {/* CONTEÚDO PRINCIPAL */}
            <div className="lg:col-span-3">
                
                {/* ABA DADOS PESSOAIS */}
                {abaAtiva === 'dados' && (
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
                        <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><User size={20} className="text-blue-500"/> Informações do Paciente</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Nome Completo</label><input disabled={!modoEdicao} className={\`w-full p-3 rounded-xl border outline-none font-bold text-slate-700 \${modoEdicao ? 'bg-white border-blue-300 ring-2 ring-blue-100' : 'bg-slate-50 border-slate-200'}\`} value={form.nome || ''} onChange={e => setForm({...form, nome: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">CPF</label><input disabled={!modoEdicao} className={\`w-full p-3 rounded-xl border outline-none \${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}\`} value={form.cpf || ''} onChange={e => setForm({...form, cpf: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Telefone</label><input disabled={!modoEdicao} className={\`w-full p-3 rounded-xl border outline-none \${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}\`} value={form.telefone || ''} onChange={e => setForm({...form, telefone: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Data Nascimento</label><input type="date" disabled={!modoEdicao} className={\`w-full p-3 rounded-xl border outline-none \${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}\`} value={form.data_nascimento || ''} onChange={e => setForm({...form, data_nascimento: e.target.value})} /></div>
                            <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Email</label><input disabled={!modoEdicao} className={\`w-full p-3 rounded-xl border outline-none \${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}\`} value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} /></div>
                            <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Endereço</label><input disabled={!modoEdicao} className={\`w-full p-3 rounded-xl border outline-none \${modoEdicao ? 'bg-white border-blue-300' : 'bg-slate-50 border-slate-200'}\`} value={form.endereco || ''} onChange={e => setForm({...form, endereco: e.target.value})} /></div>
                        </div>
                    </div>
                )}

                {/* ABA ANAMNESE ESTRUTURADA */}
                {abaAtiva === 'anamnese' && (
                    <div className="space-y-6 animate-in fade-in">
                        {/* QUADRO DE CHECAGEM */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><Stethoscope size={20} className="text-pink-500"/> Ficha Médica</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {['Diabetes', 'Hipertensão', 'Cardiopatia', 'Asma/Bronquite', 'Alergia Antibiótico', 'Alergia Anestésico', 'Gestante', 'Fumante', 'Uso de Anticoagulante'].map(item => (
                                    <label key={item} className={\`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer \${ficha[item] ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100 hover:border-slate-300'} \${!modoEdicao && 'pointer-events-none opacity-80'}\`}>
                                        <div className={\`w-5 h-5 rounded-md border flex items-center justify-center transition-colors \${ficha[item] ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-slate-300'}\`}>
                                            {ficha[item] && <X size={14}/>}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={ficha[item] || false} onChange={() => toggleCheck(item)} disabled={!modoEdicao}/>
                                        <span className={\`text-sm font-bold \${ficha[item] ? 'text-red-700' : 'text-slate-600'}\`}>{item}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* MEDICAMENTOS */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Pill size={20} className="text-purple-500"/> Medicamentos em Uso</h3>
                            <textarea disabled={!modoEdicao} value={ficha.medicamentos || ''} onChange={e => setFicha({...ficha, medicamentos: e.target.value})} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-200 h-24 resize-none" placeholder="Liste os medicamentos contínuos..." />
                        </div>

                        {/* OBSERVAÇÕES LIVRES */}
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><AlertTriangle size={20} className="text-amber-500"/> Observações Clínicas</h3>
                            <textarea disabled={!modoEdicao} value={form.anamnese || ''} onChange={e => setForm({...form, anamnese: e.target.value})} className="w-full p-4 bg-yellow-50 border border-yellow-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-300 h-40 resize-none text-slate-700" placeholder="Histórico detalhado, queixas principais e evolução..." />
                        </div>
                    </div>
                )}

                {/* ABA HISTÓRICO */}
                {abaAtiva === 'historico' && (
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm animate-in fade-in">
                        <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2"><Clock size={20} className="text-blue-500"/> Histórico de Atendimentos</h3>
                        {historico.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl">Nenhum atendimento registrado.</div>
                        ) : (
                            <div className="relative border-l-2 border-blue-100 ml-4 space-y-8 pb-4">
                                {historico.map((h: any) => (
                                    <div key={h.id} className="ml-8 relative">
                                        <div className="absolute -left-[41px] top-1 w-6 h-6 rounded-full border-4 border-white bg-blue-500 shadow-sm"></div>
                                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/60">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="font-bold text-slate-800 text-lg">{h.procedimento}</span>
                                                <span className="text-xs font-bold bg-white px-2 py-1 rounded border border-slate-200 text-slate-500 uppercase">{h.status}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-slate-500 font-bold mb-3">
                                                <span className="flex items-center gap-1"><Calendar size={14}/> {new Date(h.data_hora).toLocaleDateString('pt-BR')}</span>
                                                <span className="flex items-center gap-1"><Clock size={14}/> {new Date(h.data_hora).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
                                                <span className="flex items-center gap-1"><User size={14}/> {h.profissionais?.nome || 'Dr(a).'}</span>
                                            </div>
                                            {h.observacoes && <p className="text-sm text-slate-600 bg-white p-3 rounded-xl border border-slate-100 italic">"{h.observacoes}"</p>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    </div>
  );
}
`;

salvarArquivo('app/financeiro/page.tsx', financeiroPage);
salvarArquivo('app/pacientes/[id]/page.tsx', pacienteDetailPage);