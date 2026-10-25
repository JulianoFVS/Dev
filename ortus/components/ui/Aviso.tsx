'use client';

import { useEffect, useState } from 'react';

type Props = {
  mensagem: string | null;
};

export default function Aviso({ mensagem }: Props) {
  const [texto, setTexto] = useState<string | null>(mensagem);
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    if (mensagem) {
      setTexto(mensagem);
      setSaindo(false);
      return;
    }
    if (!texto) return;
    setSaindo(true);
    const timer = window.setTimeout(() => {
      setTexto(null);
      setSaindo(false);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [mensagem, texto]);

  if (!texto) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[10000] flex justify-center px-4">
      <p className={`rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 shadow-sm ${saindo ? 'animate-out fade-out slide-out-to-top-1 duration-150' : 'animate-in fade-in slide-in-from-top-1 duration-200'}`}>
        {texto}
      </p>
    </div>
  );
}
