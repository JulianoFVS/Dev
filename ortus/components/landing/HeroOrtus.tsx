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
  const raios = [34, 42, 50, 58, 66, 74, 82, 90];
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[20%] w-[min(92vw,1180px)] -translate-x-1/2 -translate-y-1/2"
      aria-hidden
    >
      <div className="absolute inset-[18%] rounded-full bg-[radial-gradient(circle,rgba(13,79,154,0.14)_0%,rgba(180,210,238,0.22)_38%,transparent_72%)] blur-3xl" />
      <svg className="relative w-full text-[#9fc0e4]/55" viewBox="0 0 200 200">
        <defs>
          <filter id="ortus-ring-blur" x="-8%" y="-8%" width="116%" height="116%">
            <feGaussianBlur stdDeviation="0.55" />
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
            strokeWidth="0.42"
            filter="url(#ortus-ring-blur)"
          />
        ))}
      </svg>
    </div>
  );
}

export default function HeroOrtus() {
  const chamada = (
    <p className="font-poppins text-[clamp(15px,1.4vw,21px)] font-medium leading-[1.3] text-ortus-navy">
      Gestão inteligente
      <br />
      para <span className="ortus-shine font-semibold">odontologia.</span>
    </p>
  );

  return (
    <section className="relative isolate h-[100svh] min-h-[640px] w-full overflow-hidden bg-[#f7fbff]">
      <div className="absolute inset-0 -z-10">
        <img
          src="/landing/fundo-clinica.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-[0.18] blur-2xl"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.82)_0%,rgba(248,251,255,0.72)_40%,rgba(236,245,255,0.7)_100%)]" />
        <AneisConcentricos />

        <svg
          className="absolute inset-x-0 bottom-0 h-[34%] w-full"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            fill="#c9dff6"
            fillOpacity="0.55"
            d="M0,132 C180,248 300,312 460,312 L980,312 C1140,312 1280,210 1440,96 L1440,320 L0,320 Z"
          />
          <path
            fill="#b4d0f0"
            fillOpacity="0.45"
            d="M0,214 C160,286 300,318 460,318 L1080,318 C1240,318 1340,278 1440,232 L1440,320 L0,320 Z"
          />
        </svg>

        <GradePontos className="absolute left-[2.6%] top-[46%] w-[clamp(22px,2.4vw,34px)] text-slate-300/70" />
        <GradePontos className="absolute right-[2.2%] top-[46%] w-[clamp(22px,2.4vw,34px)] text-slate-300/70" />
      </div>

      <div className="relative z-30 mx-auto flex w-full max-w-[1100px] flex-col items-center px-6 pt-[clamp(86px,11vh,118px)] text-center">
        <h1 className="sr-only">ORTUS</h1>
        <img
          src="/landing/ortus-wordmark.svg"
          alt="ortus"
          className="h-auto w-[clamp(210px,28vw,380px)]"
        />

        <p className="mt-[clamp(10px,1.6vh,18px)] max-w-[640px] font-poppins text-[clamp(14px,1.5vw,22px)] font-medium leading-[1.35] text-ortus-navy">
          Tecnologia, experiência e humanização para
          <br />
          <span className="font-semibold text-ortus-blue">transformar sorrisos e melhorar vidas.</span>
        </p>

        <div className="mt-[clamp(12px,1.8vh,20px)] flex flex-wrap items-center justify-center gap-3">
          <a
            href="#funcionalidades"
            className="flex h-10 items-center gap-2 rounded-full bg-ortus-blue px-5
                       font-poppins text-[13px] font-semibold text-white
                       transition-colors hover:bg-ortus-blueDark"
          >
            Conhecer funcionalidades
            <ArrowRight className="h-[1em] w-[1em]" strokeWidth={2.4} />
          </a>
          <Link
            href="#contato"
            className="flex h-10 items-center rounded-full border border-ortus-blue/70
                       bg-white/70 px-5 font-poppins text-[13px] font-semibold text-ortus-blue
                       transition-colors hover:bg-white"
          >
            Falar com especialista
          </Link>
        </div>

        <div className="mt-6 border-l-2 border-ortus-blue pl-3.5 text-left lg:hidden">
          {chamada}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-[7%] z-10 px-4">
        <div className="mx-auto flex h-14 w-full max-w-[920px] items-center overflow-hidden">
          <MarcasCarrossel />
        </div>
      </div>

      <img
        src="/landing/pessoas.png"
        alt="Equipe da clínica"
        className="pointer-events-none absolute bottom-0 left-1/2 z-20 h-[min(52vh,520px)] w-auto
                   max-w-[min(92vw,720px)] -translate-x-1/2 select-none object-contain object-bottom"
      />

      <div className="absolute right-[clamp(20px,5.2vw,72px)] top-[61%] z-30 hidden border-l-2 border-ortus-blue pl-3.5 text-left lg:block">
        {chamada}
      </div>
    </section>
  );
}
