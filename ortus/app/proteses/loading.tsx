export default function ProtesesLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="h-8 w-40 animate-pulse rounded-2xl bg-neutral-200 sm:h-9" />
          <div className="mt-2 h-4 w-56 animate-pulse rounded-xl bg-neutral-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-28 animate-pulse rounded-full bg-neutral-200" />
          <div className="h-10 w-36 animate-pulse rounded-full bg-neutral-900/20" />
        </div>
      </div>
      <div className="h-14 shrink-0 animate-pulse rounded-[1.35rem] bg-neutral-200 sm:rounded-[1.5rem]" />
      <div className="kanban-scrollbar flex min-h-0 flex-1 gap-3 overflow-x-auto px-3 pb-2 pt-3 sm:px-4 sm:pt-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-full min-h-[280px] w-72 shrink-0 animate-pulse rounded-[1.35rem] bg-neutral-200 sm:min-h-0 sm:rounded-[1.5rem]" />
        ))}
      </div>
    </div>
  );
}
