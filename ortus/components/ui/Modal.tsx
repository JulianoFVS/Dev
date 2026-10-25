'use client';

import { ReactNode, useEffect, useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** z-index do overlay (padrão 50; use 100 para modais aninhados) */
  zIndex?: number;
  /** Fechar ao clicar no backdrop */
  closeOnBackdrop?: boolean;
  /** Fechar com ESC */
  closeOnEscape?: boolean;
  /** Largura máxima do painel interno */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
  /** Ocultar botão X no canto (se o conteúdo já tiver) */
  hideCloseButton?: boolean;
  className?: string;
  panelClassName?: string;
};

const MAX_WIDTH: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-4xl',
  '4xl': 'max-w-6xl',
  full: 'max-w-[95vw]',
};

export default function Modal({
  open,
  onClose,
  children,
  zIndex = 50,
  closeOnBackdrop = true,
  closeOnEscape = true,
  maxWidth = 'lg',
  hideCloseButton = false,
  className = '',
  panelClassName = '',
}: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const esteveAberto = useRef(false);
  const [montado, setMontado] = useState(open);
  const [saindo, setSaindo] = useState(false);
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') onClose();
    },
    [closeOnEscape, onClose],
  );

  useEffect(() => {
    if (open) {
      esteveAberto.current = true;
      setMontado(true);
      setSaindo(false);
      return;
    }
    if (!esteveAberto.current) return;
    esteveAberto.current = false;
    setSaindo(true);
    const timer = window.setTimeout(() => {
      setMontado(false);
      setSaindo(false);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!montado) return;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    const restaurarBlur = () => {
      const el = backdropRef.current;
      if (!el) return;
      el.style.setProperty('backdrop-filter', 'none');
      el.style.setProperty('-webkit-backdrop-filter', 'none');
      void el.offsetWidth;
      el.style.setProperty('backdrop-filter', 'blur(12px)');
      el.style.setProperty('-webkit-backdrop-filter', 'blur(12px)');
    };
    const restaurarDepois = () => {
      window.setTimeout(restaurarBlur, 0);
      window.setTimeout(restaurarBlur, 80);
      window.setTimeout(restaurarBlur, 220);
    };
    const aoMudarCor = (event: Event) => {
      const alvo = event.target;
      if (alvo instanceof HTMLInputElement && alvo.type === 'color') restaurarDepois();
    };
    window.addEventListener('focus', restaurarDepois);
    document.addEventListener('change', aoMudarCor, true);
    document.addEventListener('input', aoMudarCor, true);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('focus', restaurarDepois);
      document.removeEventListener('change', aoMudarCor, true);
      document.removeEventListener('input', aoMudarCor, true);
    };
  }, [montado, handleEscape]);

  if (!montado || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 flex items-end sm:items-center justify-center p-2 sm:p-4 ${saindo ? 'animate-out fade-out duration-150' : 'animate-in fade-in duration-200'} ${className}`}
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
    >
      <div
        aria-hidden
        ref={backdropRef}
        className="absolute inset-0 bg-black/25 backdrop-blur-md"
        style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        className={`relative w-full ${MAX_WIDTH[maxWidth]} max-h-[90vh] overflow-hidden flex flex-col ${saindo ? 'animate-out fade-out slide-out-to-bottom-2 duration-150' : 'animate-in fade-in slide-in-from-bottom-2 duration-200'} ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {!hideCloseButton && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 transition-colors"
            aria-label="Fechar modal"
          >
            <X size={20} />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
