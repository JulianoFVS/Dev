'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, Mail, Calendar, AlertTriangle, Info, CheckSquare, Trash2, History } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useCustomAlert } from '@/components/ui/CustomAlert';

const TIPOS_ALERTA = new Set(['agenda', 'alerta', 'sistema', 'aviso']);
const TIPOS_MENSAGEM = new Set(['mensagem']);

type AbaInbox = 'alertas' | 'mensagens';

export default function Inbox() {
  const [todos, setTodos] = useState<any[]>([]);
  const [abaAtiva, setAbaAtiva] = useState<AbaInbox>('alertas');
  const [escopo, setEscopo] = useState<'ativas' | 'historico'>('ativas');
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showConfirm } = useCustomAlert();

  const sincronizarAba = useCallback((tab: string | null) => {
      setAbaAtiva(tab === 'mensagens' ? 'mensagens' : 'alertas');
  }, []);

  useEffect(() => {
      sincronizarAba(searchParams.get('tab'));
      carregar();
  }, [searchParams, escopo, sincronizarAba]);

  function trocarAba(tab: AbaInbox) {
      setAbaAtiva(tab);
      router.replace(`/inbox?tab=${tab}`, { scroll: false });
  }

  async function carregar() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if(user) {
        const agoraIso = new Date().toISOString();
        let query = supabase.from('notificacoes').select('*').eq('user_id', user.id);
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
      if(!(await showConfirm('Apagar esta notificação?', { title: 'Excluir', type: 'warning', confirmLabel: 'Apagar' }))) return;
      setTodos(prev => prev.filter(n => n.id !== id));
      await supabase.from('notificacoes').delete().eq('id', id);
  }

  const alertas = todos.filter((n: any) => TIPOS_ALERTA.has(n.tipo));
  const mensagens = todos.filter((n: any) => TIPOS_MENSAGEM.has(n.tipo));
  const listaAtual = abaAtiva === 'alertas' ? alertas : mensagens;

  const getIcon = (tipo: string) => {
      if (tipo === 'agenda') return <Calendar size={20} className="text-blue-500"/>;
      if (tipo === 'alerta') return <AlertTriangle size={20} className="text-amber-500"/>;
      if (tipo === 'mensagem') return <Mail size={20} className="text-purple-500"/>;
      return <Info size={20} className="text-slate-400"/>;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col items-center md:flex-row md:justify-between md:items-end gap-4 mb-2">
        <div className="text-center md:text-left">
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">Central de Avisos</h2>
          <p className="text-slate-500 text-sm">Fique por dentro do que acontece na clínica.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200">
            <button onClick={() => trocarAba('alertas')} className={`px-4 sm:px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${abaAtiva === 'alertas' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              <Bell size={16}/> Notificações
              {alertas.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{alertas.length}</span>}
            </button>
            <button onClick={() => trocarAba('mensagens')} className={`px-4 sm:px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${abaAtiva === 'mensagens' ? 'bg-purple-50 text-purple-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
              <Mail size={16}/> Mensagens
              {mensagens.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">{mensagens.length}</span>}
            </button>
          </div>
          <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-200">
            <button onClick={() => setEscopo('ativas')} className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${escopo === 'ativas' ? 'bg-emerald-50 text-emerald-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Ativas</button>
            <button onClick={() => setEscopo('historico')} className={`px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all ${escopo === 'historico' ? 'bg-slate-100 text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><History size={14}/> Histórico</button>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center py-20 text-slate-400">Carregando...</div>
        ) : listaAtual.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-20 text-center">
            <h3 className="text-slate-800 font-bold">{abaAtiva === 'alertas' ? 'Nenhuma notificação' : 'Nenhuma mensagem'}</h3>
            <p className="text-slate-400 text-sm mt-1">Tudo limpo por aqui!</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {listaAtual.map((n: any) => (
              <div key={n.id} className={`p-5 flex gap-4 ${!n.lida ? 'bg-blue-50/30' : ''}`}>
                <div className="mt-1 bg-white p-2 rounded-xl border">{getIcon(n.tipo)}</div>
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
