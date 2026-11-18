'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Bug,
  ChevronDown,
  Inbox,
  Lightbulb,
  Loader2,
  Mail,
  MailCheck,
  MailWarning,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Aviso from '@/components/ui/Aviso';
import MenuPontos from '@/components/ui/MenuPontos';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { formatarDataHora, mensagemDeErro, pluralizar } from '@/lib/saas';
import {
  ROTULO_STATUS_RELATO,
  ROTULO_TIPO_RELATO,
  type RelatoSuporte,
  type StatusRelato,
  type TipoRelato,
} from '@/lib/relatos';
import { ChipSuave } from './StatusChips';
import { ErroInline, EstadoVazio, SkeletonBloco } from './Feedback';

type FiltroStatus = 'todos' | StatusRelato;
type FiltroTipo = 'todos' | TipoRelato;

type Props = {
  className?: string;
};

const COLUNAS =
  'id, criado_em, tipo, assunto, descricao, autor_user_id, autor_profissional_id, autor_nome, clinica_id, clinica_nome, status, atualizado_em, email_enviado_em, email_erro';
const PAGINA = 50;

const FILTROS_STATUS: { id: FiltroStatus; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'aberto', label: 'Abertos' },
  { id: 'em_analise', label: 'Em análise' },
  { id: 'resolvido', label: 'Resolvidos' },
  { id: 'descartado', label: 'Descartados' },
];

const FILTROS_TIPO: { value: FiltroTipo; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'bug', label: 'Bugs' },
  { value: 'sugestao', label: 'Sugestões' },
];

const STATUS_META: Record<StatusRelato, { chip: string; ponto: string }> = {
  aberto: { chip: 'border-amber-200 bg-amber-50 text-amber-700', ponto: 'bg-amber-500' },
  em_analise: { chip: 'border-sky-200 bg-sky-50 text-sky-700', ponto: 'bg-sky-500' },
  resolvido: { chip: 'border-emerald-200 bg-emerald-50 text-emerald-700', ponto: 'bg-emerald-500' },
  descartado: { chip: 'border-neutral-200 bg-neutral-100 text-neutral-500', ponto: 'bg-neutral-400' },
};

/** Para onde o relato pode ir a partir de cada status. O primeiro é o passo natural da fila. */
const PROXIMOS: Record<StatusRelato, StatusRelato[]> = {
  aberto: ['em_analise', 'resolvido', 'descartado'],
  em_analise: ['resolvido', 'aberto', 'descartado'],
  resolvido: ['aberto', 'em_analise', 'descartado'],
  descartado: ['aberto', 'em_analise', 'resolvido'],
};

const ROTULO_ACAO: Record<StatusRelato, string> = {
  aberto: 'Reabrir',
  em_analise: 'Analisar',
  resolvido: 'Resolver',
  descartado: 'Descartar',
};

const AVISO_STATUS: Record<StatusRelato, string> = {
  aberto: 'Relato reaberto.',
  em_analise: 'Relato em análise.',
  resolvido: 'Relato resolvido.',
  descartado: 'Relato descartado.',
};

const BOTAO_CELULAR =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 text-center text-[13px] font-medium leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const ESCURO = 'bg-neutral-900 text-white hover:bg-neutral-800';
const CONTORNO = 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50';

function combina(relato: Pick<RelatoSuporte, 'status' | 'tipo'>, status: FiltroStatus, tipo: FiltroTipo) {
  return (status === 'todos' || relato.status === status) && (tipo === 'todos' || relato.tipo === tipo);
}

function juntar(atual: RelatoSuporte[], novos: RelatoSuporte[]) {
  const vistos = new Set(atual.map((relato) => relato.id));
  return [...atual, ...novos.filter((relato) => !vistos.has(relato.id))];
}

function erroDeLeitura(falha: unknown): string {
  const codigo = falha && typeof falha === 'object' ? (falha as { code?: unknown }).code : null;
  if (codigo === 'PGRST205' || codigo === '42P01') {
    return 'A tabela de relatos ainda não existe neste banco. Aplique a migration 20261123_relatos.';
  }
  return mensagemDeErro(falha, 'Não foi possível carregar os relatos.');
}

function ChipTipo({ tipo }: { tipo: TipoRelato }) {
  const Icone = tipo === 'bug' ? Bug : Lightbulb;
  return (
    <ChipSuave tom={tipo === 'bug' ? 'rosa' : 'neutro'} className="shrink-0">
      <span className="inline-flex items-center gap-1">
        <Icone size={11} className="shrink-0" aria-hidden />
        {ROTULO_TIPO_RELATO[tipo] ?? tipo}
      </span>
    </ChipSuave>
  );
}

function ChipStatus({ status }: { status: StatusRelato }) {
  const meta = STATUS_META[status] ?? STATUS_META.aberto;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.chip}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.ponto}`} />
      {ROTULO_STATUS_RELATO[status] ?? status}
    </span>
  );
}

function Descricao({ texto, aberta, onAlternar }: { texto: string; aberta: boolean; onAlternar: () => void }) {
  const paragrafo = useRef<HTMLParagraphElement>(null);
  const [cortada, setCortada] = useState(false);

  // "Ler tudo" só aparece quando as três linhas cortam o texto de verdade
  // nesta largura: o mesmo relato cabe inteiro na tabela e não no celular.
  useLayoutEffect(() => {
    const elemento = paragrafo.current;
    if (!elemento || aberta) return;
    const medir = () => setCortada(elemento.scrollHeight > elemento.clientHeight + 1);
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [texto, aberta]);

  return (
    <>
      <p
        ref={paragrafo}
        className={`whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-700 ${aberta ? '' : 'line-clamp-3'}`}
      >
        {texto}
      </p>
      {(cortada || aberta) && (
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={aberta}
          className="alvo-toque inline-flex min-h-[44px] items-center gap-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 lg:min-h-0 lg:py-1.5"
        >
          {aberta ? 'Mostrar menos' : 'Ler tudo'}
          <ChevronDown size={14} className={`transition-transform ${aberta ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      )}
    </>
  );
}

/** O aviso por e-mail aos donos é à parte do relato: mostra se saiu, por que não saiu ou que não há registro. */
function AvisoEmail({ relato }: { relato: RelatoSuporte }) {
  if (relato.email_enviado_em) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-500">
        <MailCheck size={13} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
        <span className="min-w-0">E-mail interno enviado em {formatarDataHora(relato.email_enviado_em)}</span>
      </p>
    );
  }
  if (relato.email_erro) {
    return (
      <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800">
        <MailWarning size={13} className="mt-0.5 shrink-0" aria-hidden />
        <span className="min-w-0 break-words">
          <span className="font-medium">E-mail interno não saiu: </span>
          {relato.email_erro}
        </span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-400">
      <Mail size={13} className="mt-0.5 shrink-0" aria-hidden />
      <span className="min-w-0">E-mail interno sem registro de envio</span>
    </p>
  );
}

/**
 * Fila de relatos de bug e sugestão do painel SaaS.
 *
 * Lê `relatos_suporte` com a sessão do navegador: a RLS entrega tudo ao dono
 * da plataforma e, a qualquer outra pessoa, só o que ela mesma enviou. Filtro
 * e paginação são feitos no banco, para a contagem de abertos valer para a
 * fila inteira e não só para o que já foi carregado.
 */
export default function FilaRelatos({ className = '' }: Props) {
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos');
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos');
  const [relatos, setRelatos] = useState<RelatoSuporte[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [abertos, setAbertos] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [jaCarregou, setJaCarregou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<{ id: number; destino: StatusRelato } | null>(null);
  const [expandidos, setExpandidos] = useState<Record<number, boolean>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const avisoTimer = useRef<number | null>(null);
  const requisicao = useRef(0);

  const carregar = useCallback(
    async (inicio: number) => {
      const geracao = ++requisicao.current;
      if (inicio === 0) {
        setCarregando(true);
        setErroAcao(null);
      } else {
        setCarregandoMais(true);
      }
      try {
        let consulta = supabase.from('relatos_suporte').select(COLUNAS, { count: 'exact' });
        if (filtroStatus !== 'todos') consulta = consulta.eq('status', filtroStatus);
        if (filtroTipo !== 'todos') consulta = consulta.eq('tipo', filtroTipo);

        const [lista, contagem] = await Promise.all([
          consulta
            .order('criado_em', { ascending: false })
            .order('id', { ascending: false })
            .range(inicio, inicio + PAGINA - 1),
          supabase.from('relatos_suporte').select('id', { count: 'exact', head: true }).eq('status', 'aberto'),
        ]);
        if (geracao !== requisicao.current) return;
        if (lista.error) throw lista.error;

        const pagina = (lista.data ?? []) as unknown as RelatoSuporte[];
        setRelatos((atual) => (inicio === 0 ? pagina : juntar(atual, pagina)));
        setTotal(lista.count ?? null);
        if (!contagem.error) setAbertos(contagem.count ?? 0);
        setErro(null);
      } catch (falha) {
        if (geracao !== requisicao.current) return;
        setErro(erroDeLeitura(falha));
      } finally {
        if (geracao === requisicao.current) {
          setCarregando(false);
          setCarregandoMais(false);
          setJaCarregou(true);
        }
      }
    },
    [filtroStatus, filtroTipo],
  );

  useEffect(() => {
    void carregar(0);
  }, [carregar]);

  useEffect(
    () => () => {
      if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
    },
    [],
  );

  function avisar(mensagem: string) {
    setAviso(mensagem);
    if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
    avisoTimer.current = window.setTimeout(() => setAviso(null), 2600);
  }

  // Quem mudou de status continua na tela até a próxima carga (dá para ver o
  // resultado e desfazer), mas deixa de contar na página pedida ao banco.
  const noFiltro = useMemo(
    () => relatos.filter((relato) => combina(relato, filtroStatus, filtroTipo)).length,
    [relatos, filtroStatus, filtroTipo],
  );
  const temMais = total != null && noFiltro < total;
  const filtrando = filtroStatus !== 'todos' || filtroTipo !== 'todos';
  const primeiraCarga = carregando && !jaCarregou;

  /**
   * Muda o status no banco. A trilha em `audit_log` não é escrita daqui: o
   * próprio UPDATE dispara o gatilho `trg_auditar_relatos_status`, como nas
   * redes e faturas do painel — quem altera pela API também fica registrado.
   */
  async function mudarStatus(relato: RelatoSuporte, novo: StatusRelato) {
    if (novo === relato.status || salvando !== null) return;
    setSalvando({ id: relato.id, destino: novo });
    setErroAcao(null);
    try {
      const { data, error } = await supabase
        .from('relatos_suporte')
        .update({ status: novo })
        .eq('id', relato.id)
        .select('id, status, atualizado_em');
      if (error) throw error;
      const gravado = ((data ?? []) as unknown as Pick<RelatoSuporte, 'id' | 'status' | 'atualizado_em'>[])[0];
      // Sem erro e sem linha: a RLS não deixou alterar ou o relato foi apagado.
      if (!gravado) throw new Error('O relato não foi alterado. Ele pode ter sido removido ou o seu acesso mudou.');

      setRelatos((atual) =>
        atual.map((item) =>
          item.id === relato.id ? { ...item, status: gravado.status, atualizado_em: gravado.atualizado_em } : item,
        ),
      );
      const saiuDeAberto = relato.status === 'aberto' ? 1 : 0;
      const virouAberto = gravado.status === 'aberto' ? 1 : 0;
      setAbertos((atual) => (atual == null ? atual : Math.max(0, atual + virouAberto - saiuDeAberto)));
      const antes = combina(relato, filtroStatus, filtroTipo) ? 1 : 0;
      const depois = combina({ ...relato, status: gravado.status }, filtroStatus, filtroTipo) ? 1 : 0;
      setTotal((atual) => (atual == null ? atual : Math.max(0, atual + depois - antes)));
      avisar(AVISO_STATUS[gravado.status] ?? 'Status atualizado.');
    } catch (falha) {
      setErroAcao(mensagemDeErro(falha, 'Não foi possível mudar o status do relato.'));
    } finally {
      setSalvando(null);
    }
  }

  function alternarDescricao(id: number) {
    setExpandidos((atual) => ({ ...atual, [id]: !atual[id] }));
  }

  function limparFiltros() {
    setFiltroStatus('todos');
    setFiltroTipo('todos');
  }

  return (
    <section
      aria-label="Fila de relatos"
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white ${className}`}
    >
      <Aviso mensagem={aviso} />

      <div className="flex shrink-0 items-start justify-between gap-3 px-3 pt-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-neutral-900">Relatos</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                abertos ? 'bg-amber-50 text-amber-700' : 'bg-[#f3f4f1] text-neutral-600'
              }`}
            >
              {abertos == null ? '—' : abertos === 0 ? 'nenhum aberto' : pluralizar(abertos, 'aberto', 'abertos')}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">Bugs e sugestões enviados pela tela de Ajuda.</p>
        </div>
        <button
          type="button"
          onClick={() => void carregar(0)}
          disabled={carregando}
          aria-label="Atualizar relatos"
          className="alvo-toque flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 disabled:opacity-50 lg:h-9 lg:w-9"
        >
          <RefreshCw size={16} className={carregando ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-b border-black/5 px-3 pb-3 pt-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-1.5">
          {FILTROS_STATUS.map((filtro) => {
            const ativo = filtroStatus === filtro.id;
            return (
              <button
                key={filtro.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltroStatus(filtro.id)}
                className={`alvo-toque inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors lg:h-9 ${
                  ativo
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                }`}
              >
                {filtro.label}
                {filtro.id === 'aberto' && abertos != null && abertos > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                      ativo ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {abertos}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="Filtrar por tipo" className="w-full shrink-0 lg:w-72">
          {/* O botão de dentro é 6px menor que o trilho (borda e respiro): 48px de trilho dão 42px de toque no celular. */}
          <SegmentedControl
            value={filtroTipo}
            onChange={setFiltroTipo}
            options={FILTROS_TIPO}
            className="w-full !h-12 lg:!h-10"
          />
        </div>
      </div>

      <div className="min-h-0 lg:flex-1 lg:overflow-auto" aria-busy={carregando}>
        {(erroAcao || (erro && relatos.length > 0)) && (
          <div className="px-3 pt-3">
            <ErroInline mensagem={erroAcao ?? erro} />
          </div>
        )}

        {primeiraCarga ? (
          <div className="space-y-2 p-3" aria-label="Carregando relatos">
            {Array.from({ length: 4 }).map((_, indice) => (
              <div key={indice} className="rounded-xl border border-neutral-200 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <SkeletonBloco className="h-5 w-16 rounded-full" />
                  <SkeletonBloco className="h-5 w-20 rounded-full" />
                </div>
                <SkeletonBloco className="mt-3 h-4 w-2/3" />
                <SkeletonBloco className="mt-2 h-3 w-1/2" />
                <SkeletonBloco className="mt-3 h-10 w-full" />
              </div>
            ))}
          </div>
        ) : erro && relatos.length === 0 ? (
          <EstadoVazio
            icone={<Inbox size={20} />}
            titulo="Não foi possível carregar os relatos"
            descricao={erro}
            acao={
              <button
                type="button"
                onClick={() => void carregar(0)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Tentar novamente
              </button>
            }
          />
        ) : relatos.length === 0 ? (
          <EstadoVazio
            icone={<Inbox size={20} />}
            titulo={filtrando ? 'Nenhum relato neste filtro' : 'Nenhum relato recebido'}
            descricao={
              filtrando
                ? 'Troque o status ou o tipo para ver os outros relatos da fila.'
                : 'Quando alguém enviar um bug ou uma sugestão pela tela de Ajuda, o relato aparece aqui.'
            }
            acao={
              filtrando ? (
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Ver todos
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Celular e tablet: um cartão por relato, com o texto inteiro ao abrir e as três ações à mão. */}
            <ul className={`space-y-2 p-3 lg:hidden ${carregando ? 'opacity-60' : ''}`}>
              {relatos.map((relato) => {
                const pendente = relato.status === 'aberto' || relato.status === 'em_analise';
                return (
                  <li key={relato.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <ChipTipo tipo={relato.tipo} />
                      <ChipStatus status={relato.status} />
                    </div>
                    <h3 className="mt-2 break-words text-sm font-semibold leading-snug text-neutral-900">
                      {relato.assunto}
                    </h3>
                    <p className="mt-1 break-words text-xs leading-relaxed text-neutral-500">
                      {relato.clinica_nome || 'Sem clínica'} · {relato.autor_nome || 'Autor sem nome'}
                      <span className="block tabular-nums">{formatarDataHora(relato.criado_em)}</span>
                    </p>
                    <div className="mt-2">
                      <Descricao
                        texto={relato.descricao}
                        aberta={!!expandidos[relato.id]}
                        onAlternar={() => alternarDescricao(relato.id)}
                      />
                    </div>
                    <div className="mt-2">
                      <AvisoEmail relato={relato} />
                    </div>
                    {/* O passo natural ocupa a linha inteira; os outros dois dividem a de baixo e cabem até em 320px. */}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {(PROXIMOS[relato.status] ?? PROXIMOS.aberto).map((destino, indice) => (
                        <button
                          key={destino}
                          type="button"
                          onClick={() => void mudarStatus(relato, destino)}
                          disabled={salvando !== null}
                          className={`${BOTAO_CELULAR} ${indice === 0 ? 'col-span-2' : ''} ${indice === 0 && pendente ? ESCURO : CONTORNO}`}
                        >
                          {salvando?.id === relato.id && salvando.destino === destino && (
                            <Loader2 size={14} className="shrink-0 animate-spin" />
                          )}
                          {ROTULO_ACAO[destino]}
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Computador: tabela. O passo natural fica no botão; os outros dois status, no menu. */}
            <table
              className={`hidden w-full min-w-[44rem] border-collapse text-sm lg:table ${carregando ? 'opacity-60' : ''}`}
            >
              <thead className="sticky top-0 z-10 bg-white [&_th]:whitespace-nowrap">
                <tr className="border-b border-black/5">
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-neutral-400">Relato</th>
                  <th className="px-2 py-2 text-left text-[11px] font-medium text-neutral-400">Enviado por</th>
                  <th className="px-2 py-2 text-left text-[11px] font-medium text-neutral-400">Status</th>
                  <th className="px-3 py-2 text-right text-[11px] font-medium text-neutral-400">Ações</th>
                </tr>
              </thead>
              <tbody>
                {relatos.map((relato) => {
                  const pendente = relato.status === 'aberto' || relato.status === 'em_analise';
                  const [principal, ...outros] = PROXIMOS[relato.status] ?? PROXIMOS.aberto;
                  return (
                    <tr key={relato.id} className="border-b border-black/[0.04] align-top last:border-0">
                      <td className="px-3 py-3">
                        <div className="flex items-start gap-2">
                          <ChipTipo tipo={relato.tipo} />
                          <p className="min-w-0 break-words pt-px font-medium leading-snug text-neutral-900">
                            {relato.assunto}
                          </p>
                        </div>
                        <div className="mt-1.5 max-w-prose">
                          <Descricao
                            texto={relato.descricao}
                            aberta={!!expandidos[relato.id]}
                            onAlternar={() => alternarDescricao(relato.id)}
                          />
                        </div>
                        <div className="mt-1.5 max-w-prose">
                          <AvisoEmail relato={relato} />
                        </div>
                      </td>
                      {/* Data junto de quem enviou: uma coluna a menos deixa largura para o texto do relato. */}
                      <td className="w-44 px-2 py-3">
                        <p className="break-words text-neutral-900">{relato.clinica_nome || 'Sem clínica'}</p>
                        <p className="break-words text-[11px] text-neutral-500">
                          {relato.autor_nome || 'Autor sem nome'}
                        </p>
                        <p className="mt-0.5 whitespace-nowrap text-[11px] tabular-nums text-neutral-500">
                          {formatarDataHora(relato.criado_em)}
                        </p>
                      </td>
                      <td className="px-2 py-3">
                        <ChipStatus status={relato.status} />
                        {relato.atualizado_em && (
                          <p className="mt-1 whitespace-nowrap text-[11px] tabular-nums text-neutral-400">
                            desde {formatarDataHora(relato.atualizado_em)}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => void mudarStatus(relato, principal)}
                            disabled={salvando !== null}
                            className={`alvo-toque inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                              pendente ? ESCURO : CONTORNO
                            }`}
                          >
                            {salvando?.id === relato.id && <Loader2 size={13} className="shrink-0 animate-spin" />}
                            {ROTULO_ACAO[principal]}
                          </button>
                          <MenuPontos
                            itens={outros.map((destino) => ({
                              id: destino,
                              label: ROTULO_ACAO[destino],
                              onClick: () => void mudarStatus(relato, destino),
                            }))}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {temMais && (
              <div className="flex flex-col items-center gap-1 px-3 pb-3 lg:pt-3">
                <button
                  type="button"
                  onClick={() => void carregar(noFiltro)}
                  disabled={carregando || carregandoMais}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 lg:h-9 lg:min-h-0 lg:w-auto"
                >
                  {carregandoMais && <Loader2 size={14} className="animate-spin" />}
                  Carregar mais antigos
                </button>
                <p className="text-[11px] tabular-nums text-neutral-400">
                  {noFiltro} de {total} carregados
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
