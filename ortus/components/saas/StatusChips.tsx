'use client';

import type { ReactNode } from 'react';
import type { StatusFaturaSaaS, StatusFinanceiroSaaS } from '@/lib/saas';
import { STATUS_FATURA_META, STATUS_FINANCEIRO_META } from '@/lib/saas';

export function ChipStatusFinanceiro({
  status,
  className = '',
}: {
  status: StatusFinanceiroSaaS;
  className?: string;
}) {
  const meta = STATUS_FINANCEIRO_META[status] ?? STATUS_FINANCEIRO_META.sem_fatura;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.chip} ${className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.ponto}`} />
      {meta.label}
    </span>
  );
}

export function ChipStatusFatura({
  status,
  vencida = false,
  className = '',
}: {
  status: StatusFaturaSaaS;
  vencida?: boolean;
  className?: string;
}) {
  const meta =
    status === 'aberta' && vencida
      ? {
          label: 'Vencida',
          chip: 'border-rose-200 bg-rose-50 text-rose-700',
          ponto: 'bg-rose-500',
        }
      : (STATUS_FATURA_META[status] ?? STATUS_FATURA_META.aberta);

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.chip} ${className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.ponto}`} />
      {meta.label}
    </span>
  );
}

type TomChip = 'neutro' | 'verde' | 'ambar' | 'rosa' | 'azul';

const TONS: Record<TomChip, string> = {
  neutro: 'border-neutral-200 bg-[#f3f4f1] text-neutral-600',
  verde: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  ambar: 'border-amber-200 bg-amber-50 text-amber-700',
  rosa: 'border-rose-200 bg-rose-50 text-rose-700',
  azul: 'border-sky-200 bg-sky-50 text-sky-700',
};

export function ChipSuave({
  children,
  tom = 'neutro',
  className = '',
}: {
  children: ReactNode;
  tom?: TomChip;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONS[tom]} ${className}`}
    >
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
