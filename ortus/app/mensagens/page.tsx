'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Mail } from 'lucide-react';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import BentoNotificationFeed from '@/components/bento/BentoNotificationFeed';

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
    const {
      data: { user },
    } = await supabase.auth.getUser();
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
    setTodos((prev) => prev.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    await supabase.from('notificacoes').update({ lida: true }).eq('id', id);
  }

  async function excluir(id: any) {
    if (!(await showConfirm('Apagar esta mensagem?', { title: 'Excluir', type: 'warning', confirmLabel: 'Apagar' }))) return;
    setTodos((prev) => prev.filter((n) => n.id !== id));
    await supabase.from('notificacoes').delete().eq('id', id);
  }

  return (
    <BentoNotificationFeed
      title="Mensagens"
      subtitle="Comunicação interna da equipe"
      emptyTitle="Nenhuma mensagem"
      emptyIcon={<Mail size={40} />}
      escopo={escopo}
      onEscopo={setEscopo}
      loading={loading}
      items={todos}
      onMarkRead={marcarLida}
      onDelete={excluir}
      unreadBgClass="bg-violet-50/50"
      iconForItem={() => <Mail size={18} className="text-neutral-700" />}
    />
  );
}
