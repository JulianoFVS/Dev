export default function DashboardLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      {/* Header skeleton */}
      <div className="mb-3 shrink-0">
        <div className="h-9 w-72 animate-pulse rounded-2xl bg-neutral-200 sm:h-10 sm:w-96" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded-xl bg-neutral-100" />
        <div className="mt-3 flex gap-2">
          {[80, 72, 88, 76, 80].map((w, i) => (
            <div key={i} className={`h-9 w-[${w}px] animate-pulse rounded-full bg-neutral-200`} />
          ))}
        </div>
      </div>

      {/* Bento cards skeleton */}
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2.5 sm:gap-3">
        <div className="grid grid-cols-1 gap-2.5 sm:gap-3 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="min-h-[9rem] animate-pulse rounded-[1.35rem] bg-neutral-200 sm:rounded-[1.5rem]" />
          ))}
        </div>
        <div className="grid min-h-0 grid-cols-1 gap-2.5 overflow-hidden sm:gap-3 lg:grid-cols-[1fr_22rem]">
          <div className="animate-pulse rounded-[1.35rem] bg-neutral-200 sm:rounded-[1.5rem]" />
          <div className="flex flex-col gap-2.5 sm:gap-3">
            <div className="flex-1 animate-pulse rounded-[1.35rem] bg-neutral-200 sm:rounded-[1.5rem]" />
            <div className="h-20 animate-pulse rounded-[1.35rem] bg-neutral-200 sm:rounded-[1.5rem]" />
          </div>
        </div>
      </div>
    </div>
  );
}
