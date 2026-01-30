'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Settings, Loader2 } from 'lucide-react';

export default function Configuracoes() {
  const [servicos, setServicos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [novoServico, setNovoServico] = useState({ nome: '', valor: '', cor: 'blue' });

  const cores = [
    { id: 'blue', bg: 'bg-blue-500' },
    { id: 'teal', bg: 'bg-teal-500' },
    { id: 'purple', bg: 'bg-purple-500' },
    { id: 'rose', bg: 'bg-rose-500' },
    { id: 'orange', bg: 'bg-orange-500' },
    { id: 'indigo', bg: 'bg-indigo-500' },
  ];

  useEffect(() => { fetchServicos(); }, []);

  async function fetchServicos() {
    const { data } = await supabase.from('servicos').select('*').order('nome');
    if (data) setServicos(data);
  }

  async function adicionarServico(e: any) {
    e.preventDefault();
    if (!novoServico.nome || !novoServico.valor) return;
    setLoading(true);
    await supabase.from('servicos').insert([{ 
        nome: novoServico.nome, 
        valor: parseFloat(novoServico.valor),
        cor: novoServico.cor 
    }]);
    setNovoServico({ nome: '', valor: '', cor: 'blue' });
    fetchServicos();
    setLoading(false);
  }

  async function excluirServico(id: number) {
    if (!confirm('Excluir este serviço?')) return;
    await supabase.from('servicos').delete().eq('id', id);
    fetchServicos();
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-10">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Settings className="text-teal-600"/> Catálogo de Procedimentos
        </h2>
        <p className="text-slate-500 mb-6">Cadastre procedimentos e escolha a cor padrão para a agenda.</p>

        <form onSubmit={adicionarServico} className="bg-slate-50 p-5 rounded-xl border border-slate-100 mb-6 space-y-4">
            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome</label>
                    <input value={novoServico.nome} onChange={e => setNovoServico({...novoServico, nome: e.target.value})} placeholder="Ex: Clareamento" className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                </div>
                <div className="w-32">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Valor (R$)</label>
                    <input type="number" value={novoServico.valor} onChange={e => setNovoServico({...novoServico, valor: e.target.value})} placeholder="0.00" className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                </div>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cor na Agenda</label>
                    <div className="flex gap-2">
                        {cores.map(c => (
                            <button 
                                key={c.id} 
                                type="button" 
                                onClick={() => setNovoServico({...novoServico, cor: c.id})}
                                className={`w-8 h-8 rounded-full ${c.bg} transition-all ${novoServico.cor === c.id ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'opacity-60 hover:opacity-100'}`}
                            />
                        ))}
                    </div>
                </div>
                <button disabled={loading} className="bg-teal-600 text-white px-6 py-2.5 rounded-lg hover:bg-teal-700 font-bold flex items-center gap-2 h-fit self-end shadow-sm shadow-teal-200">
                    {loading ? <Loader2 className="animate-spin"/> : <Plus size={20}/>} Cadastrar
                </button>
            </div>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {servicos.map(s => {
                const colorMap: any = { 
                    blue: 'bg-blue-100 text-blue-700 border-blue-200',
                    teal: 'bg-teal-100 text-teal-700 border-teal-200',
                    purple: 'bg-purple-100 text-purple-700 border-purple-200',
                    rose: 'bg-rose-100 text-rose-700 border-rose-200',
                    orange: 'bg-orange-100 text-orange-700 border-orange-200',
                    indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
                };
                const style = colorMap[s.cor] || colorMap.blue;

                return (
                    <div key={s.id} className={`flex justify-between items-center p-3 rounded-lg border ${style}`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${style.replace('bg-', 'bg-slate-').split(' ')[0].replace('100','500')}`}></div>
                            <span className="font-bold">{s.nome}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="font-bold opacity-80">R$ {s.valor}</span>
                            <button onClick={() => excluirServico(s.id)} className="hover:text-red-600 transition-colors"><Trash2 size={16}/></button>
                        </div>
                    </div>
                )
            })}
            {servicos.length === 0 && <p className="col-span-2 text-center text-slate-400 py-4">Nenhum serviço cadastrado.</p>}
        </div>
      </div>
    </div>
  );
}