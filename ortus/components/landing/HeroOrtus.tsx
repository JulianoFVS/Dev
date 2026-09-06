'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import MarcasCarrossel from './MarcasCarrossel';

function GradePontos({ className }: { className?: string }) {
  const pontos = Array.from({ length: 4 }, (_, l) => Array.from({ length: 3 }, (_, c) => [c, l]));
  return (
    <svg viewBox="0 0 28 38" className={className} aria-hidden>
      {pontos.flat().map(([c, l]) => (
        <circle key={`${c}-${l}`} cx={2 + c * 12} cy={2 + l * 12} r="1.45" fill="currentColor" />
      ))}
    </svg>
  );
}

function AneisConcentricos() {
  const raios = [36, 44, 52, 60, 68, 76, 84, 92];
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[18%] w-[min(110vw,1400px)] -translate-x-1/2 -translate-y-1/2"
      aria-hidden
    >
      <div className="absolute inset-[16%] rounded-full bg-[radial-gradient(circle,rgba(13,79,154,0.16)_0%,rgba(170,206,236,0.28)_42%,transparent_74%)] blur-3xl" />
      <svg className="relative w-full text-[#8fb6dc]/70" viewBox="0 0 200 200">
        <defs>
          <filter id="ortus-ring-blur" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="0.7" />
          </filter>
        </defs>
        {raios.map((r) => (
          <circle
            key={r}
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            filter="url(#ortus-ring-blur)"
          />
        ))}
      </svg>
    </div>
  );
}

export default function HeroOrtus() {
  const chamada = (
    <p className="font-poppins text-[clamp(14px,1.35vw,20px)] font-medium leading-[1.3] text-ortus-navy">
      Gestão inteligente
      <br />
      para <span className="ortus-shine font-semibold">odontologia.</span>
    </p>
  );

  return (
    <section className="relative isolate h-[100svh] min-h-[580px] w-full overflow-hidden bg-[#eef5fb]">
      <div className="absolute inset-0">
        <img
          src="/landing/fundo-clinica.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-white/40" />
        <AneisConcentricos />

        <svg
          className="absolute inset-x-0 bottom-0 h-[32%] w-full"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            fill="#c9dff6"
            fillOpacity="0.42"
            d="M0,132 C180,248 300,312 460,312 L980,312 C1140,312 1280,210 1440,96 L1440,320 L0,320 Z"
          />
          <path
            fill="#b4d0f0"
            fillOpacity="0.32"
            d="M0,214 C160,286 300,318 460,318 L1080,318 C1240,318 1340,278 1440,232 L1440,320 L0,320 Z"
          />
        </svg>

        <GradePontos className="absolute left-[2.4%] top-[44%] hidden w-[clamp(22px,2.4vw,34px)] text-slate-300/70 sm:block" />
        <GradePontos className="absolute right-[2%] top-[44%] hidden w-[clamp(22px,2.4vw,34px)] text-slate-300/70 sm:block" />
      </div>

      <div className="relative z-30 mx-auto flex w-full max-w-[1100px] flex-col items-center px-5 pt-[clamp(76px,10.5vh,112px)] text-center">
        <h1 className="sr-only">ORTUS</h1>
        <img
          src="/landing/ortus-wordmark.svg"
          alt="ortus"
          className="h-auto w-[clamp(168px,26vw,360px)]"
        />

        <p className="mt-[clamp(8px,1.4vh,16px)] max-w-[620px] font-poppins text-[clamp(13px,1.45vw,21px)] font-medium leading-[1.35] text-ortus-navy">
          Tecnologia, experiência e humanização para
          <br className="hidden sm:block" />
          <span className="font-semibold text-ortus-blue"> transformar sorrisos e melhorar vidas.</span>
        </p>

        <div className="mt-[clamp(10px,1.6vh,18px)] flex flex-wrap items-center justify-center gap-2.5">
          <a
            href="#funcionalidades"
            className="flex h-9 items-center gap-2 rounded-full bg-ortus-blue px-4
                       font-poppins text-[12.5px] font-semibold text-white
                       transition-colors hover:bg-ortus-blueDark sm:h-10 sm:px-5 sm:text-[13px]"
          >
            Conhecer funcionalidades
            <ArrowRight className="h-[1em] w-[1em]" strokeWidth={2.4} />
          </a>
          <Link
            href="#contato"
            className="flex h-9 items-center rounded-full border border-ortus-blue/70
                       bg-white/60 px-4 font-poppins text-[12.5px] font-semibold text-ortus-blue
                       transition-colors hover:bg-white sm:h-10 sm:px-5 sm:text-[13px]"
          >
            Falar com especialista
          </Link>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-[16%] z-10 w-full sm:bottom-[13%]">
        <MarcasCarrossel />
      </div>

      <img
        src="/landing/pessoas.png"
        alt="Equipe da clínica"
        className="pointer-events-none absolute bottom-0 left-1/2 z-20 h-[min(46vh,420px)] w-auto
                   max-w-[min(88vw,680px)] -translate-x-1/2 select-none object-contain object-bottom
                   sm:h-[min(54vh,540px)]"
      />

      <div className="absolute right-[clamp(16px,5vw,72px)] top-[58%] z-30 hidden border-l-2 border-ortus-blue pl-3.5 text-left lg:block">
        {chamada}
      </div>

      <div className="absolute bottom-[38%] left-4 z-30 border-l-2 border-ortus-blue pl-3 text-left sm:bottom-[42%] lg:hidden">
        {chamada}
      </div>
    </section>
  );
}
