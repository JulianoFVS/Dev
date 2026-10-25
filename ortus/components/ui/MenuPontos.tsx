'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

type Item = {
  id: string;
  label: string;
  onClick: () => void;
  perigo?: boolean;
};

type Props = {
  itens: Item[];
  className?: string;
  tamanho?: number;
};

export default function MenuPontos({ itens, className, tamanho = 16 }: Props) {
  const botao = useRef<HTMLButtonElement>(null);
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function posicionar() {
    const rect = botao.current?.getBoundingClientRect();
    if (!rect) return;
    const largura = 176;
    const altura = itens.length * 36 + 8;
    const cabeAbaixo = window.innerHeight - rect.bottom >= altura;
    const top = cabeAbaixo ? rect.bottom + 4 : Math.max(8, rect.top - altura - 4);
    const left = Math.min(Math.max(8, rect.right - largura), window.innerWidth - largura - 8);
    setPos({ top, left });
  }

  useEffect(() => {
    if (!aberto) return;
    function fechar() { setAberto(false); }
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
        aria-label="Mais opções"
        onClick={(event) => {
          event.stopPropagation();
          if (aberto) setAberto(false);
          else { posicionar(); setAberto(true); }
        }}
        className={className || 'rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}
      >
        <MoreHorizontal size={tamanho} />
      </button>
      {aberto && typeof document !== 'undefined' && createPortal(
        <>
          <button type="button" aria-label="Fechar menu" className="fixed inset-0 z-[90]" onClick={() => setAberto(false)} />
          <div className="fixed z-[91] w-44 overflow-hidden rounded-md border border-neutral-200 bg-white py-1 shadow-sm" style={{ top: pos.top, left: pos.left }}>
            {itens.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`block w-full px-3 py-2 text-left text-sm ${item.perigo ? 'text-red-600 hover:bg-red-50' : 'text-neutral-800 hover:bg-neutral-50'}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setAberto(false);
                  item.onClick();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
