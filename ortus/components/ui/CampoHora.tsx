'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));

function minutosDe(passo: number) {
  const lista: string[] = [];
  for (let m = 0; m < 60; m += passo) lista.push(String(m).padStart(2, '0'));
  return lista;
}

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
  const minutos = minutosDe(passo);
  const minutoAtivo = minutos.includes(atual.m) ? atual.m : minutos[0];
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState<{ top?: number; bottom?: number; left: number; width: number }>({ left: 0, width: 220 });

  useLayoutEffect(() => {
    if (!aberto || !botaoRef.current) return;
    const atualizar = () => {
      const rect = botaoRef.current!.getBoundingClientRect();
      const altura = 248;
      const abaixo = window.innerHeight - rect.bottom;
      const abrirCima = abaixo < altura && rect.top > abaixo;
      setPosicao({
        left: Math.min(rect.left, window.innerWidth - Math.max(rect.width, 220) - 8),
        width: Math.max(rect.width, 200),
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

  useEffect(() => {
    if (!aberto || !painelRef.current) return;
    painelRef.current.querySelectorAll<HTMLButtonElement>('[data-ativo="true"]').forEach((el) => {
      const lista = el.parentElement;
      if (!lista) return;
      lista.scrollTop = Math.max(0, el.offsetTop - lista.clientHeight / 2 + el.offsetHeight / 2);
    });
  }, [aberto]);

  function escolher(hora: string, minuto: string) {
    onChange(`${hora}:${minuto}`);
  }

  const painel = (
    <div
      ref={painelRef}
      className="fixed z-[9999] grid grid-cols-2 gap-2 rounded-lg border border-neutral-200 bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      style={{ top: posicao.top, bottom: posicao.bottom, left: posicao.left, width: posicao.width }}
    >
      <div className="max-h-52 overflow-y-auto">
        {HORAS.map((hora) => (
          <button
            key={hora}
            type="button"
            data-ativo={hora === atual.h}
            onClick={() => escolher(hora, minutoAtivo)}
            className={`flex h-8 w-full items-center justify-center rounded-md text-sm font-medium ${hora === atual.h ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'}`}
          >
            {hora}
          </button>
        ))}
      </div>
      <div className="max-h-52 overflow-y-auto">
        {minutos.map((minuto) => (
          <button
            key={minuto}
            type="button"
            data-ativo={minuto === minutoAtivo}
            onClick={() => { escolher(atual.h, minuto); setAberto(false); }}
            className={`flex h-8 w-full items-center justify-center rounded-md text-sm font-medium ${minuto === minutoAtivo ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'}`}
          >
            {minuto}
          </button>
        ))}
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
        className={`box-border flex h-10 w-full items-center rounded-md border border-neutral-200 bg-white px-3 text-left text-sm text-neutral-900 outline-none disabled:cursor-default ${className}`}
      >
        <span className={value ? '' : 'text-neutral-400'}>{rotulo}</span>
      </button>
      {aberto && typeof document !== 'undefined' && createPortal(painel, document.body)}
    </>
  );
}
