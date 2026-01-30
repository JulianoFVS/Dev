'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, ChevronRight, X, Loader2, Trash2, Search, Edit } from 'lucide-react';
import Link from 'next/link';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [modalEditarAberto, setModalEditarAberto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pacienteEmEdicao, setPacienteEmEdicao] = useState<any>(null);

  // Form
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [busca, setBusca] = useState('');

  async function fetchPacientes() {
    const { data, error } = await supabase.from('pacientes').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Erro ao carregar pacientes:', error);
    } else {
      setPacientes(data || []);
    }
  }

  async function criarPaciente(e: any) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('pacientes').insert([{ nome, telefone }]);
    if (error) {
      alert('Erro ao cadastrar paciente: ' + error.message);
    } else {
      setModalAberto(false);
      setNome('');
      setTelefone('');
      fetchPacientes();
    }
    setLoading(false);
  }

  async function atualizarPaciente(e: any) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase
      .from('pacientes')
      .update({ nome, telefone })
      .eq('id', pacienteEmEdicao.id);
      
    if (error) {
      alert('Erro ao atualizar paciente: ' + error.message);
    } else {
      setModalEditarAberto(false);
      setPacienteEmEdicao(null);
      setNome('');
      setTelefone('');
      fetchPacientes();
    }
    setLoading(false);
  }

  async function excluirPaciente(e: any, id: number) {
    e.preventDefault(); 
    if (!confirm('Tem certeza? Isso apagará também os agendamentos deste paciente.')) return;

    const { error: errorAgendamentos } = await supabase.from('agendamentos').delete().eq('paciente_id', id);
    if (errorAgendamentos) {
      alert('Erro ao excluir agendamentos: ' + errorAgendamentos.message);
      return;
    }

    const { error } = await supabase.from('pacientes').delete().eq('id', id);

    if (error) {
      alert('Erro ao excluir paciente: ' + error.message);
    } else {
      fetchPacientes();
    }
  }

  function abrirModalEdicao(e: any, paciente: any) {
    e.preventDefault();
    setPacienteEmEdicao(paciente);
    setNome(paciente.nome);
    setTelefone(paciente.telefone);
    setModalEditarAberto(true);
  }

  useEffect(() => { fetchPacientes(); }, []);

  const filtrados = pacientes.filter((p: any) => p.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in relative p-4 md:p-0">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Pacientes</h2>
            <p className="text-sm text-slate-400">{pacientes.length} cadastrados</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome..." className="pl-10 p-2 border border-slate-200 rounded-lg w-full outline-none focus:ring-2 focus:ring-teal-500"/>
            </div>
            <button onClick={() => { setNome(''); setTelefone(''); setModalAberto(true); }} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 font-medium text-sm flex items-center gap-2 transition-transform active:scale-95 whitespace-nowrap">
                <Plus size={18}/> Novo
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrados.map((p: any) => (
          <div key={p.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-teal-200 transition-all group relative overflow-hidden flex justify-between items-center">
              <Link href={`/pacientes/${p.id}`} className="flex gap-4 items-center overflow-hidden flex-1">
                  <div className="w-12 h-12 shrink-0 bg-slate-50 group-hover:bg-teal-50 rounded-full flex items-center justify-center text-slate-400 group-hover:text-teal-600 transition-colors font-bold text-lg">
                      {p.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                      <h3 className="font-bold text-slate-800 truncate">{p.nome}</h3>
                      <p className="text-sm text-slate-500 truncate">{p.telefone}</p>
                  </div>
              </Link>
              <div className="flex gap-1">
                <button onClick={(e) => abrirModalEdicao(e, p)} className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors z-10 relative">
                    <Edit size={18} />
                </button>
                <button onClick={(e) => excluirPaciente(e, p.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors z-10 relative">
                    <Trash2 size={18} />
                </button>
              </div>
          </div>
        ))}
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-700">Novo Paciente</h3>
                    <button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
                </div>
                <form onSubmit={criarPaciente} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                        <input autoFocus required type="text" value={nome} onChange={e => setNome(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" placeholder="Ex: Maria Silva" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Telefone / WhatsApp</label>
                        <input required type="text" value={telefone} onChange={e => setTelefone(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" placeholder="(00) 00000-0000" />
                    </div>
                    <button disabled={loading} type="submit" className="w-full bg-teal-600 text-white py-3 rounded-lg font-bold hover:bg-teal-700 flex justify-center items-center gap-2">
                        {loading ? <Loader2 className="animate-spin" /> : 'Cadastrar Paciente'}
                    </button>
                </form>
            </div>
        </div>
      )}

      {modalEditarAberto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-700">Editar Paciente</h3>
                    <button onClick={() => { setModalEditarAberto(false); setPacienteEmEdicao(null); }} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
                </div>
                <form onSubmit={atualizarPaciente} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                        <input autoFocus required type="text" value={nome} onChange={e => setNome(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" placeholder="Ex: Maria Silva" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Telefone / WhatsApp</label>
                        <input required type="text" value={telefone} onChange={e => setTelefone(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" placeholder="(00) 00000-0000" />
                    </div>
                    <button disabled={loading} type="submit" className="w-full bg-teal-600 text-white py-3 rounded-lg font-bold hover:bg-teal-700 flex justify-center items-center gap-2">
                        {loading ? <Loader2 className="animate-spin" /> : 'Salvar Alterações'}
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  )
}