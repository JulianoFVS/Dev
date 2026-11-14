'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export function ErroInline({
  mensagem,
  className = '',
}: {
  mensagem: string | null;
  className?: string;
}) {
  if (!mensagem) return null;
  return (
    <p
      role="alert"
      className={`flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium leading-relaxed text-rose-700 ${className}`}
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span className="min-w-0 whitespace-pre-line">{mensagem}</span>
    </p>
  );
}

export function SucessoInline({
  mensagem,
  className = '',
}: {
  mensagem: string | null;
  className?: string;
}) {
  if (!mensagem) return null;
  return (
    <p
      role="status"
      className={`flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ${className}`}
    >
      <CheckCircle2 size={14} className="shrink-0" />
      <span className="min-w-0">{mensagem}</span>
    </p>
  );
}

export function EstadoVazio({
  icone,
  titulo,
  descricao,
  acao,
  className = '',
}: {
  icone: ReactNode;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-5 py-10 text-center ${className}`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f3f4f1] text-neutral-500">
        {icone}
      </span>
      <p className="mt-3 text-sm font-medium text-neutral-900">{titulo}</p>
      {descricao && (
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-neutral-500">{descricao}</p>
      )}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

export function SkeletonBloco({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-neutral-100 ${className}`} />;
}
