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
