export default function AgendaLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-32 animate-pulse rounded-xl bg-neutral-200" />
          <div className="h-4 w-48 animate-pulse rounded-lg bg-neutral-100" />
        </div>
        <div className="h-11 w-full animate-pulse rounded-full bg-neutral-200 sm:w-44" />
      </div>
      <div className="h-10 w-full max-w-md animate-pulse rounded-full bg-neutral-100" />
      <div className="min-h-0 flex-1 animate-pulse rounded-[1.35rem] bg-neutral-200 sm:rounded-[1.5rem]" />
    </div>
  );
}
