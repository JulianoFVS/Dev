export default function FinanceiroLoading() {
  return (
    <div className="flex w-full flex-col gap-3 px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      {/* Mesma ordem da tela: no celular vêm título, ação, mês, indicadores, abas e cartões. */}
      <div className="h-8 w-40 animate-pulse rounded-md bg-neutral-200 md:h-16 md:w-full md:rounded-xl" />
      <div className="h-11 animate-pulse rounded-md bg-neutral-200 md:hidden" />
      <div className="h-11 animate-pulse rounded-md bg-neutral-200 md:hidden" />
      <div className="hidden h-[4.5rem] animate-pulse rounded-xl bg-neutral-200 md:block" />
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-neutral-200" />
        ))}
      </div>
      <div className="h-11 animate-pulse rounded-xl bg-neutral-200 md:h-10 md:rounded-md" />
      <div className="space-y-2 md:rounded-xl md:border md:border-neutral-200 md:bg-white md:p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-neutral-200 md:h-14 md:rounded-md md:bg-neutral-100" />
        ))}
      </div>
    </div>
  );
}
