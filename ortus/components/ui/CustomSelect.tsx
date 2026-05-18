'use client';
import { useState, useRef, useEffect } from 'react';
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
  size?: 'sm' | 'md' | 'lg';
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
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
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

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs gap-1.5',
    md: 'px-3 py-2.5 text-sm gap-2',
    lg: 'px-4 py-3 text-sm gap-2',
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between
          bg-white border border-slate-200 rounded-xl
          font-medium text-slate-700 transition-all
          hover:border-blue-300 hover:bg-blue-50/30
          focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400
          disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:bg-white
          ${sizeClasses[size]}
          ${open ? 'ring-2 ring-blue-500/20 border-blue-400' : ''}
          ${triggerClassName}
        `}
      >
        <span className={`truncate ${!selected ? 'text-slate-400' : 'font-semibold'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={size === 'sm' ? 14 : 16}
          className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full min-w-[180px] bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-200/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {searchable && (
            <div className="p-2 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-100 rounded-lg outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-300 font-medium"
                />
              </div>
            </div>
          )}
          <div className="max-h-56 overflow-y-auto py-1 custom-scrollbar">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400 font-medium">
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
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 text-left transition-colors
                    ${option.value === value
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50 font-medium'
                    }
                  `}
                >
                  <div className={`
                    w-4 h-4 rounded-md flex items-center justify-center shrink-0 transition-colors
                    ${option.value === value
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-200'
                    }
                  `}>
                    {option.value === value && <Check size={10} strokeWidth={3} />}
                  </div>
                  <span className={`truncate ${size === 'sm' ? 'text-xs' : 'text-sm'}`}>
                    {option.label}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
