'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Search, Plus, Filter, LayoutGrid, List as ListIcon, 
    User, Phone, Calendar, FileText, Trash2, Edit, 
    ChevronRight, Activity, Clock, Loader2, X, Save, 
    MapPin, Mail, Hash, AlertCircle
} from 'lucide-react';
import Link from 'next/link';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [visualizacao, setVisualizacao] = useState('cards');
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');

  // Estado do Modal e Formulário
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<any>({
      id: null, nome: '', cpf: '', data_nascimento: '',
      telefone: '', email: '', endereco: '', observacoes: ''
  });

  useEffect(() => { carregarPacientes(); }, []);

  async function carregarPacientes() {
    setLoading(true);
    const { data } = await supabase
        .from('pacientes')
        .select('*, agendamentos(data_hora, status)')
        .order('created_at', { ascending: false });
    
    if (data) {
        const formatados = data.map(p => {
            const agendamentos = p.agendamentos || [];
            agendamentos.sort((a:any, b:any) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());
            const ultimoAgendamento = agendamentos[0];
            const statusCalculado = ultimoAgendamento 
                ? (new Date(ultimoAgendamento.data_hora) > new Date() ? 'agendado' : 'ativo')
                : 'novo';
            return { ...p, status: statusCalculado, ultimo_atendimento: ultimoAgendamento?.data_hora };
        });
        setPacientes(formatados);
    }
    setLoading(false);
  }

  function abrirModal(paciente: any = null) {
      if (paciente) {
          setForm({
              id: paciente.id,
              nome: paciente.nome || '',
              cpf: paciente.cpf || '',
              data_nascimento: paciente.data_nascimento || '',
              telefone: paciente.telefone || '',
              email: paciente.email || '',
              endereco: paciente.endereco || '',
              observacoes: paciente.observacoes || ''
          });
      } else {
          setForm({ id: null, nome: '', cpf: '', data_nascimento: '', telefone: '', email: '', endereco: '', observacoes: '' });
      }
      setModalAberto(true);
  }

  async function salvarPaciente(e: any) {
      e.preventDefault();
      setSalvando(true);

      const payload = {
          nome: form.nome,
          cpf: form.cpf,
          data_nascimento: form.data_nascimento || null,
          telefone: form.telefone,
          email: form.email,
          endereco: form.endereco,
          observacoes: form.observacoes
      };

      try {
          if (form.id) {
              const { error } = await supabase.from('pacientes').update(payload).eq('id', form.id);
              if (error) throw error;
          } else {
              const { error } = await supabase.from('pacientes').insert([payload]);
              if (error) throw error;
          }
          setModalAberto(false);
          carregarPacientes();
      } catch (error: any) {
          alert('Erro ao salvar: ' + error.message);
      }
      setSalvando(false);
  }

  async function excluirPaciente(id: any) {
      if (!confirm('Tem certeza? Isso apagará todo o histórico e agendamentos deste paciente.')) return;
      setLoading(true); 
      const { error } = await supabase.from('pacientes').delete().eq('id', id);
      if (error) alert('Erro ao excluir: ' + error.message);
      else await carregarPacientes();
      setLoading(false);
  }

  // --- FILTROS ---
  const pacientesFiltrados = pacientes.filter(p => {
      const termo = busca.toLowerCase();
      const bateBusca = p.nome.toLowerCase().includes(termo) || (p.cpf || '').includes(termo) || (p.telefone || '').includes(termo);
      const bateStatus = filtroStatus === 'todos' ? true : p.status === filtroStatus;
      return bateBusca && bateStatus;
  });

  const stats = {
      total: pacientes.length,
      novos: pacientes.filter(p => {
          const d = new Date(p.created_at); const h = new Date();
          return d.getMonth() === h.getMonth() && d.getFullYear() === h.getFullYear();
      }).length,
      ativos: pacientes.filter(p => p.status === 'ativo' || p.status === 'agendado').length
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Pacientes</h1>
            <p className="text-slate-500 font-medium">Cadastro e histórico completo.</p>
        </div>
        <button onClick={() => abrirModal()} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-95">
            <Plus size={20}/> Novo Paciente
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><span className="text-xs font-bold text-slate-400 uppercase">Total</span><p className="text-2xl font-black text-slate-800 mt-1">{stats.total}</p></div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><Activity size={12} className="text-green-500"/> Ativos</span><p className="text-2xl font-black text-slate-800 mt-1">{stats.ativos}</p></div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><User size={12} className="text-blue-500"/> Novos (Mês)</span><p className="text-2xl font-black text-slate-800 mt-1">{stats.novos}</p></div>
      </div>

      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-2">
          <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-slate-400" size={20}/>
              <input type="text" placeholder="Buscar por nome, CPF ou telefone..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none font-medium transition-all" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
              <select className="px-4 py-2.5 rounded-xl bg-slate-50 text-sm font-bold text-slate-600 outline-none cursor-pointer hover:bg-slate-100 border-r-8 border-transparent" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                  <option value="todos">Status: Todos</option><option value="ativo">Ativos</option><option value="novo">Novos</option><option value="agendado">Com Agendamento</option>
              </select>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button onClick={() => setVisualizacao('lista')} className={`p-2 rounded-lg transition-all ${visualizacao === 'lista' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><ListIcon size={20}/></button>
                  <button onClick={() => setVisualizacao('cards')} className={`p-2 rounded-lg transition-all ${visualizacao === 'cards' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={20}/></button>
              </div>
          </div>
      </div>

      {loading ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center"><Loader2 className="animate-spin mb-2" size={32}/> Carregando...</div>
      ) : pacientesFiltrados.length === 0 ? (
          <div className="py-20 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200"><User size={48} className="mx-auto mb-4 opacity-20"/><p className="font-bold text-lg">Nenhum paciente encontrado.</p></div>
      ) : (
          visualizacao === 'lista' ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100"><tr><th className="p-4 text-xs font-bold text-slate-400 uppercase pl-6">Nome</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Contato</th><th className="p-4 text-xs font-bold text-slate-400 uppercase hidden md:table-cell">Última Visita</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Status</th><th className="p-4 text-xs font-bold text-slate-400 uppercase text-right pr-6">Ações</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">{pacientesFiltrados.map(p => (<tr key={p.id} className="hover:bg-slate-50/80 transition-colors"><td className="p-4 pl-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">{p.nome.charAt(0)}</div><div><p className="font-bold text-slate-700">{p.nome}</p><p className="text-[10px] text-slate-400 font-medium">CPF: {p.cpf || '---'}</p></div></div></td><td className="p-4"><div className="text-sm text-slate-600"><Phone size={14} className="inline mr-1"/> {p.telefone || '-'}</div></td><td className="p-4 hidden md:table-cell text-sm text-slate-500">{p.ultimo_atendimento ? new Date(p.ultimo_atendimento).toLocaleDateString('pt-BR') : 'Nunca'}</td><td className="p-4"><StatusBadge status={p.status} /></td><td className="p-4 text-right pr-6 flex justify-end gap-2"><button onClick={() => abrirModal(p)} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"><Edit size={18}/></button><button onClick={() => excluirPaciente(p.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"><Trash2 size={18}/></button></td></tr>))}</tbody>
                </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{pacientesFiltrados.map(p => (<div key={p.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative"><div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => abrirModal(p)} className="p-2 bg-white border rounded-full hover:text-blue-600"><Edit size={14}/></button><button onClick={() => excluirPaciente(p.id)} className="p-2 bg-white border rounded-full hover:text-red-600"><Trash2 size={14}/></button></div><div className="flex items-center gap-4 mb-4"><div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center font-black text-xl">{p.nome.charAt(0)}</div><div><h3 className="font-bold text-slate-800 text-lg truncate w-40">{p.nome}</h3><StatusBadge status={p.status} /></div></div><div className="space-y-2 mb-4"><div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 p-2 rounded-lg"><Phone size={14}/> {p.telefone || 'Sem telefone'}</div><div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 p-2 rounded-lg"><Clock size={14}/> Última: {p.ultimo_atendimento ? new Date(p.ultimo_atendimento).toLocaleDateString('pt-BR') : 'Nenhuma'}</div></div></div>))}</div>
          )
      )}

      {modalAberto && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in duration-200">
                <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                    <h3 className="font-black text-xl text-slate-800">{form.id ? 'Editar Paciente' : 'Novo Paciente'}</h3>
                    <button onClick={() => setModalAberto(false)} className="p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-50"><X size={20}/></button>
                </div>
                
                <form onSubmit={salvarPaciente} className="p-8 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-2 md:col-span-1 space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Nome Completo *</label><input required value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="Ex: João da Silva" /></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">CPF</label><input value={form.cpf} onChange={e => setForm({...form, cpf: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="000.000.000-00" /></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Data de Nascimento</label><input type="date" value={form.data_nascimento} onChange={e => setForm({...form, data_nascimento: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" /></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Telefone / WhatsApp *</label><input required value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="(00) 90000-0000" /></div>
                        <div className="col-span-2 space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Email</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="cliente@email.com" /></div>
                        <div className="col-span-2 space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Endereço Completo</label><input value={form.endereco} onChange={e => setForm({...form, endereco: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="Rua, Número, Bairro..." /></div>
                        <div className="col-span-2 space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Observações Médicas / Gerais</label><textarea value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none" placeholder="Alergias, histórico, preferências..." /></div>
                    </div>
                    <div className="pt-4 flex gap-4">
                        <button type="button" onClick={() => setModalAberto(false)} className="flex-1 py-3.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
                        <button type="submit" disabled={salvando} className="flex-1 bg-blue-600 text-white rounded-xl font-bold py-3.5 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex justify-center items-center gap-2">{salvando ? <Loader2 className="animate-spin"/> : <><Save size={20}/> Salvar Paciente</>}</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: {status: any}) {
    const styles: any = { ativo: 'bg-green-100 text-green-700 border-green-200', novo: 'bg-blue-100 text-blue-700 border-blue-200', agendado: 'bg-purple-100 text-purple-700 border-purple-200', inativo: 'bg-slate-100 text-slate-500 border-slate-200' };
    const labels: any = { ativo: 'Cliente Ativo', novo: 'Novo Cadastro', agendado: 'Agendado', inativo: 'Inativo' };
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wide ${styles[status] || styles.inativo}`}>{labels[status] || 'Desconhecido'}</span>;
}