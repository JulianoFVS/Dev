export default function ProtesesLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden px-2.5 py-2.5 sm:gap-3 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <div>
          <div className="h-7 w-40 animate-pulse rounded-2xl bg-neutral-200 sm:h-9" />
          <div className="mt-2 h-4 w-56 max-w-full animate-pulse rounded-xl bg-neutral-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-11 flex-1 animate-pulse rounded-md bg-neutral-200 sm:h-10 sm:w-28 sm:flex-none" />
          <div className="h-11 flex-1 animate-pulse rounded-md bg-neutral-900/20 sm:h-10 sm:w-36 sm:flex-none" />
        </div>
      </div>

      <div className="h-16 shrink-0 animate-pulse rounded-xl bg-neutral-200 sm:h-14" />

      {/* chips de etapa (celular) */}
      <div className="flex shrink-0 gap-1.5 overflow-hidden sm:hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 w-28 shrink-0 animate-pulse rounded-full bg-neutral-200" />
        ))}
      </div>

      {/* fluxo do processo (tablet/desktop) */}
      <div className="hidden h-14 shrink-0 animate-pulse rounded-xl bg-neutral-200 sm:block" />

      <div className="flex min-h-0 flex-1 gap-3 rounded-xl bg-neutral-100 p-2.5 sm:p-3">
        <div className="min-h-[200px] flex-1 animate-pulse rounded-xl bg-neutral-200 sm:min-h-0 sm:w-72 sm:flex-none" />
        <div className="hidden h-full w-72 shrink-0 animate-pulse rounded-xl bg-neutral-200 sm:block" />
        <div className="hidden h-full w-72 shrink-0 animate-pulse rounded-xl bg-neutral-200 lg:block" />
      </div>
    </div>
  );
}
