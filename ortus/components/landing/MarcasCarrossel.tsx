'use client';

import type { ReactNode } from 'react';

/**
 * Barra de marcas parceiras do hero, em carrossel infinito de ponta a ponta.
 * Duas metades idênticas: quando a primeira sai, a segunda ocupa o mesmo lugar.
 */
interface Marca {
  nome: string;
  src?: string;
  glifo?: ReactNode;
  sup?: string;
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

/** Cópias por metade: cada grupo fica mais largo que a viewport e o -50% fecha o loop. */
const COPIAS_POR_GRUPO = 6;

function LogoMarca({ marca }: { marca: Marca }) {
  if (marca.src) {
    return (
      <img
        src={marca.src}
        alt={marca.nome}
        className="h-[14px] w-auto object-contain opacity-70 md:h-[16px]"
      />
    );
  }

  return (
    <span className="flex items-center gap-1 text-[12px] leading-none text-ortus-navy/70 md:text-[13px]">
      {marca.glifo}
      <span className={marca.classe}>
        {marca.nome}
        {marca.sup && <sup className="ml-px text-[0.5em] align-super">{marca.sup}</sup>}
      </span>
    </span>
  );
}

function GrupoMarcas({ ariaHidden }: { ariaHidden?: boolean }) {
  const itens = Array.from({ length: COPIAS_POR_GRUPO }, () => MARCAS).flat();

  return (
    <ul
      className="ortus-marquee-group"
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : 'Marcas parceiras'}
    >
      {itens.map((marca, i) => (
        <li
          key={`${marca.nome}-${i}`}
          className="flex shrink-0 items-center px-3.5 md:px-5"
        >
          <LogoMarca marca={marca} />
        </li>
      ))}
    </ul>
  );
}

export default function MarcasCarrossel({ denso = false }: { denso?: boolean }) {
  return (
    <div
      className={`ortus-marquee w-full overflow-hidden ${denso ? 'py-1.5' : ''}`}
      style={{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ '--marquee-duration': '36s' } as any),
      }}
    >
      <div className="ortus-marquee-track">
        <GrupoMarcas />
        <GrupoMarcas ariaHidden />
      </div>
    </div>
  );
}
