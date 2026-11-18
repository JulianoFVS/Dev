'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFotoPaciente } from '@/hooks/useFotoPaciente';

type Props = {
  pacienteId?: string | number | null;
  /** `pacientes.foto_url`: diz se há foto e qual versão. */
  fotoUrl?: string | null;
  /** Classes da caixa: tamanho, forma, fundo e texto das iniciais. */
  className?: string;
  /** O que aparece sem foto (normalmente as iniciais). */
  children?: ReactNode;
};

/** Foto do paciente para listas: só baixa quando a linha chega perto da tela. */
export default function FotoPaciente({ pacienteId, fotoUrl, className, children }: Props) {
  const caixa = useRef<HTMLSpanElement>(null);
  const [perto, setPerto] = useState(false);

  useEffect(() => {
    const alvo = caixa.current;
    if (!alvo || perto || !fotoUrl) return;
    if (typeof IntersectionObserver === 'undefined') {
      setPerto(true);
      return;
    }
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((entrada) => entrada.isIntersecting)) {
        setPerto(true);
        observador.disconnect();
      }
    }, { rootMargin: '200px 0px' });
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [perto, fotoUrl]);

  const url = useFotoPaciente(pacienteId, fotoUrl, perto);

  return (
    <span ref={caixa} className={className}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : children}
    </span>
  );
}
