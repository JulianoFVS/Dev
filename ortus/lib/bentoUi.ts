/** Tokens visuais compartilhados — shell Bento (#f3f4f1, cards brancos, pills neutral-900). */

export const bentoCard = 'rounded-[1.35rem] bg-white sm:rounded-[1.5rem]';
/** Card com borda e padding padrão de seção */
export const bentoSection = `${bentoCard} border border-black/10 p-4 sm:p-6`;
export const bentoPagePad = 'px-2.5 py-2.5 pb-12 sm:px-3 sm:py-3 md:px-4 md:py-3.5';
export const bentoInput =
  'w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm font-medium text-neutral-800 outline-none focus:border-neutral-400';

export function bentoPill(ativo: boolean) {
  return `shrink-0 rounded-full px-3 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
    ativo ? 'bg-neutral-900 text-white' : 'border border-black/10 bg-white text-neutral-600 hover:bg-neutral-50'
  }`;
}

export function bentoTab(ativo: boolean) {
  return `shrink-0 border-b-2 pb-3 px-2 text-sm font-medium transition-colors whitespace-nowrap ${
    ativo ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'
  }`;
}

export const bentoPrimaryBtn =
  'inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60';

export const bentoGhostBtn =
  'inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50';

export const bentoModalPanel =
  'w-full overflow-hidden rounded-[1.35rem] border border-black/10 bg-white shadow-2xl sm:rounded-[1.5rem]';

/** Chip / pill de seleção (dia da semana, plano, vínculo) */
export function bentoChip(ativo: boolean) {
  return `border transition-all ${
    ativo
      ? 'border-neutral-900 bg-neutral-900 text-white shadow-sm'
      : 'border-black/10 bg-white text-neutral-600 hover:border-neutral-300'
  }`;
}

export function bentoChipOutline(ativo: boolean) {
  return `border transition-all ${
    ativo
      ? 'border-neutral-900 bg-neutral-50 text-neutral-900 shadow-sm'
      : 'border-black/10 bg-white text-neutral-600 hover:border-neutral-300'
  }`;
}

export const bentoToggleTrackOn = 'bg-neutral-900';
export const bentoToggleTrackOff = 'bg-neutral-300';

export const bentoChartBar = 'rounded-t-lg bg-neutral-800 transition-colors hover:bg-neutral-950';
export const bentoChartFill = 'h-full rounded-full bg-neutral-800 transition-all';
