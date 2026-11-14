'use client';

import { memo } from 'react';
import { Check, X } from 'lucide-react';

export type ChipProfissional = {
  id: string;
  nome: string;
  cor: string;
};

type Props = {
  profissionais: ChipProfissional[];
  selecionados: string[];
  onToggle: (id: string) => void;
  onLimpar: () => void;
};

function ChipsProfissionais({ profissionais, selecionados, onToggle, onLimpar }: Props) {
  if (!profissionais.length) return null;

  return (
    <div
      role="group"
      aria-label="Filtrar agenda por profissional"
      className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        onClick={onLimpar}
        aria-pressed={selecionados.length === 0}
        className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium sm:min-h-[34px] ${
          selecionados.length === 0
            ? 'border-neutral-900 bg-neutral-900 text-white'
            : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
        }`}
      >
        Todos
        {selecionados.length === 0 && <Check size={12} className="shrink-0" />}
        {selecionados.length > 0 && <X size={12} className="shrink-0 opacity-70" />}
      </button>
      {profissionais.map((profissional) => {
        const ativo = selecionados.includes(profissional.id);
        return (
          <button
            key={profissional.id}
            type="button"
            title={`Filtrar ${profissional.nome}`}
            aria-pressed={ativo}
            onClick={() => onToggle(profissional.id)}
            className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium sm:min-h-[34px] ${
              ativo
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/5"
              style={{ backgroundColor: profissional.cor }}
            />
            <span className="max-w-[9rem] truncate">{profissional.nome}</span>
            {ativo && <Check size={12} className="shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

export default memo(ChipsProfissionais);
