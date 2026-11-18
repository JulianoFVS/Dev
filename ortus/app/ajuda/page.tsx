'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { BookOpen, Bug, Headset, Search, Wrench } from 'lucide-react';
import { buscarAssuntos } from './topicos';

const CARDS = [
  { id: 'tutoriais', titulo: 'Tutoriais', href: '/ajuda/tutoriais', Icone: BookOpen },
  { id: 'guia', titulo: 'Guia técnico', href: '/ajuda/guia', Icone: Wrench },
  { id: 'bugs', titulo: 'Reportar bugs ou sugerir funcionalidades', href: null, Icone: Bug },
  { id: 'suporte', titulo: 'Contatar o suporte', href: null, Icone: Headset },
];

export default function AjudaPage() {
  const [busca, setBusca] = useState('');
  const [caixa, setCaixa] = useState<DOMRect | null>(null);
  const campo = useRef<HTMLDivElement>(null);
  const termo = busca.trim();
  const resultados = termo ? buscarAssuntos(termo) : [];

  useEffect(() => {
    if (!termo) return;
    const medir = () => {
      const rect = campo.current?.getBoundingClientRect();
      if (rect) setCaixa(rect);
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [termo]);

  useEffect(() => {
    if (!termo) return;
    const fechar = (event: MouseEvent) => {
      const alvo = event.target as Node;
      if (campo.current?.contains(alvo)) return;
      if ((event.target as HTMLElement).closest?.('[data-busca-ajuda]')) return;
      setBusca('');
    };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [termo]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5 max-lg:pb-20">
      <div className="relative shrink-0">
        <div className="relative flex min-h-[15.5rem] flex-col items-center justify-center overflow-hidden rounded-[1.75rem] bg-[#141816] px-4 pb-16 pt-8 text-center sm:min-h-[16.5rem] sm:rounded-[2rem] sm:px-8 sm:pb-20 sm:pt-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(190,220,90,0.28),transparent_58%)]" />
          <div className="relative">
            <span className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white">FAQ</span>
            <p className="mx-auto mt-3 max-w-xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl">
              Precisando de{' '}
              <span className="inline-block rounded-md bg-white px-1.5 text-neutral-900">ajuda?</span>
            </p>
          </div>
        </div>
        <div className="absolute inset-x-3 -bottom-5 sm:inset-x-10 md:inset-x-16 lg:inset-x-24">
          <div ref={campo} className="relative mx-auto max-w-xl">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar assunto..."
              aria-label="Buscar assunto"
              className="h-10 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 shadow-[0_8px_24px_rgba(0,0,0,0.12)] outline-none placeholder:text-neutral-400 focus:border-neutral-900"
            />
          </div>
        </div>
      </div>

      {termo && caixa && createPortal(
        <div
          data-busca-ajuda=""
          className="overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
          style={{ position: 'fixed', top: caixa.bottom + 6, left: caixa.left, width: caixa.width, maxHeight: 256, zIndex: 80 }}
        >
          {resultados.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-neutral-500">Nada com esse termo. Sugira uma funcionalidade ou fale com o suporte.</p>
          ) : resultados.map((item) => {
            const Icone = item.tipo === 'guia' ? Wrench : BookOpen;
            return (
              <Link
                key={item.id}
                href={item.href}
                className="flex h-10 items-center gap-2.5 px-2.5 text-sm text-neutral-900 hover:bg-neutral-50"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                  <Icone size={14} />
                </span>
                <span className="min-w-0 truncate">{item.titulo}</span>
              </Link>
            );
          })}
        </div>,
        document.body,
      )}

      <div className="mt-8 grid h-[11.75rem] shrink-0 grid-cols-2 grid-rows-2 gap-2.5 lg:h-[5.5rem] lg:grid-cols-4 lg:grid-rows-1">
        {CARDS.map(({ id, titulo, href, Icone }) => {
          const classe = `flex h-full min-h-0 items-center gap-3 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-3 text-left ${href ? 'cursor-pointer hover:border-neutral-300' : 'cursor-default'}`;
          const miolo = (
            <>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                <Icone size={16} />
              </span>
              <span className="min-w-0 text-sm font-semibold text-neutral-900">{titulo}</span>
            </>
          );
          if (href) {
            return (
              <Link key={id} href={href} className={classe}>
                {miolo}
              </Link>
            );
          }
          return (
            <button key={id} type="button" className={classe}>
              {miolo}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <p className="text-center text-sm text-neutral-400">Se o sistema aprontar, a gente dá um jeito.</p>
      </div>
    </div>
  );
}
