'use client';

import type { ReactNode } from 'react';

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
  className?: string;
};

export default function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className = '',
}: Props<T>) {
  const i = Math.max(0, options.findIndex((option) => option.value === value));
  const n = Math.max(1, options.length);
  const altura = size === 'sm' ? 'h-8' : 'h-10';
  const texto = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div
      className={`relative grid ${altura} rounded-md border border-neutral-200 p-0.5 ${className}`}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0.5 left-0.5 top-0.5 rounded-[5px] bg-neutral-900 transition-transform duration-200 ease-out"
        style={{
          width: `calc((100% - 0.25rem) / ${n})`,
          transform: `translateX(${i * 100}%)`,
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-label={option.ariaLabel}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`relative z-10 flex items-center justify-center gap-1.5 rounded-[5px] px-2 font-medium transition-colors duration-200 ${texto} ${
            value === option.value ? 'text-white' : 'text-neutral-600'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
