'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import MarcasCarrossel from './MarcasCarrossel';

function GradePontos({ className }: { className?: string }) {
  const pontos = Array.from({ length: 5 }, (_, l) => Array.from({ length: 5 }, (_, c) => [c, l]));
  return (
    <svg viewBox="0 0 44 44" className={className} aria-hidden>
      {pontos.flat().map(([c, l]) => (
        <circle key={`${c}-${l}`} cx={2 + c * 10} cy={2 + l * 10} r="1.55" fill="currentColor" />
      ))}
    </svg>
  );
}

function AneisConcentricos() {
  const raios = [18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98];
  return (
    <svg
      className="pointer-events-none absolute left-1/2 top-[22%] w-[min(160vw,2200px)] -translate-x-1/2 -translate-y-1/2 text-[#d7e6f8]"
      viewBox="0 0 200 200"
      aria-hidden
    >
      {raios.map((r) => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="currentColor" strokeWidth="0.28" />
      ))}
    </svg>
  );
}

export default function HeroOrtus() {
  const chamada = (
    <p className="font-poppins text-[clamp(16px,1.55vw,23px)] font-medium leading-[1.28] text-ortus-navy">
      Gestão inteligente
      <br />
      para <span className="font-semibold text-ortus-blue">odontologia.</span>
    </p>
  );

  return (
    <section className="relative isolate min-h-[100svh] w-full overflow-hidden bg-[#f8fbff]">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_28%,#eef5fd_62%,#e4effc_100%)]" />
        <div className="absolute left-1/2 top-[8%] h-[42%] w-[58%] -translate-x-1/2 rounded-full bg-white/80 blur-3xl" />
        <AneisConcentricos />

        <svg
          className="absolute inset-x-0 bottom-0 h-[38%] w-full"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            fill="#cfe2fa"
            d="M0,128 C180,248 300,312 460,312 L980,312 C1140,312 1280,210 1440,96 L1440,320 L0,320 Z"
          />
          <path
            fill="#b7d4f6"
            d="M0,210 C160,286 300,318 460,318 L1080,318 C1240,318 1340,278 1440,232 L1440,320 L0,320 Z"
          />
        </svg>

        <GradePontos className="absolute left-[2.4%] top-[14%] w-[clamp(30px,3.1vw,44px)] text-slate-300/75" />
        <GradePontos className="absolute right-[2%] top-[52%] w-[clamp(30px,3.1vw,44px)] text-slate-300/75" />
      </div>

      <div className="relative z-20 mx-auto flex w-full max-w-[1180px] flex-col items-center px-6 pt-[clamp(92px,12.2vh,138px)] text-center">
        <h1 className="sr-only">ORTUS</h1>
        <img
          src="/landing/ortus-wordmark.png"
          alt="ortus"
          className="w-[clamp(248px,38vw,560px)]"
        />

        <p className="mt-[clamp(14px,2.1vh,28px)] max-w-[720px] font-poppins text-[clamp(15px,1.75vw,26px)] font-medium leading-[1.35] text-ortus-navy">
          Tecnologia, experiência e humanização para
          <br />
          <span className="font-semibold text-ortus-blue">transformar sorrisos e melhorar vidas.</span>
        </p>

        <div className="mt-[clamp(16px,2.4vh,30px)] flex flex-wrap items-center justify-center gap-[clamp(10px,1.15vw,16px)]">
          <a
            href="#funcionalidades"
            className="flex h-[clamp(40px,3.15vw,46px)] items-center gap-2.5 rounded-full bg-ortus-blue
                       px-[clamp(20px,2.15vw,30px)] font-poppins text-[clamp(12px,1.02vw,15px)]
                       font-semibold text-white shadow-[0_10px_24px_-12px_rgba(22,137,254,0.85)]
                       transition-colors hover:bg-ortus-blueDark"
          >
            Conhecer funcionalidades
            <ArrowRight className="h-[1.05em] w-[1.05em]" strokeWidth={2.5} />
          </a>
          <Link
            href="#contato"
            className="flex h-[clamp(40px,3.15vw,46px)] items-center rounded-full border border-ortus-blue
                       bg-white/80 px-[clamp(20px,2.15vw,30px)] font-poppins text-[clamp(12px,1.02vw,15px)]
                       font-semibold text-ortus-blue transition-colors hover:bg-white"
          >
            Falar com especialista
          </Link>
        </div>

        <div className="mt-8 border-l-[3px] border-ortus-blue pl-4 text-left lg:hidden">
          {chamada}
        </div>
      </div>

      <img
        src="/landing/pessoas.png"
        alt="Equipe da clínica"
        className="pointer-events-none absolute left-1/2 z-10 w-[clamp(360px,48vw,680px)]
                   -translate-x-1/2 select-none object-contain
                   bottom-[clamp(88px,12vh,118px)]"
      />

      <div className="absolute right-[clamp(24px,6vw,88px)] top-[58%] z-20 hidden border-l-[3px] border-ortus-blue pl-4 text-left lg:block">
        {chamada}
      </div>

      <div className="absolute inset-x-0 bottom-[clamp(16px,2.4vh,28px)] z-30 px-4">
        <div className="mx-auto flex h-[clamp(56px,5.2vw,72px)] w-full max-w-[980px] items-center overflow-hidden rounded-full bg-white shadow-[0_14px_36px_-18px_rgba(20,60,120,0.38)]">
          <MarcasCarrossel />
        </div>
      </div>
    </section>
  );
}
