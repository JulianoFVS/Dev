export default function PacientesLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      {/* Header: no celular o botão ocupa a linha de baixo, como na tela pronta */}
      <div className="mb-3 flex flex-col gap-3 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-8 w-36 animate-pulse rounded-2xl bg-neutral-200 sm:h-9 sm:w-44" />
          <div className="mt-1.5 h-3.5 w-20 animate-pulse rounded-xl bg-neutral-100" />
        </div>
        <div className="flex gap-2">
          <div className="hidden h-10 w-24 animate-pulse rounded-md bg-neutral-200 sm:block" />
          <div className="h-11 w-full animate-pulse rounded-md bg-neutral-900/20 sm:h-10 sm:w-36" />
        </div>
      </div>

      {/* Search bar: no celular são duas linhas (busca e filtros) */}
      <div className="mb-3 h-28 shrink-0 animate-pulse rounded-xl bg-neutral-200 md:h-12" />

      {/* Rows skeleton */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl bg-white p-4">
            <div className="h-10 w-10 animate-pulse rounded-full bg-neutral-200 sm:h-11 sm:w-11" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 animate-pulse rounded-lg bg-neutral-200" />
              <div className="h-3 w-28 animate-pulse rounded-lg bg-neutral-100" />
            </div>
            <div className="h-6 w-16 animate-pulse rounded-full bg-neutral-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
