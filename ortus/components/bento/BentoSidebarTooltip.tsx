'use client';

import type { ReactElement } from 'react';
import { cloneElement, isValidElement } from 'react';

type Props = {
  label: string;
  show: boolean;
  children: ReactElement;
};

/** Rótulo ao hover — sidebar Bento colapsada (sem tooltip nativo do browser). */
export default function BentoSidebarTooltip({ label, show, children }: Props) {
  if (!show) return children;

  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ title?: string }>, { title: undefined })
    : children;

  return (
    <div className="group/tip relative flex w-full justify-center">
      {child}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[400] max-w-[14rem] -translate-y-1/2 truncate rounded-full bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 opacity-0 shadow-[0_8px_30px_rgba(0,0,0,0.28)] transition-opacity duration-150 ease-out group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}
