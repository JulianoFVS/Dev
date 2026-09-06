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
        <div className="absolute inset-x-0 top-0 h-[62%] bg-gradient-to-b from-white/88 via-white/62 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-[48%] backdrop-blur-[6px] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]" />

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

      <div className="absolute inset-x-0 top-[4.75rem] bottom-[46%] z-30 flex items-center justify-center px-5 sm:bottom-[48%]">
        <div className="flex w-full max-w-[1100px] flex-col items-center text-center">
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

      <div className="absolute right-[clamp(16px,4vw,56px)] bottom-[26%] z-30 hidden border-l-2 border-ortus-blue pl-3.5 text-left lg:block">
        {chamada}
      </div>

      <div className="absolute bottom-[24%] left-4 z-30 border-l-2 border-ortus-blue pl-3 text-left lg:hidden">
        {chamada}
      </div>
    </section>
  );
}
