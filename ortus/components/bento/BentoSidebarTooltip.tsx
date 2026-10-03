'use client';

import { useState, type ReactElement } from 'react';

type Props = {
  label: string;
  show: boolean;
  children: ReactElement;
};

/** Rótulo da sidebar colapsada. Some assim que o cursor sai ou o botão é pressionado. */
export default function BentoSidebarTooltip({ label, show, children }: Props) {
  const [visible, setVisible] = useState(false);

  if (!show) return children;

  return (
    <div
      className="relative flex w-full justify-center"
      onPointerEnter={() => setVisible(true)}
      onPointerLeave={() => setVisible(false)}
      onPointerDown={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[400] max-w-[14rem] -translate-y-1/2 truncate rounded-full bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-[0_8px_30px_rgba(0,0,0,0.28)]"
        >
          {label}
        </span>
      )}
    </div>
  );
}
