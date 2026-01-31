const fs = require('fs');
const path = require('path');

console.log('🚑 Instalando V43: Resgate da Página de Paciente e Filtros de Período...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    // Garante que a pasta existe (importante para criar a pasta [id])
    const dir = path.dirname(caminhoCompleto);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Restaurado: ${caminhoRelativo}`);
}

// ======================================================
// 1. FINANCEIRO (Filtros de Período Personalizado)
// ======================================================
const financeiroPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { TrendingUp, TrendingDown, Wallet, Activity, Plus, Printer, ArrowUpCircle, ArrowDownCircle, Loader2, X, Save, Calendar } from 'lucide-react';

export default function Financeiro() {
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [transacoesFiltradas, setTransacoesFiltradas] = useState<any[]>([]);
  const [resumo, setResumo] = useState({ entrada: 0, saida: 0, saldo: 0 });
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  
  // FILTROS DE PERÍODO
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0];

  const [dataInicio, setDataInicio] = useState(primeiroDia);
  const [dataFim, setDataFim] = useState(ultimoDia);
  const [tipoFiltro, setTipoFiltro] = useState('todos');

  const [novaDespesa, setNovaDespesa] = useState({ descricao: '', valor: '', data: new Date().toISOString().split('T')[0], categoria: 'geral' });

  useEffect(() => { carregarDados(); }, [dataInicio, dataFim]);
  useEffect(() => { 
      if (tipoFiltro === 'todos') setTransacoesFiltradas(transacoes);
      else setTransacoesFiltradas(transacoes.filter(t => t.tipo === tipoFiltro));
  }, [tipoFiltro, transacoes]);

  async function carregarDados() {
    setLoading(true);
    // Filtro por DATA INICIO e FIM
    const { data: entradas } = await supabase.from('agendamentos').select('id, valor_final, data_hora, procedimento, pacientes(nome)').eq('status', 'concluido').gte('data_hora', \`\${dataInicio}T00:00:00\`).lte('data_hora', \`\${dataFim}T23:59:59\`);
    const { data: saidas } = await supabase.from('despesas').select('*').gte('data', dataInicio).lte('data', dataFim);

    const listaEntradas = (entradas || []).map((e: any) => ({
        id: 'ent_' + e.id, tipo: 'entrada',
        descricao: \`\${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome} - \${e.procedimento}\`,
        valor: Number(e.valor_final || 0), data: e.data_hora, categoria: 'Serviço'
    }));

    const listaSaidas = (saidas || []).map((s: any) => ({
        id: 'sai_' + s.id, tipo: 'saida', descricao: s.descricao,
        valor: Number(s.valor || 0), data: s.data, categoria: s.categoria || 'Despesa'
    }));

    const todas = [...listaEntradas, ...listaSaidas].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    
    setTransacoes(todas);
    setTransacoesFiltradas(todas);
    
    const totalEntrada = listaEntradas.reduce((acc: number, curr: any) => acc + curr.valor, 0);
    const totalSaida = listaSaidas.reduce((acc: number, curr: any) => acc + curr.valor, 0);
    setResumo({ entrada: totalEntrada, saida: totalSaida, saldo: totalEntrada - totalSaida });
    setLoading(false);
  }

  async function salvarDespesa(e: any) {
      e.preventDefault(); setSalvando(true);
      const { data: { user } } = await supabase.auth.getUser();
      const payload = { descricao: novaDespesa.descricao, valor: parseFloat(novaDespesa.valor), data: novaDespesa.data, categoria: novaDespesa.categoria, user_id: user?.id };
      await supabase.from('despesas').insert([payload]);
      setModalAberto(false); setNovaDespesa({ descricao: '', valor: '', data: new Date().toISOString().split('T')[0], categoria: 'geral' }); carregarDados();
      setSalvando(false);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20 print:p-0 print:max-w-none">
      <style jsx global>{\` @media print { .no-print { display: none !important; } body { background: white; } .print-border { border: 1px solid #ddd; } } \`}</style>

      {/* HEADER COM PERÍODO */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 no-print">
          <div><h1 className="text-3xl font-black text-slate-800 tracking-tight">Financeiro</h1><p className="text-slate-500 font-medium">Fluxo de caixa por período.</p></div>
          <div className="flex gap-2 items-center flex-wrap bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 px-2">
                  <span className="text-xs font-bold text-slate-400 uppercase">De:</span>
                  <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-700 font-bold text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <div className="flex items-center gap-2 px-2 border-l border-slate-100">
                  <span className="text-xs font-bold text-slate-400 uppercase">Até:</span>
                  <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-700 font-bold text-sm rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500"/>
              </div>
              <button onClick={() => window.print()} className="ml-2 bg-slate-100 text-slate-600 p-2 rounded-lg hover:bg-slate-200" title="Imprimir"><Printer size={18}/></button>
              <button onClick={() => setModalAberto(true)} className="ml-2 bg-slate-900 text-white px-4 py-2 rounded-lg font-bold hover:bg-black flex items-center gap-2 text-sm shadow-lg"><Plus size={16}/> Despesa</button>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm print-border"><div className="flex justify-between items-start mb-4"><div className="p-3 bg-green-50 text-green-600 rounded-2xl no-print"><TrendingUp size={24}/></div><span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">+ Receitas</span></div><div><p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Entradas</p><p className="text-3xl font-black text-slate-800 mt-1">R$ {resumo.entrada.toFixed(2)}</p></div></div>
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm print-border"><div className="flex justify-between items-start mb-4"><div className="p-3 bg-red-50 text-red-600 rounded-2xl no-print"><TrendingDown size={24}/></div><span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg">- Gastos</span></div><div><p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Saídas</p><p className="text-3xl font-black text-slate-800 mt-1">R$ {resumo.saida.toFixed(2)}</p></div></div>
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-3xl shadow-xl shadow-slate-200 relative overflow-hidden text-white print:bg-white print:text-black print-border"><div className="flex justify-between items-start mb-4"><div className="p-3 bg-white/10 text-white rounded-2xl no-print"><Wallet size={24}/></div><span className="text-xs font-bold text-white/80 bg-white/10 px-2 py-1 rounded-lg print:text-black print:border">Resultado</span></div><div><p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Saldo Líquido</p><p className={\`text-3xl font-black mt-1 \${resumo.saldo >= 0 ? 'text-white print:text-black' : 'text-red-400'}\`}>R$ {resumo.saldo.toFixed(2)}</p></div></div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden print-border">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div className="flex items-center gap-4">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2"><Activity size={18} className="text-blue-600 no-print"/> Extrato</h3>
                  <div className="flex bg-slate-200 p-1 rounded-lg no-print">
                      <button onClick={() => setTipoFiltro('todos')} className={\`px-3 py-1 rounded-md text-xs font-bold transition-all \${tipoFiltro === 'todos' ? 'bg-white shadow text-black' : 'text-slate-500'}\`}>Todos</button>
                      <button onClick={() => setTipoFiltro('entrada')} className={\`px-3 py-1 rounded-md text-xs font-bold transition-all \${tipoFiltro === 'entrada' ? 'bg-white shadow text-green-600' : 'text-slate-500'}\`}>Entradas</button>
                      <button onClick={() => setTipoFiltro('saida')} className={\`px-3 py-1 rounded-md text-xs font-bold transition-all \${tipoFiltro === 'saida' ? 'bg-white shadow text-red-600' : 'text-slate-500'}\`}>Saídas</button>
                  </div>
              </div>
          </div>
          <div className="divide-y divide-slate-100">
              {loading ? (<div className="p-10 text-center text-slate-400 flex flex-col items-center"><Loader2 className="animate-spin mb-2"/> Carregando...</div>) : transacoesFiltradas.length === 0 ? (<div className="p-12 text-center text-slate-400">Nenhuma movimentação no período.</div>) : (transacoesFiltradas.map((t: any) => (
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

      {modalAberto && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in no-print">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-zoom-in border border-slate-100">
                <div className="p-6 border-b bg-slate-50 flex justify-between items-center"><h3 className="font-black text-xl text-slate-800">Nova Despesa</h3><button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-red-500 p-1"><X size={20}/></button></div>
                <form onSubmit={salvarDespesa} className="p-6 space-y-4">
                    <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Descrição</label><input required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="Ex: Conta de Luz" value={novaDespesa.descricao} onChange={e => setNovaDespesa({...novaDespesa, descricao: e.target.value})} /></div>
                    <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Valor (R$)</label><input required type="number" step="0.01" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="0.00" value={novaDespesa.valor} onChange={e => setNovaDespesa({...novaDespesa, valor: e.target.value})} /></div><div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Data</label><input required type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-slate-600" value={novaDespesa.data} onChange={e => setNovaDespesa({...novaDespesa, data: e.target.value})} /></div></div>
                    <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Categoria</label><select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-600" value={novaDespesa.categoria} onChange={e => setNovaDespesa({...novaDespesa, categoria: e.target.value})}><option value="geral">Geral</option><option value="aluguel">Aluguel</option><option value="fornecedores">Fornecedores</option><option value="equipe">Equipe</option><option value="impostos">Impostos</option><option value="marketing">Marketing</option></select></div>
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
// 2. LISTA DE PACIENTES (Simples, com link para página)
// ======================================================
const pacientesListPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Plus, LayoutGrid, List as ListIcon, User, Phone, Edit, Trash2, Activity, Loader2, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [visualizacao, setVisualizacao] = useState('lista');
  const [busca, setBusca] = useState('');
  const router = useRouter();

  useEffect(() => { carregarPacientes(); }, []);

  async function carregarPacientes() {
    setLoading(true);
    const { data } = await supabase.from('pacientes').select('*, agendamentos(data_hora, status)').order('created_at', { ascending: false });
    if (data) {
        const formatados = data.map((p: any) => {
            const agendamentos = p.agendamentos || [];
            agendamentos.sort((a: any, b: any) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());
            const ultimo = agendamentos[0];
            const status = ultimo ? (new Date(ultimo.data_hora) > new Date() ? 'agendado' : 'ativo') : 'novo';
            return { ...p, status };
        });
        setPacientes(formatados);
    }
    setLoading(false);
  }

  // Criar novo e redirecionar
  async function novoPaciente() {
      const { data, error } = await supabase.from('pacientes').insert([{ nome: 'Novo Paciente', telefone: '' }]).select().single();
      if(data) router.push(\`/pacientes/\${data.id}\`);
  }

  const filtrados = pacientes.filter((p: any) => p.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
      <div className="flex justify-between items-end">
          <div><h1 className="text-3xl font-black text-slate-800">Pacientes</h1><p className="text-slate-500">Gerencie seus clientes.</p></div>
          <button onClick={novoPaciente} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg flex items-center gap-2"><Plus size={20}/> Novo Paciente</button>
      </div>

      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex gap-2"><div className="flex-1 relative"><Search className="absolute left-3 top-3 text-slate-400" size={20}/><input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none font-medium" value={busca} onChange={e => setBusca(e.target.value)} /></div><div className="flex bg-slate-100 p-1 rounded-xl"><button onClick={() => setVisualizacao('lista')} className={\`p-2 rounded-lg \${visualizacao === 'lista' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}\`}><ListIcon size={20}/></button><button onClick={() => setVisualizacao('cards')} className={\`p-2 rounded-lg \${visualizacao === 'cards' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}\`}><LayoutGrid size={20}/></button></div></div>

      {loading ? <div className="py-20 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2"/> Carregando...</div> : 
       visualizacao === 'lista' ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100"><tr><th className="p-4 pl-6 text-xs font-bold text-slate-400 uppercase">Nome</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Telefone</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Status</th><th className="p-4 text-right"></th></tr></thead>
                <tbody className="divide-y divide-slate-50">{filtrados.map((p: any) => (
                    <tr key={p.id} onClick={() => router.push(\`/pacientes/\${p.id}\`)} className="hover:bg-blue-50 cursor-pointer transition-colors group">
                        <td className="p-4 pl-6 font-bold text-slate-700">{p.nome}</td>
                        <td className="p-4 text-sm text-slate-500">{p.telefone}</td>
                        <td className="p-4"><span className="text-[10px] font-bold uppercase bg-slate-100 text-slate-500 px-2 py-1 rounded">{p.status}</span></td>
                        <td className="p-4 text-right pr-6 text-slate-300 group-hover:text-blue-500"><ChevronRight size={20}/></td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
       ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{filtrados.map((p: any) => (
            <div key={p.id} onClick={() => router.push(\`/pacientes/\${p.id}\`)} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md cursor-pointer transition-all hover:border-blue-200 group">
                <div className="flex items-center gap-4 mb-4"><div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold text-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">{p.nome.charAt(0)}</div><div><h3 className="font-bold text-slate-800 truncate w-40">{p.nome}</h3><p className="text-xs text-slate-400 uppercase font-bold">{p.status}</p></div></div>
                <div className="text-sm text-slate-500 flex items-center gap-2"><Phone size={14}/> {p.telefone || 'Sem telefone'}</div>
            </div>
        ))}</div>
       )
      }
    </div>
  );
}
`;

// ======================================================
// 3. PÁGINA DE DETALHE DO PACIENTE ([id]) - A TELA COMPLETA
// ======================================================
const pacienteDetailPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
import { User, Phone, MapPin, FileText, Clock, Save, Loader2, Trash2, ArrowLeft, Calendar, Mail } from 'lucide-react';
import Link from 'next/link';

export default function PacienteDetalhe() {
  const { id } = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [historico, setHistorico] = useState<any[]>([]);

  useEffect(() => { if(id) carregar(); }, [id]);

  async function carregar() {
      setLoading(true);
      const { data } = await supabase.from('pacientes').select('*').eq('id', id).single();
      if (data) setForm(data);
      const { data: hist } = await supabase.from('agendamentos').select('*, profissionais(nome)').eq('paciente_id', id).order('data_hora', { ascending: false });
      setHistorico(hist || []);
      setLoading(false);
  }

  async function salvar(e: any) {
      e.preventDefault();
      setSaving(true);
      await supabase.from('pacientes').update(form).eq('id', id);
      setSaving(false);
      alert('Dados salvos!');
  }

  async function excluir() {
      if(!confirm('Cuidado: Isso apagará o paciente e todo o histórico. Continuar?')) return;
      await supabase.from('agendamentos').delete().eq('paciente_id', id);
      await supabase.from('pacientes').delete().eq('id', id);
      router.push('/pacientes');
  }

  if (loading) return <div className="h-screen flex items-center justify-center text-slate-400"><Loader2 className="animate-spin mr-2"/> Carregando Prontuário...</div>;

  return (
    <div className="max-w-7xl mx-auto pb-20 space-y-6 animate-in slide-in-from-right-4 duration-500">
        {/* HEADER */}
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <Link href="/pacientes" className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500"><ArrowLeft size={20}/></Link>
                <div>
                    <h1 className="text-2xl font-black text-slate-800">{form.nome}</h1>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-wide">Prontuário Digital</p>
                </div>
            </div>
            <div className="flex gap-2">
                <button onClick={excluir} className="px-4 py-2 text-red-500 hover:bg-red-50 rounded-xl font-bold text-sm transition-colors">Excluir</button>
                <button onClick={salvar} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center gap-2 transition-all active:scale-95">
                    {saving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} Salvar Alterações
                </button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* COLUNA ESQUERDA: DADOS E ANAMNESE */}
            <div className="lg:col-span-2 space-y-6">
                
                {/* DADOS PESSOAIS */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-400 uppercase mb-4 flex items-center gap-2"><User size={16}/> Dados Pessoais</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Nome Completo</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" value={form.nome || ''} onChange={e => setForm({...form, nome: e.target.value})} /></div>
                        <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">CPF</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={form.cpf || ''} onChange={e => setForm({...form, cpf: e.target.value})} /></div>
                        <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Telefone</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={form.telefone || ''} onChange={e => setForm({...form, telefone: e.target.value})} /></div>
                        <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Data Nascimento</label><input type="date" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={form.data_nascimento || ''} onChange={e => setForm({...form, data_nascimento: e.target.value})} /></div>
                        <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Email</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} /></div>
                        <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Endereço</label><input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" value={form.endereco || ''} onChange={e => setForm({...form, endereco: e.target.value})} /></div>
                    </div>
                </div>

                {/* ANAMNESE GRANDE */}
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-[500px]">
                    <h3 className="text-sm font-bold text-slate-400 uppercase mb-4 flex items-center gap-2"><FileText size={16}/> Anamnese e Evolução</h3>
                    <textarea 
                        className="flex-1 w-full p-4 bg-yellow-50 border border-yellow-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400 text-slate-700 leading-relaxed text-sm resize-none"
                        placeholder="Descreva o histórico clínico, alergias, procedimentos realizados e evolução do tratamento..."
                        value={form.anamnese || ''}
                        onChange={e => setForm({...form, anamnese: e.target.value})}
                    ></textarea>
                </div>
            </div>

            {/* COLUNA DIREITA: HISTÓRICO (MENU LATERAL) */}
            <div className="lg:col-span-1">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm h-full max-h-[800px] overflow-y-auto sticky top-24">
                    <h3 className="text-sm font-bold text-slate-400 uppercase mb-6 flex items-center gap-2"><Clock size={16}/> Histórico Clínico</h3>
                    
                    {historico.length === 0 ? (
                        <div className="text-center text-slate-400 py-10">Nenhuma consulta.</div>
                    ) : (
                        <div className="relative border-l-2 border-slate-100 ml-3 space-y-8 pb-10">
                            {historico.map((h: any) => (
                                <div key={h.id} className="ml-6 relative group">
                                    <div className={\`absolute -left-[31px] top-2 w-4 h-4 rounded-full border-2 border-white shadow-sm transition-colors \${h.status === 'concluido' ? 'bg-green-500' : 'bg-slate-300'}\`}></div>
                                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-bold text-slate-700 text-sm">{h.procedimento}</span>
                                            <span className={\`text-[10px] font-bold uppercase px-2 py-0.5 rounded \${h.status === 'concluido' ? 'bg-green-100 text-green-600' : 'bg-slate-200 text-slate-500'}\`}>{h.status}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
                                            <Calendar size={12}/> {new Date(h.data_hora).toLocaleDateString('pt-BR')}
                                            <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                            <User size={12}/> {h.profissionais?.nome || 'Dr(a).'}
                                        </div>
                                        {h.observacoes && <p className="text-xs text-slate-600 italic bg-white/50 p-2 rounded-lg">"{h.observacoes}"</p>}
                                        {h.valor_final > 0 && <p className="text-xs font-bold text-green-600 mt-2 text-right">R$ {h.valor_final}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
}
`;

salvarArquivo('app/financeiro/page.tsx', financeiroPage);
salvarArquivo('app/pacientes/page.tsx', pacientesListPage);
salvarArquivo('app/pacientes/[id]/page.tsx', pacienteDetailPage);