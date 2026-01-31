const fs = require('fs');
const path = require('path');

console.log('🛠️ Instalando V39: Restaurando Funcionalidades Completas (Financeiro, Pacientes, Config) com Blindagem de Build...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Restaurado: ${caminhoRelativo}`);
}

// ======================================================
// 1. FINANCEIRO COMPLETO (Com Despesas e Filtros)
// ======================================================
const financeiroPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    DollarSign, TrendingUp, TrendingDown, Calendar, 
    ArrowRight, Wallet, Activity, Plus, Filter, 
    MoreHorizontal, ArrowUpCircle, ArrowDownCircle, Loader2, X, Save
} from 'lucide-react';

export default function Financeiro() {
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [resumo, setResumo] = useState({ entrada: 0, saida: 0, saldo: 0 });
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mesAno, setMesAno] = useState(new Date().toISOString().slice(0, 7));
  const [novaDespesa, setNovaDespesa] = useState({ descricao: '', valor: '', data: new Date().toISOString().split('T')[0], categoria: 'geral' });

  useEffect(() => { carregarDados(); }, [mesAno]);

  async function carregarDados() {
    setLoading(true);
    const inicioMes = \`\${mesAno}-01 00:00:00\`;
    const fimMes = \`\${mesAno}-31 23:59:59\`;

    const { data: entradas } = await supabase.from('agendamentos').select('id, valor_final, data_hora, procedimento, pacientes(nome)').eq('status', 'concluido').gte('data_hora', inicioMes).lte('data_hora', fimMes).order('data_hora', { ascending: false });
    const { data: saidas } = await supabase.from('despesas').select('*').gte('data', \`\${mesAno}-01\`).lte('data', \`\${mesAno}-31\`).order('data', { ascending: false });

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
    
    const totalEntrada = listaEntradas.reduce((acc: number, curr: any) => acc + curr.valor, 0);
    const totalSaida = listaSaidas.reduce((acc: number, curr: any) => acc + curr.valor, 0);

    setTransacoes(todas);
    setResumo({ entrada: totalEntrada, saida: totalSaida, saldo: totalEntrada - totalSaida });
    setLoading(false);
  }

  async function salvarDespesa(e: any) {
      e.preventDefault(); setSalvando(true);
      const { data: { user } } = await supabase.auth.getUser();
      const payload = { descricao: novaDespesa.descricao, valor: parseFloat(novaDespesa.valor), data: novaDespesa.data, categoria: novaDespesa.categoria, user_id: user?.id };
      const { error } = await supabase.from('despesas').insert([payload]);
      if (error) alert('Erro: ' + error.message);
      else { setModalAberto(false); setNovaDespesa({ descricao: '', valor: '', data: new Date().toISOString().split('T')[0], categoria: 'geral' }); carregarDados(); }
      setSalvando(false);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
          <div><h1 className="text-3xl font-black text-slate-800 tracking-tight">Financeiro</h1><p className="text-slate-500 font-medium">Controle de caixa e resultados.</p></div>
          <div className="flex gap-2 items-center">
              <input type="month" value={mesAno} onChange={(e) => setMesAno(e.target.value)} className="bg-white border border-slate-200 text-slate-600 font-bold text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"/>
              <button onClick={() => setModalAberto(true)} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-black flex items-center gap-2 text-sm shadow-lg shadow-slate-200 transition-all active:scale-95"><Plus size={18}/> Nova Despesa</button>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:border-green-200 transition-colors">
              <div className="flex justify-between items-start mb-4"><div className="p-3 bg-green-50 text-green-600 rounded-2xl"><TrendingUp size={24}/></div><span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">+ Receitas</span></div>
              <div><p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Entradas</p><p className="text-3xl font-black text-slate-800 mt-1">R$ {resumo.entrada.toFixed(2)}</p></div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:border-red-200 transition-colors">
              <div className="flex justify-between items-start mb-4"><div className="p-3 bg-red-50 text-red-600 rounded-2xl"><TrendingDown size={24}/></div><span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-lg">- Gastos</span></div>
              <div><p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Saídas</p><p className="text-3xl font-black text-slate-800 mt-1">R$ {resumo.saida.toFixed(2)}</p></div>
          </div>
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-3xl shadow-xl shadow-slate-200 relative overflow-hidden text-white">
              <div className="flex justify-between items-start mb-4"><div className="p-3 bg-white/10 text-white rounded-2xl"><Wallet size={24}/></div><span className="text-xs font-bold text-white/80 bg-white/10 px-2 py-1 rounded-lg">Resultado</span></div>
              <div><p className="text-slate-400 text-sm font-bold uppercase tracking-wider">Saldo Líquido</p><p className={\`text-3xl font-black mt-1 \${resumo.saldo >= 0 ? 'text-white' : 'text-red-400'}\`}>R$ {resumo.saldo.toFixed(2)}</p></div>
          </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center"><h3 className="font-bold text-slate-700 flex items-center gap-2"><Activity size={18} className="text-blue-600"/> Extrato do Mês</h3><span className="text-xs font-bold text-slate-400 uppercase">{transacoes.length} Movimentações</span></div>
          <div className="divide-y divide-slate-100">
              {loading ? (<div className="p-10 text-center text-slate-400 flex flex-col items-center"><Loader2 className="animate-spin mb-2"/> Carregando finanças...</div>) : transacoes.length === 0 ? (<div className="p-12 text-center text-slate-400 flex flex-col items-center"><div className="bg-slate-50 p-4 rounded-full mb-3"><DollarSign size={24} className="opacity-20"/></div><p className="font-medium">Nenhuma movimentação neste mês.</p></div>) : (transacoes.map((t: any) => (<div key={t.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors group"><div className="flex items-center gap-4"><div className={\`p-3 rounded-2xl flex items-center justify-center shadow-sm \${t.tipo === 'entrada' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}\`}>{t.tipo === 'entrada' ? <ArrowUpCircle size={24}/> : <ArrowDownCircle size={24}/>}</div><div><p className="font-bold text-slate-700 text-sm md:text-base">{t.descricao}</p><div className="flex items-center gap-2 mt-0.5"><span className="text-xs font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase">{t.categoria}</span><span className="text-xs text-slate-400 font-medium">{new Date(t.data).toLocaleDateString('pt-BR')}</span></div></div></div><span className={\`font-black text-sm md:text-lg whitespace-nowrap \${t.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}\`}>{t.tipo === 'entrada' ? '+' : '-'} R$ {t.valor.toFixed(2)}</span></div>)))}
          </div>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-zoom-in border border-slate-100">
                <div className="p-6 border-b bg-slate-50 flex justify-between items-center"><h3 className="font-black text-xl text-slate-800 flex items-center gap-2"><div className="p-1.5 bg-red-100 rounded-lg text-red-600"><TrendingDown size={18}/></div> Nova Despesa</h3><button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-red-500 p-1 rounded-full hover:bg-red-50 transition-colors"><X size={20}/></button></div>
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
// 2. PACIENTES COMPLETO (Com Formulário Rico)
// ======================================================
const pacientesPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Plus, LayoutGrid, List as ListIcon, User, Phone, Edit, Trash2, Activity, Loader2, X, Save, Clock, MapPin, Mail, FileText } from 'lucide-react';
import Link from 'next/link';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [visualizacao, setVisualizacao] = useState('cards');
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<any>({ id: null, nome: '', cpf: '', data_nascimento: '', telefone: '', email: '', endereco: '', observacoes: '' });

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
            return { ...p, status, ultimo_atendimento: ultimo?.data_hora };
        });
        setPacientes(formatados);
    }
    setLoading(false);
  }

  function abrirModal(paciente: any = null) {
      if (paciente) { setForm({ id: paciente.id, nome: paciente.nome || '', cpf: paciente.cpf || '', data_nascimento: paciente.data_nascimento || '', telefone: paciente.telefone || '', email: paciente.email || '', endereco: paciente.endereco || '', observacoes: paciente.observacoes || '' }); } 
      else { setForm({ id: null, nome: '', cpf: '', data_nascimento: '', telefone: '', email: '', endereco: '', observacoes: '' }); }
      setModalAberto(true);
  }

  async function salvarPaciente(e: any) {
      e.preventDefault(); setSalvando(true);
      const payload = { nome: form.nome, cpf: form.cpf, data_nascimento: form.data_nascimento || null, telefone: form.telefone, email: form.email, endereco: form.endereco, observacoes: form.observacoes };
      try {
          if (form.id) await supabase.from('pacientes').update(payload).eq('id', form.id);
          else await supabase.from('pacientes').insert([payload]);
          setModalAberto(false); carregarPacientes();
      } catch (error: any) { alert('Erro: ' + error.message); }
      setSalvando(false);
  }

  async function excluirPaciente(id: any) {
      if (!confirm('Tem certeza?')) return;
      setLoading(true); await supabase.from('pacientes').delete().eq('id', id); await carregarPacientes(); setLoading(false);
  }

  const pacientesFiltrados = pacientes.filter((p: any) => {
      const termo = busca.toLowerCase();
      const bateBusca = p.nome.toLowerCase().includes(termo) || (p.cpf || '').includes(termo) || (p.telefone || '').includes(termo);
      const bateStatus = filtroStatus === 'todos' ? true : p.status === filtroStatus;
      return bateBusca && bateStatus;
  });

  const stats = { total: pacientes.length, novos: pacientes.filter(p => new Date(p.created_at).getMonth() === new Date().getMonth()).length, ativos: pacientes.filter(p => p.status === 'ativo' || p.status === 'agendado').length };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4"><div><h1 className="text-3xl font-black text-slate-800 tracking-tight">Pacientes</h1><p className="text-slate-500 font-medium">Gestão de clientes.</p></div><button onClick={() => abrirModal()} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 shadow-lg"><Plus size={20}/> Novo Paciente</button></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><span className="text-xs font-bold text-slate-400 uppercase">Total</span><p className="text-2xl font-black text-slate-800 mt-1">{stats.total}</p></div><div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><Activity size={12} className="text-green-500"/> Ativos</span><p className="text-2xl font-black text-slate-800 mt-1">{stats.ativos}</p></div><div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><User size={12} className="text-blue-500"/> Novos (Mês)</span><p className="text-2xl font-black text-slate-800 mt-1">{stats.novos}</p></div></div>
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-2"><div className="flex-1 relative"><Search className="absolute left-3 top-3 text-slate-400" size={20}/><input type="text" placeholder="Buscar por nome, CPF, telefone..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none font-medium" value={busca} onChange={e => setBusca(e.target.value)} /></div><div className="flex gap-2"><select className="px-4 py-2.5 rounded-xl bg-slate-50 text-sm font-bold text-slate-600 outline-none cursor-pointer hover:bg-slate-100" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}><option value="todos">Status: Todos</option><option value="ativo">Ativos</option><option value="novo">Novos</option><option value="agendado">Com Agendamento</option></select><div className="flex bg-slate-100 p-1 rounded-xl"><button onClick={() => setVisualizacao('lista')} className={\`p-2 rounded-lg \${visualizacao === 'lista' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}\`}><ListIcon size={20}/></button><button onClick={() => setVisualizacao('cards')} className={\`p-2 rounded-lg \${visualizacao === 'cards' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}\`}><LayoutGrid size={20}/></button></div></div></div>
      {loading ? (<div className="py-20 text-center text-slate-400 flex flex-col items-center"><Loader2 className="animate-spin mb-2" size={32}/> Carregando...</div>) : pacientesFiltrados.length === 0 ? (<div className="py-20 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200"><User size={48} className="mx-auto mb-4 opacity-20"/><p className="font-bold text-lg">Nenhum paciente encontrado.</p></div>) : visualizacao === 'lista' ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"><table className="w-full text-left"><thead className="bg-slate-50 border-b border-slate-100"><tr><th className="p-4 text-xs font-bold text-slate-400 uppercase pl-6">Nome</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Contato</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Status</th><th className="p-4 text-xs font-bold text-slate-400 uppercase text-right pr-6">Ações</th></tr></thead><tbody className="divide-y divide-slate-50">{pacientesFiltrados.map((p: any) => (<tr key={p.id} className="hover:bg-slate-50"><td className="p-4 pl-6 font-bold text-slate-700">{p.nome}</td><td className="p-4 text-sm text-slate-600">{p.telefone}</td><td className="p-4"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold uppercase">{p.status}</span></td><td className="p-4 text-right flex justify-end gap-2"><button onClick={() => abrirModal(p)} className="p-2 hover:bg-slate-100 rounded"><Edit size={16}/></button><button onClick={() => excluirPaciente(p.id)} className="p-2 hover:bg-red-50 text-red-500 rounded"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div>
      ) : (<div className="grid grid-cols-1 md:grid-cols-3 gap-6">{pacientesFiltrados.map((p: any) => (<div key={p.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all"><div className="flex justify-between mb-4"><div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500">{p.nome.charAt(0)}</div><button onClick={() => abrirModal(p)} className="text-slate-400 hover:text-blue-600"><Edit size={18}/></button></div><h3 className="font-bold text-slate-800 text-lg">{p.nome}</h3><p className="text-sm text-slate-500 mb-4">{p.telefone}</p><div className="flex gap-2"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold uppercase">{p.status}</span></div></div>))}</div>)}
      {modalAberto && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-zoom-in">
                <div className="p-6 border-b bg-slate-50 flex justify-between items-center"><h3 className="font-black text-xl text-slate-800">{form.id ? 'Editar Paciente' : 'Novo Paciente'}</h3><button onClick={() => setModalAberto(false)} className="p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-50"><X size={20}/></button></div>
                <form onSubmit={salvarPaciente} className="p-8 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-2 md:col-span-1 space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Nome Completo *</label><input required value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="Ex: João da Silva" /></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">CPF</label><input value={form.cpf} onChange={e => setForm({...form, cpf: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="000.000.000-00" /></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Data de Nascimento</label><input type="date" value={form.data_nascimento} onChange={e => setForm({...form, data_nascimento: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" /></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Telefone / WhatsApp *</label><input required value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="(00) 90000-0000" /></div>
                        <div className="col-span-2 space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Email</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="cliente@email.com" /></div>
                        <div className="col-span-2 space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Endereço Completo</label><input value={form.endereco} onChange={e => setForm({...form, endereco: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="Rua, Número, Bairro..." /></div>
                        <div className="col-span-2 space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Observações Médicas</label><textarea value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none" placeholder="Alergias, histórico..." /></div>
                    </div>
                    <div className="pt-4 flex gap-4"><button type="button" onClick={() => setModalAberto(false)} className="flex-1 py-3.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button><button type="submit" disabled={salvando} className="flex-1 bg-blue-600 text-white rounded-xl font-bold py-3.5 hover:bg-blue-700 transition-all shadow-lg flex justify-center items-center gap-2">{salvando ? <Loader2 className="animate-spin"/> : <><Save size={20}/> Salvar Paciente</>}</button></div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}
`;

// ======================================================
// 3. CONFIGURAÇÕES COMPLETO (Com Edição de Profissionais)
// ======================================================
const configPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, User, Tag, CheckSquare, Square, Loader2, Edit, X, Save, Shield, Mail, Lock, AlertCircle, Palette } from 'lucide-react';

export default function Configuracoes() {
  const [aba, setAba] = useState('servicos');
  const [dados, setDados] = useState<any[]>([]); 
  const [clinicas, setClinicas] = useState<any[]>([]); 
  const [loading, setLoading] = useState(false);
  const [editandoId, setEditandoId] = useState(null); 
  const [userIdAuth, setUserIdAuth] = useState(null); 
  const [novoServico, setNovoServico] = useState({ nome: '', valor: '', cor: 'blue' });
  const [novoProfissional, setNovoProfissional] = useState({ nome: '', cargo: '', nivel_acesso: 'padrao', email: '', password: '' });
  const [clinicasSelecionadas, setClinicasSelecionadas] = useState<any[]>([]); 

  const coresDisponiveis = [ { nome: 'slate', classe: 'bg-slate-500' }, { nome: 'gray', classe: 'bg-gray-500' }, { nome: 'zinc', classe: 'bg-zinc-500' }, { nome: 'red', classe: 'bg-red-500' }, { nome: 'orange', classe: 'bg-orange-500' }, { nome: 'amber', classe: 'bg-amber-500' }, { nome: 'yellow', classe: 'bg-yellow-500' }, { nome: 'lime', classe: 'bg-lime-500' }, { nome: 'green', classe: 'bg-green-500' }, { nome: 'emerald', classe: 'bg-emerald-500' }, { nome: 'teal', classe: 'bg-teal-500' }, { nome: 'cyan', classe: 'bg-cyan-500' }, { nome: 'sky', classe: 'bg-sky-500' }, { nome: 'blue', classe: 'bg-blue-500' }, { nome: 'indigo', classe: 'bg-indigo-500' }, { nome: 'violet', classe: 'bg-violet-500' }, { nome: 'purple', classe: 'bg-purple-500' }, { nome: 'fuchsia', classe: 'bg-fuchsia-500' }, { nome: 'pink', classe: 'bg-pink-500' }, { nome: 'rose', classe: 'bg-rose-500' } ];

  useEffect(() => { fetchClinicas(); carregarLista(); }, [aba]);

  async function fetchClinicas() { const { data } = await supabase.from('clinicas').select('*'); if (data) setClinicas(data); }
  async function carregarLista() { setLoading(true); if (aba === 'servicos') { const { data } = await supabase.from('servicos').select('*').order('nome'); if (data) setDados(data); } else { const { data } = await supabase.from('profissionais').select('*, profissionais_clinicas(clinica_id, clinicas(nome))').order('nome'); if (data) setDados(data); } setLoading(false); }

  function editarItem(item: any) { setEditandoId(item.id); window.scrollTo({ top: 0, behavior: 'smooth' }); if (aba === 'servicos') { setNovoServico({ nome: item.nome, valor: item.valor, cor: item.cor || 'blue' }); } else { setUserIdAuth(item.user_id); setNovoProfissional({ nome: item.nome, cargo: item.cargo, nivel_acesso: item.nivel_acesso, email: item.email || '', password: '' }); const idsClinicas = item.profissionais_clinicas?.map((pc: any) => pc.clinica_id) || []; setClinicasSelecionadas(idsClinicas); } }
  function cancelarEdicao() { setEditandoId(null); setUserIdAuth(null); setNovoServico({ nome: '', valor: '', cor: 'blue' }); setNovoProfissional({ nome: '', cargo: '', nivel_acesso: 'padrao', email: '', password: '' }); setClinicasSelecionadas([]); }

  async function salvar(e: any) { e.preventDefault(); setLoading(true); try { if (aba === 'servicos') { const payload = { ...novoServico, valor: parseFloat(novoServico.valor) }; if (editandoId) await supabase.from('servicos').update(payload).eq('id', editandoId); else await supabase.from('servicos').insert([payload]); setNovoServico({ nome: '', valor: '', cor: 'blue' }); } else { if (clinicasSelecionadas.length === 0) throw new Error('Selecione pelo menos uma clínica.'); if (editandoId) { await fetch('/api/editar-usuario', { method: 'POST', body: JSON.stringify({ id: editandoId, user_id: userIdAuth, ...novoProfissional, clinicas: clinicasSelecionadas }) }); } else { if (!novoProfissional.email || !novoProfissional.password) throw new Error('Email e Senha obrigatórios.'); await fetch('/api/criar-usuario', { method: 'POST', body: JSON.stringify({ ...novoProfissional, clinicas: clinicasSelecionadas }) }); } setNovoProfissional({ nome: '', cargo: '', nivel_acesso: 'padrao', email: '', password: '' }); setClinicasSelecionadas([]); } cancelarEdicao(); await carregarLista(); } catch (err: any) { alert('Erro: ' + err.message); } setLoading(false); }
  async function excluir(id: any) { if(!confirm('ATENÇÃO: Excluir removerá o histórico. Confirmar?')) return; setLoading(true); const tabela = aba === 'servicos' ? 'servicos' : 'profissionais'; await supabase.from(tabela).delete().eq('id', id); await carregarLista(); setLoading(false); }
  function toggleClinica(id: any) { if (clinicasSelecionadas.includes(id)) setClinicasSelecionadas(prev => prev.filter(c => c !== id)); else setClinicasSelecionadas(prev => [...prev, id]); }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20">
      <div className="flex gap-4 border-b border-slate-200"><button onClick={() => { setAba('servicos'); cancelarEdicao(); }} className={\`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors \${aba === 'servicos' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400'}\`}><Tag size={18}/> Procedimentos</button><button onClick={() => { setAba('profissionais'); cancelarEdicao(); }} className={\`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors \${aba === 'profissionais' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400'}\`}><User size={18}/> Profissionais</button></div>
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">{editandoId ? 'Editando Registro' : (aba === 'servicos' ? 'Novo Procedimento' : 'Novo Profissional')}</h2>{editandoId && <button onClick={cancelarEdicao} className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-red-100"><X size={14}/> Cancelar</button>}</div>
        <form onSubmit={salvar} className={\`p-5 rounded-xl border mb-6 space-y-4 transition-colors \${editandoId ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}\`}>
            <div className="flex flex-col md:flex-row gap-4 items-start">{aba === 'servicos' ? (<><div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400 mb-1 block">NOME</label><input required value={novoServico.nome} onChange={e => setNovoServico({...novoServico, nome: e.target.value})} className="w-full p-2.5 bg-white rounded-lg border border-slate-200 outline-blue-500 font-medium" placeholder="Ex: Limpeza"/></div><div className="w-32"><label className="text-xs font-bold text-slate-400 mb-1 block">VALOR (R$)</label><input required type="number" value={novoServico.valor} onChange={e => setNovoServico({...novoServico, valor: e.target.value})} className="w-full p-2.5 bg-white rounded-lg border border-slate-200 outline-blue-500 font-medium" placeholder="0.00"/></div><div className="w-full md:w-auto"><label className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1"><Palette size={12}/> COR</label><div className="flex flex-wrap gap-2 max-w-[280px]">{coresDisponiveis.map(c => (<button key={c.nome} type="button" onClick={() => setNovoServico({...novoServico, cor: c.nome})} className={\`w-6 h-6 rounded-full \${c.classe} transition-all hover:scale-110 \${novoServico.cor === c.nome ? 'ring-2 ring-offset-2 ring-slate-400 scale-110 shadow-md' : 'opacity-70 hover:opacity-100'}\`} title={c.nome} />))}</div></div></>) : (<div className="w-full space-y-4"><div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-400">NOME</label><input required value={novoProfissional.nome} onChange={e => setNovoProfissional({...novoProfissional, nome: e.target.value})} className="w-full p-2.5 rounded border border-slate-200 outline-blue-500 bg-white" placeholder="Ex: Dr. Silva"/></div><div><label className="text-xs font-bold text-slate-400">CARGO</label><input required value={novoProfissional.cargo} onChange={e => setNovoProfissional({...novoProfissional, cargo: e.target.value})} className="w-full p-2.5 rounded border border-slate-200 outline-blue-500 bg-white" placeholder="Ex: Dentista"/></div></div><div className="bg-white p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 relative"><div><label className="text-xs font-bold text-slate-400 flex items-center gap-1 mb-1"><Mail size={12}/> EMAIL</label><input required type="email" value={novoProfissional.email} onChange={e => setNovoProfissional({...novoProfissional, email: e.target.value})} className="w-full p-2.5 rounded border border-slate-200 outline-blue-500 font-medium"/></div><div><label className="text-xs font-bold text-slate-400 flex items-center gap-1 mb-1"><Lock size={12}/> SENHA {editandoId && '(Vazio = Não mudar)'}</label><input type="password" value={novoProfissional.password} onChange={e => setNovoProfissional({...novoProfissional, password: e.target.value})} className="w-full p-2.5 rounded border border-slate-200 outline-blue-500 font-medium" placeholder="******"/></div></div><div className="w-full"><label className="text-xs font-bold text-slate-400 flex items-center gap-1 mb-1"><Shield size={12}/> PERMISSÃO</label><select value={novoProfissional.nivel_acesso} onChange={e => setNovoProfissional({...novoProfissional, nivel_acesso: e.target.value})} className="w-full p-2.5 rounded border border-slate-200 outline-blue-500 bg-white"><option value="padrao">Padrão</option><option value="admin">Administrador</option></select></div></div>)}</div>
            {aba === 'profissionais' && (<div><label className="text-xs font-bold text-slate-400 block mb-2">ATENDE NAS CLÍNICAS:</label><div className="flex flex-wrap gap-2">{clinicas.map((c:any) => { const isSelected = clinicasSelecionadas.includes(c.id); return (<button key={c.id} type="button" onClick={() => toggleClinica(c.id)} className={\`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all \${isSelected ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'}\`}>{isSelected ? <CheckSquare size={16}/> : <Square size={16}/>}{c.nome}</button>)})}</div></div>)}
            <button disabled={loading} className={\`w-full text-white p-3.5 rounded-xl font-bold flex justify-center items-center gap-2 shadow-sm transition-colors \${editandoId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}\`}>{loading ? <Loader2 className="animate-spin"/> : (editandoId ? <><Save size={20}/> Salvar Alterações</> : <><Plus size={20}/> Cadastrar</>)}</button>
        </form>
        <div className="space-y-2">{dados.map((item: any) => (<div key={item.id} className={\`flex justify-between items-center p-4 border rounded-xl transition-all group \${editandoId === item.id ? 'bg-amber-50 border-amber-300 shadow-md ring-1 ring-amber-300' : 'bg-white border-slate-100 hover:border-blue-200 hover:shadow-sm'}\`}><div className="flex items-center gap-4">{aba === 'servicos' && (<div className={\`w-6 h-6 rounded-full shadow-sm border border-white ring-1 ring-slate-100 \${coresDisponiveis.find(c => c.nome === item.cor)?.classe || 'bg-blue-500'}\`}></div>)}<div><p className="font-bold text-slate-700 flex items-center gap-2 text-base">{item.nome}{item.nivel_acesso === 'admin' && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded border border-yellow-200 font-bold uppercase flex items-center gap-1"><Shield size={10}/> Admin</span>}</p><div className="text-xs text-slate-400 flex flex-wrap gap-1 mt-1 items-center">{aba === 'servicos' ? \`R$ \${item.valor}\` : <span className="flex items-center gap-1"><Mail size={10}/> {item.email || 'Sem email'}</span>}</div></div></div><div className="flex gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => editarItem(item)} className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors" title="Editar"><Edit size={18}/></button><button onClick={() => excluir(item.id)} className="text-slate-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors" title="Excluir"><Trash2 size={18}/></button></div></div>))}</div>
      </div>
    </div>
  );
}
`;

salvarArquivo('app/financeiro/page.tsx', financeiroPage);
salvarArquivo('app/pacientes/page.tsx', pacientesPage);
salvarArquivo('app/configuracoes/page.tsx', configPage);