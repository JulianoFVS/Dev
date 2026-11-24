'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';

function partes(valor: string) {
  const [h = '08', m = '00'] = (valor || '').split(':');
  return { h: h.padStart(2, '0').slice(0, 2), m: m.padStart(2, '0').slice(0, 2) };
}

type Props = {
  value: string;
  onChange: (hora: string) => void;
  disabled?: boolean;
  className?: string;
  passo?: number;
};

export default function CampoHora({ value, onChange, disabled, className = '', passo = 5 }: Props) {
  const [aberto, setAberto] = useState(false);
  const atual = partes(value || '08:00');
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });

  useLayoutEffect(() => {
    if (!aberto || !botaoRef.current) return;
    const atualizar = () => {
      const rect = botaoRef.current!.getBoundingClientRect();
      const altura = 148;
      const abaixo = window.innerHeight - rect.bottom;
      const abrirCima = abaixo < altura && rect.top > abaixo;
      setPosicao({
        left: Math.min(rect.left, window.innerWidth - 196),
        top: abrirCima ? undefined : rect.bottom + 6,
        bottom: abrirCima ? window.innerHeight - rect.top + 6 : undefined,
      });
    };
    atualizar();
    window.addEventListener('resize', atualizar);
    window.addEventListener('scroll', atualizar, true);
    return () => {
      window.removeEventListener('resize', atualizar);
      window.removeEventListener('scroll', atualizar, true);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function fechar(evento: MouseEvent) {
      const alvo = evento.target as Node;
      if (botaoRef.current?.contains(alvo) || painelRef.current?.contains(alvo)) return;
      setAberto(false);
    }
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [aberto]);

  function aplicar(hora: number, minuto: number) {
    const total = ((hora * 60 + minuto) % 1440 + 1440) % 1440;
    onChange(`${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`);
  }

  function digitarHora(texto: string) {
    aplicar(Number(texto), Number(atual.m));
  }

  function digitarMinuto(texto: string) {
    aplicar(Number(atual.h), Number(texto));
  }

  const painel = (
    <div
      ref={painelRef}
      className="fixed z-[9999] w-[11.5rem] rounded-lg border border-neutral-200 bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      style={{ top: posicao.top, bottom: posicao.bottom, left: posicao.left }}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        <Coluna
          valor={atual.h}
          max={23}
          subir={() => aplicar(Number(atual.h) + 1, Number(atual.m))}
          descer={() => aplicar(Number(atual.h) - 1, Number(atual.m))}
          onCommit={digitarHora}
        />
        <span className="pb-0.5 text-sm font-medium text-neutral-400">:</span>
        <Coluna
          valor={atual.m}
          max={59}
          subir={() => aplicar(Number(atual.h), Number(atual.m) + passo)}
          descer={() => aplicar(Number(atual.h), Number(atual.m) - passo)}
          onCommit={digitarMinuto}
        />
      </div>
    </div>
  );

  const rotulo = value ? `${atual.h}:${atual.m}` : 'hh:mm';

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setAberto((v) => !v)}
        className={`box-border flex h-10 w-full items-center rounded-md border border-neutral-200 bg-white px-3 text-left text-sm outline-none disabled:cursor-default ${value ? 'text-neutral-900' : 'text-neutral-400'} ${className}`}
      >
        {rotulo}
      </button>
      {aberto && typeof document !== 'undefined' && createPortal(painel, document.body)}
    </>
  );
}

function Coluna({ valor, max, subir, descer, onCommit }: { valor: string; max: number; subir: () => void; descer: () => void; onCommit: (texto: string) => void }) {
  const [focado, setFocado] = useState(false);
  const [rascunho, setRascunho] = useState(valor);

  useEffect(() => {
    if (!focado) setRascunho(valor);
  }, [valor, focado]);

  function aoDigitar(texto: string) {
    const limpo = texto.replace(/\D/g, '').slice(0, 2);
    if (!limpo) {
      setRascunho('');
      return;
    }
    const n = Number(limpo);
    // Um dígito que não pode começar um número válido vira 0N na hora (3 vira 03 nas horas, 6 vira 06 nos minutos).
    if (limpo.length === 1 && n > Math.floor(max / 10)) {
      const formatado = String(n).padStart(2, '0');
      setRascunho(formatado);
      onCommit(formatado);
      return;
    }
    if (limpo.length === 2 && n > max) return;
    setRascunho(limpo);
    if (limpo.length === 2) onCommit(limpo);
  }

  function aoSair() {
    setFocado(false);
    if (!rascunho || Number(rascunho) > max) {
      setRascunho(valor);
      return;
    }
    const formatado = String(Number(rascunho)).padStart(2, '0');
    setRascunho(formatado);
    onCommit(formatado);
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" onClick={subir} className="inline-flex h-7 w-full items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" aria-label="Aumentar">
        <ChevronUp size={16} />
      </button>
      <input
        inputMode="numeric"
        value={focado ? rascunho : valor}
        onFocus={(evento) => {
          setFocado(true);
          setRascunho(valor);
          evento.target.select();
        }}
        onBlur={aoSair}
        onChange={(evento) => aoDigitar(evento.target.value)}
        className="h-10 w-full rounded-md border border-neutral-200 bg-white text-center text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900"
      />
      <button type="button" onClick={descer} className="inline-flex h-7 w-full items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" aria-label="Diminuir">
        <ChevronDown size={16} />
      </button>
    </div>
  );
}
