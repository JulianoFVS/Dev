export default function FinanceiroLoading() {
  return (
    <div className="w-full space-y-3 px-2.5 py-2.5 pb-12 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="h-24 animate-pulse rounded-[1.35rem] bg-neutral-200 sm:rounded-[1.5rem]" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[1.35rem] bg-neutral-200 sm:rounded-[1.5rem]" />
        ))}
      </div>
      <div className="h-12 animate-pulse rounded-full bg-neutral-200" />
      <div className="space-y-2 rounded-[1.35rem] bg-white p-4 sm:rounded-[1.5rem]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-100" />
        ))}
      </div>
    </div>
  );
}
