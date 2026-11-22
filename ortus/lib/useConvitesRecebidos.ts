'use client';

import { useEffect, useState } from 'react';
import { listarMeusConvites, obterStatusConvite, type MeuConvite } from '@/lib/convites';

export const CONVITES_EVENTO = 'ortus:convites-changed';

let cache: MeuConvite[] | null = null;

export function avisarConvitesMudaram() {
  cache = null;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CONVITES_EVENTO));
}

/** Convites de equipe ainda sem resposta da pessoa logada. */
export function useConvitesRecebidos() {
  const [pendentes, setPendentes] = useState<MeuConvite[]>(() => cache ?? []);
  const [pronto, setPronto] = useState(cache !== null);

  useEffect(() => {
    let vivo = true;
    async function ler() {
      try {
        const lista = await listarMeusConvites();
        const abertos = lista.filter((convite) => obterStatusConvite(convite) === 'pendente');
        cache = abertos;
        if (!vivo) return;
        setPendentes(abertos);
        setPronto(true);
      } catch {
        if (vivo) setPronto(true);
      }
    }
    void ler();
    window.addEventListener(CONVITES_EVENTO, ler);
    return () => {
      vivo = false;
      window.removeEventListener(CONVITES_EVENTO, ler);
    };
  }, []);

  return { pendentes, pronto };
}
