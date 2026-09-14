'use client';

import type { ReactNode } from 'react';
import { bentoPagePad } from '@/lib/bentoUi';

type Props = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
  className?: string;
};

export default function BentoPageShell({
  title,
  subtitle,
  eyebrow,
  actions,
  children,
  maxWidthClass = 'max-w-6xl',
  className = '',
}: Props) {
  return (
    <div className={`mx-auto w-full ${maxWidthClass} ${bentoPagePad} font-poppins ${className}`}>
      <header className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{eyebrow}</p>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-neutral-500 sm:text-base">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}
