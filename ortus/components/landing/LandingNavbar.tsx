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
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white">
      <nav className="mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between px-5 md:h-[72px]">
        <div className="flex items-center gap-8 lg:gap-12">
          <Link href="/" aria-label="ORTUS" className="flex items-center">
            <img
              src="/landing/ortus-wordmark.svg"
              alt="ortus"
              className="h-7 w-auto md:h-8"
            />
          </Link>

          <ul className="hidden items-center gap-7 md:flex">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="font-poppins text-[15px] font-normal text-[#323338] transition-colors hover:text-ortus-blue"
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
            className="hidden font-poppins text-[15px] font-normal text-[#323338] transition-colors hover:text-ortus-blue sm:inline"
          >
            Login
          </Link>
          <Link
            href="/cadastro"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ortus-blue px-5 font-poppins text-[14px] font-semibold text-white transition-colors hover:bg-ortus-blueDark"
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
        <div className="border-t border-slate-100 bg-white px-5 py-3 md:hidden">
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
                className="block rounded-lg px-2 py-3 font-poppins font-medium text-[#323338]"
              >
                Login
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
