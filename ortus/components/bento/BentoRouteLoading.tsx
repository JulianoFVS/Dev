/** Skeleton genérico para rotas no shell Bento (casca já visível via layout). */
export default function BentoRouteLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-2.5 py-2.5 pb-12 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="mb-4">
        <div className="h-8 w-48 animate-pulse rounded-xl bg-neutral-200 sm:h-9 sm:w-64" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded-lg bg-neutral-100" />
      </div>
      <div className="space-y-3">
        <div className="h-11 animate-pulse rounded-full bg-neutral-200" />
        <div className="h-48 animate-pulse rounded-[1.35rem] bg-neutral-200 sm:rounded-[1.5rem]" />
        <div className="h-64 animate-pulse rounded-[1.35rem] bg-neutral-100 sm:rounded-[1.5rem]" />
      </div>
    </div>
  );
}
