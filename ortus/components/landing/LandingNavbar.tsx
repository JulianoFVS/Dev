'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';

const LINKS = [
  { rotulo: 'Soluções', href: '#funcionalidades' },
  { rotulo: 'Preços', href: '#precos' },
  { rotulo: 'Contato', href: '#contato' },
];

export default function LandingNavbar() {
  const [aberto, setAberto] = useState(false);

  return (
    <header className="fixed left-1/2 top-4 z-50 w-[min(1120px,calc(100%-1.5rem))] -translate-x-1/2">
      <nav className="flex h-14 items-center justify-between rounded-full border border-black/5 bg-white/70 px-4 shadow-[0_10px_40px_rgba(26,34,25,0.12)] backdrop-blur-md md:h-16 md:px-6">
        <div className="flex items-center gap-8 lg:gap-12">
          <Link href="/" aria-label="ORTUS" className="flex items-center">
            <img
              src="/landing/ortus-wordmark.svg"
              alt="ortus"
              className="h-7 w-auto brightness-0 md:h-8"
            />
          </Link>

          <ul className="hidden items-center gap-7 md:flex">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="font-poppins text-[15px] font-normal text-neutral-800 transition-colors hover:text-neutral-950"
                >
                  {link.rotulo}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="font-poppins text-[15px] font-normal text-neutral-800 transition-colors hover:text-neutral-950"
          >
            Login
          </Link>
          <Link
            href="/cadastro"
            className="hidden h-10 items-center gap-1.5 rounded-full bg-neutral-900 px-5 font-poppins text-[14px] font-semibold text-white transition-colors hover:bg-neutral-800 md:inline-flex"
          >
            Cadastre-se
            <ArrowRight className="h-4 w-4" strokeWidth={2.4} />
          </Link>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={aberto}
            className="flex h-10 w-10 items-center justify-center text-[#323338] md:hidden"
          >
            {aberto ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {aberto && (
        <div className="mt-2 rounded-[1.5rem] border border-black/5 bg-white/75 px-4 py-2 shadow-[0_10px_40px_rgba(26,34,25,0.12)] backdrop-blur-md md:hidden">
          <ul className="flex flex-col">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setAberto(false)}
                  className="block rounded-lg px-2 py-3 font-poppins font-medium text-[#323338]"
                >
                  {link.rotulo}
                </a>
              </li>
            ))}
            <li>
              <Link
                href="/login"
                onClick={() => setAberto(false)}
                className="block rounded-lg px-2 py-3 font-poppins font-normal text-[#323338]"
              >
                Login
              </Link>
            </li>
            <li>
              <Link
                href="/cadastro"
                onClick={() => setAberto(false)}
                className="block rounded-lg px-2 py-3 font-poppins font-normal text-[#323338]"
              >
                Cadastre-se
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
