export default function TratamentosLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="mb-3 h-8 w-56 animate-pulse rounded-md bg-neutral-100" />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white lg:flex-row">
        <div className="h-12 shrink-0 border-b border-neutral-200 lg:h-auto lg:w-56 lg:border-b-0 lg:border-r" />
        <div className="flex-1 space-y-2 p-3">
          <div className="h-8 w-40 animate-pulse rounded-md bg-neutral-100" />
          <div className="h-10 animate-pulse rounded-md bg-neutral-50" />
          <div className="h-10 animate-pulse rounded-md bg-neutral-50" />
          <div className="h-10 animate-pulse rounded-md bg-neutral-50" />
        </div>
      </div>
    </div>
  );
}
