'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';

function minutosDe(passo: number) {
  const lista: string[] = [];
  for (let m = 0; m < 60; m += passo) lista.push(String(m).padStart(2, '0'));
  return lista;
}

function partes(valor: string) {
  const [h = '08', m = '00'] = (valor || '').split(':');
  return { h: h.padStart(2, '0').slice(0, 2), m: m.padStart(2, '0').slice(0, 2) };
}

function encaixarMinuto(minuto: string, passo: number) {
  const lista = minutosDe(passo);
  const n = Number(minuto);
  if (!Number.isFinite(n)) return lista[0];
  return lista.reduce((melhor, item) => (Math.abs(Number(item) - n) < Math.abs(Number(melhor) - n) ? item : melhor), lista[0]);
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
  const minutoAtivo = encaixarMinuto(atual.m, passo);
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

  function aplicar(hora: number, minuto: string) {
    const h = ((hora % 24) + 24) % 24;
    onChange(`${String(h).padStart(2, '0')}:${encaixarMinuto(minuto, passo)}`);
  }

  function digitarHora(texto: string) {
    const limpo = texto.replace(/\D/g, '').slice(0, 2);
    if (!limpo) return;
    const n = Number(limpo);
    if (n > 23) return;
    aplicar(n, minutoAtivo);
  }

  function digitarMinuto(texto: string) {
    const limpo = texto.replace(/\D/g, '').slice(0, 2);
    if (!limpo) return;
    const n = Number(limpo);
    if (n > 59) return;
    aplicar(Number(atual.h), String(n).padStart(2, '0'));
  }

  const passoMinuto = () => {
    const lista = minutosDe(passo);
    const i = lista.indexOf(minutoAtivo);
    const proximo = lista[(i + 1) % lista.length];
    const volta = i === lista.length - 1;
    aplicar(Number(atual.h) + (volta ? 1 : 0), proximo);
  };
  const voltaMinuto = () => {
    const lista = minutosDe(passo);
    const i = lista.indexOf(minutoAtivo);
    const anterior = lista[(i - 1 + lista.length) % lista.length];
    const volta = i === 0;
    aplicar(Number(atual.h) - (volta ? 1 : 0), anterior);
  };

  const painel = (
    <div
      ref={painelRef}
      className="fixed z-[9999] w-[11.5rem] rounded-lg border border-neutral-200 bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      style={{ top: posicao.top, bottom: posicao.bottom, left: posicao.left }}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        <Coluna
          valor={atual.h}
          subir={() => aplicar(Number(atual.h) + 1, minutoAtivo)}
          descer={() => aplicar(Number(atual.h) - 1, minutoAtivo)}
          onChange={digitarHora}
        />
        <span className="pb-0.5 text-sm font-medium text-neutral-400">:</span>
        <Coluna
          valor={minutoAtivo}
          subir={passoMinuto}
          descer={voltaMinuto}
          onChange={digitarMinuto}
        />
      </div>
    </div>
  );

  const rotulo = value ? `${atual.h}:${minutoAtivo}` : 'hh:mm';

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

function Coluna({ valor, subir, descer, onChange }: { valor: string; subir: () => void; descer: () => void; onChange: (texto: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" onClick={subir} className="inline-flex h-7 w-full items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" aria-label="Aumentar">
        <ChevronUp size={16} />
      </button>
      <input
        inputMode="numeric"
        value={valor}
        onChange={(evento) => onChange(evento.target.value)}
        className="h-10 w-full rounded-md border border-neutral-200 bg-white text-center text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900"
      />
      <button type="button" onClick={descer} className="inline-flex h-7 w-full items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900" aria-label="Diminuir">
        <ChevronDown size={16} />
      </button>
    </div>
  );
}
