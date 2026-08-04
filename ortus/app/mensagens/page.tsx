'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Mail, CheckSquare, Trash2, History } from 'lucide-react';
import { useCustomAlert } from '@/components/ui/CustomAlert';

export default function Mensagens() {
  const [todos, setTodos] = useState<any[]>([]);
  const [escopo, setEscopo] = useState<'ativas' | 'historico'>('ativas');
  const [loading, setLoading] = useState(true);
  const { showConfirm } = useCustomAlert();

  useEffect(() => {
    carregar();
  }, [escopo]);

  async function carregar() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const agoraIso = new Date().toISOString();
      let query = supabase.from('notificacoes').select('*').eq('user_id', user.id).eq('tipo', 'mensagem');
      if (escopo === 'ativas') {
        query = query.or(`expires_at.is.null,expires_at.gt.${agoraIso}`);
      } else {
        query = query.or(`lida.eq.true,expires_at.lte.${agoraIso}`).limit(200);
      }
      const { data } = await query.order('created_at', { ascending: false });
      setTodos(data || []);
    }
    setLoading(false);
  }

  async function marcarLida(id: any) {
    setTodos(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
    await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
  }

  async function excluir(id: any) {
    if (!(await showConfirm('Apagar esta mensagem?', { title: 'Excluir', type: 'warning', confirmLabel: 'Apagar' }))) return;
    setTodos(prev => prev.filter(n => n.id !== id));
    await supabase.from('notificacoes').delete().eq('id', id);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col items-center md:flex-row md:justify-between md:items-end gap-4 mb-2">
        <div className="text-center md:text-left">
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">Central de Mensagens</h2>
          <p className="text-slate-500 text-sm">Mensagens diretas da equipe e da clínica.</p>
        </div>
        <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200">
          <button onClick={() => setEscopo('ativas')} className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${escopo === 'ativas' ? 'bg-purple-50 text-purple-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Ativas</button>
          <button onClick={() => setEscopo('historico')} className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${escopo === 'historico' ? 'bg-slate-100 text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><History size={14}/> Histórico</button>
        </div>
      </div>
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center py-20 text-slate-400">Carregando...</div>
        ) : todos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-20 text-center">
            <Mail size={40} className="text-slate-200 mb-3"/>
            <h3 className="text-slate-800 font-bold">Nenhuma mensagem</h3>
            <p className="text-slate-400 text-sm mt-1">Tudo limpo por aqui!</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {todos.map((n: any) => (
              <div key={n.id} className={`p-5 flex gap-4 ${!n.lida ? 'bg-purple-50/30' : ''}`}>
                <div className="mt-1 bg-white p-2 rounded-xl border"><Mail size={20} className="text-purple-500"/></div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-slate-800">{n.titulo}</h4>
                  <p className="text-sm text-slate-500 mt-0.5">{n.mensagem}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{new Date(n.created_at).toLocaleString('pt-BR')}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {!n.lida && <button onClick={() => marcarLida(n.id)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Marcar como lida"><CheckSquare size={18}/></button>}
                  <button onClick={() => excluir(n.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Excluir"><Trash2 size={18}/></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
