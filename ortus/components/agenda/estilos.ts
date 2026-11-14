/**
 * Classes utilitárias da agenda.
 *
 * Mantido em `components/` de propósito: o Tailwind só varre `app/` e
 * `components/`, então as classes de status precisam existir em um arquivo
 * escaneado para serem geradas no CSS final.
 */
export function corStatus(status?: string | null): string {
  if (status === 'concluido') return 'bg-emerald-500';
  if (status === 'fiado') return 'bg-amber-500';
  if (status === 'cancelado') return 'bg-rose-500';
  return 'bg-neutral-900';
}

/**
 * Paleta fixa da agenda. É usada quando o profissional ainda não tem
 * `cor_agenda` cadastrada, garantindo uma cor estável entre recarregamentos.
 */
export const PALETA_PROFISSIONAL = [
  '#2563eb',
  '#db2777',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#4b5563',
] as const;

/** Cor neutra para atendimentos sem profissional vinculado. */
export const COR_PROFISSIONAL_PADRAO = '#94a3b8';

type ProfissionalCor = {
  id?: string | number | null;
  cor_agenda?: string | null;
};

/**
 * Índice determinístico na paleta. IDs numéricos usam `id % 8` (como antes);
 * IDs em UUID ganham um hash simples para não ficarem todos com a mesma cor.
 */
function indicePaleta(id: string | number | null | undefined): number {
  if (id === null || id === undefined || id === '') return PALETA_PROFISSIONAL.length - 1;
  const numero = typeof id === 'number' ? id : Number(id);
  if (Number.isFinite(numero)) {
    return Math.abs(Math.trunc(numero)) % PALETA_PROFISSIONAL.length;
  }
  const texto = String(id);
  let hash = 0;
  for (let indice = 0; indice < texto.length; indice += 1) {
    hash = (hash * 31 + texto.charCodeAt(indice)) >>> 0;
  }
  return hash % PALETA_PROFISSIONAL.length;
}

/** Cor do profissional: `cor_agenda` quando existir, senão paleta fixa. */
export function corProfissional(profissional?: ProfissionalCor | null): string {
  const corSalva = profissional?.cor_agenda?.trim();
  if (corSalva) return corSalva;
  return PALETA_PROFISSIONAL[indicePaleta(profissional?.id)];
}
