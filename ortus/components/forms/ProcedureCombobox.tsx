'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import CustomSelect from '@/components/ui/CustomSelect';

export type ProcedimentoOption = {
  id: string | number;
  nome: string;
  valor_sugerido?: number | string | null;
  especialidade_id?: string | null;
};

type Props = {
  clinicaId: string | number | null | undefined;
  especialidades: { id: string; nome: string }[];
  tratamentos: ProcedimentoOption[];
  value: string;
  onChange: (nome: string, tratamento?: ProcedimentoOption | null) => void;
  disabled?: boolean;
};

export default function ProcedureCombobox({
  clinicaId,
  especialidades,
  tratamentos,
  value,
  onChange,
  disabled,
}: Props) {
  const [espId, setEspId] = useState('');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (!espId && especialidades.length) setEspId(especialidades[0].id);
    if (espId && !especialidades.some((e) => e.id === espId)) {
      setEspId(especialidades[0]?.id || '');
    }
  }, [especialidades, espId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tratamentos
      .filter((t) => !espId || t.especialidade_id === espId)
      .filter((t) => !q || t.nome.toLowerCase().includes(q))
      .slice(0, 12);
  }, [tratamentos, espId, query]);

  function pick(t: ProcedimentoOption) {
    setQuery(t.nome);
    onChange(t.nome, t);
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      {especialidades.length > 0 && (
        <CustomSelect
          value={espId}
          onChange={setEspId}
          options={especialidades.map((e) => ({ value: e.id, label: e.nome }))}
          placeholder="Especialidade..."
          disabled={disabled || !clinicaId}
          size="sm"
        />
      )}
      <div ref={wrapRef} className="relative">
        <div className="flex gap-1">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onChange(e.target.value, null);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            disabled={disabled || !clinicaId}
            placeholder={clinicaId ? 'Buscar ou digitar procedimento...' : 'Selecione a clínica primeiro'}
            className="box-border h-10 min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"
          />
          <button
            type="button"
            disabled={disabled || !clinicaId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-50"
            aria-label="Abrir lista de procedimentos"
          >
            <ChevronDown size={18} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        </div>
        {open && clinicaId && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-neutral-200 bg-white">
            {filtrados.length === 0 ? (
              <p className="p-3 text-xs text-slate-400 italic">Nenhum procedimento encontrado — use texto livre.</p>
            ) : (
              filtrados.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(t)}
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 border-b border-slate-50 last:border-0 flex justify-between gap-2"
                >
                  <span className="font-medium text-slate-700 truncate">{t.nome}</span>
                  <span className="text-xs font-bold text-blue-600 shrink-0">
                    R$ {Number(t.valor_sugerido || 0).toFixed(2)}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
