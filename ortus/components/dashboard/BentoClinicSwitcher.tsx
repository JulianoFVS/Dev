'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronsUpDown, Globe } from 'lucide-react';
import { getClinicLabel, useClinica } from '@/app/context/ClinicaContext';

export default function BentoClinicSwitcher({ className = '' }: { className?: string }) {
  const { clinics, activeClinic, activeClinicId, setActiveClinicById, loading } = useClinica();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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

  const label = activeClinic ? getClinicLabel(activeClinic) : loading ? 'Carregando…' : 'Selecionar unidade';
  const showGlobe = activeClinicId === 'all';

  function select(id: 'all' | string) {
    setActiveClinicById(id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-full items-center gap-2 rounded-full border border-black/10 bg-white py-2 pl-3 pr-2.5 text-left text-[13px] font-medium text-neutral-800 shadow-[0_1px_0_rgba(0,0,0,0.04)] transition-colors hover:border-black/15 hover:bg-neutral-50 sm:text-sm"
        aria-expanded={open}
        aria-haspopup="listbox"
        title="Trocar unidade"
      >
        {showGlobe ? (
          <Globe size={16} className="shrink-0 text-neutral-500" strokeWidth={1.75} />
        ) : (
          <Building2 size={16} className="shrink-0 text-neutral-500" strokeWidth={1.75} />
        )}
        <span className="min-w-0 truncate">{label}</span>
        <ChevronsUpDown size={14} className="shrink-0 text-neutral-400" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+0.35rem)] z-[80] max-h-[min(70vh,22rem)] w-[min(100vw-1.5rem,18rem)] overflow-hidden overflow-y-auto rounded-[1.15rem] border border-black/8 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] sm:rounded-[1.25rem]"
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
        </div>
      )}
    </div>
  );
}
