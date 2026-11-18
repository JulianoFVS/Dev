export default function ProtesesLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="h-8 w-40 animate-pulse rounded-2xl bg-neutral-200 sm:h-9" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded-xl bg-neutral-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-11 flex-1 animate-pulse rounded-md bg-neutral-200 sm:h-10 sm:w-28 sm:flex-none" />
          <div className="h-11 flex-1 animate-pulse rounded-md bg-neutral-900/20 sm:h-10 sm:w-36 sm:flex-none" />
        </div>
      </div>
      <div className="h-16 shrink-0 animate-pulse rounded-xl bg-neutral-200 md:h-14" />
      {/* Celular: resumo do fluxo e etapas empilhadas, como na tela. No computador, as colunas lado a lado. */}
      <div className="h-36 shrink-0 animate-pulse rounded-xl bg-neutral-200 md:hidden" />
      <div className="kanban-scrollbar flex min-h-0 flex-1 flex-col gap-3 md:flex-row md:overflow-x-auto md:px-4 md:pb-2 md:pt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 w-full shrink-0 animate-pulse rounded-xl bg-neutral-200 md:h-full md:w-72" />
        ))}
      </div>
    </div>
  );
}
