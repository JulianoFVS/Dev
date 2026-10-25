'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { AlertTriangle, Bell, Calendar, Info, Mail } from 'lucide-react';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import BentoNotificationFeed from '@/components/bento/BentoNotificationFeed';

const TIPOS_ALERTA = new Set(['agenda', 'alerta', 'sistema', 'aviso']);

function Painel({
  titulo,
  subtitulo,
  vazio,
  iconeVazio,
  modo,
  iconeItem,
}: {
  titulo: string;
  subtitulo: string;
  vazio: string;
  iconeVazio: ReactNode;
  modo: 'mensagem' | 'alerta';
  iconeItem: (tipo: string) => ReactNode;
}) {
  const [todos, setTodos] = useState<any[]>([]);
  const [escopo, setEscopo] = useState<'ativas' | 'historico'>('ativas');
  const [loading, setLoading] = useState(true);
  const { showConfirm } = useCustomAlert();

  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelado) {
        if (!cancelado) setLoading(false);
        return;
      }
      const agoraIso = new Date().toISOString();
      let query = supabase.from('notificacoes').select('*').eq('user_id', user.id);
      if (escopo === 'ativas') query = query.or(`expires_at.is.null,expires_at.gt.${agoraIso}`);
      else query = query.or(`lida.eq.true,expires_at.lte.${agoraIso}`).limit(200);
      const { data } = await query.order('created_at', { ascending: false });
      if (!cancelado) {
        setTodos((data || []).filter((item) => modo === 'mensagem' ? item.tipo === 'mensagem' : TIPOS_ALERTA.has(String(item.tipo || ''))));
        setLoading(false);
      }
    }
    carregar();
    return () => { cancelado = true; };
  }, [escopo, modo]);

  async function marcarLida(id: any) {
    setTodos((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
  }

  async function excluir(id: any) {
    if (!(await showConfirm(`Apagar este item de ${titulo.toLowerCase()}?`, { title: 'Excluir', type: 'warning', confirmLabel: 'Apagar' }))) return;
    setTodos((prev) => prev.filter((n) => n.id !== id));
    await supabase.from('notificacoes').delete().eq('id', id);
  }

  return (
    <BentoNotificationFeed
      embedded
      title={titulo}
      subtitle={subtitulo}
      emptyTitle={vazio}
      emptyIcon={iconeVazio}
      escopo={escopo}
      onEscopo={setEscopo}
      loading={loading}
      items={todos}
      onMarkRead={marcarLida}
      onDelete={excluir}
      iconForItem={(n) => iconeItem(String((n as { tipo?: string }).tipo || ''))}
    />
  );
}

export default function Mensagens() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <header className="mb-3 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Mensagens</h1>
        <p className="mt-1 text-sm text-neutral-500 sm:text-base">Comunicação da equipe de um lado e avisos da clínica do outro.</p>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-2">
        <Painel
          titulo="Mensagens"
          subtitulo="Comunicação interna"
          vazio="Nenhuma mensagem"
          iconeVazio={<Mail size={32} />}
          modo="mensagem"
          iconeItem={() => <Mail size={18} className="text-neutral-700" />}
        />
        <Painel
          titulo="Notificações"
          subtitulo="Avisos da clínica"
          vazio="Nenhuma notificação"
          iconeVazio={<Bell size={32} />}
          modo="alerta"
          iconeItem={(tipo) => tipo === 'agenda'
            ? <Calendar size={18} className="text-neutral-700" />
            : tipo === 'alerta'
              ? <AlertTriangle size={18} className="text-amber-600" />
              : <Info size={18} className="text-neutral-400" />}
        />
      </div>
    </div>
  );
}
