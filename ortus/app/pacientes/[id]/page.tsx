'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Save, History } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

// Componente Visual de um Dente
const Dente = ({ numero, status, onClick }: any) => {
  const cores: any = { saudavel: 'fill-slate-100', carie: 'fill-red-200', restaurado: 'fill-blue-200', canal: 'fill-yellow-100' };
  const border: any = { saudavel: 'stroke-slate-300', carie: 'stroke-red-400', restaurado: 'stroke-blue-400', canal: 'stroke-yellow-400' };
  
  return (
    <div onClick={onClick} className="flex flex-col items-center gap-1 cursor-pointer group">
      <svg width="40" height="50" viewBox="0 0 40 50" className="transition-transform group-hover:scale-110">
        <path d="M5 15 Q5 0 20 0 Q35 0 35 15 L35 35 Q35 50 20 50 Q5 50 5 35 Z" className={`${cores[status] || cores.saudavel} ${border[status] || border.saudavel} stroke-2 transition-colors`} />
        <text x="50%" y="65%" dominantBaseline="middle" textAnchor="middle" className="text-[10px] fill-slate-400 font-bold select-none">{numero}</text>
      </svg>
    </div>
  );
};

export default function Prontuario() {
  const params = useParams();
  const id = params.id as string;
  
  const [paciente, setPaciente] = useState<any>(null);
  const [dentes, setDentes] = useState<any>({}); 
  const [texto, setTexto] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const { data: p } = await supabase.from('pacientes').select('*').eq('id', id).single();
      setPaciente(p);

      const { data: ult } = await supabase.from('prontuarios')
        .select('*')
        .eq('paciente_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (ult) {
        setDentes(ult.dentes || {});
        setTexto(ult.descricao || '');
      }
      setLoading(false);
    }
    load();
  }, [id]);

  async function salvar() {
    if (!id) return;
    const { error } = await supabase.from('prontuarios').insert([
      { paciente_id: id, dentes: dentes, descricao: texto }
    ]);

    if (error) alert('Erro ao salvar: ' + error.message);
    else alert('✅ Evolução salva com sucesso!');
  }

  const toggleDente = (num: number) => {
    const estados = ['saudavel', 'carie', 'restaurado', 'canal'];
    const atual = dentes[num] || 'saudavel';
    const proximo = estados[(estados.indexOf(atual) + 1) % estados.length];
    setDentes({ ...dentes, [num]: proximo });
  };

  if (loading) return <div className="p-10 text-center animate-pulse text-teal-600">Carregando ficha...</div>;

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/pacientes" className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ArrowLeft size={20}/></Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{paciente?.nome}</h1>
          <p className="text-slate-500 text-sm">Prontuário Digital • {paciente?.telefone}</p>
        </div>
        <div className="ml-auto">
            <button onClick={salvar} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 shadow-sm hover:shadow-md transition-all">
                <Save size={18} /> Salvar Evolução
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
           <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-slate-700">Odontograma Visual</h3>
              <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-red-200 border border-red-400 rounded-full"></div> Cárie</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-200 border border-blue-400 rounded-full"></div> Restaurado</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-yellow-100 border border-yellow-400 rounded-full"></div> Canal</span>
              </div>
           </div>
           
           <div className="flex justify-center gap-2 mb-4 border-b border-dashed border-slate-100 pb-4">
              {[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28].map(n => <Dente key={n} numero={n} status={dentes[n]} onClick={() => toggleDente(n)} />)}
           </div>
           <div className="flex justify-center gap-2 pt-2">
              {[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38].map(n => <Dente key={n} numero={n} status={dentes[n]} onClick={() => toggleDente(n)} />)}
           </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><History size={16}/> Evolução Clínica</h3>
            <textarea 
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Descreva o procedimento..." 
                className="w-full h-40 p-3 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            ></textarea>
        </div>
      </div>
    </div>
  );
}