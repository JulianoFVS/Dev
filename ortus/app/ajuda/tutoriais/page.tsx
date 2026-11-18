'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronRight, Search } from 'lucide-react';
import { BarraAjuda } from '../BarraAjuda';
import { TOPICOS_TUTORIAL, normalizar } from '../topicos';

function Tutoriais() {
  const params = useSearchParams();
  const pedido = params.get('topico');
  const [busca, setBusca] = useState('');
  const [ativo, setAtivo] = useState(() => (
    pedido && TOPICOS_TUTORIAL.some((item) => item.id === pedido) ? pedido : TOPICOS_TUTORIAL[0].id
  ));
  const termo = normalizar(busca.trim());

  useEffect(() => {
    if (pedido && TOPICOS_TUTORIAL.some((item) => item.id === pedido)) setAtivo(pedido);
  }, [pedido]);

  const visiveis = useMemo(() => {
    if (!termo) return TOPICOS_TUTORIAL;
    return TOPICOS_TUTORIAL.filter((item) => normalizar(`${item.grupo} ${item.titulo}`).includes(termo));
  }, [termo]);

  const video = visiveis.find((item) => item.id === ativo) ?? visiveis[0] ?? null;
  const grupos = [...new Set(visiveis.map((item) => item.grupo))];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5 max-lg:pb-20">
      <BarraAjuda titulo="Tutoriais" />

      <div className="mt-2.5 grid min-h-0 flex-1 grid-cols-1 gap-2.5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="flex max-h-44 min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white lg:max-h-none">
          <div className="shrink-0 p-2.5">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="O que você procura"
                aria-label="O que você procura"
                className="h-10 w-full rounded-md border border-neutral-200 bg-white pl-8 pr-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
              />
            </div>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
            {grupos.length === 0 ? (
              <p className="px-2 py-3 text-sm text-neutral-400">Nada encontrado.</p>
            ) : grupos.map((grupo) => (
              <div key={grupo} className="mb-2">
                <p className="px-2 pb-1 text-[11px] font-medium text-neutral-400">{grupo}</p>
                {visiveis.filter((item) => item.grupo === grupo).map((item) => {
                  const ligado = video?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setAtivo(item.id)}
                      className={`flex h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm ${ligado ? 'bg-neutral-100 font-medium text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50'}`}
                    >
                      <span className="min-w-0 truncate">{item.titulo}</span>
                      <ChevronRight size={14} className="shrink-0 text-neutral-400" />
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        <article className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
          {video ? (
            <div className="flex min-h-0 w-full flex-1 items-center justify-center" style={{ containerType: 'size' }}>
              <div className="overflow-hidden rounded-xl bg-neutral-950" style={{ width: 'min(100cqw, calc(100cqh * 16 / 9))', aspectRatio: '16 / 9' }}>
                <iframe
                  key={video.videoId}
                  title={video.titulo}
                  src={`https://www.youtube-nocookie.com/embed/${video.videoId}?rel=0`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-neutral-400">Nenhum vídeo com esse termo.</p>
          )}
        </article>
      </div>
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
