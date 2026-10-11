'use client';

import { useState, useRef, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  label: string;
  show: boolean;
  children: ReactElement;
};

/** Rótulo da sidebar colapsada. Some assim que o cursor sai ou o botão é pressionado. */
export default function BentoSidebarTooltip({ label, show, children }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  if (!show) return children;

  return (
    <div
      ref={wrapRef}
      className="relative flex w-full shrink-0 justify-center"
      onPointerEnter={() => {
        const rect = wrapRef.current?.getBoundingClientRect();
        if (!rect) return;
        setPos({ top: rect.top + rect.height / 2, left: rect.right + 10 });
      }}
      onPointerLeave={() => setPos(null)}
      onPointerDown={() => setPos(null)}
    >
      {children}
      {pos && typeof document !== 'undefined' && createPortal(
        <span
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
          className="pointer-events-none fixed z-[400] max-w-[14rem] -translate-y-1/2 truncate rounded-full bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-[0_8px_30px_rgba(0,0,0,0.28)]"
        >
          {label}
        </span>,
        document.body,
      )}
    </div>
  );
}
