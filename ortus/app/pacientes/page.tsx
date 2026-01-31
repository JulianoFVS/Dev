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
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-2"><div className="flex-1 relative"><Search className="absolute left-3 top-3 text-slate-400" size={20}/><input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none font-medium" value={busca} onChange={e => setBusca(e.target.value)} /></div><div className="flex gap-2"><select className="px-4 py-2.5 rounded-xl bg-slate-50 text-sm font-bold text-slate-600 outline-none cursor-pointer hover:bg-slate-100" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}><option value="todos">Status: Todos</option><option value="ativo">Ativos</option><option value="novo">Novos</option><option value="agendado">Com Agendamento</option></select><div className="flex bg-slate-100 p-1 rounded-xl"><button onClick={() => setVisualizacao('lista')} className={`p-2 rounded-lg ${visualizacao === 'lista' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}><ListIcon size={20}/></button><button onClick={() => setVisualizacao('cards')} className={`p-2 rounded-lg ${visualizacao === 'cards' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}><LayoutGrid size={20}/></button></div></div></div>
      {loading ? (<div className="py-20 text-center text-slate-400 flex flex-col items-center"><Loader2 className="animate-spin mb-2" size={32}/> Carregando...</div>) : pacientesFiltrados.length === 0 ? (<div className="py-20 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200"><User size={48} className="mx-auto mb-4 opacity-20"/><p className="font-bold text-lg">Nenhum paciente encontrado.</p></div>) : visualizacao === 'lista' ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"><table className="w-full text-left"><thead className="bg-slate-50 border-b border-slate-100"><tr><th className="p-4 text-xs font-bold text-slate-400 uppercase pl-6">Nome</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Contato</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Status</th><th className="p-4 text-xs font-bold text-slate-400 uppercase text-right pr-6">Ações</th></tr></thead><tbody className="divide-y divide-slate-50">{pacientesFiltrados.map((p: any) => (<tr key={p.id} className="hover:bg-slate-50"><td className="p-4 pl-6 font-bold text-slate-700">{p.nome}</td><td className="p-4 text-sm text-slate-600">{p.telefone}</td><td className="p-4"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold uppercase">{p.status}</span></td><td className="p-4 text-right flex justify-end gap-2"><button onClick={() => abrirModal(p)} className="p-2 hover:bg-slate-100 rounded"><Edit size={16}/></button><button onClick={() => excluirPaciente(p.id)} className="p-2 hover:bg-red-50 text-red-500 rounded"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div>
      ) : (<div className="grid grid-cols-1 md:grid-cols-3 gap-6">{pacientesFiltrados.map((p: any) => (<div key={p.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all"><div className="flex justify-between mb-4"><div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500">{p.nome.charAt(0)}</div><button onClick={() => abrirModal(p)} className="text-slate-400 hover:text-blue-600"><Edit size={18}/></button></div><h3 className="font-bold text-slate-800 text-lg">{p.nome}</h3><p className="text-sm text-slate-500 mb-4">{p.telefone}</p><div className="flex gap-2"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold uppercase">{p.status}</span></div></div>))}</div>)}
      {modalAberto && (<div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4"><div className="bg-white w-full max-w-lg rounded-2xl p-6"><h3 className="font-bold text-xl mb-4">{form.id ? 'Editar' : 'Novo'}</h3><input className="w-full p-3 border rounded-xl mb-4" placeholder="Nome" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})}/><input className="w-full p-3 border rounded-xl mb-4" placeholder="Telefone" value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})}/><div className="flex gap-4"><button onClick={() => setModalAberto(false)} className="flex-1 p-3 text-slate-500">Cancelar</button><button onClick={salvarPaciente} className="flex-1 p-3 bg-blue-600 text-white rounded-xl font-bold">{salvando ? 'Salvando...' : 'Salvar'}</button></div></div></div>)}
    </div>
  );
}