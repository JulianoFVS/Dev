export default function FinanceiroLoading() {
  return (
    <div className="w-full space-y-3 px-2.5 py-2.5 pb-12 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="h-16 animate-pulse rounded-xl bg-neutral-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-neutral-200" />
        ))}
      </div>
      <div className="h-10 animate-pulse rounded-md bg-neutral-200" />
      <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-neutral-100" />
        ))}
      </div>
    </div>
  );
}
