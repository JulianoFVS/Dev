const fs = require('fs');
const path = require('path');

console.log('⚙️ Instalando Gestão de Profissionais e Serviços...');

const configPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Settings, User, Briefcase, Tag } from 'lucide-react';

export default function Configuracoes() {
  const [aba, setAba] = useState<'servicos' | 'profissionais'>('servicos');
  const [dados, setDados] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);
  
  // Forms
  const [novoServico, setNovoServico] = useState({ nome: '', valor: '' });
  const [novoProfissional, setNovoProfissional] = useState({ nome: '', cargo: '', clinica_id: '' });

  useEffect(() => { 
      fetchClinicas();
      if(aba === 'servicos') fetchServicos(); 
      else fetchProfissionais();
  }, [aba]);

  async function fetchClinicas() {
      const { data } = await supabase.from('clinicas').select('*');
      if (data) setClinicas(data);
  }
  async function fetchServicos() {
    const { data } = await supabase.from('servicos').select('*').order('nome');
    if (data) setDados(data);
  }
  async function fetchProfissionais() {
    const { data } = await supabase.from('profissionais').select('*, clinicas(nome)').order('nome');
    if (data) setDados(data);
  }

  async function criar(e: any) {
    e.preventDefault();
    if (aba === 'servicos') {
        await supabase.from('servicos').insert([{ nome: novoServico.nome, valor: parseFloat(novoServico.valor) }]);
        setNovoServico({ nome: '', valor: '' });
        fetchServicos();
    } else {
        await supabase.from('profissionais').insert([{ 
            nome: novoProfissional.nome, 
            cargo: novoProfissional.cargo,
            clinica_id: novoProfissional.clinica_id 
        }]);
        setNovoProfissional({ nome: '', cargo: '', clinica_id: '' });
        fetchProfissionais();
    }
  }

  async function excluir(id: number) {
    if(!confirm('Tem certeza?')) return;
    const tabela = aba === 'servicos' ? 'servicos' : 'profissionais';
    await supabase.from(tabela).delete().eq('id', id);
    if(aba === 'servicos') fetchServicos(); else fetchProfissionais();
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-10">
      
      <div className="flex gap-4 border-b border-slate-200">
          <button onClick={() => setAba('servicos')} className={\`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors \${aba === 'servicos' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400'}\`}>
              <Tag size={18}/> Procedimentos
          </button>
          <button onClick={() => setAba('profissionais')} className={\`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors \${aba === 'profissionais' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400'}\`}>
              <User size={18}/> Profissionais
          </button>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            {aba === 'servicos' ? 'Catálogo de Preços' : 'Equipe Médica'}
        </h2>

        {/* FORMULÁRIO */}
        <form onSubmit={criar} className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6 flex flex-col md:flex-row gap-4 items-end">
            {aba === 'servicos' ? (
                <>
                    <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400">NOME</label><input required value={novoServico.nome} onChange={e => setNovoServico({...novoServico, nome: e.target.value})} className="w-full p-2 rounded border border-slate-200" placeholder="Ex: Limpeza"/></div>
                    <div className="w-32"><label className="text-xs font-bold text-slate-400">VALOR (R$)</label><input required type="number" value={novoServico.valor} onChange={e => setNovoServico({...novoServico, valor: e.target.value})} className="w-full p-2 rounded border border-slate-200" placeholder="0.00"/></div>
                </>
            ) : (
                <>
                    <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400">NOME</label><input required value={novoProfissional.nome} onChange={e => setNovoProfissional({...novoProfissional, nome: e.target.value})} className="w-full p-2 rounded border border-slate-200" placeholder="Ex: Dr. Silva"/></div>
                    <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400">CARGO</label><input required value={novoProfissional.cargo} onChange={e => setNovoProfissional({...novoProfissional, cargo: e.target.value})} className="w-full p-2 rounded border border-slate-200" placeholder="Ex: Ortodontista"/></div>
                    <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400">CLÍNICA</label><select required value={novoProfissional.clinica_id} onChange={e => setNovoProfissional({...novoProfissional, clinica_id: e.target.value})} className="w-full p-2 rounded border border-slate-200"><option value="">Selecione...</option>{clinicas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
                </>
            )}
            <button className="bg-blue-600 text-white p-2.5 rounded-lg font-bold hover:bg-blue-700 w-full md:w-auto flex justify-center"><Plus size={20}/></button>
        </form>

        {/* LISTA */}
        <div className="space-y-2">
            {dados.map((item: any) => (
                <div key={item.id} className="flex justify-between items-center p-3 border border-slate-100 rounded-lg hover:border-blue-200 transition-colors">
                    <div>
                        <p className="font-bold text-slate-700">{item.nome}</p>
                        <p className="text-xs text-slate-400">
                            {aba === 'servicos' ? \`R$ \${item.valor}\` : \`\${item.cargo} • \${item.clinicas?.nome}\`}
                        </p>
                    </div>
                    <button onClick={() => excluir(item.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={18}/></button>
                </div>
            ))}
            {dados.length === 0 && <p className="text-center text-slate-400 py-4">Nenhum registro.</p>}
        </div>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(path.join('app', 'configuracoes', 'page.tsx'), configPage.trim());