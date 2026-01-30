'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Plus, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);

  async function fetchPacientes() {
    const { data } = await supabase.from('pacientes').select('*').order('created_at', { ascending: false });
    if (data) setPacientes(data);
  }

  useEffect(() => { fetchPacientes(); }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div><h2 className="text-2xl font-bold text-slate-800">Pacientes</h2><p className="text-sm text-slate-400">Clique no paciente para abrir o prontuário</p></div>
        <button onClick={() => alert('Use o banco de dados para criar por enquanto!')} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 font-medium text-sm">+ Novo Paciente</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pacientes.map((p: any) => (
          <Link key={p.id} href={`/pacientes/${p.id}`}>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-teal-200 transition-all cursor-pointer group relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity text-teal-600"><ChevronRight /></div>
                <div className="flex gap-4 items-center">
                    <div className="w-12 h-12 bg-slate-50 group-hover:bg-teal-50 rounded-full flex items-center justify-center text-slate-400 group-hover:text-teal-600 transition-colors font-bold text-lg">
                        {p.nome.charAt(0).toUpperCase()}
                    </div>
                    <div><h3 className="font-bold text-slate-800">{p.nome}</h3><p className="text-sm text-slate-500">{p.telefone}</p></div>
                </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}