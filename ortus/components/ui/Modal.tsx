'use client';

import { ReactNode, useEffect, useCallback } from 'react';
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
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
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
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') onClose();
    },
    [closeOnEscape, onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open, handleEscape]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 flex items-end sm:items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150 ${className}`}
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        className={`relative w-full ${MAX_WIDTH[maxWidth]} max-h-[90vh] overflow-hidden flex flex-col ${panelClassName}`}
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
