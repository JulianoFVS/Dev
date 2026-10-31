export default function AgendaLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="h-8 w-48 animate-pulse rounded-md bg-neutral-200" />
      <div className="h-10 w-full animate-pulse rounded-md bg-neutral-100" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <div className="h-8 w-28 animate-pulse rounded-md bg-neutral-100" />
          <div className="h-8 w-20 animate-pulse rounded-md bg-neutral-100" />
          <div className="h-8 w-28 animate-pulse rounded-md bg-neutral-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-36 animate-pulse rounded-md bg-neutral-100 sm:w-56" />
          <div className="h-8 w-20 animate-pulse rounded-md bg-neutral-200 sm:w-40" />
        </div>
      </div>
      <div className="min-h-0 flex-1 animate-pulse rounded-xl bg-neutral-100" />
    </div>
  );
}
