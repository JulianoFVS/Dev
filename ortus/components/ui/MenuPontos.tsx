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

/** Abaixo de lg a barra flutuante da casca (MobileAppChrome) ocupa o fim da tela: 4.5rem, o mesmo respiro que ela reserva. */
const BARRA_CELULAR = 72;

export default function MenuPontos({ itens, className, tamanho = 16 }: Props) {
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxAltura: number }>({ left: 0, maxAltura: 0 });

  function posicionar() {
    const rect = botao.current?.getBoundingClientRect();
    if (!rect) return;
    const largura = 176;
    const altura = itens.length * 40 + 10;
    const fim = window.innerHeight - (window.innerWidth < 1024 ? BARRA_CELULAR : 0);
    const abaixo = fim - rect.bottom - 4;
    const acima = rect.top - 4 - 8;
    // Sem espaço inteiro em nenhum lado, abre no lado maior e rola por dentro.
    // Para cima, preso pela base: um rótulo de duas linhas cresce para cima, não por cima do botão.
    const cabeAbaixo = abaixo >= altura || abaixo >= acima;
    const left = Math.min(Math.max(8, rect.right - largura), window.innerWidth - largura - 8);
    setPos(cabeAbaixo
      ? { top: rect.bottom + 4, left, maxAltura: Math.max(0, abaixo) }
      : { bottom: window.innerHeight - rect.top + 4, left, maxAltura: Math.max(0, acima) });
  }

  useEffect(() => {
    if (!aberto) return;
    function fechar() { setAberto(false); }
    function fecharAoRolar(evento: Event) {
      if (evento.target instanceof Node && menu.current?.contains(evento.target)) return;
      setAberto(false);
    }
    window.addEventListener('scroll', fecharAoRolar, true);
    window.addEventListener('resize', fechar);
    return () => {
      window.removeEventListener('scroll', fecharAoRolar, true);
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
        className={`alvo-toque ${className || 'rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}`}
      >
        <MoreHorizontal size={tamanho} />
      </button>
      {aberto && typeof document !== 'undefined' && createPortal(
        <>
          {/* Acima da barra flutuante do celular (z-[110]) e dos modais (até 100). */}
          <button type="button" aria-label="Fechar menu" className="fixed inset-0 z-[120]" onClick={() => setAberto(false)} />
          <div ref={menu} className="fixed z-[121] w-44 overflow-y-auto overscroll-contain rounded-md border border-neutral-200 bg-white py-1 shadow-sm" style={{ top: pos.top, bottom: pos.bottom, left: pos.left, maxHeight: pos.maxAltura }}>
            {itens.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`block min-h-[40px] w-full px-3 py-2 text-left text-sm ${item.perigo ? 'text-red-600 hover:bg-red-50' : 'text-neutral-800 hover:bg-neutral-50'}`}
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
