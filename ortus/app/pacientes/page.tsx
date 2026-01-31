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
      if(data) router.push(`/pacientes/${data.id}`);
  }

  const filtrados = pacientes.filter((p: any) => p.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-fade-in">
      <div className="flex justify-between items-end">
          <div><h1 className="text-3xl font-black text-slate-800">Pacientes</h1><p className="text-slate-500">Gerencie seus clientes.</p></div>
          <button onClick={novoPaciente} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg flex items-center gap-2"><Plus size={20}/> Novo Paciente</button>
      </div>

      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex gap-2"><div className="flex-1 relative"><Search className="absolute left-3 top-3 text-slate-400" size={20}/><input type="text" placeholder="Buscar..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none font-medium" value={busca} onChange={e => setBusca(e.target.value)} /></div><div className="flex bg-slate-100 p-1 rounded-xl"><button onClick={() => setVisualizacao('lista')} className={`p-2 rounded-lg ${visualizacao === 'lista' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}><ListIcon size={20}/></button><button onClick={() => setVisualizacao('cards')} className={`p-2 rounded-lg ${visualizacao === 'cards' ? 'bg-white shadow text-blue-600' : 'text-slate-400'}`}><LayoutGrid size={20}/></button></div></div>

      {loading ? <div className="py-20 text-center text-slate-400"><Loader2 className="animate-spin mx-auto mb-2"/> Carregando...</div> : 
       visualizacao === 'lista' ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100"><tr><th className="p-4 pl-6 text-xs font-bold text-slate-400 uppercase">Nome</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Telefone</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Status</th><th className="p-4 text-right"></th></tr></thead>
                <tbody className="divide-y divide-slate-50">{filtrados.map((p: any) => (
                    <tr key={p.id} onClick={() => router.push(`/pacientes/${p.id}`)} className="hover:bg-blue-50 cursor-pointer transition-colors group">
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
            <div key={p.id} onClick={() => router.push(`/pacientes/${p.id}`)} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md cursor-pointer transition-all hover:border-blue-200 group">
                <div className="flex items-center gap-4 mb-4"><div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold text-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">{p.nome.charAt(0)}</div><div><h3 className="font-bold text-slate-800 truncate w-40">{p.nome}</h3><p className="text-xs text-slate-400 uppercase font-bold">{p.status}</p></div></div>
                <div className="text-sm text-slate-500 flex items-center gap-2"><Phone size={14}/> {p.telefone || 'Sem telefone'}</div>
            </div>
        ))}</div>
       )
      }
    </div>
  );
}