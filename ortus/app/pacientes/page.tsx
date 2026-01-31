'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Search, Plus, LayoutGrid, List as ListIcon, User, Phone, Edit, Trash2, Activity, Loader2, X, Save, Clock, FileText, ClipboardList } from 'lucide-react';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [visualizacao, setVisualizacao] = useState('cards');
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  
  // MODAL STATES
  const [modalAberto, setModalAberto] = useState(false);
  const [abaModal, setAbaModal] = useState('dados'); // dados, anamnese, historico
  const [salvando, setSalvando] = useState(false);
  const [historicoPaciente, setHistoricoPaciente] = useState<any[]>([]);
  
  const [form, setForm] = useState<any>({ 
      id: null, nome: '', cpf: '', data_nascimento: '', telefone: '', email: '', 
      endereco: '', observacoes: '', anamnese: '' 
  });

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

  async function abrirModal(paciente: any = null) {
      setAbaModal('dados');
      setHistoricoPaciente([]);
      
      if (paciente) { 
          setForm({ 
              id: paciente.id, nome: paciente.nome || '', cpf: paciente.cpf || '', 
              data_nascimento: paciente.data_nascimento || '', telefone: paciente.telefone || '', 
              email: paciente.email || '', endereco: paciente.endereco || '', 
              observacoes: paciente.observacoes || '', anamnese: paciente.anamnese || '' 
          });
          
          // Carregar histórico
          const { data: hist } = await supabase.from('agendamentos').select('*').eq('paciente_id', paciente.id).order('data_hora', { ascending: false });
          setHistoricoPaciente(hist || []);
      } else { 
          setForm({ id: null, nome: '', cpf: '', data_nascimento: '', telefone: '', email: '', endereco: '', observacoes: '', anamnese: '' }); 
      }
      setModalAberto(true);
  }

  async function salvarPaciente(e: any) {
      e.preventDefault(); setSalvando(true);
      const payload = { 
          nome: form.nome, cpf: form.cpf, data_nascimento: form.data_nascimento || null, 
          telefone: form.telefone, email: form.email, endereco: form.endereco, 
          observacoes: form.observacoes, anamnese: form.anamnese 
      };
      
      try {
          if (form.id) await supabase.from('pacientes').update(payload).eq('id', form.id);
          else await supabase.from('pacientes').insert([payload]);
          setModalAberto(false); carregarPacientes();
      } catch (error: any) { alert('Erro: ' + error.message); }
      setSalvando(false);
  }

  async function excluirPaciente(id: any) {
      if (!confirm('Tem certeza? Isso apaga todo o histórico.')) return;
      setLoading(true); await supabase.from('pacientes').delete().eq('id', id); await carregarPacientes(); setLoading(false);
  }

  const pacientesFiltrados = pacientes.filter((p: any) => {
      const termo = busca.toLowerCase();
      const bateBusca = p.nome.toLowerCase().includes(termo) || (p.cpf || '').includes(termo) || (p.telefone || '').includes(termo);
      return bateBusca;
  });

  const stats = { total: pacientes.length, novos: pacientes.filter(p => new Date(p.created_at).getMonth() === new Date().getMonth()).length, ativos: pacientes.filter(p => p.status === 'ativo' || p.status === 'agendado').length };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4"><div><h1 className="text-3xl font-black text-slate-800 tracking-tight">Pacientes</h1><p className="text-slate-500 font-medium">Gestão de clientes.</p></div><button onClick={() => abrirModal()} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 shadow-lg"><Plus size={20}/> Novo Paciente</button></div>
      
      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><span className="text-xs font-bold text-slate-400 uppercase">Total</span><p className="text-2xl font-black text-slate-800 mt-1">{stats.total}</p></div><div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><Activity size={12} className="text-green-500"/> Ativos</span><p className="text-2xl font-black text-slate-800 mt-1">{stats.ativos}</p></div><div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><User size={12} className="text-blue-500"/> Novos (Mês)</span><p className="text-2xl font-black text-slate-800 mt-1">{stats.novos}</p></div></div>
      
      {/* FILTROS */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-2"><div className="flex-1 relative"><Search className="absolute left-3 top-3 text-slate-400" size={20}/><input type="text" placeholder="Buscar por nome, CPF..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none font-medium" value={busca} onChange={e => setBusca(e.target.value)} /></div><div className="flex bg-slate-100 p-1 rounded-xl"><button onClick={() => setVisualizacao('lista')} className={`p-2 rounded-lg ${visualizacao === 'lista' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}><ListIcon size={20}/></button><button onClick={() => setVisualizacao('cards')} className={`p-2 rounded-lg ${visualizacao === 'cards' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}><LayoutGrid size={20}/></button></div></div>
      
      {/* LISTA DE PACIENTES */}
      {loading ? (<div className="py-20 text-center text-slate-400 flex flex-col items-center"><Loader2 className="animate-spin mb-2" size={32}/> Carregando...</div>) : pacientesFiltrados.length === 0 ? (<div className="py-20 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200"><User size={48} className="mx-auto mb-4 opacity-20"/><p className="font-bold text-lg">Nenhum paciente encontrado.</p></div>) : visualizacao === 'lista' ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"><table className="w-full text-left"><thead className="bg-slate-50 border-b border-slate-100"><tr><th className="p-4 text-xs font-bold text-slate-400 uppercase pl-6">Nome</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Contato</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Status</th><th className="p-4 text-xs font-bold text-slate-400 uppercase text-right pr-6">Ações</th></tr></thead><tbody className="divide-y divide-slate-50">{pacientesFiltrados.map((p: any) => (<tr key={p.id} className="hover:bg-slate-50"><td className="p-4 pl-6 font-bold text-slate-700 cursor-pointer" onClick={() => abrirModal(p)}>{p.nome}</td><td className="p-4 text-sm text-slate-600">{p.telefone}</td><td className="p-4"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold uppercase">{p.status}</span></td><td className="p-4 text-right flex justify-end gap-2"><button onClick={() => abrirModal(p)} className="p-2 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600"><Edit size={16}/></button><button onClick={() => excluirPaciente(p.id)} className="p-2 hover:bg-red-50 text-red-500 rounded"><Trash2 size={16}/></button></td></tr>))}</tbody></table></div>
      ) : (<div className="grid grid-cols-1 md:grid-cols-3 gap-6">{pacientesFiltrados.map((p: any) => (<div key={p.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => abrirModal(p)}><div className="flex justify-between mb-4"><div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center font-bold text-slate-500">{p.nome.charAt(0)}</div><button onClick={(e) => { e.stopPropagation(); excluirPaciente(p.id); }} className="text-slate-300 hover:text-red-500"><Trash2 size={18}/></button></div><h3 className="font-bold text-slate-800 text-lg truncate">{p.nome}</h3><p className="text-sm text-slate-500 mb-4">{p.telefone}</p></div>))}</div>)}
      
      {/* MODAL COMPLETO COM ABAS */}
      {modalAberto && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-zoom-in">
                <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                    <div>
                        <h3 className="font-black text-xl text-slate-800">{form.id ? 'Prontuário do Paciente' : 'Novo Paciente'}</h3>
                        {form.id && <p className="text-xs text-slate-400 font-bold uppercase mt-1">{form.nome}</p>}
                    </div>
                    <button onClick={() => setModalAberto(false)} className="p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-50"><X size={20}/></button>
                </div>
                
                {/* MENU DE ABAS */}
                <div className="flex border-b border-slate-200 bg-white px-6">
                    <button onClick={() => setAbaModal('dados')} className={`pb-3 pt-4 px-4 font-bold text-sm border-b-2 transition-colors ${abaModal === 'dados' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Dados Pessoais</button>
                    {form.id && (
                        <>
                            <button onClick={() => setAbaModal('anamnese')} className={`pb-3 pt-4 px-4 font-bold text-sm border-b-2 transition-colors ${abaModal === 'anamnese' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Anamnese</button>
                            <button onClick={() => setAbaModal('historico')} className={`pb-3 pt-4 px-4 font-bold text-sm border-b-2 transition-colors ${abaModal === 'historico' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>Histórico</button>
                        </>
                    )}
                </div>

                <div className="p-8 overflow-y-auto flex-1 bg-slate-50/50">
                    {/* ABA: DADOS PESSOAIS */}
                    {abaModal === 'dados' && (
                        <form id="formPaciente" onSubmit={salvarPaciente} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="col-span-2 md:col-span-1"><label className="text-xs font-bold text-slate-400 uppercase">Nome Completo *</label><input required value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="Nome" /></div>
                                <div><label className="text-xs font-bold text-slate-400 uppercase">CPF</label><input value={form.cpf} onChange={e => setForm({...form, cpf: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="000.000.000-00" /></div>
                                <div><label className="text-xs font-bold text-slate-400 uppercase">Nascimento</label><input type="date" value={form.data_nascimento} onChange={e => setForm({...form, data_nascimento: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" /></div>
                                <div><label className="text-xs font-bold text-slate-400 uppercase">Telefone *</label><input required value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="(00) 00000-0000" /></div>
                                <div className="col-span-2"><label className="text-xs font-bold text-slate-400 uppercase">Email</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="email@exemplo.com" /></div>
                                <div className="col-span-2"><label className="text-xs font-bold text-slate-400 uppercase">Endereço</label><input value={form.endereco} onChange={e => setForm({...form, endereco: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="Rua, Número, Bairro..." /></div>
                                <div className="col-span-2"><label className="text-xs font-bold text-slate-400 uppercase">Observações Gerais</label><textarea value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none" placeholder="Preferências, avisos..." /></div>
                            </div>
                        </form>
                    )}

                    {/* ABA: ANAMNESE */}
                    {abaModal === 'anamnese' && (
                        <div className="space-y-4 h-full flex flex-col">
                            <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2"><FileText size={16}/> Ficha de Anamnese / Histórico Médico</label>
                            <textarea 
                                value={form.anamnese} 
                                onChange={e => setForm({...form, anamnese: e.target.value})} 
                                className="w-full flex-1 p-4 bg-yellow-50 border border-yellow-200 rounded-xl outline-none focus:ring-2 focus:ring-yellow-400 text-slate-700 leading-relaxed min-h-[300px]" 
                                placeholder="Descreva o histórico clínico, alergias, medicamentos em uso e queixas principais..." 
                            />
                            <p className="text-xs text-slate-400">As alterações na anamnese precisam ser salvas.</p>
                        </div>
                    )}

                    {/* ABA: HISTÓRICO */}
                    {abaModal === 'historico' && (
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-4"><Clock size={16}/> Linha do Tempo de Consultas</h4>
                            {historicoPaciente.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">Nenhuma consulta registrada.</div>
                            ) : (
                                <div className="relative border-l-2 border-blue-100 ml-3 space-y-6 pb-4">
                                    {historicoPaciente.map((h: any) => (
                                        <div key={h.id} className="ml-6 relative">
                                            <div className={`absolute -left-[31px] w-4 h-4 rounded-full border-2 border-white shadow-sm ${h.status === 'concluido' ? 'bg-green-500' : 'bg-blue-400'}`}></div>
                                            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="font-bold text-slate-800">{h.procedimento}</span>
                                                    <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{h.status}</span>
                                                </div>
                                                <p className="text-xs text-slate-500 font-medium mb-2">{new Date(h.data_hora).toLocaleDateString('pt-BR')} às {new Date(h.data_hora).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p>
                                                {h.observacoes && <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded-lg italic">"{h.observacoes}"</p>}
                                                {h.valor_final > 0 && <p className="text-xs font-bold text-green-600 mt-2">R$ {h.valor_final}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t bg-white flex justify-end gap-3">
                    <button onClick={() => setModalAberto(false)} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">Fechar</button>
                    {abaModal !== 'historico' && (
                        <button onClick={salvarPaciente} disabled={salvando} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg flex items-center gap-2">
                            {salvando ? <Loader2 className="animate-spin" size={20}/> : <><Save size={20}/> Salvar Dados</>}
                        </button>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}