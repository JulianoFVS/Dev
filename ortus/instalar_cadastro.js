const fs = require('fs');
const path = require('path');

const conteudoDaPagina = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Plus, ChevronRight, X, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function Pacientes() {
  // AQUI ESTAVA O ERRO: Adicionamos <any[]> para o TypeScript aceitar os dados
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Dados do formulário
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');

  async function fetchPacientes() {
    const { data } = await supabase.from('pacientes').select('*').order('created_at', { ascending: false });
    if (data) setPacientes(data);
  }

  async function criarPaciente(e: any) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from('pacientes').insert([
        { nome, telefone }
    ]);

    if (error) {
        alert('Erro: ' + error.message);
    } else {
        setModalAberto(false);
        setNome('');
        setTelefone('');
        fetchPacientes(); 
    }
    setLoading(false);
  }

  useEffect(() => { fetchPacientes(); }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in relative">
      
      {/* Cabeçalho */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Pacientes</h2>
            <p className="text-sm text-slate-400">Gerencie seus cadastros</p>
        </div>
        <button onClick={() => setModalAberto(true)} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 font-medium text-sm flex items-center gap-2 transition-transform active:scale-95">
            <Plus size={18}/> Novo Paciente
        </button>
      </div>

      {/* Lista de Pacientes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pacientes.map((p) => (
          <Link key={p.id} href={\`/pacientes/\${p.id}\`}>
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

      {/* MODAL DE CADASTRO */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
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
    </div>
  );
}
`; 

const caminhoArquivo = path.join('app', 'pacientes', 'page.tsx');
fs.writeFileSync(caminhoArquivo, conteudoDaPagina.trim());
console.log('✅ Correção de Tipagem Aplicada!');