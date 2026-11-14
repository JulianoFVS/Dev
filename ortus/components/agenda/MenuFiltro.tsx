'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export type MenuFiltroOpcao = { value: string; label: string };

type Props = {
  rotulo: string;
  valor: string;
  opcoes: MenuFiltroOpcao[];
  onChange: (valor: string) => void;
  cheio?: boolean;
};

function MenuFiltro({ rotulo, valor, opcoes, onChange, cheio = false }: Props) {
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 180, maxHeight: 240 });
  const ativo = valor !== 'todos';
  const titulo = ativo ? (opcoes.find((opcao) => opcao.value === valor)?.label || rotulo) : rotulo;

  function abrir() {
    const rect = botao.current?.getBoundingClientRect();
    if (!rect) return;
    const abaixo = window.innerHeight - rect.bottom;
    const acima = rect.top;
    const abreAbaixo = abaixo >= 160 || abaixo >= acima;
    const maxHeight = Math.max(120, Math.min(240, (abreAbaixo ? abaixo : acima) - 12));
    setPos({
      top: abreAbaixo ? rect.bottom + 4 : Math.max(8, rect.top - maxHeight - 4),
      left: rect.left,
      width: Math.max(rect.width, 180),
      maxHeight,
    });
    setAberto((atual) => !atual);
  }

  useEffect(() => {
    if (!aberto) return;
    const fechar = (event: Event) => {
      const alvo = event.target as Node | null;
      if (alvo && menu.current?.contains(alvo)) return;
      setAberto(false);
    };
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    return () => {
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
    };
  }, [aberto]);

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={abrir}
        title={ativo ? titulo : undefined}
        className={`relative inline-flex h-8 items-center rounded-md border bg-white text-sm text-neutral-700 hover:bg-neutral-50 ${cheio ? 'w-full min-w-0' : ''} ${ativo ? 'border-red-500' : 'border-neutral-200'}`}
      >
        <span className={`invisible inline-flex items-center gap-1.5 px-2.5 ${cheio ? 'min-w-0 overflow-hidden' : ''}`}>
          <ChevronDown size={13} />
          {rotulo}
        </span>
        <span className="absolute inset-0 flex items-center gap-1.5 px-2.5">
          <ChevronDown size={13} className={`shrink-0 text-neutral-500 transition-transform ${aberto ? 'rotate-180' : ''}`} />
          <span className="truncate">{titulo}</span>
        </span>
      </button>
      {aberto && typeof document !== 'undefined' && createPortal(
        <>
          <button type="button" aria-label="Fechar filtro" className="fixed inset-0 z-[80] cursor-default" onClick={() => setAberto(false)} />
          <div
            ref={menu}
            className="fixed z-[81] overflow-y-auto overscroll-contain rounded-md border border-neutral-200 bg-white py-1"
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            onWheel={(event) => event.stopPropagation()}
          >
            {opcoes.map((opcao) => (
              <button
                key={opcao.value}
                type="button"
                onClick={() => { onChange(opcao.value); setAberto(false); }}
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50 ${valor === opcao.value ? 'font-medium text-neutral-900' : 'text-neutral-600'}`}
              >
                {opcao.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

export default memo(MenuFiltro);
