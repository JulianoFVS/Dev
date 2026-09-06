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
        className="relative mx-auto flex h-[52px] w-full max-w-[960px] items-center
                   justify-between rounded-full border border-white/80 bg-white/95 px-1.5"
      >
        <Link href="/" aria-label="ORTUS" className="flex h-full items-center pl-1">
          <img
            src="/landing/ortus-mark.svg"
            alt=""
            className="h-7 w-7 object-contain"
          />
        </Link>

        <ul className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-10 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="font-poppins text-[14px] font-medium text-ortus-navy
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
            className="flex h-8 items-center rounded-full bg-ortus-blue px-5
                       font-poppins text-[13px] font-semibold text-white
                       transition-colors hover:bg-ortus-blueDark"
          >
            Entrar
          </Link>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={aberto}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ortus-navy md:hidden"
          >
            {aberto ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {aberto && (
        <div className="mx-auto mt-2 w-full max-w-[960px] rounded-3xl border border-white/80 bg-white/95 p-3 md:hidden">
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
