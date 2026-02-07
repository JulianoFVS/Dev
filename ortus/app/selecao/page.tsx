'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Building2, Plus, Globe, LogOut, ChevronRight, Loader2, AlertCircle } from 'lucide-react';

export default function SelecaoClinica() {
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [nomeNova, setNomeNova] = useState('');
  const [usuario, setUsuario] = useState<any>(null);
  
  const router = useRouter();

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');

    try {
        // CHAMADA API SEGURA (Garante que Admins vejam tudo)
        const res = await fetch('/api/listar-clinicas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id })
        });

        const json = await res.json();
        
        if (!res.ok) throw new Error(json.error);

        setUsuario(json.usuario);
        
        if (json.clinicas && json.clinicas.length > 0) {
            // Adiciona opção "Todas" no topo
            const lista = [
                { id: 'todas', nome: 'Todas as Clínicas', endereco: 'Visão Geral' },
                ...json.clinicas
            ];
            setClinicas(lista);
        }
    } catch (err) {
        console.error('Erro ao carregar clínicas:', err);
    } finally {
        setLoading(false);
    }
  }

  function selecionar(id: string) {
      localStorage.setItem('ortus_clinica_id', id);
      router.push('/dashboard');
  }

  async function criarClinica() {
      if (!nomeNova) return alert('Digite o nome da clínica.');
      setCriando(true);
      
      // Criação direta via API ou Client (Client pode falhar se RLS for estrito, mas Admin geralmente pode inserir)
      // Vamos tentar via Client primeiro, se falhar, precisaríamos de API de criação (já temos criar-usuario, mas não criar-clinica solta)
      // Assumindo que RLS permite insert para auth users:
      
      const { data: nova, error } = await supabase.from('clinicas').insert([{ nome: nomeNova }]).select().single();
      
      if (nova) {
          // Vincula automaticamente
          if(usuario) {
             await supabase.from('profissionais_clinicas').insert([{ profissional_id: usuario.id, clinica_id: nova.id }]);
          }
          alert('Clínica criada com sucesso!');
          selecionar(nova.id.toString());
      } else {
          alert('Erro ao criar: ' + (error?.message || 'Verifique suas permissões'));
          setCriando(false);
      }
  }

  async function entrarMatriz() {
      setCriando(true);
      // Tenta buscar "Matriz"
      const { data: existe } = await supabase.from('clinicas').select('*').ilike('nome', 'Matriz').maybeSingle();
      
      if (existe) {
          // Se achou, seleciona (e vincula se precisar, mas vamos só selecionar por enquanto)
          // Idealmente vincularia, mas se for Admin já vê tudo pela API
          selecionar(existe.id.toString());
      } else {
          // Se não achou, cria
          const { data: nova } = await supabase.from('clinicas').insert([{ nome: 'Matriz Principal', endereco: 'Sede' }]).select().single();
          if (nova) selecionar(nova.id.toString());
          else {
              alert('Não foi possível acessar a Matriz.');
              setCriando(false);
          }
      }
  }

  async function sair() {
      await supabase.auth.signOut();
      localStorage.removeItem('ortus_clinica_id');
      router.push('/login');
  }

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50 text-blue-600"><Loader2 className="animate-spin" size={40}/></div>;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="text-center mb-8">
                <img src="/logo.png" alt="Ortus" className="h-12 w-auto mx-auto mb-4 object-contain"/>
                <h1 className="text-2xl font-black text-slate-800">Selecionar Unidade</h1>
                <p className="text-slate-500 font-medium">Bem-vindo(a), {usuario?.nome?.split(' ')[0] || 'Dr(a).'}</p>
            </div>

            {clinicas.length > 0 ? (
                <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                    <div className="p-2 space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar">
                        {clinicas.map((c) => (
                            <button key={c.id} onClick={() => selecionar(c.id)} className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-blue-50 transition-all group text-left border border-transparent hover:border-blue-100">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold shadow-sm transition-colors ${c.id === 'todas' ? 'bg-slate-800 text-white' : 'bg-white text-blue-600 border border-slate-100'}`}>
                                        {c.id === 'todas' ? <Globe size={20}/> : <Building2 size={20}/>}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 text-sm">{c.nome}</h3>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{c.endereco || 'Acesso Geral'}</p>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-500"/>
                            </button>
                        ))}
                    </div>
                    <div className="p-4 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-3">
                        <button onClick={() => setClinicas([])} className="py-2 text-blue-600 font-bold text-xs flex items-center justify-center gap-2 hover:bg-blue-50 rounded-lg transition-colors"><Plus size={14}/> Nova</button>
                        <button onClick={sair} className="py-2 text-red-400 font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-50 rounded-lg transition-colors"><LogOut size={14}/> Sair</button>
                    </div>
                </div>
            ) : (
                <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 text-center space-y-6">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400"><Building2 size={32}/></div>
                    <div><h3 className="font-bold text-lg text-slate-800">Nenhuma unidade encontrada</h3><p className="text-sm text-slate-500">Crie a primeira clínica ou entre na Matriz.</p></div>
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="Nome da Clínica" value={nomeNova} onChange={e => setNomeNova(e.target.value)} />
                            <button onClick={criarClinica} disabled={criando} className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700">{criando ? <Loader2 className="animate-spin"/> : <Plus/>}</button>
                        </div>
                        <button onClick={entrarMatriz} className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900 shadow-lg">Acessar Matriz Padrão</button>
                    </div>
                    <button onClick={sair} className="text-xs text-red-400 font-bold hover:underline mt-4">Sair do sistema</button>
                </div>
            )}
        </div>
    </div>
  );
}