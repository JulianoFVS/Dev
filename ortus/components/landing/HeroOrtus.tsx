'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import MarcasCarrossel from './MarcasCarrossel';
import LandingDashboardPreview from './LandingDashboardPreview';

export default function HeroOrtus() {
  return (
    <section className="overflow-x-hidden bg-white pb-8 pt-8 md:pb-16 md:pt-16">
      {/* ── texto hero ── */}
      <div className="mx-auto flex max-w-[820px] flex-col items-center px-5 text-center">
        <span className="ortus-logo-idle mb-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f3f4f1] md:mb-7 md:h-16 md:w-16 md:rounded-3xl">
          <img src="/landing/ortus-mark.svg" alt="ortus" className="h-7 w-7 object-contain brightness-0 md:h-10 md:w-10" />
        </span>

        <h1 className="font-poppins text-[28px] font-extrabold leading-[1.12] tracking-[-0.03em] text-neutral-900 md:text-[clamp(32px,5.4vw,64px)] md:leading-[1.08]">
          Gestão inteligente
          <br />
          para <span className="ortus-shine">odontologia</span>
        </h1>

        <p className="mt-3 max-w-[560px] font-poppins text-[13px] font-normal leading-snug text-neutral-500 md:mt-5 md:text-[clamp(16px,1.7vw,20px)] md:leading-relaxed">
          Tecnologia, experiência e humanização para transformar sorrisos e melhorar vidas.
        </p>

        <Link
          href="/cadastro"
          className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-900 px-4 font-poppins text-[13px] font-semibold text-white transition-colors hover:bg-neutral-800 md:mt-8 md:h-12 md:px-7 md:text-[16px]"
        >
          Comece já
          <ArrowRight className="h-[1.05em] w-[1.05em]" strokeWidth={2.4} />
        </Link>
      </div>

      {/* ── preview block ── */}
      <div className="relative mt-8 md:mt-14">
        {/* carrossel de marcas ao fundo (desktop) */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 hidden w-screen -translate-x-1/2 -translate-y-1/2 md:block">
          <MarcasCarrossel denso />
        </div>

        {/* frame principal — moldura tipo browser */}
        <div className="group/preview relative z-10 mx-auto w-full max-w-[980px] px-4 md:px-5">
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_20px_60px_-12px_rgba(0,0,0,0.20),0_0_0_1px_rgba(0,0,0,0.04)] transition-shadow duration-500 group-hover/preview:shadow-[0_32px_80px_-12px_rgba(0,0,0,0.28)] md:rounded-2xl">

            {/* ── barra de chrome (janela de browser) ── */}
            <div className="flex items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 md:py-3">
              {/* botões macOS */}
              <div className="flex shrink-0 gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
                <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
                <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              </div>
              {/* URL bar */}
              <div className="mx-auto max-w-[200px] flex-1 rounded-md border border-neutral-200 bg-white px-3 py-1 text-center text-[11px] leading-none text-neutral-400 md:max-w-xs md:py-1.5 md:text-xs">
                app.ortus.com.br/dashboard
              </div>
              {/* espaçador simétrico */}
              <div className="w-[3.75rem] shrink-0" />
            </div>

            {/* ── viewport do dashboard ── */}
            {/*
             * h-[220px] mobile  → scale 0.28 → mostra 220/0.28 ≈ 786 px do preview
             * h-[500px] desktop → scale 0.72 → mostra 500/0.72 ≈ 694 px do preview
             * O preview tem 1280 px de largura fixo; o scale encaixa no container.
             */}
            <div className="relative h-[220px] overflow-hidden md:h-[500px]">
              <div className="lp-scaler">
                <LandingDashboardPreview />
              </div>
            </div>

          </div>
        </div>

        {/* carrossel de marcas (mobile) */}
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 w-screen -translate-x-1/2 md:hidden">
          <MarcasCarrossel denso />
        </div>
      </div>
    </section>
  );
}
