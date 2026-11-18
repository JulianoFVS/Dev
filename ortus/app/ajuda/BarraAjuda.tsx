import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export function BarraAjuda({ titulo }: { titulo: string }) {
  return (
    <div className="relative flex h-12 shrink-0 items-center overflow-hidden rounded-2xl bg-[#141816] px-2.5 sm:h-14 sm:rounded-[1.25rem] sm:px-3">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(190,220,90,0.28),transparent_60%)]" />
      <Link
        href="/ajuda"
        aria-label="Voltar"
        className="relative z-10 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white hover:bg-white/10 sm:h-8 sm:w-8"
      >
        <ArrowLeft size={16} />
      </Link>
      <p className="pointer-events-none absolute inset-x-12 top-1/2 -translate-y-1/2 truncate text-center text-sm font-semibold text-white sm:text-base">
        {titulo}
      </p>
    </div>
  );
}
