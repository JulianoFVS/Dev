'use client';

/**
 * Depois que uma consulta é salva (evento ortus:agenda-changed), pede ao
 * servidor para enviar já a fila do Google Agenda, em vez de esperar a
 * rotina de 2 minutos. Sem efeito visível: se falhar, a rotina envia.
 */
import { useEffect } from 'react';
import { chamarApi } from '@/lib/apiAutenticada';

export default function EmpurraoGoogle() {
  useEffect(() => {
    let timer: number | null = null;
    const empurrar = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (navigator.onLine === false) return;
        void chamarApi('/api/google/empurrar', { metodo: 'POST', corpo: {} }).then((r) => {
          // Enviou ou falhou: o aviso da agenda relê o estado na hora.
          if (r.ok && (r.dados as { processados?: number }).processados) window.dispatchEvent(new CustomEvent('ortus:google-atualizado'));
        });
      }, 1500);
    };
    window.addEventListener('ortus:agenda-changed', empurrar);
    return () => {
      window.removeEventListener('ortus:agenda-changed', empurrar);
      if (timer) window.clearTimeout(timer);
    };
  }, []);
  return null;
}
