const fs = require('fs');
const path = require('path');

console.log('🛠️ Instalando V34: Correção TOTAL de Build (Agenda, Config, Financeiro, Pacientes, Inbox, Dashboard)...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Blindado: ${caminhoRelativo}`);
}

// ======================================================
// 1. DASHBOARD (app/page.tsx) - Correção do User/Null
// ======================================================
const dashboardPage = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Users, Calendar, DollarSign, ArrowRight, TrendingUp, Activity, Clock, CheckCircle } from 'lucide-react';

export default function Dashboard() {
  const [stats, setStats] = useState({ pacientes: 0, agendamentos: 0, faturamento: 0 });
  const [proximos, setProximos] = useState<any[]>([]); // Tipagem Any
  const [loading, setLoading] = useState(true);
  const [usuario, setUsuario] = useState<any>(null); // Tipagem Any para aceitar User ou Null

  useEffect(() => { carregarDados(); }, []);

  async function carregarDados() {
    const { data: { user } } = await supabase.auth.getUser();
    setUsuario(user);

    if (user) {
        const hoje = new Date().toISOString().split('T')[0];
        
        const { count: countPac } = await supabase.from('pacientes').select('*', { count: 'exact', head: true });
        const { count: countAg } = await supabase.from('agendamentos').select('*', { count: 'exact', head: true }).gte('data_hora', \`\${hoje}T00:00:00\`).lte('data_hora', \`\${hoje}T23:59:59\`);
        
        const { data: agendamentos } = await supabase.from('agendamentos').select('valor_final').eq('status', 'concluido');
        const totalFat = agendamentos?.reduce((acc: any, curr: any) => acc + (curr.valor_final || 0), 0) || 0;

        setStats({ pacientes: countPac || 0, agendamentos: countAg || 0, faturamento: totalFat });

        const { data: prox } = await supabase.from('agendamentos').select('*, pacientes(nome)').gte('data_hora', new Date().toISOString()).order('data_hora', { ascending: true }).limit(4);
        setProximos(prox || []);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4"><div><h1 className="text-3xl font-black text-slate-800 tracking-tight">Olá, Dr(a).</h1><p className="text-slate-500 font-medium">Aqui está o resumo da sua clínica hoje.</p></div><div className="text-right hidden md:block"><p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><Link href="/agenda" className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-blue-800 p-8 text-white shadow-xl shadow-blue-200 transition-all hover:shadow-2xl hover:scale-[1.01]"><div className="relative z-10"><div className="mb-4 inline-flex rounded-xl bg-white/20 p-3 backdrop-blur-sm group-hover:bg-white/30 transition-colors"><Calendar size={28} className="text-white" /></div><h3 className="text-2xl font-bold">Acessar Agenda</h3><p className="mt-2 text-blue-100 font-medium max-w-sm">Gerencie consultas, marque como concluído e lance valores.</p><div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur-sm transition-colors group-hover:bg-white group-hover:text-blue-700">Ver Grade <ArrowRight size={16} /></div></div><Calendar className="absolute -bottom-6 -right-6 h-48 w-48 text-white/5 rotate-12 group-hover:rotate-0 transition-transform duration-500" /></Link><Link href="/pacientes" className="group relative overflow-hidden rounded-3xl bg-white border border-slate-100 p-8 text-slate-800 shadow-xl shadow-slate-200/50 transition-all hover:shadow-2xl hover:border-blue-200"><div className="relative z-10"><div className="mb-4 inline-flex rounded-xl bg-blue-50 p-3 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors"><Users size={28} /></div><h3 className="text-2xl font-bold">Prontuários</h3><p className="mt-2 text-slate-500 font-medium max-w-sm">Consulte o histórico completo e dados de cada paciente.</p><div className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-blue-600 group-hover:underline">Ir para Pacientes <ArrowRight size={16} /></div></div><Activity className="absolute -bottom-4 -right-4 h-40 w-40 text-slate-50 group-hover:text-blue-50 transition-colors duration-500" /></Link></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6"><div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4"><div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl"><Users size={24}/></div><div><p className="text-sm font-bold text-slate-400 uppercase">Pacientes</p><p className="text-2xl font-black text-slate-800">{stats.pacientes}</p></div></div><div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4"><div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl"><Calendar size={24}/></div><div><p className="text-sm font-bold text-slate-400 uppercase">Agendamentos Hoje</p><p className="text-2xl font-black text-slate-800">{stats.agendamentos}</p></div></div><div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4"><div className="p-3 bg-amber-50 text-amber-600 rounded-xl"><DollarSign size={24}/></div><div><p className="text-sm font-bold text-slate-400 uppercase">Faturamento Mês</p><p className="text-2xl font-black text-slate-800">R$ {stats.faturamento.toFixed(2)}</p></div></div></div>
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden"><div className="p-6 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center"><h3 className="font-bold text-slate-700 flex items-center gap-2"><Clock size={20} className="text-blue-500"/> Próximos Atendimentos</h3><Link href="/agenda" className="text-xs font-bold text-blue-600 hover:underline">Ver todos</Link></div><div className="divide-y divide-slate-50">{proximos.length === 0 ? (<div className="p-8 text-center text-slate-400">Nenhum agendamento futuro encontrado.</div>) : (proximos.map((ag: any) => (<div key={ag.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"><div className="flex items-center gap-4"><div className="flex flex-col items-center justify-center w-12 h-12 bg-blue-50 text-blue-700 rounded-xl font-bold text-xs border border-blue-100"><span>{new Date(ag.data_hora).getDate()}</span><span className="text-[9px] uppercase">{new Date(ag.data_hora).toLocaleString('pt-BR', { month: 'short' }).replace('.','')}</span></div><div><p className="font-bold text-slate-700">{ag.pacientes?.nome}</p><p className="text-xs text-slate-500">{ag.procedimento} • {new Date(ag.data_hora).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p></div></div><div className="flex items-center gap-2"><span className={\`text-[10px] font-bold px-2 py-1 rounded-md uppercase \${ag.status === 'concluido' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}\`}>{ag.status}</span></div></div>)))}</div></div>
    </div>
  );
}
`;

// ======================================================
// 2. PACIENTES (app/pacientes/page.tsx) - Import Loader2
// ======================================================
const pacientesPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Plus, LayoutGrid, List as ListIcon, User, Phone, Edit, Trash2, Activity, Loader2, X, Save } from 'lucide-react';
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
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-2"><div className="flex-1 relative"><Search className="absolute left-3 top-3 text-slate-400" size={20}/><input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none font-medium" value={busca} onChange={e => setBusca(e.target.value)} /></div><div className="flex gap-2"><select className="px-4 py-2.5 rounded-xl bg-slate-50 text-sm font-bold text-slate-600 outline-none cursor-pointer hover:bg-slate-100" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}><option value="todos">Status: Todos</option><option value="ativo">Ativos</option><option value="novo">Novos</option><option value="agendado">Com Agendamento</option></select><div className="flex bg-slate-100 p-1 rounded-xl"><button onClick={() => setVisualizacao('lista')} className={\`p-2 rounded-lg \${visualizacao === 'lista' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}\`}><ListIcon size={20}/></button><button onClick={() => setVisualizacao('cards')} className={\`p-2 rounded-lg \${visualizacao === 'cards' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}\`}><LayoutGrid size={20}/></button></div></div></div>
      {loading ? (<div className="py-20 text-center text-slate-400 flex flex-col items-center"><Loader2 className="animate-spin mb-2" size={32}/> Carregando...</div>) : pacientesFiltrados.length === 0 ? (<div className="py-20 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200"><User size={48} className="mx-auto mb-4 opacity-20"/><p className="font-bold text-lg">Nenhum paciente encontrado.</p></div>) : visualizacao === 'lista' ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"><table className="w-full text-left"><thead className="bg-slate-50 border-b border-slate-100"><tr><th className="p-4 text-xs font-bold text-slate-400 uppercase pl-6">Nome</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Contato</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Status</th><th className="p-4 text-xs font-bold text-slate-400 uppercase text-right pr-6">Ações</th></tr></thead><tbody className="divide-y divide-slate-50">{pacientesFiltrados.map((p: any) => (<tr key={p.id} className="hover:bg-slate-50"><td className="p-4 pl-6 font-bold text-slate-700">{p.nome}</td><td className="p-4 text-sm text-slate-600">{p.telefone}</td><td className="p-4"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold uppercase">{p.status}</span></td><td className="p-4 text-right flex justify-end gap-2"><button onClick={() => abrirModal(p)} className="p-2 hover:bg-slate-100 rounded"><Edit size={16}/></button><button onClick={() => excluirPaciente(p.id)} className="p-2 hover:bg-red-50 text-red-500 rounded"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div>
      ) : (<div className="grid grid-cols-1 md:grid-cols-3 gap-6">{pacientesFiltrados.map((p: any) => (<div key={p.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all"><div className="flex justify-between mb-4"><div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500">{p.nome.charAt(0)}</div><button onClick={() => abrirModal(p)} className="text-slate-400 hover:text-blue-600"><Edit size={18}/></button></div><h3 className="font-bold text-slate-800 text-lg">{p.nome}</h3><p className="text-sm text-slate-500 mb-4">{p.telefone}</p><div className="flex gap-2"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold uppercase">{p.status}</span></div></div>))}</div>)}
      {modalAberto && (<div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4"><div className="bg-white w-full max-w-lg rounded-2xl p-6"><h3 className="font-bold text-xl mb-4">{form.id ? 'Editar' : 'Novo'}</h3><input className="w-full p-3 border rounded-xl mb-4" placeholder="Nome" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})}/><input className="w-full p-3 border rounded-xl mb-4" placeholder="Telefone" value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})}/><div className="flex gap-4"><button onClick={() => setModalAberto(false)} className="flex-1 p-3 text-slate-500">Cancelar</button><button onClick={salvarPaciente} className="flex-1 p-3 bg-blue-600 text-white rounded-xl font-bold">{salvando ? 'Salvando...' : 'Salvar'}</button></div></div></div>)}
    </div>
  );
}
`;

// ======================================================
// 3. INBOX (app/inbox/page.tsx)
// ======================================================
const inboxPage = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, Mail, Calendar, AlertTriangle, Info, CheckSquare, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function Inbox() {
  const [todos, setTodos] = useState<any[]>([]);
  const [abaAtiva, setAbaAtiva] = useState('alertas');
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();

  useEffect(() => { 
      const tab = searchParams.get('tab');
      if (tab === 'mensagens') setAbaAtiva('mensagens');
      else setAbaAtiva('alertas');
      carregar(); 
  }, [searchParams]);

  async function carregar() {
    const { data: { user } } = await supabase.auth.getUser();
    if(user) {
        const { data } = await supabase.from('notificacoes').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        setTodos(data || []);
    }
    setLoading(false);
  }

  async function marcarLida(id: any) {
      setTodos(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
      await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
      window.location.reload(); 
  }

  async function excluir(id: any) {
      if(!confirm('Apagar esta notificação?')) return;
      setTodos(prev => prev.filter(n => n.id !== id));
      await supabase.from('notificacoes').delete().eq('id', id);
  }

  const alertas = todos.filter((n: any) => ['agenda', 'alerta', 'sistema', 'aviso'].includes(n.tipo));
  const mensagens = todos.filter((n: any) => !['agenda', 'alerta', 'sistema', 'aviso'].includes(n.tipo));
  const listaAtual = abaAtiva === 'alertas' ? alertas : mensagens;

  const getIcon = (tipo: string) => {
      if (tipo === 'agenda') return <Calendar size={20} className="text-blue-500"/>;
      if (tipo === 'alerta') return <AlertTriangle size={20} className="text-amber-500"/>;
      if (tipo === 'mensagem') return <Mail size={20} className="text-purple-500"/>;
      return <Info size={20} className="text-slate-400"/>;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-2"><div><h2 className="text-2xl font-black text-slate-800 tracking-tight">Central de Avisos</h2><p className="text-slate-500 text-sm">Fique por dentro do que acontece na clínica.</p></div><div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200"><button onClick={() => setAbaAtiva('alertas')} className={\`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all \${abaAtiva === 'alertas' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}\`}><Bell size={16}/> Notificações</button><button onClick={() => setAbaAtiva('mensagens')} className={\`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all \${abaAtiva === 'mensagens' ? 'bg-purple-50 text-purple-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}\`}><Mail size={16}/> Mensagens</button></div></div>
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {listaAtual.length === 0 && (<div className="h-full flex flex-col items-center justify-center py-20 text-center"><h3 className="text-slate-800 font-bold">Tudo limpo!</h3></div>)}
        <div className="divide-y divide-slate-100">{listaAtual.map((n:any) => (<div key={n.id} className="p-5 flex gap-4"><div className="mt-1 bg-white p-2 rounded-xl border">{getIcon(n.tipo)}</div><div className="flex-1"><h4>{n.titulo}</h4><p>{n.mensagem}</p></div><div className="flex gap-2"><button onClick={() => marcarLida(n.id)}><CheckSquare size={18}/></button><button onClick={() => excluir(n.id)}><Trash2 size={18}/></button></div></div>))}</div>
      </div>
    </div>
  );
}
`;

// ======================================================
// 4. CONFIGURAÇÕES (app/configuracoes/page.tsx)
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

  const coresDisponiveis = [ { nome: 'slate', classe: 'bg-slate-500' }, { nome: 'blue', classe: 'bg-blue-500' }, { nome: 'red', classe: 'bg-red-500' }, { nome: 'green', classe: 'bg-green-500' }, { nome: 'yellow', classe: 'bg-yellow-500' }, { nome: 'purple', classe: 'bg-purple-500' } ];

  useEffect(() => { fetchClinicas(); carregarLista(); }, [aba]);

  async function fetchClinicas() { const { data } = await supabase.from('clinicas').select('*'); if (data) setClinicas(data); }
  async function carregarLista() { setLoading(true); if (aba === 'servicos') { const { data } = await supabase.from('servicos').select('*').order('nome'); if (data) setDados(data); } else { const { data } = await supabase.from('profissionais').select('*, profissionais_clinicas(clinica_id, clinicas(nome))').order('nome'); if (data) setDados(data); } setLoading(false); }

  function editarItem(item: any) { setEditandoId(item.id); if (aba === 'servicos') { setNovoServico({ nome: item.nome, valor: item.valor, cor: item.cor || 'blue' }); } else { setUserIdAuth(item.user_id); setNovoProfissional({ nome: item.nome, cargo: item.cargo, nivel_acesso: item.nivel_acesso, email: item.email || '', password: '' }); const idsClinicas = item.profissionais_clinicas?.map((pc: any) => pc.clinica_id) || []; setClinicasSelecionadas(idsClinicas); } }
  function cancelarEdicao() { setEditandoId(null); setUserIdAuth(null); setNovoServico({ nome: '', valor: '', cor: 'blue' }); setNovoProfissional({ nome: '', cargo: '', nivel_acesso: 'padrao', email: '', password: '' }); setClinicasSelecionadas([]); }

  async function salvar(e: any) { e.preventDefault(); setLoading(true); try { if (aba === 'servicos') { const payload = { ...novoServico, valor: parseFloat(novoServico.valor) }; if (editandoId) await supabase.from('servicos').update(payload).eq('id', editandoId); else await supabase.from('servicos').insert([payload]); } else { if (clinicasSelecionadas.length === 0) throw new Error('Selecione pelo menos uma clínica.'); if (editandoId) { await fetch('/api/editar-usuario', { method: 'POST', body: JSON.stringify({ id: editandoId, user_id: userIdAuth, ...novoProfissional, clinicas: clinicasSelecionadas }) }); } else { await fetch('/api/criar-usuario', { method: 'POST', body: JSON.stringify({ ...novoProfissional, clinicas: clinicasSelecionadas }) }); } } cancelarEdicao(); await carregarLista(); } catch (err: any) { alert('Erro: ' + err.message); } setLoading(false); }
  async function excluir(id: any) { if(!confirm('Confirmar exclusão?')) return; setLoading(true); const tabela = aba === 'servicos' ? 'servicos' : 'profissionais'; await supabase.from(tabela).delete().eq('id', id); await carregarLista(); setLoading(false); }
  function toggleClinica(id: any) { if (clinicasSelecionadas.includes(id)) setClinicasSelecionadas(prev => prev.filter(c => c !== id)); else setClinicasSelecionadas(prev => [...prev, id]); }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex gap-4 border-b"><button onClick={() => setAba('servicos')} className="pb-3 px-4 font-bold border-b-2">Procedimentos</button><button onClick={() => setAba('profissionais')} className="pb-3 px-4 font-bold border-b-2">Profissionais</button></div>
      <div className="bg-white p-6 rounded-2xl shadow-sm border">
        <h2 className="text-xl font-bold mb-6">{editandoId ? 'Editando' : 'Novo'}</h2>
        <form onSubmit={salvar} className="space-y-4">
            {aba === 'servicos' ? (<div className="flex gap-4"><input className="border p-2 rounded w-full" value={novoServico.nome} onChange={e => setNovoServico({...novoServico, nome: e.target.value})} placeholder="Nome"/><input className="border p-2 rounded w-32" type="number" value={novoServico.valor} onChange={e => setNovoServico({...novoServico, valor: e.target.value})} placeholder="Valor"/></div>) : (<div className="grid grid-cols-2 gap-4"><input className="border p-2 rounded" value={novoProfissional.nome} onChange={e => setNovoProfissional({...novoProfissional, nome: e.target.value})} placeholder="Nome"/><input className="border p-2 rounded" value={novoProfissional.cargo} onChange={e => setNovoProfissional({...novoProfissional, cargo: e.target.value})} placeholder="Cargo"/><input className="border p-2 rounded" value={novoProfissional.email} onChange={e => setNovoProfissional({...novoProfissional, email: e.target.value})} placeholder="Email"/><input className="border p-2 rounded" type="password" value={novoProfissional.password} onChange={e => setNovoProfissional({...novoProfissional, password: e.target.value})} placeholder="Senha"/></div>)}
            {aba === 'profissionais' && (<div className="flex gap-2 flex-wrap">{clinicas.map((c:any) => (<button key={c.id} type="button" onClick={() => toggleClinica(c.id)} className={\`border px-3 py-1 rounded \${clinicasSelecionadas.includes(c.id) ? 'bg-blue-100' : ''}\`}>{c.nome}</button>))}</div>)}
            <button disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded font-bold">{loading ? '...' : 'Salvar'}</button>
        </form>
        <div className="mt-6 space-y-2">{dados.map((item:any) => (<div key={item.id} className="flex justify-between p-4 border rounded"><p className="font-bold">{item.nome}</p><div className="flex gap-2"><button onClick={() => editarItem(item)}><Edit size={18}/></button><button onClick={() => excluir(item.id)}><Trash2 size={18}/></button></div></div>))}</div>
      </div>
    </div>
  );
}
`;

// ======================================================
// 5. FINANCEIRO (app/financeiro/page.tsx)
// ======================================================
const financeiroPage = `
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
        descricao: \`\${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome} - \${e.procedimento}\`,
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
`;

// ======================================================
// 6. AGENDA (app/agenda/page.tsx)
// ======================================================
const agendaPage = `
'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { Plus, X, Loader2, CheckCircle, XCircle, MapPin, User, Building2, Calendar as CalIcon } from 'lucide-react';

export default function Agenda() {
  const calendarRef = useRef(null);
  const [events, setEvents] = useState<any[]>([]);
  const [usuarioAtual, setUsuarioAtual] = useState<any>(null);
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  const [profissionaisFiltrados, setProfissionaisFiltrados] = useState<any[]>([]);
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [servicos, setServicos] = useState<any[]>([]);
  const [clinicaFiltro, setClinicaFiltro] = useState('todas');
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ id: null, title: '', date: '', time: '08:00', theme: 'blue', paciente_id: '', valor: '0', desconto: '0', observacoes: '', status: 'agendado', clinica_id: '', profissional_id: '' });

  useEffect(() => { inicializar(); }, []);
  useEffect(() => { if(usuarioAtual) carregarEventos(); }, [clinicaFiltro, usuarioAtual]);
  useEffect(() => { if (!formData.clinica_id) { setProfissionaisFiltrados([]); } else { const filtrados = profissionais.filter((p:any) => p.profissionais_clinicas?.some((vinculo:any) => vinculo.clinica_id == formData.clinica_id)); setProfissionaisFiltrados(filtrados); } }, [formData.clinica_id, profissionais]);

  async function inicializar() { const { data: { user } } = await supabase.auth.getUser(); if (user) { const { data: prof } = await supabase.from('profissionais').select('*').eq('user_id', user.id).single(); if (prof) { setUsuarioAtual({ id: user.id, nivel: prof.nivel_acesso, profissional_id: prof.id }); if (prof.nivel_acesso !== 'admin') setFormData(prev => ({ ...prev, profissional_id: prof.id })); } else { setUsuarioAtual({ id: user.id, nivel: 'admin', profissional_id: null }); } } fetchDados(); }
  async function fetchDados() { const { data: cl } = await supabase.from('clinicas').select('*'); if (cl) setClinicas(cl); const { data: pr } = await supabase.from('profissionais').select('*, profissionais_clinicas(clinica_id)'); if (pr) setProfissionais(pr); const { data: pac } = await supabase.from('pacientes').select('id, nome, clinica_id').order('nome'); if (pac) setPacientes(pac); const { data: serv } = await supabase.from('servicos').select('*').order('nome'); if (serv) setServicos(serv); }
  async function carregarEventos() { if (!usuarioAtual) return; let query = supabase.from('agendamentos').select('*, pacientes(nome), clinicas(nome, cor_tema)'); if (clinicaFiltro !== 'todas') query = query.eq('clinica_id', clinicaFiltro); if (usuarioAtual.nivel !== 'admin' && usuarioAtual.profissional_id) query = query.eq('profissional_id', usuarioAtual.profissional_id); const { data: ag } = await query; if (ag) { const fmt = ag.map((e:any) => ({ id: e.id, title: \`\${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome} - \${e.procedimento}\`, start: e.data_hora, end: new Date(new Date(e.data_hora).getTime() + 60*60*1000).toISOString(), extendedProps: e, backgroundColor: 'transparent', borderColor: 'transparent' })); setEvents(fmt); } else setEvents([]); }

  const handleDateClick = (arg:any) => { const d = arg.date; const h = String(d.getHours()).padStart(2, '0'); const min = String(d.getMinutes()).padStart(2, '0'); const preClinica = clinicaFiltro !== 'todas' ? clinicaFiltro : ''; const preProfissional = (usuarioAtual?.nivel !== 'admin' && usuarioAtual?.profissional_id) ? usuarioAtual.profissional_id : ''; setFormData(prev => ({ ...prev, id: null, title: '', date: d.toISOString().split('T')[0], time: \`\${h}:\${min}\`, status: 'agendado', desconto: '0', valor: '0', clinica_id: preClinica, profissional_id: preProfissional })); setOpenModal(true); };
  const handleEventClick = (info:any) => { const r = info.event.extendedProps; const localDate = new Date(r.data_hora); setFormData({ id: r.id, title: r.procedimento, date: localDate.toISOString().split('T')[0], time: localDate.toTimeString().slice(0,5), theme: r.cor || 'blue', paciente_id: r.paciente_id, valor: r.valor || '0', desconto: r.desconto || '0', observacoes: r.observacoes || '', status: r.status || 'agendado', clinica_id: r.clinica_id, profissional_id: r.profissional_id }); setOpenModal(true); };
  async function saveOrUpdate(overrideStatus?: string) { if (!formData.title || !formData.paciente_id || !formData.clinica_id) return alert('Preencha campos obrigatórios.'); setLoading(true); const finalStatus = overrideStatus || formData.status; const dataLocal = new Date(\`\${formData.date}T\${formData.time}:00\`); const dataHoraISO = dataLocal.toISOString(); const payload = { paciente_id: formData.paciente_id, clinica_id: formData.clinica_id, profissional_id: formData.profissional_id || null, data_hora: dataHoraISO, procedimento: formData.title, cor: formData.theme, valor: parseFloat(formData.valor) || 0, desconto: parseFloat(formData.desconto) || 0, valor_final: (parseFloat(formData.valor) || 0) - (parseFloat(formData.desconto) || 0), observacoes: formData.observacoes, status: finalStatus }; if (formData.id) await supabase.from('agendamentos').update(payload).eq('id', formData.id); else await supabase.from('agendamentos').insert([payload]); setOpenModal(false); carregarEventos(); setLoading(false); }

  const renderEventContent = (eventInfo:any) => {
      const props = eventInfo.event.extendedProps; const status = props.status; const viewType = eventInfo.view.type;
      const mapBg:any = { slate: 'bg-slate-500', blue: 'bg-blue-500', red: 'bg-red-500', green: 'bg-green-500', yellow: 'bg-yellow-500', purple: 'bg-purple-500' };
      const bgClass = mapBg[props.cor] || 'bg-blue-500';
      if (viewType === 'listWeek' || viewType === 'dayGridMonth') return (<div className="flex items-center gap-1 overflow-hidden w-full"><div className={\`w-2 h-2 rounded-full \${status === 'cancelado' ? 'bg-red-500' : bgClass}\`}></div><span className={\`text-xs font-medium truncate \${status === 'cancelado' ? 'line-through text-slate-400' : 'text-slate-700'}\`}>{eventInfo.timeText && <span className="mr-1 opacity-70">{eventInfo.timeText}</span>}{eventInfo.event.title}</span></div>);
      let classes = \`w-full h-full p-1 px-2 rounded-md shadow-sm transition-all hover:opacity-90 \${bgClass} text-white border-l-[3px] border-white/30\`;
      if (status === 'cancelado') return (<div className="w-full h-full p-1 rounded-md bg-red-100 border-l-4 border-red-500 text-red-700 flex flex-col justify-center relative opacity-80"><span className="font-bold text-[10px] line-through truncate">{eventInfo.event.title}</span><span className="text-[9px] uppercase font-bold text-red-600">Cancelado</span></div>);
      if (status === 'concluido') return (<div className="w-full h-full p-1 rounded-md bg-slate-200 border-l-4 border-slate-500 text-slate-600 flex flex-col justify-center opacity-75"><span className="font-bold text-[10px] truncate">{eventInfo.event.title}</span><span className="text-[9px] uppercase font-bold">Concluído</span></div>);
      return (<div className={classes}><div className="text-[10px] font-medium opacity-90">{eventInfo.timeText}</div><div className="text-xs font-bold truncate leading-tight">{eventInfo.event.title}</div></div>);
  };

  return (
    <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-2rem)] flex flex-col space-y-4">
      <style jsx global>{\` .fc { font-family: inherit; } .fc-header-toolbar { margin-bottom: 1.5rem !important; } .fc-toolbar-title { font-size: 1.25rem !important; font-weight: 800 !important; color: #1e293b; text-transform: capitalize; } .fc-button { background-color: white !important; color: #475569 !important; border: 1px solid #e2e8f0 !important; font-weight: 600 !important; font-size: 0.875rem !important; padding: 0.5rem 1rem !important; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); text-transform: capitalize; transition: all 0.2s; } .fc-button:hover { background-color: #f8fafc !important; color: #0f172a !important; border-color: #cbd5e1 !important; } .fc-button-active { background-color: #f1f5f9 !important; color: #2563eb !important; border-color: #cbd5e1 !important; box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06) !important; } .fc-button-primary:focus { box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5) !important; } .fc-theme-standard td, .fc-theme-standard th { border-color: #e2e8f0; } .fc-scrollgrid { border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; } .fc-timegrid-slot-label { color: #64748b; font-size: 11px; font-weight: 500; } .fc-day-today { background-color: #f8fafc !important; } .fc-event { border: none; background: transparent; box-shadow: none; } .fc-daygrid-event { white-space: normal !important; align-items: center; } .fc-col-header-cell { background-color: #f8fafc; padding: 12px 0; } .fc-col-header-cell-cushion { color: #475569; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; } .fc-list { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; } .fc-list-day-cushion { background-color: #f8fafc !important; } .fc-list-event:hover td { background-color: #f1f5f9 !important; cursor: pointer; } \`}</style>
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200"><div className="flex items-center gap-2"><div className="bg-blue-50 p-2 rounded-lg text-blue-600"><CalIcon size={20}/></div><div><h1 className="text-lg font-bold text-slate-800 leading-tight">Agenda</h1><div className="flex items-center gap-1 text-xs text-slate-500"><Building2 size={10}/><select value={clinicaFiltro} onChange={e => setClinicaFiltro(e.target.value)} className="bg-transparent outline-none font-bold hover:text-blue-600 cursor-pointer"><option value="todas">Todas as Clínicas</option>{clinicas.map((c:any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div></div></div><button onClick={() => { setOpenModal(true); setFormData(prev => ({...prev, id: null})); }} className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 text-sm shadow-sm transition-colors"><Plus size={18}/> Novo Agendamento</button></div>
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-4 overflow-hidden"><FullCalendar ref={calendarRef} plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]} initialView="timeGridWeek" headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' }} buttonText={{ today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', list: 'Lista' }} locale={ptBrLocale} slotMinTime="07:00:00" slotMaxTime="20:00:00" allDaySlot={false} events={events} eventContent={renderEventContent} dateClick={handleDateClick} eventClick={handleEventClick} height="100%" slotDuration="00:30:00" dayHeaderFormat={{ weekday: 'short', day: 'numeric' }} nowIndicator={true} navLinks={true} /></div>
      {openModal && ( <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in"><div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh] animate-zoom-in border border-slate-100"><div className="p-5 border-b bg-slate-50 flex justify-between items-center"><h3 className="font-bold text-slate-800 flex items-center gap-2">{formData.id ? 'Editar Agendamento' : 'Novo Agendamento'}</h3><button onClick={() => setOpenModal(false)} className="text-slate-400 hover:text-red-500 p-1"><X size={20}/></button></div><div className="p-6 space-y-5 overflow-y-auto"><div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Clínica</label><select value={formData.clinica_id} onChange={e => setFormData({...formData, clinica_id: e.target.value})} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"><option value="">Selecione...</option>{clinicas.map((c:any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Profissional</label><select value={formData.profissional_id} onChange={e => setFormData({...formData, profissional_id: e.target.value})} className={\`w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none \${usuarioAtual?.nivel !== 'admin' ? 'opacity-60' : ''}\`} disabled={usuarioAtual?.nivel !== 'admin'}><option value="">Qualquer um...</option>{profissionaisFiltrados.map((p:any) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Paciente</label><select value={formData.paciente_id} onChange={e => setFormData({...formData, paciente_id: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"><option value="">Selecione...</option>{pacientes.filter((p:any) => !formData.clinica_id || p.clinica_id == formData.clinica_id).map((p:any) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div><div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Data</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" /></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Hora</label><input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" /></div></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Procedimento</label><select onChange={(e) => { const s = servicos.find((x:any) => x.id == e.target.value); if(s) setFormData(p => ({...p, title: s.nome, valor: s.valor, theme: s.cor || 'blue'})) }} className="w-full p-2.5 mb-2 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"><option value="">✨ Selecionar Catálogo...</option>{servicos.map((s:any) => <option key={s.id} value={s.id}>{s.nome} - R$ {s.valor}</option>)}</select><input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ou digite o procedimento..."/></div><div className="flex gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100"><div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase">Valor</label><div className="flex items-center text-slate-700 font-bold">R$ <input type="number" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className="w-full bg-transparent outline-none ml-1"/></div></div><div className="w-px bg-slate-200"></div><div className="flex-1 text-right"><label className="text-[10px] font-bold text-slate-400 uppercase">Total</label><div className="text-lg font-black text-slate-900">R$ {(parseFloat(formData.valor || '0') - parseFloat(formData.desconto || '0')).toFixed(2)}</div></div></div>{formData.id && ( <div className="flex gap-3 pt-2"><button onClick={() => saveOrUpdate('concluido')} className="flex-1 bg-green-50 text-green-700 py-2.5 rounded-lg font-bold text-xs uppercase hover:bg-green-100 border border-green-200">Concluir</button><button onClick={() => saveOrUpdate('cancelado')} className="flex-1 bg-red-50 text-red-600 py-2.5 rounded-lg font-bold text-xs uppercase hover:bg-red-100 border border-red-200">Cancelar</button></div> )}</div><div className="p-5 border-t bg-slate-50 flex justify-end gap-3"><button onClick={() => setOpenModal(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg text-sm transition-colors">Fechar</button><button onClick={() => saveOrUpdate()} disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm">{loading && <Loader2 className="animate-spin" size={16}/>} Salvar</button></div></div></div> )}
    </div>
  );
}
`;

salvarArquivo('app/page.tsx', dashboardPage);
salvarArquivo('app/pacientes/page.tsx', pacientesPage);
salvarArquivo('app/inbox/page.tsx', inboxPage);
salvarArquivo('app/configuracoes/page.tsx', configPage);
salvarArquivo('app/financeiro/page.tsx', financeiroPage);
salvarArquivo('app/agenda/page.tsx', agendaPage);