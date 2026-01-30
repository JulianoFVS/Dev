'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, User, Tag, CheckSquare, Square, Loader2, Building2, Shield } from 'lucide-react';

export default function Configuracoes() {
  const [aba, setAba] = useState<'servicos' | 'profissionais'>('servicos');
  const [dados, setDados] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Forms
  const [novoServico, setNovoServico] = useState({ nome: '', valor: '' });
  const [novoProfissional, setNovoProfissional] = useState({ nome: '', cargo: '', nivel_acesso: 'padrao' });
  const [clinicasSelecionadas, setClinicasSelecionadas] = useState<number[]>([]); 

  useEffect(() => { 
      fetchClinicas();
      carregarLista();
  }, [aba]);

  async function fetchClinicas() {
      const { data } = await supabase.from('clinicas').select('*');
      if (data) setClinicas(data);
  }

  async function carregarLista() {
    setLoading(true);
    if (aba === 'servicos') {
        const { data } = await supabase.from('servicos').select('*').order('nome');
        if (data) setDados(data);
    } else {
        const { data } = await supabase.from('profissionais')
            .select('*, profissionais_clinicas(clinicas(nome))')
            .order('nome');
        if (data) setDados(data);
    }
    setLoading(false);
  }

  async function criar(e: any) {
    e.preventDefault();
    setLoading(true);

    if (aba === 'servicos') {
        await supabase.from('servicos').insert([{ nome: novoServico.nome, valor: parseFloat(novoServico.valor) }]);
        setNovoServico({ nome: '', valor: '' });
    } else {
        if (clinicasSelecionadas.length === 0) {
            alert('Selecione pelo menos uma clínica!');
            setLoading(false);
            return;
        }

        const { data: prof, error } = await supabase.from('profissionais')
            .insert([{ 
                nome: novoProfissional.nome, 
                cargo: novoProfissional.cargo,
                nivel_acesso: novoProfissional.nivel_acesso
            }])
            .select()
            .single();
        
        if (error) { alert('Erro: ' + error.message); setLoading(false); return; }

        const vinculos = clinicasSelecionadas.map(id => ({ profissional_id: prof.id, clinica_id: id }));
        await supabase.from('profissionais_clinicas').insert(vinculos);

        setNovoProfissional({ nome: '', cargo: '', nivel_acesso: 'padrao' });
        setClinicasSelecionadas([]);
    }
    
    await carregarLista();
    setLoading(false);
  }

  async function excluir(id: number) {
    if(!confirm('Tem certeza?')) return;
    const tabela = aba === 'servicos' ? 'servicos' : 'profissionais';
    await supabase.from(tabela).delete().eq('id', id);
    carregarLista();
  }

  function toggleClinica(id: number) {
      if (clinicasSelecionadas.includes(id)) setClinicasSelecionadas(prev => prev.filter(c => c !== id));
      else setClinicasSelecionadas(prev => [...prev, id]);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20">
      
      <div className="flex gap-4 border-b border-slate-200">
          <button onClick={() => setAba('servicos')} className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors ${aba === 'servicos' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400'}`}><Tag size={18}/> Procedimentos</button>
          <button onClick={() => setAba('profissionais')} className={`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors ${aba === 'profissionais' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400'}`}><User size={18}/> Profissionais & Acessos</button>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">{aba === 'servicos' ? 'Catálogo de Preços' : 'Cadastro de Equipe'}</h2>

        <form onSubmit={criar} className="bg-slate-50 p-5 rounded-xl border border-slate-100 mb-6 space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-end">
                {aba === 'servicos' ? (
                    <>
                        <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400">NOME</label><input required value={novoServico.nome} onChange={e => setNovoServico({...novoServico, nome: e.target.value})} className="w-full p-2 rounded border border-slate-200 outline-blue-500" placeholder="Ex: Limpeza"/></div>
                        <div className="w-32"><label className="text-xs font-bold text-slate-400">VALOR (R$)</label><input required type="number" value={novoServico.valor} onChange={e => setNovoServico({...novoServico, valor: e.target.value})} className="w-full p-2 rounded border border-slate-200 outline-blue-500" placeholder="0.00"/></div>
                    </>
                ) : (
                    <>
                        <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400">NOME</label><input required value={novoProfissional.nome} onChange={e => setNovoProfissional({...novoProfissional, nome: e.target.value})} className="w-full p-2 rounded border border-slate-200 outline-blue-500" placeholder="Ex: Dr. Silva"/></div>
                        <div className="w-1/3"><label className="text-xs font-bold text-slate-400">CARGO</label><input required value={novoProfissional.cargo} onChange={e => setNovoProfissional({...novoProfissional, cargo: e.target.value})} className="w-full p-2 rounded border border-slate-200 outline-blue-500" placeholder="Ex: Dentista"/></div>
                        <div className="w-1/3"><label className="text-xs font-bold text-slate-400">PERMISSÃO</label><select value={novoProfissional.nivel_acesso} onChange={e => setNovoProfissional({...novoProfissional, nivel_acesso: e.target.value})} className="w-full p-2 rounded border border-slate-200 outline-blue-500"><option value="padrao">Padrão</option><option value="admin">Administrador</option></select></div>
                    </>
                )}
            </div>

            {aba === 'profissionais' && (
                <div>
                    <label className="text-xs font-bold text-slate-400 block mb-2">ATENDE NAS CLÍNICAS:</label>
                    <div className="flex flex-wrap gap-2">{clinicas.map(c => { const isSelected = clinicasSelecionadas.includes(c.id); return (<button key={c.id} type="button" onClick={() => toggleClinica(c.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${isSelected ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'}`}>{isSelected ? <CheckSquare size={16}/> : <Square size={16}/>}{c.nome}</button>)})}</div>
                </div>
            )}

            <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold hover:bg-blue-700 flex justify-center items-center gap-2 shadow-sm">{loading ? <Loader2 className="animate-spin"/> : <Plus size={20}/>} Cadastrar</button>
        </form>

        <div className="space-y-2">
            {loading && dados.length === 0 && <p className="text-center text-slate-400">Carregando...</p>}
            {dados.map((item: any) => (
                <div key={item.id} className="flex justify-between items-center p-3 border border-slate-100 rounded-lg hover:border-blue-200 transition-colors bg-white">
                    <div>
                        <p className="font-bold text-slate-700 flex items-center gap-2">{item.nome} {item.nivel_acesso === 'admin' && <span className="bg-yellow-100 text-yellow-700 text-[10px] px-1.5 rounded border border-yellow-200 flex items-center gap-1"><Shield size={10}/> ADMIN</span>}</p>
                        <div className="text-xs text-slate-400 flex flex-wrap gap-1 mt-1 items-center">{aba === 'servicos' ? `R$ ${item.valor}` : item.cargo}
                            {aba === 'profissionais' && item.profissionais_clinicas?.map((pc: any, idx: number) => (<span key={idx} className="flex items-center gap-1 bg-slate-50 text-slate-600 px-1.5 rounded border border-slate-200 text-[10px]"><Building2 size={10}/> {pc.clinicas?.nome}</span>))}
                        </div>
                    </div>
                    <button onClick={() => excluir(item.id)} className="text-slate-300 hover:text-red-500 p-2"><Trash2 size={18}/></button>
                </div>
            ))}
            {!loading && dados.length === 0 && <p className="text-center text-slate-400 py-4">Nenhum registro encontrado.</p>}
        </div>
      </div>
    </div>
  );
}