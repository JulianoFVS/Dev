/**
 * Esqueleto da ficha, com o mesmo desenho da tela pronta: cabeçalho do paciente, abas
 * (faixa de lado no celular, coluna à esquerda no computador) e conteúdo.
 * Serve à troca de rota e à própria ficha enquanto o paciente ainda não veio do cache.
 */
export default function PacienteDetalheLoading() {
  return (
    <div aria-busy="true" className="flex w-full shrink-0 grow flex-col bg-white lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-hidden">
      <div className="flex shrink-0 flex-col gap-2 border-b border-black/10 px-3 py-2.5 sm:px-4 md:flex-row md:items-center md:justify-between md:gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-neutral-100 sm:h-8 sm:w-8" />
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-neutral-100" />
          <div className="min-w-0 space-y-1.5">
            <div className="h-5 w-44 max-w-full animate-pulse rounded-md bg-neutral-100" />
            <div className="h-3 w-24 animate-pulse rounded-md bg-neutral-50" />
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 w-10 animate-pulse rounded-full bg-neutral-100 sm:h-8 sm:w-20" />
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex shrink-0 gap-1 overflow-hidden border-b border-black/10 px-2 py-2 lg:w-56 lg:flex-col lg:border-b-0 lg:border-r">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 w-28 shrink-0 animate-pulse rounded-xl bg-neutral-100 lg:w-full" />
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-4 px-3 pb-4 pt-3 sm:px-5 sm:pt-4">
          <div className="h-5 w-48 animate-pulse rounded-md bg-neutral-100" />
          <div className="mx-auto h-28 w-28 animate-pulse rounded-md bg-neutral-100 sm:mx-0 sm:h-36 sm:w-36" />
          <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3 w-20 animate-pulse rounded-md bg-neutral-50" />
                <div className="h-10 animate-pulse rounded-md bg-neutral-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
