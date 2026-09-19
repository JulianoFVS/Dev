'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import MarcasCarrossel from './MarcasCarrossel';
import LandingDashboardPreview from './LandingDashboardPreview';

export default function HeroOrtus() {
  return (
    <section className="overflow-x-hidden bg-white pb-8 pt-8 md:pb-16 md:pt-16">
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

      <div className="relative mt-8 md:mt-16">
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-0 hidden w-screen -translate-x-1/2 -translate-y-1/2 md:block">
          <MarcasCarrossel denso />
        </div>

        <div className="group/preview relative z-10 mx-auto w-full max-w-[1080px] px-4 md:px-6">
          <div className="landing-preview-viewport">
            <div className="landing-preview-scaler">
              <LandingDashboardPreview />
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 w-screen -translate-x-1/2 md:hidden">
          <MarcasCarrossel denso />
        </div>
      </div>
    </section>
  );
}
