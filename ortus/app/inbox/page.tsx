'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, Calendar, AlertTriangle, Info } from 'lucide-react';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import BentoNotificationFeed from '@/components/bento/BentoNotificationFeed';

const TIPOS_ALERTA = new Set(['agenda', 'alerta', 'sistema', 'aviso']);

export default function Inbox() {
  const [todos, setTodos] = useState<any[]>([]);
  const [escopo, setEscopo] = useState<'ativas' | 'historico'>('ativas');
  const [loading, setLoading] = useState(true);
  const { showConfirm } = useCustomAlert();

  useEffect(() => {
    carregar();
  }, [escopo]);

  async function carregar() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const agoraIso = new Date().toISOString();
      let query = supabase.from('notificacoes').select('*').eq('user_id', user.id);
      if (escopo === 'ativas') {
        query = query.or(`expires_at.is.null,expires_at.gt.${agoraIso}`);
      } else {
        query = query.or(`lida.eq.true,expires_at.lte.${agoraIso}`).limit(200);
      }
      const { data } = await query.order('created_at', { ascending: false });
      setTodos((data || []).filter((n: any) => TIPOS_ALERTA.has(n.tipo)));
    }
    setLoading(false);
  }

  async function marcarLida(id: any) {
    setTodos((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
  }

  async function excluir(id: any) {
    if (!(await showConfirm('Apagar esta notificação?', { title: 'Excluir', type: 'warning', confirmLabel: 'Apagar' }))) return;
    setTodos((prev) => prev.filter((n) => n.id !== id));
    await supabase.from('notificacoes').delete().eq('id', id);
  }

  function iconFor(tipo: string) {
    if (tipo === 'agenda') return <Calendar size={18} className="text-neutral-700" />;
    if (tipo === 'alerta') return <AlertTriangle size={18} className="text-amber-600" />;
    return <Info size={18} className="text-neutral-400" />;
  }

  return (
    <BentoNotificationFeed
      title="Notificações"
      subtitle="Central de avisos da clínica"
      emptyTitle="Nenhuma notificação"
      emptyIcon={<Bell size={40} />}
      escopo={escopo}
      onEscopo={setEscopo}
      loading={loading}
      items={todos}
      onMarkRead={marcarLida}
      onDelete={excluir}
      iconForItem={(n) => iconFor(String((n as any).tipo || 'sistema'))}
    />
  );
}
