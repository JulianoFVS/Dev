'use client';

import type { ReactNode } from 'react';

/**
 * Barra de marcas parceiras do hero, em carrossel infinito.
 *
 * Para usar os logotipos oficiais, coloque os arquivos em
 * `public/landing/marcas/` e preencha o campo `src` da marca correspondente —
 * o desenho abaixo é usado apenas enquanto o arquivo não existe.
 */
interface Marca {
  nome: string;
  /** Caminho para o logotipo oficial, se disponível. */
  src?: string;
  glifo?: ReactNode;
  /** Sobrescrito ao lado do nome (®, ™). */
  sup?: string;
  /** Peso/estilo próprios da assinatura da marca. */
  classe?: string;
}

const asterisco = (
  <svg viewBox="0 0 24 24" className="h-[1.15em] w-[1.15em]" fill="currentColor" aria-hidden>
    {[0, 45, 90, 135].map((a) => (
      <rect key={a} x="11" y="2" width="2" height="20" rx="1" transform={`rotate(${a} 12 12)`} />
    ))}
  </svg>
);

const swoosh = (
  <svg viewBox="0 0 28 24" className="h-[1.05em] w-[1.25em]" fill="currentColor" aria-hidden>
    <path d="M4 17.5c5.5-1.2 10-4.2 13.2-9.1L14 8.4l9-4.9-1.2 10.1-2.4-3C15.7 15.9 10.6 19 4 20v-2.5Z" />
    <path d="M2 21.5h18l-2 2.5H0l2-2.5Z" opacity=".55" />
  </svg>
);

const anelA = (
  <svg viewBox="0 0 24 24" className="h-[1.3em] w-[1.3em]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <circle cx="12" cy="12" r="8" />
    <path d="M20 4v16" strokeLinecap="round" />
  </svg>
);

const bandeira = (
  <svg viewBox="0 0 24 24" className="h-[1.1em] w-[1.1em]" fill="currentColor" aria-hidden>
    <path d="M2 5h20L9.5 19 2 5Zm4.6 2.4 3.2 6 5.4-6H6.6Z" />
  </svg>
);

const MARCAS: Marca[] = [
  { nome: 'invisalign', glifo: asterisco, sup: '®', classe: 'font-medium tracking-tight' },
  { nome: 'straumann', glifo: swoosh, classe: 'font-bold italic tracking-tight' },
  { nome: 'angelus', glifo: anelA, sup: '®', classe: 'font-medium tracking-tight' },
  { nome: '3M', classe: 'font-extrabold tracking-tighter text-[1.35em]' },
  { nome: 'Carestream', glifo: bandeira, classe: 'font-medium tracking-tight' },
];

function LogoMarca({ marca }: { marca: Marca }) {
  if (marca.src) {
    return (
      <img
        src={marca.src}
        alt={marca.nome}
        className="h-[18px] w-auto object-contain opacity-70"
      />
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-[14px] leading-none text-ortus-navy/70">
      {marca.glifo}
      <span className={marca.classe}>
        {marca.nome}
        {marca.sup && <sup className="ml-px text-[0.5em] align-super">{marca.sup}</sup>}
      </span>
    </span>
  );
}

export default function MarcasCarrossel() {
  // A trilha repete a lista duas vezes; o keyframe desloca -50% e reinicia
  // exatamente sobre a cópia, sem salto visível.
  const trilha = [...MARCAS, ...MARCAS];

  return (
    <div
      className="ortus-marquee w-full overflow-hidden"
      style={{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...( { '--marquee-duration': '30s' } as any),
        maskImage: 'linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)',
      }}
    >
      <ul className="ortus-marquee-track items-center" aria-label="Marcas parceiras">
        {trilha.map((marca, i) => (
          <li
            key={`${marca.nome}-${i}`}
            aria-hidden={i >= MARCAS.length}
            className="flex shrink-0 items-center"
          >
            <span className="px-8">
              <LogoMarca marca={marca} />
            </span>
            <span className="h-5 w-px bg-slate-300/50" />
          </li>
        ))}
      </ul>
    </div>
  );
}
