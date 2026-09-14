export default function PacienteDetalheLoading() {
  return (
    <div className="w-full space-y-3 px-2.5 py-2.5 pb-16 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="flex items-center gap-4 rounded-[1.35rem] border border-black/5 bg-white p-4 sm:rounded-[1.5rem] sm:p-5">
        <div className="h-11 w-11 shrink-0 animate-pulse rounded-2xl bg-neutral-100" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-48 animate-pulse rounded-lg bg-neutral-100" />
          <div className="h-3 w-32 animate-pulse rounded-lg bg-neutral-50" />
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-9 w-28 shrink-0 animate-pulse rounded-full bg-neutral-100" />
        ))}
      </div>
      <div className="h-[50vh] animate-pulse rounded-[1.35rem] bg-neutral-100 sm:rounded-[1.5rem]" />
    </div>
  );
}
