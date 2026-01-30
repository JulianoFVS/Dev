'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, X, Loader2, Trash2, Search, Edit, User, MapPin } from 'lucide-react';
import Link from 'next/link';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clinicaAtual, setClinicaAtual] = useState<string | null>(null);

  // Form
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    // Pega a clínica selecionada no login
    const id = typeof window !== 'undefined' ? localStorage.getItem('ortus_clinica_atual') : null;
    setClinicaAtual(id);
    if(id) fetchPacientes(id);
  }, []);

  async function fetchPacientes(clinicaId: string) {
    let query = supabase.from('pacientes').select('*, clinicas(nome)').order('created_at', { ascending: false });
    
    // SEGREGAÇÃO: Se não for "todas", filtra pela clínica
    if (clinicaId !== 'todas') {
        query = query.eq('clinica_id', clinicaId);
    }

    const { data, error } = await query;
    if (!error) setPacientes(data || []);
  }

  async function criarPaciente(e: any) {
    e.preventDefault();
    if (!clinicaAtual || clinicaAtual === 'todas') {
        alert('Por favor, selecione uma clínica específica no painel principal para cadastrar pacientes.');
        return;
    }
    
    setLoading(true);
    const { error } = await supabase.from('pacientes').insert([{ 
        nome, 
        telefone,
        clinica_id: clinicaAtual // VINCULA O PACIENTE À CLÍNICA
    }]);
    
    if (error) alert('Erro: ' + error.message);
    else {
        setModalAberto(false);
        setNome(''); setTelefone('');
        fetchPacientes(clinicaAtual);
    }
    setLoading(false);
  }

  async function excluirPaciente(id: number) {
    if (!confirm('Tem certeza? Isso apagará histórico e dados.')) return;
    await supabase.from('pacientes').delete().eq('id', id);
    if(clinicaAtual) fetchPacientes(clinicaAtual);
  }

  const filtrados = pacientes.filter((p: any) => p.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in p-4 md:p-0 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                <User className="text-blue-600"/> Pacientes
            </h2>
            <p className="text-sm text-slate-400 font-medium">
                {clinicaAtual === 'todas' ? 'Visualizando TODAS as clínicas' : 'Lista exclusiva desta unidade'}
            </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-slate-400" size={18}/>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome..." className="pl-10 p-2.5 border border-slate-200 rounded-xl w-full outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 font-medium text-slate-700"/>
            </div>
            {clinicaAtual !== 'todas' && (
                <button onClick={() => setModalAberto(true)} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl hover:bg-blue-700 font-bold text-sm flex items-center gap-2 transition-transform active:scale-95 shadow-md shadow-blue-200">
                    <Plus size={18}/> Novo
                </button>
            )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrados.map((p: any) => (
          <div key={p.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all group relative overflow-hidden">
              <Link href={`/pacientes/${p.id}`} className="flex gap-4 items-center">
                  <div className="w-12 h-12 shrink-0 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center font-black text-lg">
                      {p.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                      <h3 className="font-bold text-slate-800 truncate text-lg">{p.nome}</h3>
                      <p className="text-xs text-slate-400 font-bold truncate flex items-center gap-1">
                        <MapPin size={10}/> {p.clinicas?.nome || 'Sem Clínica'}
                      </p>
                  </div>
              </Link>
              <button onClick={() => excluirPaciente(p.id)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 transition-colors">
                <Trash2 size={16} />
              </button>
          </div>
        ))}
        {filtrados.length === 0 && (
            <div className="col-span-full text-center py-10 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                Nenhum paciente encontrado nesta clínica.
            </div>
        )}
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 text-lg">Novo Paciente</h3>
                    <button onClick={() => setModalAberto(false)}><X size={20} className="text-slate-400 hover:text-red-500"/></button>
                </div>
                <form onSubmit={criarPaciente} className="p-6 space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Nome Completo</label>
                        <input autoFocus required value={nome} onChange={e => setNome(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium" placeholder="Ex: Maria Silva" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Telefone</label>
                        <input required value={telefone} onChange={e => setTelefone(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium" placeholder="(00) 00000-0000" />
                    </div>
                    <button disabled={loading} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 flex justify-center items-center gap-2 shadow-lg shadow-blue-200">
                        {loading ? <Loader2 className="animate-spin" /> : 'Cadastrar'}
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  )
}