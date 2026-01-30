'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Plus, Building2, LayoutGrid, ArrowRight, Trash2, Loader2, X } from 'lucide-react';

export default function SelecaoClinica() {
  const router = useRouter();
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [novaClinica, setNovaClinica] = useState('');

  useEffect(() => { carregarClinicas(); }, []);

  async function carregarClinicas() {
    const { data } = await supabase.from('clinicas').select('*').order('created_at');
    setClinicas(data || []);
    setLoading(false);
  }

  async function criarClinica(e: any) {
    e.preventDefault();
    if (!novaClinica) return;
    await supabase.from('clinicas').insert([{ nome: novaClinica, cor_tema: 'blue' }]);
    setNovaClinica('');
    setModalAberto(false);
    carregarClinicas();
  }

  async function excluirClinica(e: any, id: number) {
    e.stopPropagation();
    if (!confirm('ATENÇÃO: Isso apagará TODOS os agendamentos e profissionais desta clínica. Continuar?')) return;
    await supabase.from('clinicas').delete().eq('id', id);
    carregarClinicas();
  }

  function selecionar(id: string | number) {
    // Salva a preferência no navegador
    if (typeof window !== 'undefined') {
        localStorage.setItem('ortus_clinica_atual', id.toString());
    }
    router.push('/'); // Vai para o Dashboard
  }

  if (loading) return <div className="h-screen flex items-center justify-center text-blue-600"><Loader2 className="animate-spin" size={40}/></div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 animate-fade-in">
      
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tight">ORTUS</h1>
            <p className="text-slate-500">Selecione o ambiente de trabalho</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* CARD: VISÃO GERAL (TODAS) */}
            <div 
                onClick={() => selecionar('todas')}
                className="group bg-gradient-to-br from-slate-800 to-slate-900 text-white p-6 rounded-2xl shadow-lg cursor-pointer hover:scale-[1.02] transition-all relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><LayoutGrid size={100}/></div>
                <div className="relative z-10 h-full flex flex-col justify-between">
                    <div className="bg-white/10 w-12 h-12 rounded-xl flex items-center justify-center mb-4"><LayoutGrid size={24}/></div>
                    <div>
                        <h3 className="text-xl font-bold">Visão Geral</h3>
                        <p className="text-slate-300 text-sm mt-1">Gerenciar todas as clínicas</p>
                    </div>
                </div>
            </div>

            {/* LISTA DE CLÍNICAS */}
            {clinicas.map(c => (
                <div 
                    key={c.id} 
                    onClick={() => selecionar(c.id)}
                    className="group bg-white p-6 rounded-2xl shadow-sm border border-slate-200 cursor-pointer hover:border-blue-400 hover:shadow-md transition-all relative"
                >
                    <div className="flex justify-between items-start">
                        <div className="bg-blue-50 text-blue-600 w-12 h-12 rounded-xl flex items-center justify-center mb-4"><Building2 size={24}/></div>
                        <button onClick={(e) => excluirClinica(e, c.id)} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"><Trash2 size={16}/></button>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{c.nome}</h3>
                        <p className="text-slate-400 text-sm mt-1 flex items-center gap-1">Acessar painel <ArrowRight size={12}/></p>
                    </div>
                </div>
            ))}

            {/* CARD: NOVA CLÍNICA */}
            <button 
                onClick={() => setModalAberto(true)}
                className="border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all gap-2 min-h-[180px]"
            >
                <Plus size={32}/>
                <span className="font-bold">Nova Clínica</span>
            </button>
        </div>
      </div>

      {/* MODAL CRIAR */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in">
                <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Cadastrar Clínica</h3>
                    <button onClick={() => setModalAberto(false)}><X size={20} className="text-slate-400"/></button>
                </div>
                <form onSubmit={criarClinica} className="p-6 space-y-4">
                    <input autoFocus value={novaClinica} onChange={e => setNovaClinica(e.target.value)} placeholder="Nome da Clínica (Ex: Matriz)" className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" />
                    <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors">Confirmar</button>
                </form>
            </div>
        </div>
      )}

    </div>
  );
}