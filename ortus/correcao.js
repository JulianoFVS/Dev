const fs = require('fs');

// --- 👇 SUAS CHAVES AQUI NOVAMENTE 👇 ---
const SUPABASE_URL = "https://vjqeekvoxddxwvbazwlt.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqcWVla3ZveGRkeHd2YmF6d2x0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MzE3MjUsImV4cCI6MjA4NTMwNzcyNX0.bpqlERIRoeMs4m1_oe_wfpvAaTgNsaLY2YpNosvqBDA"; 
// ----------------------------------------

const files = {
  // 1. CSS Limpo (Remove o fundo preto/modo noturno)
  'app/globals.css': `
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 248, 250, 252; /* Slate-50 */
  --background-end-rgb: 255, 255, 255;
}

body {
  color: rgb(var(--foreground-rgb));
  background: rgb(var(--background-start-rgb));
}
`,

  // 2. Variáveis de ambiente (Garante que estão certas)
  '.env.local': `NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_KEY}`,

  // 3. Página de Pacientes (Com aviso de erro se falhar)
  'app/pacientes/page.tsx': `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Plus, Trash2 } from 'lucide-react';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Busca pacientes
  async function fetchPacientes() {
    setLoading(true);
    const { data, error } = await supabase.from('pacientes').select('*').order('created_at', { ascending: false });
    
    if (error) {
      console.error('Erro ao buscar:', error);
      alert('Erro ao conectar no banco. Verifique se rodou o SQL no Supabase.');
    } else {
      setPacientes(data || []);
    }
    setLoading(false);
  }

  // Cria novo paciente
  async function criarTeste() {
    const nome = prompt("Nome do Paciente:");
    if (!nome) return;
    
    const { error } = await supabase.from('pacientes').insert([
      { nome, telefone: '79 9999-0000' }
    ]);

    if (error) {
      alert('Erro ao salvar: ' + error.message);
    } else {
      fetchPacientes(); // Recarrega a lista
    }
  }

  // Deleta paciente
  async function deletar(id: string) {
    if(!confirm('Tem certeza?')) return;
    await supabase.from('pacientes').delete().eq('id', id);
    fetchPacientes();
  }

  useEffect(() => { fetchPacientes(); }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
           <h2 className="text-2xl font-bold text-slate-800">Pacientes</h2>
           <p className="text-sm text-slate-400">Gerencie seus cadastros</p>
        </div>
        <button onClick={criarTeste} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 flex items-center gap-2 transition-all shadow-md hover:shadow-lg">
            <Plus size={18}/> Novo Paciente
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-400 animate-pulse">Carregando dados...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pacientes.length === 0 && (
                <div className="col-span-3 text-center py-10 text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                    Nenhum paciente encontrado.
                </div>
            )}
            {pacientes.map((p: any) => (
            <div key={p.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group flex justify-between items-start">
                <div className="flex gap-4">
                    <div className="w-12 h-12 bg-slate-50 group-hover:bg-teal-50 rounded-full flex items-center justify-center text-slate-400 group-hover:text-teal-600 transition-colors">
                        <User size={24} />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">{p.nome}</h3>
                        <p className="text-sm text-slate-500">{p.telefone || 'Sem telefone'}</p>
                    </div>
                </div>
                <button onClick={() => deletar(p.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 size={18} />
                </button>
            </div>
            ))}
        </div>
      )}
    </div>
  )
}
`
};

Object.keys(files).forEach(path => fs.writeFileSync(path, files[path].trim()));
console.log("✅ Correções aplicadas! O site deve ficar branco e bonito agora.");