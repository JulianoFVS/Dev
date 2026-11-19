'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useClinica } from '@/app/context/ClinicaContext';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import {
  ESTADO_ASSINATURA_META,
  ESTADO_PAGAMENTO_META,
  STATUS_FATURA_ASSINATURA_META,
  dataCurta,
  diasEntre,
  mesDaCompetencia,
  motivoDoPagamento,
  reais,
  rotuloMeio,
  textoDoLimite,
  type FaturaDaAssinatura,
  type SituacaoAssinatura,
  type UsoDoPlano,
} from '@/lib/assinaturas';
import { avisarMudancaNaAssinatura, buscarSituacao, clinicaPorRede, piorSituacao } from '@/lib/assinaturaCliente';
import { supabase } from '@/lib/supabase';

/**
 * Assinatura do Ortus — tela do administrador da clínica.
 *
 * Mostra o plano, a situação, a próxima cobrança e as faturas, com o estado
 * do pagamento de cada uma. "Pagar" leva à página do provedor (Pix ou
 * cartão); na volta a tela confere o pagamento sem esperar o webhook.
 */

const SEM_FATURAS: FaturaDaAssinatura[] = [];

function Etiqueta({ meta }: { meta: { rotulo: string; chip: string; ponto: string } }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${meta.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.ponto}`} aria-hidden />
      {meta.rotulo}
    </span>
  );
}

async function chamar(caminho: string, corpo: unknown): Promise<{ ok: boolean; status: number; dados: Record<string, unknown> | null }> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(caminho, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
    body: JSON.stringify(corpo),
  });
  return { ok: r.ok, status: r.status, dados: (await r.json().catch(() => null)) as Record<string, unknown> | null };
}

/** Respostas da clínica (ou das redes, em "todas as clínicas") e a rede que está na tela. */
type Carga = { chave: string; respostas: (SituacaoAssinatura | null)[]; rede: string | null };

/**
 * Com mais de uma rede administrada: a da fatura que voltou do pagamento, senão
 * a que já estava na tela (não pula de rede ao recarregar), senão a de pior
 * situação, que é a mesma que a faixa aponta.
 */
function redeAMostrar(respostas: (SituacaoAssinatura | null)[], anterior: string | null, faturaId: number | null): string | null {
  const administradas = respostas.filter((s): s is SituacaoAssinatura => Boolean(s?.admin));
  const escolhida =
    (faturaId !== null ? administradas.find((s) => s.faturas?.some((f) => f.id === faturaId)) : undefined) ??
    administradas.find((s) => anterior !== null && s.rede_id === anterior) ??
    piorSituacao(administradas);
  return escolhida?.rede_id ?? null;
}

function explicacao(s: SituacaoAssinatura): string {
  const hoje = s.hoje || new Date().toISOString().slice(0, 10);
  switch (s.estado) {
    case 'ativa':
      return s.fatura_pendente
        ? `Fatura em aberto, com vencimento em ${dataCurta(s.fatura_pendente.vencimento)}.`
        : 'Tudo em dia.';
    case 'em_atraso': {
      const dias = Math.max(1, diasEntre(s.divida_desde, hoje));
      return `Fatura vencida há ${dias} ${dias === 1 ? 'dia' : 'dias'}. ${s.bloqueio_em ? `A partir de ${dataCurta(s.bloqueio_em)} o sistema entra em modo de consulta.` : ''}`;
    }
    case 'bloqueada':
      return 'Sistema em modo de consulta: tudo pode ser lido, nada é gravado. Volta ao normal assim que o pagamento for confirmado. Nenhum dado foi apagado.';
    case 'suspensa':
      return 'O acesso foi suspenso pelo suporte do Ortus. O sistema está em modo de consulta; os dados continuam guardados.';
    case 'cancelada':
      return 'Assinatura encerrada. O sistema está em modo de consulta; os dados continuam guardados.';
    default:
      return 'A cobrança desta clínica é combinada direto com a equipe do Ortus.';
  }
}

/**
 * Equipe e unidades do plano ("2 de 3 profissionais · 1 de 1 unidade"). No
 * celular só a equipe, numa linha: o resumo não pode empurrar o Pagar para baixo.
 */
function UsoDoPlanoResumo({ uso }: { uso: UsoDoPlano | null }) {
  if (!uso) return null;
  const equipe = textoDoLimite(uso.profissionais, uso.limite_profissionais, 'profissional', 'profissionais');
  const unidades = textoDoLimite(uso.unidades, uso.limite_unidades, 'unidade', 'unidades');
  if (!equipe && !unidades) return null;
  const noLimite = (uso.limite_profissionais != null && uso.profissionais >= uso.limite_profissionais)
    || (uso.limite_unidades != null && uso.unidades >= uso.limite_unidades);
  return (
    <p className="mt-1 truncate text-xs text-neutral-500 md:whitespace-normal">
      {equipe}
      {unidades && <span className="hidden md:inline">{equipe ? ' · ' : ''}{unidades}</span>}
      {noLimite && <span className="hidden md:inline">. Para ampliar, fale com o suporte.</span>}
    </p>
  );
}

function Assinatura() {
  const { clinics, activeClinicId, loading: carregandoClinicas } = useClinica();
  const { showAlert } = useCustomAlert();
  const router = useRouter();
  const busca = useSearchParams();
  const faturaDeVolta = Number(busca.get('fatura')) || null;

  // Clínicas a consultar. Em "todas as clínicas", uma por rede e só onde a pessoa
  // não é convidada: a tela mostra a rede que ela administra, não clinics[0].
  const alvos = useMemo(() => {
    if (activeClinicId === 'all') {
      const porRede = clinicaPorRede(clinics);
      const proprias = porRede.filter((c) => !c.convidado);
      return (proprias.length ? proprias : porRede).map((c) => c.id);
    }
    if (activeClinicId) return [String(activeClinicId)];
    return clinics[0]?.id ? [String(clinics[0].id)] : [];
  }, [activeClinicId, clinics]);
  const chaveAlvos = alvos.join(',');

  const [carga, setCarga] = useState<Carga | null>(null);
  const [pagando, setPagando] = useState<number | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const chaveAtual = useRef(chaveAlvos);

  useEffect(() => {
    chaveAtual.current = chaveAlvos;
  }, [chaveAlvos]);

  const carregar = useCallback(async (faturaId: number | null = null) => {
    const ids = chaveAlvos ? chaveAlvos.split(',') : [];
    if (!ids.length) return null;
    const novas = await Promise.all(ids.map((id) => buscarSituacao(id, true)));
    // Resposta de uma clínica que já não é a ativa (troca A→B→A): descarta.
    if (chaveAtual.current !== chaveAlvos) return null;
    setCarga((anterior) => {
      const previa = anterior?.chave === chaveAlvos ? anterior : null;
      // Falha ao recarregar a mesma clínica: fica o que já estava. Clínica nova sem resposta mostra o erro.
      const juntas = novas.map((r, i) => r ?? previa?.respostas[i] ?? null);
      return { chave: chaveAlvos, respostas: juntas, rede: redeAMostrar(juntas, previa?.rede ?? null, faturaId) };
    });
    return novas;
  }, [chaveAlvos]);

  useEffect(() => {
    if (carregandoClinicas || !chaveAlvos) return;
    void carregar();
  }, [carregandoClinicas, chaveAlvos, carregar]);

  // Volta do provedor: confere o pagamento agora (até 5 vezes, uma a cada 4 s).
  // Sem trava por ref: no StrictMode, ou se a clínica mudar no meio, o efeito roda
  // de novo e a rodada nova termina o serviço; a antiga só para.
  useEffect(() => {
    if (!faturaDeVolta || !chaveAlvos) return;
    let cancelado = false;
    let avisarNaSaida = false;
    (async () => {
      setConferindo(true);
      for (let i = 0; i < 5 && !cancelado; i += 1) {
        await chamar('/api/assinatura/conferir', { fatura_id: faturaDeVolta }).catch(() => null);
        avisarNaSaida = true;
        const lista = await carregar(faturaDeVolta);
        if (cancelado) return;
        const fatura = lista?.flatMap((s) => s?.faturas ?? []).find((f) => f.id === faturaDeVolta);
        if (!fatura || fatura.status === 'paga' || fatura.pagamento_status === 'recusado') break;
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }
      if (cancelado) return;
      avisarNaSaida = false;
      setConferindo(false);
      avisarMudancaNaAssinatura();
      router.replace('/assinatura');
    })();
    return () => {
      cancelado = true;
      setConferindo(false);
      // Parou no meio (troca de clínica, saída da tela): a faixa confere de novo.
      if (avisarNaSaida) avisarMudancaNaAssinatura();
    };
  }, [faturaDeVolta, chaveAlvos, carregar, router]);

  async function pagar(fatura: FaturaDaAssinatura) {
    if (pagando) return;
    setPagando(fatura.id);
    try {
      const r = await chamar('/api/assinatura/pagar', { fatura_id: fatura.id });
      const url = typeof r.dados?.url === 'string' ? r.dados.url : null;
      if (r.ok && url) {
        window.location.assign(url);
        return;
      }
      // Já paga (ex.: pelo link do e-mail, em outro aparelho) ou não existe mais: a lista e a faixa se atualizam.
      if (r.status === 409 || r.status === 404) {
        void carregar();
        avisarMudancaNaAssinatura();
      }
      await showAlert(typeof r.dados?.error === 'string' ? r.dados.error : 'Não foi possível abrir o pagamento agora.', { type: 'error' });
    } catch {
      await showAlert('Sem conexão com o servidor. Confira a internet e tente de novo.', { type: 'error' });
    }
    setPagando(null);
  }

  // Só vale a resposta da clínica ativa: trocou de clínica, volta ao esqueleto em vez de mostrar a rede anterior.
  const respostas = carga && carga.chave === chaveAlvos ? carga.respostas : null;
  const administradas = (respostas ?? []).filter((s): s is SituacaoAssinatura => Boolean(s?.admin));
  // Quem não administra nenhuma das redes recebe o aviso da primeira resposta.
  const situacao = administradas.find((s) => s.rede_id === carga?.rede) ?? administradas[0] ?? respostas?.find(Boolean) ?? null;
  const variasRedes = administradas.length > 1;
  const carregando = !respostas && (carregandoClinicas || alvos.length > 0);

  const faturas = situacao?.faturas ?? SEM_FATURAS;
  const emDivida = (f: FaturaDaAssinatura) => f.status === 'aberta' || f.status === 'estornada' || f.status === 'contestada';

  return (
    // No celular a página cresce e a casca rola (a lista de faturas é o que rola);
    // a altura só fica presa à tela do computador (lg), onde a lista rola por dentro.
    <div className="flex flex-col gap-3 px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">
          Assinatura
          {situacao?.rede_nome && <span className="hidden text-neutral-400 md:inline"> · {situacao.rede_nome}</span>}
        </h1>
        {situacao && <Etiqueta meta={ESTADO_ASSINATURA_META[situacao.estado]} />}
        {/* Mais de uma rede administrada: o nome da rede aparece também no celular. */}
        {variasRedes && situacao?.rede_nome && (
          <p className="w-full truncate text-sm text-neutral-500 md:hidden">Rede {situacao.rede_nome}</p>
        )}
      </header>

      {carregando ? (
        // Mesmo desenho do resumo (compacto no celular): a tela não pula quando os dados chegam.
        <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-3 md:gap-3" aria-hidden>
          {[0, 1, 2].map((i) => <div key={i} className={`h-24 animate-pulse rounded-xl bg-white ${i === 2 ? 'col-span-2 md:col-span-1' : ''}`} />)}
        </div>
      ) : !situacao ? (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-500">
          Não foi possível carregar a assinatura agora. Confira a internet e abra a tela de novo.
        </p>
      ) : !situacao.admin ? (
        <p className="rounded-xl border border-neutral-200 bg-white px-4 py-8 text-center text-sm text-neutral-600">
          Só quem administra a clínica vê os dados da assinatura.
          {!situacao.pode_gravar && ' O sistema está em modo de consulta: avise o administrador.'}
        </p>
      ) : (
        <>
          {/* Celular: Plano e Próxima cobrança lado a lado e textos menores, para a
              primeira fatura (e o Pagar) aparecer sem rolar mesmo com a faixa no topo. */}
          <section aria-label="Resumo" className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-3 md:gap-3">
            <div className="min-w-0 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 md:px-4 md:py-3">
              <p className="text-xs font-medium text-neutral-500">Plano</p>
              <p className="mt-0.5 text-sm font-semibold text-neutral-900 md:mt-1 md:text-base">{situacao.plano_nome || situacao.plano || 'Sem plano'}</p>
              <p className="text-xs text-neutral-600 md:text-sm">
                {(situacao.valor_centavos ?? 0) > 0 ? `${reais(situacao.valor_centavos)} por mês` : 'Valor combinado com o Ortus'}
              </p>
              <UsoDoPlanoResumo uso={situacao.uso ?? null} />
            </div>
            <div className="min-w-0 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 md:px-4 md:py-3">
              <p className="text-xs font-medium text-neutral-500">Próxima cobrança</p>
              <p className="mt-0.5 text-sm font-semibold tabular-nums text-neutral-900 md:mt-1 md:text-base">{dataCurta(situacao.proxima_cobranca)}</p>
              <p className="text-xs text-neutral-600 md:text-sm">
                {situacao.cobranca_automatica ? (
                  <>
                    Vence todo dia {situacao.dia_vencimento}.<span className="hidden md:inline"> A fatura chega por e-mail 5 dias antes.</span>
                  </>
                ) : (
                  'Cobrança manual.'
                )}
              </p>
            </div>
            <div className="col-span-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 md:col-span-1 md:px-4 md:py-3">
              <p className="text-xs font-medium text-neutral-500">Situação</p>
              <p className="mt-0.5 text-xs leading-snug text-neutral-800 md:mt-1 md:text-sm">{explicacao(situacao)}</p>
            </div>
          </section>

          <section aria-labelledby="titulo-faturas" className="flex flex-col rounded-xl border border-neutral-200 bg-white lg:min-h-0 lg:flex-1 lg:overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
              <h2 id="titulo-faturas" className="text-base font-semibold text-neutral-900">Faturas</h2>
              {/* Na volta do provedor o aviso fica no cabeçalho da lista: não empurra a lista para baixo. */}
              {conferindo ? (
                <p role="status" className="flex min-w-0 items-center gap-1.5 text-xs text-neutral-700">
                  <Loader2 size={14} className="shrink-0 animate-spin" aria-hidden /> Conferindo o pagamento…
                </p>
              ) : (
                <p className="hidden text-xs text-neutral-500 sm:block">Pix ou cartão, na página do Mercado Pago. O Ortus não guarda dados de cartão.</p>
              )}
            </div>
            {faturas.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-neutral-500">Nenhuma fatura ainda.</p>
            ) : (
              <ul className="divide-y divide-neutral-100 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain">
                {faturas.map((f) => {
                  const motivo = f.pagamento_status && f.pagamento_status !== 'aprovado' ? motivoDoPagamento(f.pagamento_detalhe) : null;
                  return (
                    <li key={f.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-neutral-900 first-letter:uppercase">{mesDaCompetencia(f.competencia)}</p>
                        <p className="text-xs text-neutral-500">
                          {f.status === 'paga' && f.pago_em
                            ? `Paga em ${dataCurta(f.pago_em)}${f.metodo ? ` · ${rotuloMeio(f.metodo)}` : ''}`
                            : `Vence em ${dataCurta(f.vencimento)}`}
                        </p>
                      </div>
                      <div className="col-start-1 flex min-w-0 flex-wrap items-center gap-1.5 md:col-start-auto">
                        <Etiqueta meta={STATUS_FATURA_ASSINATURA_META[f.status]} />
                        {f.pagamento_status && f.pagamento_status !== 'aprovado' && emDivida(f) && <Etiqueta meta={ESTADO_PAGAMENTO_META[f.pagamento_status]} />}
                        {motivo && <span className="w-full text-xs text-neutral-500">{motivo}</span>}
                      </div>
                      <p className="col-start-2 row-start-1 text-right text-sm font-semibold tabular-nums text-neutral-900 md:col-start-auto md:row-start-auto">{reais(f.valor_centavos)}</p>
                      <div className="col-start-2 row-start-2 justify-self-end md:col-start-auto md:row-start-auto">
                        {emDivida(f) && f.valor_centavos > 0 ? (
                          <button
                            type="button"
                            onClick={() => pagar(f)}
                            disabled={pagando !== null}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                          >
                            {pagando === f.id && <Loader2 size={15} className="animate-spin" aria-hidden />}
                            Pagar
                          </button>
                        ) : (
                          <span className="block w-[4.5rem]" aria-hidden />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <p className="shrink-0 text-xs text-neutral-500">
            Dúvida sobre a cobrança? <Link href="/ajuda" className="font-medium text-neutral-800 underline underline-offset-2">Fale com o suporte</Link>.
          </p>
        </>
      )}
    </div>
  );
}

export default function PaginaAssinatura() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Assinatura />
    </Suspense>
  );
}
