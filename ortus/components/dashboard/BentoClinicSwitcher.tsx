'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Check, ChevronsUpDown, Globe } from 'lucide-react';
import { getClinicLabel, useClinica } from '@/app/context/ClinicaContext';
import BentoSidebarTooltip from '@/components/bento/BentoSidebarTooltip';

type BentoClinicSwitcherProps = {
  className?: string;
  /** light = barra clara; sidebar = menu escuro */
  variant?: 'light' | 'sidebar';
  collapsed?: boolean;
};

export default function BentoClinicSwitcher({
  className = '',
  variant = 'light',
  collapsed = false,
}: BentoClinicSwitcherProps) {
  const { clinics, activeClinic, activeClinicId, setActiveClinicById, loading } = useClinica();
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const alvo = e.target as Node;
      if (rootRef.current?.contains(alvo) || panelRef.current?.contains(alvo)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isSidebar = variant === 'sidebar';

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setPanelPos(null);
      return;
    }
    const posicionar = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (isSidebar && collapsed) {
        setPanelPos({ top: rect.top, left: rect.right + 8 });
        return;
      }
      const largura = Math.min(288, window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - largura - 12));
      setPanelPos({ top: rect.bottom + 6, left });
    };
    posicionar();
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);
    return () => {
      window.removeEventListener('resize', posicionar);
      window.removeEventListener('scroll', posicionar, true);
    };
  }, [open, isSidebar, collapsed]);

  const fullLabel = activeClinic ? getClinicLabel(activeClinic) : loading ? 'Carregando…' : 'Selecionar unidade';
  const shortLabel =
    activeClinicId === 'all'
      ? 'Todas'
      : activeClinic && activeClinic.id !== 'all'
        ? activeClinic.nome
        : 'Unidade';
  const label = variant === 'sidebar' && collapsed ? shortLabel : fullLabel;
  const showGlobe = activeClinicId === 'all';

  function select(id: 'all' | string) {
    setActiveClinicById(id);
    setOpen(false);
  }

  const triggerClass = isSidebar
    ? collapsed
      ? 'flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white/90 transition-colors hover:bg-white/15'
      : 'flex w-full max-w-full items-center gap-2 rounded-2xl bg-white/10 px-3 py-2.5 text-left text-sm font-medium text-white/90 transition-colors hover:bg-white/15'
    : collapsed
      ? 'flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-white text-neutral-700 shadow-[0_1px_0_rgba(0,0,0,0.04)] hover:bg-neutral-50'
      : 'flex max-w-full items-center gap-2 rounded-full border border-black/10 bg-white py-2 pl-3 pr-2.5 text-left text-[13px] font-medium text-neutral-800 shadow-[0_1px_0_rgba(0,0,0,0.04)] transition-colors hover:border-black/15 hover:bg-neutral-50 sm:text-sm';

  const iconClass = isSidebar ? 'shrink-0 text-white/70' : 'shrink-0 text-neutral-500';
  const chevronClass = isSidebar ? 'shrink-0 text-white/45' : 'shrink-0 text-neutral-400';

  const panelClass =
    'z-[200] max-h-[min(70vh,22rem)] w-[min(100vw-1.5rem,18rem)] overflow-hidden overflow-y-auto rounded-[1.15rem] border border-black/8 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] sm:rounded-[1.25rem]';

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={triggerClass}
      aria-expanded={open}
      aria-haspopup="listbox"
      title={isSidebar && collapsed ? undefined : fullLabel}
    >
      {showGlobe ? (
        <Globe size={16} className={iconClass} strokeWidth={1.75} />
      ) : (
        <Building2 size={16} className={iconClass} strokeWidth={1.75} />
      )}
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronsUpDown size={14} className={chevronClass} />
        </>
      )}
    </button>
  );

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      {isSidebar && collapsed ? (
        <BentoSidebarTooltip label={fullLabel} show>
          {trigger}
        </BentoSidebarTooltip>
      ) : (
        trigger
      )}

      {open && panelPos && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          role="listbox"
          className={`${panelClass} fixed`}
          style={{ top: panelPos.top, left: panelPos.left }}
        >
          <p className="sticky top-0 border-b border-black/6 bg-[#f3f4f1] px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Trocar unidade
          </p>
          <button
            type="button"
            role="option"
            aria-selected={activeClinicId === 'all'}
            onClick={() => select('all')}
            className="flex w-full items-center justify-between gap-2 border-b border-black/4 px-4 py-3 text-left text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-50"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Globe size={16} className="shrink-0 text-neutral-500" />
              <span className="truncate">Todas as Clínicas</span>
            </span>
            {activeClinicId === 'all' && <Check size={16} className="shrink-0 text-neutral-900" strokeWidth={2.25} />}
          </button>
          {clinics.length === 0 && !loading && (
            <p className="px-4 py-4 text-xs text-neutral-400">Nenhuma unidade vinculada ao seu usuário.</p>
          )}
          {clinics.map((c) => {
            const selected = String(activeClinicId) === String(c.id);
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => select(String(c.id))}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-neutral-800">{getClinicLabel(c)}</span>
                  {c.endereco ? (
                    <span className="mt-0.5 block truncate text-[10px] font-medium text-neutral-400">{c.endereco}</span>
                  ) : null}
                </span>
                {selected && <Check size={16} className="shrink-0 text-neutral-900" strokeWidth={2.25} />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
