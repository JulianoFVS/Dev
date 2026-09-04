'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

const LINKS = [
  { rotulo: 'Funcionalidades', href: '#funcionalidades' },
  { rotulo: 'Preços', href: '#precos' },
  { rotulo: 'Contato', href: '#contato' },
];

export default function LandingNavbar() {
  const [aberto, setAberto] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-3 sm:pt-4">
      <nav
        className="relative mx-auto flex h-[clamp(56px,4.6vw,64px)] w-full max-w-[1010px] items-center
                   justify-between rounded-full bg-white pl-[6px] pr-[6px]
                   shadow-[0_12px_34px_-16px_rgba(20,60,120,0.35)]"
      >
        <Link href="/" aria-label="ORTUS" className="flex h-full items-center">
          <span className="flex aspect-square h-[78%] items-center justify-center overflow-hidden rounded-full bg-ortus-blue">
            <img src="/landing/ortus-mark.png" alt="" className="h-[72%] w-[72%] object-contain" />
          </span>
        </Link>

        {/* Os links ficam centralizados na pílula, independentes das laterais. */}
        <ul className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-[clamp(20px,3.4vw,46px)] md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="font-poppins text-[clamp(13px,1.05vw,15px)] font-medium text-ortus-navy
                           transition-colors hover:text-ortus-blue"
              >
                {link.rotulo}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex h-full items-center gap-1">
          <Link
            href="/login"
            className="flex h-[74%] items-center rounded-full bg-ortus-blue px-[clamp(20px,2.6vw,34px)]
                       font-poppins text-[clamp(13px,1.05vw,15px)] font-semibold text-white
                       transition-colors hover:bg-ortus-blueDark"
          >
            Entrar
          </Link>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={aberto}
            className="flex h-10 w-10 items-center justify-center rounded-full text-ortus-navy md:hidden"
          >
            {aberto ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {aberto && (
        <div className="mx-auto mt-2 w-full max-w-[1010px] rounded-3xl bg-white p-4 shadow-[0_12px_34px_-16px_rgba(20,60,120,0.35)] md:hidden">
          <ul className="flex flex-col">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setAberto(false)}
                  className="block rounded-xl px-4 py-3 font-poppins font-medium text-ortus-navy hover:bg-ortus-mist"
                >
                  {link.rotulo}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
