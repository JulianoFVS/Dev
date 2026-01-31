'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, User, Tag, CheckSquare, Square, Loader2, Edit, X, Save, Shield, Mail, Lock, AlertCircle, Palette } from 'lucide-react';

export default function Configuracoes() {
  const [aba, setAba] = useState('servicos');
  const [dados, setDados] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editandoId, setEditandoId] = useState(null); 
  const [userIdAuth, setUserIdAuth] = useState(null); 
  const [novoServico, setNovoServico] = useState({ nome: '', valor: '', cor: 'blue' });
  const [novoProfissional, setNovoProfissional] = useState({ nome: '', cargo: '', nivel_acesso: 'padrao', email: '', password: '' });
  const [clinicasSelecionadas, setClinicasSelecionadas] = useState<any[]>([]); 

  const coresDisponiveis = [ { nome: 'slate', classe: 'bg-slate-500' }, { nome: 'blue', classe: 'bg-blue-500' }, { nome: 'red', classe: 'bg-red-500' }, { nome: 'green', classe: 'bg-green-500' }, { nome: 'yellow', classe: 'bg-yellow-500' }, { nome: 'purple', classe: 'bg-purple-500' } ];

  useEffect(() => { fetchClinicas(); carregarLista(); }, [aba]);

  async function fetchClinicas() { const { data } = await supabase.from('clinicas').select('*'); if (data) setClinicas(data); }
  async function carregarLista() { setLoading(true); if (aba === 'servicos') { const { data } = await supabase.from('servicos').select('*').order('nome'); if (data) setDados(data); } else { const { data } = await supabase.from('profissionais').select('*, profissionais_clinicas(clinica_id, clinicas(nome))').order('nome'); if (data) setDados(data); } setLoading(false); }

  function editarItem(item: any) { setEditandoId(item.id); if (aba === 'servicos') { setNovoServico({ nome: item.nome, valor: item.valor, cor: item.cor || 'blue' }); } else { setUserIdAuth(item.user_id); setNovoProfissional({ nome: item.nome, cargo: item.cargo, nivel_acesso: item.nivel_acesso, email: item.email || '', password: '' }); const idsClinicas = item.profissionais_clinicas?.map((pc: any) => pc.clinica_id) || []; setClinicasSelecionadas(idsClinicas); } }
  function cancelarEdicao() { setEditandoId(null); setUserIdAuth(null); setNovoServico({ nome: '', valor: '', cor: 'blue' }); setNovoProfissional({ nome: '', cargo: '', nivel_acesso: 'padrao', email: '', password: '' }); setClinicasSelecionadas([]); }

  async function salvar(e: any) { e.preventDefault(); setLoading(true); try { if (aba === 'servicos') { const payload = { ...novoServico, valor: parseFloat(novoServico.valor) }; if (editandoId) await supabase.from('servicos').update(payload).eq('id', editandoId); else await supabase.from('servicos').insert([payload]); } else { if (clinicasSelecionadas.length === 0) throw new Error('Selecione pelo menos uma clínica.'); if (editandoId) { await fetch('/api/editar-usuario', { method: 'POST', body: JSON.stringify({ id: editandoId, user_id: userIdAuth, ...novoProfissional, clinicas: clinicasSelecionadas }) }); } else { await fetch('/api/criar-usuario', { method: 'POST', body: JSON.stringify({ ...novoProfissional, clinicas: clinicasSelecionadas }) }); } } cancelarEdicao(); await carregarLista(); } catch (err: any) { alert('Erro: ' + err.message); } setLoading(false); }
  async function excluir(id: any) { if(!confirm('Confirmar exclusão?')) return; setLoading(true); const tabela = aba === 'servicos' ? 'servicos' : 'profissionais'; await supabase.from(tabela).delete().eq('id', id); await carregarLista(); setLoading(false); }
  function toggleClinica(id: any) { if (clinicasSelecionadas.includes(id)) setClinicasSelecionadas(prev => prev.filter(c => c !== id)); else setClinicasSelecionadas(prev => [...prev, id]); }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <div className="flex gap-4 border-b"><button onClick={() => setAba('servicos')} className="pb-3 px-4 font-bold border-b-2">Procedimentos</button><button onClick={() => setAba('profissionais')} className="pb-3 px-4 font-bold border-b-2">Profissionais</button></div>
      <div className="bg-white p-6 rounded-2xl shadow-sm border">
        <h2 className="text-xl font-bold mb-6">{editandoId ? 'Editando' : 'Novo'}</h2>
        <form onSubmit={salvar} className="space-y-4">
            {aba === 'servicos' ? (<div className="flex gap-4"><input className="border p-2 rounded w-full" value={novoServico.nome} onChange={e => setNovoServico({...novoServico, nome: e.target.value})} placeholder="Nome"/><input className="border p-2 rounded w-32" type="number" value={novoServico.valor} onChange={e => setNovoServico({...novoServico, valor: e.target.value})} placeholder="Valor"/></div>) : (<div className="grid grid-cols-2 gap-4"><input className="border p-2 rounded" value={novoProfissional.nome} onChange={e => setNovoProfissional({...novoProfissional, nome: e.target.value})} placeholder="Nome"/><input className="border p-2 rounded" value={novoProfissional.cargo} onChange={e => setNovoProfissional({...novoProfissional, cargo: e.target.value})} placeholder="Cargo"/><input className="border p-2 rounded" value={novoProfissional.email} onChange={e => setNovoProfissional({...novoProfissional, email: e.target.value})} placeholder="Email"/><input className="border p-2 rounded" type="password" value={novoProfissional.password} onChange={e => setNovoProfissional({...novoProfissional, password: e.target.value})} placeholder="Senha"/></div>)}
            {aba === 'profissionais' && (<div className="flex gap-2 flex-wrap">{clinicas.map((c:any) => (<button key={c.id} type="button" onClick={() => toggleClinica(c.id)} className={`border px-3 py-1 rounded ${clinicasSelecionadas.includes(c.id) ? 'bg-blue-100' : ''}`}>{c.nome}</button>))}</div>)}
            <button disabled={loading} className="bg-blue-600 text-white px-6 py-2 rounded font-bold">{loading ? '...' : 'Salvar'}</button>
        </form>
        <div className="mt-6 space-y-2">{dados.map((item:any) => (<div key={item.id} className="flex justify-between p-4 border rounded"><p className="font-bold">{item.nome}</p><div className="flex gap-2"><button onClick={() => editarItem(item)}><Edit size={18}/></button><button onClick={() => excluir(item.id)}><Trash2 size={18}/></button></div></div>))}</div>
      </div>
    </div>
  );
}