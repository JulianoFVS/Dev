'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronRight, Search, Video, Wrench } from 'lucide-react';
import { BarraAjuda } from '../BarraAjuda';
import { TOPICOS_GUIA, TOPICOS_TUTORIAL, buscarTutoriais } from '../topicos';

function existe(id: string | null): id is string {
  return !!id && TOPICOS_TUTORIAL.some((item) => item.id === id);
}

/** Enquanto não há vídeo gravado, a tela só explica isso e leva ao guia (no mesmo assunto, se o link trouxe um). */
function SemVideos({ pedido }: { pedido: string | null }) {
  const noGuia = pedido ? TOPICOS_GUIA.find((item) => item.id === pedido) : undefined;
  return (
    <div className="mt-2.5 flex flex-1 flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white px-5 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-md bg-neutral-100 text-neutral-500">
        <Video size={20} />
      </span>
      <h1 className="mt-4 text-base font-semibold text-neutral-900">Os vídeos ainda não foram gravados.</h1>
      <p className="mt-1 max-w-sm text-sm text-neutral-500">Enquanto isso, use o Guia técnico.</p>
      <Link
        href={noGuia ? `/ajuda/guia?topico=${noGuia.id}` : '/ajuda/guia'}
        className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        <Wrench size={16} className="shrink-0" />
        {noGuia ? `Ler “${noGuia.titulo}” no Guia técnico` : 'Abrir o Guia técnico'}
      </Link>
    </div>
  );
}

function Tutoriais() {
  const params = useSearchParams();
  const pedido = params.get('topico');
  const [busca, setBusca] = useState('');
  const [ativo, setAtivo] = useState<string | null>(() => (existe(pedido) ? pedido : TOPICOS_TUTORIAL[0]?.id ?? null));

  useEffect(() => {
    if (existe(pedido)) setAtivo(pedido);
  }, [pedido]);

  const visiveis = useMemo(() => buscarTutoriais(busca), [busca]);
  const video = TOPICOS_TUTORIAL.find((item) => item.id === ativo) ?? TOPICOS_TUTORIAL[0] ?? null;
  const grupos = [...new Set(visiveis.map((item) => item.grupo))];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5 lg:overflow-hidden">
      <BarraAjuda titulo="Tutoriais" />

      {!video ? (
        <SemVideos pedido={pedido} />
      ) : (
        <div className="mt-2.5 grid shrink-0 grid-cols-1 gap-2.5 lg:min-h-0 lg:flex-1 lg:shrink lg:grid-cols-[16rem_minmax(0,1fr)]">
          {/* Celular: o vídeo vem primeiro e a lista segue abaixo, na rolagem da página. */}
          <article className="flex min-h-0 flex-col rounded-xl border border-neutral-200 bg-white p-3 sm:p-4 lg:order-2 lg:overflow-hidden">
            <div className="flex w-full items-center justify-center lg:min-h-0 lg:flex-1 lg:[container-type:size]">
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-neutral-950 lg:w-[min(100cqw,calc(100cqh*16/9))]">
                <iframe
                  key={video.videoId}
                  title={video.titulo}
                  src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.videoId)}?rel=0`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
            <h1 className="mt-3 shrink-0 text-base font-semibold text-neutral-900">{video.titulo}</h1>
          </article>

          <aside className="flex min-h-0 flex-col rounded-xl border border-neutral-200 bg-white lg:order-1 lg:overflow-hidden">
            <div className="shrink-0 p-2.5">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="O que você procura"
                  aria-label="O que você procura"
                  autoComplete="off"
                  className="h-10 w-full rounded-md border border-neutral-200 bg-white pl-8 pr-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
                />
              </div>
            </div>
            <nav aria-label="Vídeos" className="px-1.5 pb-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {grupos.length === 0 ? (
                <p className="px-2 py-3 text-sm text-neutral-400">Nenhum vídeo com esse termo.</p>
              ) : grupos.map((grupo) => (
                <div key={grupo} className="mb-2">
                  <p className="px-2 pb-1 text-[11px] font-medium text-neutral-400">{grupo}</p>
                  {visiveis.filter((item) => item.grupo === grupo).map((item) => {
                    const ligado = video.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setAtivo(item.id)}
                        aria-current={ligado ? 'true' : undefined}
                        className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm leading-snug lg:min-h-[2.25rem] lg:py-1.5 ${ligado ? 'bg-neutral-100 font-medium text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50'}`}
                      >
                        <span className="min-w-0">{item.titulo}</span>
                        <ChevronRight size={14} className="shrink-0 text-neutral-400" />
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function TutoriaisPage() {
  return (
    <Suspense fallback={null}>
      <Tutoriais />
    </Suspense>
  );
}
