'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useClinica } from '@/app/context/ClinicaContext';
import { Building2, Globe, LogOut, ChevronRight, Loader2, PlusCircle } from 'lucide-react';

function nomeRede(c: any): string | null {
    const r = c?.redes;
    if (!r) return null;
    const obj = Array.isArray(r) ? r[0] : r;
    return obj?.nome || null;
}

export default function SelecaoClinica() {
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [usuario, setUsuario] = useState<any>(null);
  const router = useRouter();
  const { setActiveClinicById } = useClinica();

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const res = await fetch('/api/listar-clinicas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id })
        });

        const json = await res.json();
        
        if (!res.ok) {
            console.error(json.error);
            // Se der erro na API, tenta carregar direto do cliente como fallback
            fallbackCarregarDoCliente();
            return;
        }

        setUsuario(json.usuario);

        const listaDoBanco = json.clinicas || [];
        
        // Adiciona "Todas as Clínicas" no topo
        const opcaoTodas = { id: 'todas', nome: 'Todas as Clínicas', endereco: 'Visão Geral Multi-Unidades' };
        
        setClinicas([opcaoTodas, ...listaDoBanco]);
        setLoading(false);

    } catch (err) {
        console.error(err);
        setLoading(false);
    }
  }

  // Fallback caso a API falhe (busca direta) — 3 etapas compatíveis com RLS.
  async function fallbackCarregarDoCliente() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const { data: prof } = await supabase
          .from('profissionais')
          .select('id, is_super_admin')
          .eq('user_id', session.user.id)
          .maybeSingle();

      let minhas: { id: any; nome: string; endereco: string }[] = [];
      if (prof?.is_super_admin) {
          const { data } = await supabase.from('clinicas').select('id, nome, endereco').order('nome');
          minhas = (data || []) as any;
      } else if (prof?.id) {
          const { data: vinculos } = await supabase
              .from('profissionais_clinicas')
              .select('clinica_id')
              .eq('profissional_id', prof.id);
          const ids = Array.from(new Set((vinculos || []).map((v: any) => v.clinica_id))).filter((x) => x !== null && x !== undefined);
          if (ids.length > 0) {
              const { data } = await supabase
                  .from('clinicas')
                  .select('id, nome, endereco')
                  .in('id', ids as any)
                  .order('nome');
              minhas = (data || []) as any;
          }
      }

      const opcaoTodas = { id: 'todas', nome: 'Todas as Clínicas', endereco: 'Visão Geral' };
      setClinicas([opcaoTodas, ...minhas]);
      setLoading(false);
  }

  function selecionar(id: string) {
      if (typeof window !== 'undefined') {
          const normalized = id === 'todas' ? 'all' : id;
          localStorage.setItem('ortus_clinica_id', normalized);
          try { setActiveClinicById(normalized as any); } catch {}
          router.replace('/dashboard');
      }
  }

  async function sair() {
      await supabase.auth.signOut();
      localStorage.removeItem('ortus_clinica_id');
      router.push('/login');
  }

  if (loading) {
      return (
          <div className="h-screen flex flex-col items-center justify-center bg-slate-50 text-blue-600">
              <Loader2 className="animate-spin mb-2" size={40} />
              <p className="text-sm font-bold text-slate-400">Carregando unidades...</p>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
        
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            
            {/* CABEÇALHO COM LOGO */}
            <div className="p-8 text-center border-b border-slate-50 bg-white">
                <div className="flex justify-center mb-6">
                    <img src="/logo.png" alt="Ortus" className="h-16 w-auto object-contain hover:scale-105 transition-transform"/>
                </div>
                <h1 className="text-xl font-black text-slate-800">Olá, Dr(a). {usuario?.nome?.split(' ')[0]}</h1>
                <p className="text-slate-500 text-sm font-medium mt-1">Selecione onde você vai trabalhar:</p>
            </div>

            {/* LISTA DE CLÍNICAS */}
            <div className="p-2 max-h-[60vh] overflow-y-auto custom-scrollbar bg-slate-50/50">
                {clinicas.map((c) => (
                    <button 
                        key={c.id} 
                        onClick={() => selecionar(c.id.toString())}
                        className="w-full flex items-center justify-between p-4 mb-2 bg-white hover:bg-blue-50 rounded-xl border border-slate-100 hover:border-blue-200 transition-all group shadow-sm last:mb-0"
                    >
                        <div className="flex items-center gap-4 text-left">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm transition-colors ${c.id === 'todas' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-100 text-blue-600'}`}>
                                {c.id === 'todas' ? <Globe size={22}/> : <Building2 size={22}/>}
                            </div>
                            <div>
                                {c.id !== 'todas' && nomeRede(c) && (
                                    <p className="text-[10px] text-blue-500 font-black uppercase tracking-wider mb-0.5">{nomeRede(c)}</p>
                                )}
                                <h3 className="font-bold text-slate-700 text-sm group-hover:text-blue-700 transition-colors">{c.nome}</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{c.endereco || 'Unidade'}</p>
                            </div>
                        </div>
                        <ChevronRight size={20} className="text-slate-300 group-hover:text-blue-500 transition-colors"/>
                    </button>
                ))}
            </div>

            {/* RODAPÉ */}
            <div className="p-4 bg-white border-t border-slate-100">
                <button onClick={sair} className="w-full py-3 text-red-400 font-bold text-xs hover:bg-red-50 rounded-xl transition-all flex items-center justify-center gap-2">
                    <LogOut size={16}/> Sair da Conta
                </button>
            </div>

        </div>
    </div>
  );
}