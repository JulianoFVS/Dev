'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronDown, ChevronRight, List, MapPin, Search, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { BarraAjuda } from '../BarraAjuda';
import { TOPICOS_GUIA, buscarNoGuia, type BlocoGuia, type TopicoGuia } from '../topicos';

function existe(id: string | null): id is string {
  return !!id && TOPICOS_GUIA.some((item) => item.id === id);
}

/** Troca **trecho** por negrito. O texto vem de topicos.ts, nunca de quem usa o sistema. */
function Marcado({ texto }: { texto: string }) {
  return (
    <>
      {texto.split('**').map((parte, indice) => (
        indice % 2 === 1
          ? <strong key={indice} className="font-medium text-neutral-900">{parte}</strong>
          : parte
      ))}
    </>
  );
}

function Bloco({ bloco }: { bloco: BlocoGuia }) {
  if (bloco.tipo === 'passos') {
    return (
      <ol className="mt-3 space-y-2.5">
        {bloco.itens.map((item, indice) => (
          <li key={indice} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-medium text-white">
              {indice + 1}
            </span>
            <span className="min-w-0 flex-1"><Marcado texto={item} /></span>
          </li>
        ))}
      </ol>
    );
  }
  if (bloco.tipo === 'lista') {
    return (
      <ul className="mt-3 space-y-2">
        {bloco.itens.map((item, indice) => (
          <li key={indice} className="flex gap-3">
            <span aria-hidden className="mt-3 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
            <span className="min-w-0 flex-1"><Marcado texto={item} /></span>
          </li>
        ))}
      </ul>
    );
  }
  if (bloco.tipo === 'aviso') {
    return (
      <p className="mt-3 flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-950">
        <AlertTriangle size={16} aria-hidden className="mt-1.5 shrink-0 text-amber-600" />
        <span className="min-w-0 flex-1"><Marcado texto={bloco.texto} /></span>
      </p>
    );
  }
  return <p className="mt-3"><Marcado texto={bloco.texto} /></p>;
}

type IndiceProps = {
  busca: string;
  onBusca: (valor: string) => void;
  visiveis: TopicoGuia[];
  ativoId: string;
  onEscolher: (id: string) => void;
  /** Na gaveta do celular as linhas têm altura de toque. */
  toque?: boolean;
};

function Indice({ busca, onBusca, visiveis, ativoId, onEscolher, toque = false }: IndiceProps) {
  const grupos = [...new Set(visiveis.map((item) => item.grupo))];
  return (
    <>
      <div className="shrink-0 p-2.5">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={busca}
            onChange={(event) => onBusca(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && visiveis[0]) onEscolher(visiveis[0].id);
            }}
            placeholder="O que você procura"
            aria-label="O que você procura"
            autoComplete="off"
            enterKeyHint="search"
            className="h-10 w-full rounded-md border border-neutral-200 bg-white pl-8 pr-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
          />
        </div>
      </div>
      <nav aria-label="Assuntos do guia" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2">
        {grupos.length === 0 ? (
          <p className="px-2 py-3 text-sm text-neutral-400">Nada encontrado.</p>
        ) : grupos.map((grupo) => (
          <div key={grupo} className="mb-2">
            <p className="px-2 pb-1 text-[11px] font-medium text-neutral-400">{grupo}</p>
            {visiveis.filter((item) => item.grupo === grupo).map((item) => {
              const ligado = ativoId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onEscolher(item.id)}
                  aria-current={ligado ? 'true' : undefined}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm leading-snug ${toque ? 'min-h-[44px] py-2' : 'min-h-[2.25rem] py-1.5'} ${ligado ? 'bg-neutral-100 font-medium text-neutral-900' : 'text-neutral-600 hover:bg-neutral-50'}`}
                >
                  <span className="min-w-0">{item.titulo}</span>
                  <ChevronRight size={14} className="shrink-0 text-neutral-400" />
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </>
  );
}

function GuiaTecnico() {
  const params = useSearchParams();
  const pedido = params.get('topico');
  const [busca, setBusca] = useState('');
  const [ativo, setAtivo] = useState(() => (existe(pedido) ? pedido : TOPICOS_GUIA[0].id));
  const [indiceAberto, setIndiceAberto] = useState(false);
  const pagina = useRef<HTMLDivElement>(null);
  const artigo = useRef<HTMLElement>(null);

  useEffect(() => {
    if (existe(pedido)) setAtivo(pedido);
  }, [pedido]);

  const visiveis = useMemo(() => buscarNoGuia(busca), [busca]);
  const posicao = Math.max(0, TOPICOS_GUIA.findIndex((item) => item.id === ativo));
  const doc = TOPICOS_GUIA[posicao];
  const anterior = posicao > 0 ? TOPICOS_GUIA[posicao - 1] : null;
  const proximo = posicao < TOPICOS_GUIA.length - 1 ? TOPICOS_GUIA[posicao + 1] : null;
  const relacionados = TOPICOS_GUIA.filter((item) => doc.relacionados?.includes(item.id));

  function escolher(id: string) {
    setAtivo(id);
    setIndiceAberto(false);
    // No computador quem rola é o artigo; no celular, a página inteira.
    artigo.current?.scrollTo({ top: 0 });
    pagina.current?.scrollTo({ top: 0 });
  }

  function irParaSecao(indice: number) {
    document.getElementById(`guia-secao-${indice}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const passo = 'flex min-h-[52px] items-center gap-3 rounded-md border border-neutral-200 bg-white px-3 py-2 hover:bg-neutral-50';

  return (
    <div ref={pagina} className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5 lg:overflow-hidden">
      <BarraAjuda titulo="Guia técnico" />

      {/* Celular: o índice fica numa gaveta. Uma lista de assuntos em cima do texto empurrava o artigo para fora da tela. */}
      <button
        type="button"
        onClick={() => setIndiceAberto(true)}
        className="mt-2.5 flex min-h-[52px] w-full shrink-0 items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left lg:hidden"
      >
        <List size={18} className="shrink-0 text-neutral-500" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-neutral-400">Assunto {posicao + 1} de {TOPICOS_GUIA.length}</span>
          <span className="block text-sm font-medium leading-snug text-neutral-900">{doc.titulo}</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-neutral-500">Índice</span>
        <ChevronDown size={16} className="shrink-0 text-neutral-400" />
      </button>

      <div className="mt-2.5 grid shrink-0 grid-cols-1 gap-2.5 lg:min-h-0 lg:flex-1 lg:shrink lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white lg:flex">
          <Indice busca={busca} onBusca={setBusca} visiveis={visiveis} ativoId={doc.id} onEscolher={escolher} />
        </aside>

        <article ref={artigo} className="min-h-0 rounded-xl border border-neutral-200 bg-white px-4 py-5 sm:px-6 lg:overflow-y-auto lg:overscroll-contain">
          <div className="max-w-[42rem] text-[15px] leading-7 text-neutral-700">
            <p className="text-xs font-medium text-neutral-400">{doc.grupo}</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem] md:leading-tight">{doc.titulo}</h1>
            <p className="mt-2 text-base leading-7 text-neutral-600">{doc.resumo}</p>

            {doc.onde && (
              <p className="mt-3 flex gap-2.5 rounded-md bg-neutral-50 px-3 py-2.5">
                <MapPin size={16} aria-hidden className="mt-1.5 shrink-0 text-neutral-400" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-neutral-900">Onde fica: </span>
                  <Marcado texto={doc.onde} />
                </span>
              </p>
            )}

            {doc.secoes.length > 2 && (
              // Atalho para as seções. No celular é uma fila que desliza de lado, para não empurrar o texto; no computador quebra em linhas.
              <nav
                aria-label="Seções deste assunto"
                className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
              >
                {doc.secoes.map((secao, indice) => (
                  <button
                    key={secao.titulo}
                    type="button"
                    onClick={() => irParaSecao(indice)}
                    className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 lg:h-8 lg:text-xs"
                  >
                    {secao.titulo}
                  </button>
                ))}
              </nav>
            )}

            {doc.secoes.map((secao, indiceSecao) => (
              <section key={secao.titulo} id={`guia-secao-${indiceSecao}`} className="mt-6 scroll-mt-3">
                <h2 className="text-base font-semibold text-neutral-900">{secao.titulo}</h2>
                {secao.blocos.map((bloco, indice) => <Bloco key={indice} bloco={bloco} />)}
              </section>
            ))}

            {relacionados.length > 0 && (
              <section className="mt-6 border-t border-neutral-200 pt-4">
                <h2 className="text-base font-semibold text-neutral-900">Veja também</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {relacionados.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => escolher(item.id)}
                      className="inline-flex min-h-[44px] items-center rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-left text-sm font-medium leading-snug text-neutral-800 hover:bg-neutral-50 lg:min-h-[2.25rem]"
                    >
                      {item.titulo}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <nav aria-label="Assunto anterior e próximo" className="mt-6 grid grid-cols-1 gap-2 border-t border-neutral-200 pt-4 sm:grid-cols-2">
              {anterior ? (
                <button type="button" onClick={() => escolher(anterior.id)} className={`${passo} text-left`}>
                  <ArrowLeft size={16} className="shrink-0 text-neutral-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium leading-4 text-neutral-400">Anterior</span>
                    <span className="block text-sm font-medium leading-snug text-neutral-900">{anterior.titulo}</span>
                  </span>
                </button>
              ) : <span className="hidden sm:block" />}
              {proximo && (
                <button type="button" onClick={() => escolher(proximo.id)} className={`${passo} text-right`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium leading-4 text-neutral-400">Próximo</span>
                    <span className="block text-sm font-medium leading-snug text-neutral-900">{proximo.titulo}</span>
                  </span>
                  <ArrowRight size={16} className="shrink-0 text-neutral-400" />
                </button>
              )}
            </nav>
          </div>
        </article>
      </div>

      <Modal
        open={indiceAberto}
        onClose={() => setIndiceAberto(false)}
        maxWidth="md"
        hideCloseButton
        className="lg:hidden"
        panelClassName="flex h-[85dvh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/5 py-1.5 pl-4 pr-1.5">
          <h2 className="text-base font-semibold text-neutral-900">Assuntos</h2>
          <button
            type="button"
            onClick={() => setIndiceAberto(false)}
            aria-label="Fechar"
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>
        <Indice busca={busca} onBusca={setBusca} visiveis={visiveis} ativoId={doc.id} onEscolher={escolher} toque />
      </Modal>
    </div>
  );
}

export default function GuiaTecnicoPage() {
  return (
    <Suspense fallback={null}>
      <GuiaTecnico />
    </Suspense>
  );
}
