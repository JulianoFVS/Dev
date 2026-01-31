'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, Mail, Calendar, AlertTriangle, Info, CheckSquare, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function Inbox() {
  const [todos, setTodos] = useState<any[]>([]); // FIX: any[]
  const [abaAtiva, setAbaAtiva] = useState('alertas');
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();

  useEffect(() => { 
      const tab = searchParams.get('tab');
      if (tab === 'mensagens') setAbaAtiva('mensagens');
      else setAbaAtiva('alertas');
      carregar(); 
  }, [searchParams]);

  async function carregar() {
    const { data: { user } } = await supabase.auth.getUser();
    if(user) {
        const { data } = await supabase.from('notificacoes').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        setTodos(data || []);
    }
    setLoading(false);
  }

  async function marcarLida(id: any) {
      setTodos(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
      await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
      window.location.reload(); 
  }

  async function excluir(id: any) {
      if(!confirm('Apagar esta notificação?')) return;
      setTodos(prev => prev.filter(n => n.id !== id));
      await supabase.from('notificacoes').delete().eq('id', id);
  }

  const alertas = todos.filter((n: any) => ['agenda', 'alerta', 'sistema', 'aviso'].includes(n.tipo));
  const mensagens = todos.filter((n: any) => !['agenda', 'alerta', 'sistema', 'aviso'].includes(n.tipo));
  const listaAtual = abaAtiva === 'alertas' ? alertas : mensagens;

  const getIcon = (tipo: string) => {
      if (tipo === 'agenda') return <Calendar size={20} className="text-blue-500"/>;
      if (tipo === 'alerta') return <AlertTriangle size={20} className="text-amber-500"/>;
      if (tipo === 'mensagem') return <Mail size={20} className="text-purple-500"/>;
      return <Info size={20} className="text-slate-400"/>;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-2"><div><h2 className="text-2xl font-black text-slate-800 tracking-tight">Central de Avisos</h2><p className="text-slate-500 text-sm">Fique por dentro do que acontece na clínica.</p></div><div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200"><button onClick={() => setAbaAtiva('alertas')} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${abaAtiva === 'alertas' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><Bell size={16}/> Notificações</button><button onClick={() => setAbaAtiva('mensagens')} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${abaAtiva === 'mensagens' ? 'bg-purple-50 text-purple-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><Mail size={16}/> Mensagens</button></div></div>
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {listaAtual.length === 0 && (<div className="h-full flex flex-col items-center justify-center py-20 text-center"><h3 className="text-slate-800 font-bold">Tudo limpo!</h3></div>)}
        <div className="divide-y divide-slate-100">{listaAtual.map((n:any) => (<div key={n.id} className="p-5 flex gap-4"><div className="mt-1 bg-white p-2 rounded-xl border">{getIcon(n.tipo)}</div><div className="flex-1"><h4>{n.titulo}</h4><p>{n.mensagem}</p></div><div className="flex gap-2"><button onClick={() => marcarLida(n.id)}><CheckSquare size={18}/></button><button onClick={() => excluir(n.id)}><Trash2 size={18}/></button></div></div>))}</div>
      </div>
    </div>
  );
}