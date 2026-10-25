'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type Option<T extends string> = {
  value: T;
  label: ReactNode;
  ariaLabel?: string;
};

type Props<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: Option<T>[];
  size?: 'sm' | 'md';
  /** Altura e fonte de um botão h-8 text-sm, largura pelo conteúdo. */
  fit?: boolean;
  className?: string;
};

export default function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  fit = false,
  className = '',
}: Props<T>) {
  const i = Math.max(0, options.findIndex((option) => option.value === value));
  const n = Math.max(1, options.length);
  const trilho = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ x: 0, w: 0 });
  const altura = fit || size === 'sm' ? 'h-8' : 'h-10';
  const texto = fit || size === 'md' ? 'text-sm' : 'text-xs';

  useLayoutEffect(() => {
    if (!fit) return;
    const pai = trilho.current;
    const el = pai?.querySelectorAll('button')[i] as HTMLElement | undefined;
    if (!pai || !el) return;
    setPill({ x: el.offsetLeft, w: el.offsetWidth });
  }, [fit, i, n]);

  return (
    <div
      ref={trilho}
      className={`relative ${fit ? 'inline-flex' : 'grid'} ${altura} rounded-md border border-neutral-200 p-0.5 ${className}`}
      style={fit ? undefined : { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute bottom-0.5 top-0.5 rounded-[5px] bg-neutral-900 duration-200 ease-out ${fit ? 'left-0 transition-[transform,width]' : 'left-0.5 transition-transform'}`}
        style={fit
          ? { width: pill.w, transform: `translateX(${pill.x}px)` }
          : { width: `calc((100% - 0.25rem) / ${n})`, transform: `translateX(${i * 100}%)` }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.ariaLabel}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 flex items-center justify-center gap-1.5 rounded-[5px] transition-colors duration-200 ${fit ? 'px-2.5' : 'px-2 font-medium'} ${texto} ${
            value === option.value ? 'text-white' : 'text-neutral-600'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
