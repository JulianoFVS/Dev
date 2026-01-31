'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, Mail, CheckCircle, Trash2, Calendar, AlertTriangle, Info, CheckSquare } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function Inbox() {
  const [todos, setTodos] = useState([]);
  const [abaAtiva, setAbaAtiva] = useState('alertas');
  const [loading, setLoading] = useState(true);
  
  const searchParams = useSearchParams();

  useEffect(() => { 
      // Lógica de Troca Automática de Aba
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

  async function marcarLida(id) {
      setTodos(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
      await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
      window.location.reload(); 
  }

  async function excluir(id) {
      if(!confirm('Apagar esta notificação?')) return;
      setTodos(prev => prev.filter(n => n.id !== id));
      await supabase.from('notificacoes').delete().eq('id', id);
  }

  const alertas = todos.filter(n => ['agenda', 'alerta', 'sistema', 'aviso'].includes(n.tipo));
  const mensagens = todos.filter(n => !['agenda', 'alerta', 'sistema', 'aviso'].includes(n.tipo));

  const listaAtual = abaAtiva === 'alertas' ? alertas : mensagens;

  const getIcon = (tipo) => {
      if (tipo === 'agenda') return <Calendar size={20} className="text-blue-500"/>;
      if (tipo === 'alerta') return <AlertTriangle size={20} className="text-amber-500"/>;
      if (tipo === 'mensagem') return <Mail size={20} className="text-purple-500"/>;
      return <Info size={20} className="text-slate-400"/>;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20">
      
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-2">
        <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Central de Avisos</h2>
            <p className="text-slate-500 text-sm">Fique por dentro do que acontece na clínica.</p>
        </div>
        
        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200">
            <button 
                onClick={() => setAbaAtiva('alertas')}
                className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${abaAtiva === 'alertas' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
                <Bell size={16}/> 
                Notificações 
                {alertas.filter(n => !n.lida).length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{alertas.filter(n => !n.lida).length}</span>}
            </button>
            <button 
                onClick={() => setAbaAtiva('mensagens')}
                className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${abaAtiva === 'mensagens' ? 'bg-purple-50 text-purple-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
                <Mail size={16}/> 
                Mensagens
                {mensagens.filter(n => !n.lida).length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{mensagens.filter(n => !n.lida).length}</span>}
            </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {listaAtual.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center py-20 text-center">
                <div className="bg-slate-50 p-6 rounded-full text-slate-300 mb-4">
                    {abaAtiva === 'alertas' ? <Bell size={40}/> : <Mail size={40}/>}
                </div>
                <h3 className="text-slate-800 font-bold">Tudo limpo por aqui!</h3>
                <p className="text-slate-400 text-sm mt-1">Você não tem {abaAtiva === 'alertas' ? 'novas notificações' : 'novas mensagens'}.</p>
            </div>
        )}

        <div className="divide-y divide-slate-100">
            {listaAtual.map(n => (
                <div key={n.id} className={`p-5 flex gap-4 transition-all hover:bg-slate-50 group relative ${n.lida ? 'bg-white' : 'bg-blue-50/40'}`}>
                    {!n.lida && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>}
                    
                    <div className="mt-1 bg-white p-2 rounded-xl shadow-sm border border-slate-100 h-fit">
                        {getIcon(n.tipo)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                            <h4 className={`text-sm font-bold truncate pr-4 ${n.lida ? 'text-slate-600' : 'text-slate-800'}`}>{n.titulo}</h4>
                            <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                {new Date(n.created_at).toLocaleDateString('pt-BR')} às {new Date(n.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                            </span>
                        </div>
                        <p className={`text-sm leading-relaxed ${n.lida ? 'text-slate-400' : 'text-slate-600'}`}>{n.mensagem}</p>
                    </div>

                    <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity pl-2 border-l border-slate-100">
                        {!n.lida && (
                            <button onClick={() => marcarLida(n.id)} className="text-blue-500 hover:bg-blue-100 p-2 rounded-lg" title="Marcar como lida">
                                <CheckSquare size={18}/>
                            </button>
                        )}
                        <button onClick={() => excluir(n.id)} className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-lg" title="Excluir">
                            <Trash2 size={18}/>
                        </button>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}