'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Bug, ChevronRight, Search, Wrench } from 'lucide-react';
import CartaoSuporte from './CartaoSuporte';
import FormularioRelato from './FormularioRelato';
import { TOPICOS_GUIA, TOPICOS_TUTORIAL, buscarAssuntos } from './topicos';

type Caixa = { top: number; left: number; width: number; maxHeight: number };

/**
 * Onde o campo de busca está na tela, para o menu que abre no body.
 * No computador a casca aplica zoom quando a janela é baixa e, conforme o navegador, a medida
 * vem na escala de dentro do zoom: aí precisa ser convertida (a mesma conta do CustomSelect).
 */
function medirCampo(el: HTMLElement): Caixa {
  const bruto = el.getBoundingClientRect();
  const comZoom = el.closest<HTMLElement>('[style*="zoom"]');
  const zoom = comZoom ? Number(getComputedStyle(comZoom).zoom) || 1 : 1;
  const semEscala = comZoom !== null && zoom !== 1 && comZoom.getBoundingClientRect().width > window.innerWidth * 1.05;
  const escala = semEscala ? zoom : 1;
  const top = bruto.bottom * escala + 6;
  // Com o teclado do celular aberto, a área visível termina antes do fim da janela.
  const visivel = window.visualViewport;
  const fim = visivel ? visivel.offsetTop + visivel.height : window.innerHeight;
  return {
    top,
    left: bruto.left * escala,
    width: bruto.width * escala,
    maxHeight: Math.max(132, Math.min(272, fim - top - 8)),
  };
}

function resumoTutoriais() {
  const total = TOPICOS_TUTORIAL.length;
  if (total === 0) return 'Os vídeos ainda não foram gravados';
  return total === 1 ? '1 vídeo' : `${total} vídeos`;
}

const cartao = 'flex min-h-[4.5rem] w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-left hover:border-neutral-300 md:min-h-[5.5rem]';

function MioloCartao({ Icone, titulo, descricao }: { Icone: typeof BookOpen; titulo: string; descricao: string }) {
  return (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
        <Icone size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-neutral-900">{titulo}</span>
        <span className="mt-0.5 block text-xs text-neutral-500">{descricao}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-neutral-300 md:hidden" />
    </>
  );
}

export default function AjudaPage() {
  const router = useRouter();
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState(false);
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const [relatoAberto, setRelatoAberto] = useState(false);
  const campo = useRef<HTMLDivElement>(null);
  const termo = busca.trim();
  const mostrar = aberta && termo.length > 0;
  const resultados = mostrar ? buscarAssuntos(termo) : [];

  // Mede na hora de abrir: o menu já nasce no lugar certo, mesmo que a página tenha rolado desde a última vez.
  function abrir() {
    if (campo.current) setCaixa(medirCampo(campo.current));
    setAberta(true);
  }

  useEffect(() => {
    if (!mostrar) return;
    const medir = () => {
      if (!campo.current) return;
      const nova = medirCampo(campo.current);
      setCaixa((atual) => (
        atual && atual.top === nova.top && atual.left === nova.left && atual.width === nova.width && atual.maxHeight === nova.maxHeight
          ? atual
          : nova
      ));
    };
    medir();
    const visivel = window.visualViewport;
    window.addEventListener('resize', medir);
    // No celular a página rola inteira: o menu acompanha o campo.
    window.addEventListener('scroll', medir, true);
    visivel?.addEventListener('resize', medir);
    visivel?.addEventListener('scroll', medir);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
      visivel?.removeEventListener('resize', medir);
      visivel?.removeEventListener('scroll', medir);
    };
  }, [mostrar]);

  useEffect(() => {
    if (!mostrar) return;
    const fechar = (event: MouseEvent) => {
      const alvo = event.target;
      if (!(alvo instanceof Element)) return;
      if (campo.current?.contains(alvo) || alvo.closest('[data-busca-ajuda]')) return;
      setAberta(false);
    };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [mostrar]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="relative shrink-0">
        <div className="relative flex min-h-[11rem] flex-col items-center justify-center overflow-hidden rounded-[1.75rem] bg-[#141816] px-4 pb-14 pt-7 text-center sm:min-h-[16.5rem] sm:rounded-[2rem] sm:px-8 sm:pb-20 sm:pt-10">
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
              onChange={(event) => {
                setBusca(event.target.value);
                abrir();
              }}
              onFocus={abrir}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setAberta(false);
                if (event.key === 'Enter' && resultados[0]) router.push(resultados[0].href);
              }}
              placeholder="Buscar assunto..."
              aria-label="Buscar assunto"
              autoComplete="off"
              enterKeyHint="search"
              className="h-11 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 shadow-[0_8px_24px_rgba(0,0,0,0.12)] outline-none placeholder:text-neutral-400 focus:border-neutral-900 sm:h-10"
            />
          </div>
        </div>
      </div>

      {mostrar && caixa && createPortal(
        <div
          data-busca-ajuda=""
          className="overflow-y-auto overscroll-contain rounded-md border border-neutral-200 bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
          style={{ position: 'fixed', top: caixa.top, left: caixa.left, width: caixa.width, maxHeight: caixa.maxHeight, zIndex: 120 }}
        >
          {resultados.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-neutral-500">Nada com esse termo. Sugira uma funcionalidade ou fale com o suporte.</p>
          ) : resultados.map((item) => {
            const Icone = item.tipo === 'guia' ? Wrench : BookOpen;
            return (
              <Link
                key={item.id}
                href={item.href}
                className="flex min-h-[44px] items-center gap-2.5 px-2.5 py-1.5 text-sm text-neutral-900 hover:bg-neutral-50"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700">
                  <Icone size={14} />
                </span>
                <span className="min-w-0 flex-1 leading-snug">{item.titulo}</span>
                <span className="shrink-0 text-xs text-neutral-400">{item.tipo === 'guia' ? 'Guia' : 'Tutorial'}</span>
              </Link>
            );
          })}
        </div>,
        document.body,
      )}

      <div className="mt-8 grid shrink-0 grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)]">
        <Link href="/ajuda/tutoriais" className={cartao}>
          <MioloCartao Icone={BookOpen} titulo="Tutoriais" descricao={resumoTutoriais()} />
        </Link>
        <Link href="/ajuda/guia" className={cartao}>
          <MioloCartao Icone={Wrench} titulo="Guia técnico" descricao={`${TOPICOS_GUIA.length} assuntos, passo a passo`} />
        </Link>
        <button type="button" onClick={() => setRelatoAberto(true)} className={cartao}>
          <MioloCartao Icone={Bug} titulo="Reportar bugs ou sugerir funcionalidades" descricao="O relato vai para a fila do suporte" />
        </button>
      </div>

      <CartaoSuporte className="mt-2.5 shrink-0" />

      <div className="flex min-h-[4rem] flex-1 items-center justify-center px-6 py-3">
        <p className="text-center text-sm text-neutral-400">Se o sistema aprontar, a gente dá um jeito.</p>
      </div>

      <FormularioRelato aberto={relatoAberto} onFechar={() => setRelatoAberto(false)} />
    </div>
  );
}
