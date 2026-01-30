const fs = require('fs');
const path = require('path');

const files = {
  // 1. Atualiza a Lista para ser Clicável
  'app/pacientes/page.tsx': `
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
    </div>
  )
}
`,

  // 2. Cria a Página de Detalhes (Onde fica o Odontograma)
  'app/pacientes/[id]/page.tsx': `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import Link from 'next/link';

// Componente Visual de um Dente
const Dente = ({ numero, status, onClick }: any) => {
  const cores: any = { saudavel: 'fill-slate-100', carie: 'fill-red-200', restaurado: 'fill-blue-200', canal: 'fill-yellow-100' };
  const border: any = { saudavel: 'stroke-slate-300', carie: 'stroke-red-400', restaurado: 'stroke-blue-400', canal: 'stroke-yellow-400' };
  
  return (
    <div onClick={onClick} className="flex flex-col items-center gap-1 cursor-pointer group">
      <svg width="40" height="50" viewBox="0 0 40 50" className="transition-transform group-hover:scale-110">
        <path d="M5 15 Q5 0 20 0 Q35 0 35 15 L35 35 Q35 50 20 50 Q5 50 5 35 Z" className={\`\${cores[status] || cores.saudavel} \${border[status] || border.saudavel} stroke-2 transition-colors\`} />
        <text x="50%" y="65%" dominantBaseline="middle" textAnchor="middle" className="text-[10px] fill-slate-400 font-bold select-none">{numero}</text>
      </svg>
    </div>
  );
};

export default function Prontuario({ params }: { params: { id: string } }) {
  const [paciente, setPaciente] = useState<any>(null);
  const [dentes, setDentes] = useState<any>({}); // Ex: { 18: 'carie', 21: 'restaurado' }
  const [loading, setLoading] = useState(true);

  // Carrega dados
  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('pacientes').select('*').eq('id', params.id).single();
      setPaciente(data);
      setLoading(false);
    }
    load();
  }, [params.id]);

  // Função para mudar o status do dente ao clicar
  const toggleDente = (num: number) => {
    const estados = ['saudavel', 'carie', 'restaurado', 'canal'];
    const atual = dentes[num] || 'saudavel';
    const proximo = estados[(estados.indexOf(atual) + 1) % estados.length];
    setDentes({ ...dentes, [num]: proximo });
  };

  if (loading) return <div className="p-10 text-center animate-pulse">Carregando prontuário...</div>;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/pacientes" className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft size={20}/></Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{paciente?.nome}</h1>
          <p className="text-slate-500 text-sm">Prontuário Digital • {paciente?.telefone}</p>
        </div>
        <div className="ml-auto flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 shadow-sm shadow-teal-200">
                <Save size={18} /> Salvar Evolução
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Esquerda: Odontograma */}
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
           <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-700 flex items-center gap-2">Odontograma <span className="text-xs font-normal text-slate-400 bg-slate-100 px-2 py-1 rounded">Interativo</span></h3>
              <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-100 border border-slate-300 rounded-full"></div> Saudável</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-red-200 border border-red-400 rounded-full"></div> Cárie</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-200 border border-blue-400 rounded-full"></div> Restaurado</span>
              </div>
           </div>
           
           {/* Boca Superior */}
           <div className="flex justify-center gap-2 mb-4 border-b border-dashed border-slate-100 pb-4">
              {[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28].map(n => (
                  <Dente key={n} numero={n} status={dentes[n]} onClick={() => toggleDente(n)} />
              ))}
           </div>
           {/* Boca Inferior */}
           <div className="flex justify-center gap-2 pt-2">
              {[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38].map(n => (
                  <Dente key={n} numero={n} status={dentes[n]} onClick={() => toggleDente(n)} />
              ))}
           </div>
           
           <p className="text-center text-xs text-slate-400 mt-8">Clique nos dentes para alterar o diagnóstico.</p>
        </div>

        {/* Coluna Direita: Anotações */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
            <h3 className="font-bold text-slate-700 mb-4">Evolução Clínica</h3>
            <textarea placeholder="Descreva o procedimento realizado hoje..." className="w-full h-32 p-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"></textarea>
            
            <div className="mt-6 space-y-4">
                <h4 className="font-bold text-xs text-slate-400 uppercase tracking-wider">Histórico Recente</h4>
                <div className="border-l-2 border-slate-200 pl-4 py-1">
                    <p className="text-sm font-medium text-slate-800">Avaliação Inicial</p>
                    <p className="text-xs text-slate-500">29 Jan 2026</p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
`
};

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) return true;
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}
Object.keys(files).forEach(path => {
  ensureDirectoryExistence(path);
  fs.writeFileSync(path, files[path].trim());
  console.log('✅ PEP instalado: ' + path);
});