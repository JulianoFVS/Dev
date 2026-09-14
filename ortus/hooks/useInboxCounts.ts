'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useInboxCounts() {
  const [mensagensCount, setMensagensCount] = useState(0);
  const [notificacoesCount, setNotificacoesCount] = useState(0);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelado) return;

      const agoraIso = new Date().toISOString();
      const tiposAlerta = ['agenda', 'alerta', 'sistema', 'aviso'];
      const [{ count: alertasCount }, { count: msgsCount }] = await Promise.all([
        supabase
          .from('notificacoes')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', session.user.id)
          .eq('lida', false)
          .in('tipo', tiposAlerta)
          .or(`expires_at.is.null,expires_at.gt.${agoraIso}`),
        supabase
          .from('notificacoes')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', session.user.id)
          .eq('lida', false)
          .eq('tipo', 'mensagem')
          .or(`expires_at.is.null,expires_at.gt.${agoraIso}`),
      ]);

      if (cancelado) return;
      setNotificacoesCount(alertasCount || 0);
      setMensagensCount(msgsCount || 0);
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, []);

  return { mensagensCount, notificacoesCount };
}
