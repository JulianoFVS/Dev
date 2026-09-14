export default function ProtesesLoading() {
  return (
    <div className="w-full space-y-3 px-2.5 py-2.5 pb-12 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="h-8 w-40 animate-pulse rounded-2xl bg-neutral-200 sm:h-9" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded-xl bg-neutral-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-28 animate-pulse rounded-full bg-neutral-200" />
          <div className="h-10 w-36 animate-pulse rounded-full bg-neutral-900/20" />
        </div>
      </div>
      <div className="h-14 animate-pulse rounded-[1.35rem] bg-neutral-200 sm:rounded-[1.5rem]" />
      <div className="flex gap-3 overflow-x-auto pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[420px] w-72 shrink-0 animate-pulse rounded-[1.35rem] bg-neutral-200 sm:rounded-[1.5rem]" />
        ))}
      </div>
    </div>
  );
}
