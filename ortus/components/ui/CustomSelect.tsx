'use client';
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  searchable?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Campo em pílula — barra de filtros */
  pill?: boolean;
  /** Renderiza o menu via portal (evita corte em modais com overflow hidden) */
  menuPortal?: boolean;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  className = '',
  triggerClassName = '',
  disabled = false,
  searchable = false,
  size = 'md',
  pill = false,
  menuPortal = true,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setSearch('');
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  useEffect(() => {
    if (open && searchable && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, searchable]);

  useLayoutEffect(() => {
    if (!open || !menuPortal || !ref.current) return;

    const updatePosition = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const gap = 6;
      const needed = Math.min(filtered.length * 36 + (searchable ? 52 : 8), 360);
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openUp = needed > spaceBelow && spaceAbove > spaceBelow;
      const available = Math.max(8, openUp ? spaceAbove : spaceBelow);
      const maxH = Math.min(needed, available);

      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        top: openUp ? undefined : rect.bottom + gap,
        bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
        zIndex: 9999,
        maxHeight: maxH,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, menuPortal, filtered.length]);

  const sizeClasses = {
    xs: 'h-8 gap-1.5 px-2.5 text-sm',
    sm: 'h-10 gap-2 px-3 text-sm',
    md: 'h-10 gap-2 px-3 text-sm',
    lg: 'h-10 gap-2 px-3 text-sm',
  };

  const menuContent = (
    <div
      ref={menuRef}
      className={`${menuPortal ? 'flex min-h-0 flex-col' : 'absolute z-50 mt-1.5 flex max-h-72 w-full min-h-0 flex-col'} overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]`}
      style={menuPortal ? menuStyle : undefined}
    >
      {searchable && (
        <div className="border-b border-black/5 p-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full rounded-lg border border-black/10 bg-[#f8f8f6] py-2 pl-8 pr-3 text-xs font-medium text-neutral-800 outline-none focus:border-neutral-400"
            />
          </div>
        </div>
      )}
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs font-medium text-neutral-400">
            Nenhuma opção encontrada
          </div>
        ) : (
          filtered.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                setSearch('');
              }}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                option.value === value
                  ? 'bg-neutral-900 font-medium text-white'
                  : 'font-medium text-neutral-700 hover:bg-[#f6f6f4]'
              }`}
            >
              <span className="truncate">{option.label}</span>
              {option.value === value && <Check size={14} strokeWidth={2.5} className="shrink-0" />}
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div ref={ref} className={`relative w-full min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`box-border flex w-full items-center justify-between border font-medium text-neutral-900 outline-none transition-colors disabled:cursor-default disabled:opacity-100 ${
          pill
            ? 'h-10 gap-2 rounded-full border-neutral-200 bg-white px-4 text-sm hover:border-neutral-300 focus:border-neutral-900 disabled:bg-neutral-50'
            : `rounded-md border-neutral-200 bg-white hover:border-neutral-300 focus:border-neutral-900 disabled:border-neutral-200 disabled:bg-white ${sizeClasses[size]}`
        } ${open ? 'border-neutral-900' : ''} ${triggerClassName}`}
      >
        <span className={`truncate ${!selected ? 'text-neutral-400' : 'font-medium'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-neutral-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (menuPortal && typeof document !== 'undefined'
        ? createPortal(menuContent, document.body)
        : menuContent
      )}
    </div>
  );
}
