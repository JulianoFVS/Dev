'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2, Mail, RefreshCw, RotateCcw, ShieldOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Switch from '@/components/ui/Switch';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import {
  formatarData,
  formatarDataHora,
  mensagemDeErro,
  moeda,
  MOTIVO_REVISAR,
  type AssinaturaRedeSaaS,
  type PagamentoEventoSaaS,
} from '@/lib/saas';
import { ESTADO_ASSINATURA_META, ESTADO_PAGAMENTO_META, STATUS_PEDIDO_META, motivoDoPagamento, rotuloMeio } from '@/lib/assinaturas';
import { ErroInline, SkeletonBloco, SucessoInline } from './Feedback';
import { ChipSuave } from './StatusChips';

/**
 * Aba "Assinatura" do detalhe da rede (painel SaaS).
 *
 * Mostra o estado calculado pelo banco, a próxima cobrança, os pagamentos que
 * o provedor informou e os avisos de cobrança; e faz as ações do dono:
 * cobrança automática, prazo extra, cancelar, reativar e dar um pagamento
 * por conferido. Cada ação passa pelas funções saas_* (exigem dono) e fica
 * em audit_log.
 */

const ROTULO = 'mb-1.5 block text-xs font-medium text-neutral-500';
const TITULO_SECAO = 'text-base font-semibold text-neutral-900';
const BOTAO = 'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50';

const AVISO_ROTULO: Record<string, string> = {
  fatura_gerada: 'Fatura do mês',
  fatura_atrasada: 'Fatura em atraso',
  acesso_bloqueado: 'Modo de consulta',
  acesso_reaberto: 'Liberado de novo',
};

function Meta({ meta }: { meta: { rotulo: string; chip: string; ponto: string } }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.chip}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.ponto}`} />
      {meta.rotulo}
    </span>
  );
}

async function acaoServidor(corpo: Record<string, unknown>): Promise<{ ok: boolean; dados: Record<string, unknown> | null }> {
  const { data } = await supabase.auth.getSession();
  const r = await fetch('/api/super-admin/assinaturas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
    body: JSON.stringify(corpo),
  });
  return { ok: r.ok, dados: (await r.json().catch(() => null)) as Record<string, unknown> | null };
}

export default function RedeAssinatura({ redeId, onAtualizar }: { redeId: string; onAtualizar: () => Promise<void> }) {
  const { showConfirm } = useCustomAlert();
  const [dados, setDados] = useState<AssinaturaRedeSaaS | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [prazo, setPrazo] = useState('');
  const [resolvendo, setResolvendo] = useState<number | null>(null);
  const [resolucao, setResolucao] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  // Erro dos formulários de cancelar e de conferir: aparece junto do formulário, que fica aberto.
  const [erroCancelamento, setErroCancelamento] = useState<string | null>(null);
  const [erroResolucao, setErroResolucao] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('saas_rede_assinatura', { p_rede: redeId });
    if (error) setErro(mensagemDeErro(error, 'Não foi possível carregar a assinatura.'));
    else {
      setErro(null);
      setDados(data as AssinaturaRedeSaaS);
      setPrazo((data as AssinaturaRedeSaaS).bloqueio_suspenso_ate || '');
    }
    setCarregando(false);
  }, [redeId]);

  useEffect(() => {
    setCarregando(true);
    setDados(null);
    setErro(null);
    setSucesso(null);
    void carregar();
  }, [carregar]);

  /** Devolve se deu certo: quem chama só fecha o formulário (e limpa o texto) no sucesso. */
  async function executar(
    id: string,
    fn: () => Promise<{ error: unknown; data?: unknown }>,
    ok: string,
    mostrarErro: (mensagem: string) => void = setErro,
  ): Promise<boolean> {
    setOcupado(id);
    setErro(null);
    setSucesso(null);
    const { error, data } = await fn();
    if (error) mostrarErro(mensagemDeErro(error, 'Não foi possível concluir.'));
    else {
      if (data && typeof data === 'object' && 'estado' in (data as object)) setDados(data as AssinaturaRedeSaaS);
      else await carregar();
      setSucesso(ok);
      await onAtualizar();
    }
    setOcupado(null);
    return !error;
  }

  async function alternarCobranca(ligar: boolean) {
    if (!dados) return;
    const confirmado = await showConfirm(
      ligar
        ? `Com a cobrança automática a fatura de cada mês nasce sozinha (${moeda(dados.valor_centavos)}, vencimento dia ${dados.dia_vencimento}), vai por e-mail com o link de pagamento e, com mais de ${dados.tolerancia_dias} dias de atraso, a rede entra em modo de consulta.`
        : 'Sem a cobrança automática a rede não recebe fatura nova nem entra em modo de consulta por atraso. As faturas passam a ser lançadas à mão nesta tela.',
      { title: ligar ? 'Ligar cobrança automática?' : 'Desligar cobrança automática?', confirmLabel: ligar ? 'Ligar' : 'Desligar', type: 'warning' },
    );
    if (!confirmado) return;
    await executar('cobranca', async () => supabase.rpc('saas_assinatura_cobranca', { p_rede: redeId, p_automatica: ligar }),
      ligar ? 'Cobrança automática ligada.' : 'Cobrança automática desligada.');
  }

  async function salvarPrazo(limpar = false) {
    const deu = await executar('prazo', async () => supabase.rpc('saas_assinatura_prazo', { p_rede: redeId, p_ate: limpar ? null : prazo || null }),
      limpar ? 'Prazo extra removido.' : 'Prazo extra salvo.');
    // Removido: o campo esvazia junto, senão "Dar prazo" reaplicaria a data que acabou de sair.
    if (deu && limpar) setPrazo('');
  }

  async function cancelar() {
    setErroCancelamento(null);
    if (!motivoCancelamento.trim()) {
      setErroCancelamento('Informe o motivo do cancelamento.');
      return;
    }
    const confirmado = await showConfirm(
      'A rede entra em modo de consulta (a equipe lê, não grava) e para de receber fatura. Nenhum dado é apagado; dá para reativar depois.',
      { title: 'Cancelar a assinatura?', confirmLabel: 'Cancelar assinatura', cancelLabel: 'Voltar', type: 'error' },
    );
    if (!confirmado) return;
    const deu = await executar('cancelar', async () => supabase.rpc('saas_assinatura_cancelar', { p_rede: redeId, p_motivo: motivoCancelamento }),
      'Assinatura cancelada.', setErroCancelamento);
    if (!deu) return;
    setCancelando(false);
    setMotivoCancelamento('');
  }

  async function reativar() {
    await executar('reativar', async () => supabase.rpc('saas_assinatura_reativar', { p_rede: redeId }), 'Assinatura reativada.');
  }

  async function resolver(evento: PagamentoEventoSaaS) {
    setErroResolucao(null);
    if (!resolucao.trim()) {
      setErroResolucao('Anote o que foi feito antes de dar por conferido.');
      return;
    }
    const deu = await executar(`resolver-${evento.id}`, async () => supabase.rpc('saas_pagamento_resolver', { p_evento: evento.id, p_resolucao: resolucao }),
      'Pagamento dado por conferido.', setErroResolucao);
    if (!deu) return;
    setResolvendo(null);
    setResolucao('');
  }

  async function doServidor(id: string, corpo: Record<string, unknown>, ok: string) {
    setOcupado(id);
    setErro(null);
    setSucesso(null);
    try {
      const r = await acaoServidor(corpo);
      if (!r.ok) setErro(typeof r.dados?.error === 'string' ? r.dados.error : 'Não foi possível concluir.');
      else {
        setSucesso(ok);
        await carregar();
        await onAtualizar();
      }
    } catch {
      setErro('Sem conexão com o servidor.');
    }
    setOcupado(null);
  }

  if (carregando) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <SkeletonBloco className="h-24 w-full" />
        <SkeletonBloco className="h-40 w-full" />
      </div>
    );
  }
  if (!dados) return <ErroInline mensagem={erro || 'Assinatura indisponível.'} />;

  const cancelada = Boolean(dados.cancelada_em);
  const meta = ESTADO_ASSINATURA_META[dados.estado];

  return (
    <div className="flex flex-col gap-4">
      <ErroInline mensagem={erro} />
      <SucessoInline mensagem={sucesso} />

      <section aria-label="Situação" className="rounded-xl border border-neutral-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900">
              {dados.plano_nome || dados.plano || 'Sem plano'} · {moeda(dados.valor_centavos)}/mês
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              Vencimento dia {dados.dia_vencimento}
              {dados.inicio ? ` · cliente desde ${formatarData(dados.inicio)}` : ''}
            </p>
          </div>
          <Meta meta={meta} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-neutral-500">Próxima cobrança</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-neutral-900">{formatarData(dados.proxima_cobranca)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Em atraso desde</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-neutral-900">{formatarData(dados.divida_desde)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Modo de consulta em</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-neutral-900">
              {dados.estado === 'bloqueada' ? `desde ${formatarData(dados.bloqueada_em)}` : formatarData(dados.bloqueio_em)}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Prazo extra até</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-neutral-900">{formatarData(dados.bloqueio_suspenso_ate)}</dd>
          </div>
        </dl>
        {cancelada && (
          <p className="mt-3 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-700">
            Cancelada em {formatarDataHora(dados.cancelada_em)}{dados.cancelamento_motivo ? ` — ${dados.cancelamento_motivo}` : ''}.
          </p>
        )}
      </section>

      <section aria-label="Cobrança" className="flex flex-col gap-3">
        <h3 className={TITULO_SECAO}>Cobrança</h3>
        <Switch
          checked={dados.cobranca_automatica}
          onChange={(valor) => void alternarCobranca(valor)}
          disabled={ocupado !== null || cancelada}
          className="w-full justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2.5"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-neutral-900">Cobrança automática</span>
            <span className="mt-0.5 block text-[11px] text-neutral-500">
              Fatura do mês 5 dias antes do vencimento, e-mail com o link de pagamento e modo de consulta depois de {dados.tolerancia_dias} dias de atraso.
            </span>
          </span>
        </Switch>

        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <label htmlFor="prazo-extra" className={ROTULO}>
            Prazo extra antes do modo de consulta
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="prazo-extra"
              type="date"
              value={prazo}
              min={dados.hoje}
              onChange={(e) => setPrazo(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-3 text-sm"
            />
            <button type="button" onClick={() => void salvarPrazo()} disabled={!prazo || ocupado !== null} className={BOTAO}>
              {ocupado === 'prazo' ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
              Dar prazo
            </button>
            {dados.bloqueio_suspenso_ate && (
              <button type="button" onClick={() => void salvarPrazo(true)} disabled={ocupado !== null} className={BOTAO}>
                Remover
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-neutral-500">Até 60 dias. A dívida continua; só o modo de consulta espera.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {cancelada ? (
            <button type="button" onClick={() => void reativar()} disabled={ocupado !== null} className={BOTAO}>
              {ocupado === 'reativar' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              Reativar assinatura
            </button>
          ) : cancelando ? (
            <div className="flex w-full flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
              <label htmlFor="motivo-cancelamento" className={ROTULO}>
                Motivo do cancelamento <span className="text-red-500">*</span>
              </label>
              <input
                id="motivo-cancelamento"
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
                maxLength={300}
                placeholder="Fica registrado na auditoria"
                className="h-10 rounded-md border border-neutral-200 bg-white px-3 text-sm"
              />
              <ErroInline mensagem={erroCancelamento} />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void cancelar()} disabled={ocupado !== null} className={`${BOTAO} text-rose-700 hover:bg-rose-50`}>
                  {ocupado === 'cancelar' ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
                  Confirmar cancelamento
                </button>
                <button type="button" onClick={() => { setCancelando(false); setMotivoCancelamento(''); setErroCancelamento(null); }} disabled={ocupado !== null} className={BOTAO}>
                  Voltar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setCancelando(true)} disabled={ocupado !== null} className={`${BOTAO} text-rose-700 hover:bg-rose-50`}>
              <ShieldOff size={14} />
              Cancelar assinatura
            </button>
          )}
        </div>
      </section>

      {dados.pedido && (
        <section aria-label="Compra de origem" className="flex flex-col gap-2">
          <h3 className={TITULO_SECAO}>Compra pela página</h3>
          <div className="rounded-xl border border-neutral-200 bg-white p-3 text-xs text-neutral-600">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-neutral-900">{dados.pedido.responsavel_nome} · {dados.pedido.email}</span>
              <Meta meta={STATUS_PEDIDO_META[dados.pedido.status]} />
            </div>
            <p className="mt-1.5">
              {dados.pedido.plano_nome} · {moeda(dados.pedido.valor_centavos)} · comprado em {formatarDataHora(dados.pedido.criado_em)}
              {dados.pedido.pagamento_meio ? ` · ${rotuloMeio(dados.pedido.pagamento_meio)}` : ''}
            </p>
            <p className="mt-1">
              Link de acesso:{' '}
              {dados.pedido.email_acesso_em
                ? `enviado em ${formatarDataHora(dados.pedido.email_acesso_em)}`
                : dados.pedido.email_acesso_erro
                  ? `não saiu — ${dados.pedido.email_acesso_erro}`
                  : 'ainda não enviado'}
            </p>
            {dados.pedido.status === 'provisionado' && (
              <button
                type="button"
                onClick={() => void doServidor('reenviar', { acao: 'reenviar_acesso', pedido: dados.pedido?.id }, 'Link de acesso reenviado.')}
                disabled={ocupado !== null}
                className={`${BOTAO} mt-2`}
              >
                {ocupado === 'reenviar' ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                Reenviar link de acesso
              </button>
            )}
          </div>
        </section>
      )}

      <section aria-label="Pagamentos informados pelo provedor" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className={TITULO_SECAO}>Pagamentos</h3>
          <button type="button" onClick={() => void carregar()} aria-label="Atualizar pagamentos" className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100">
            <RefreshCw size={15} />
          </button>
        </div>
        {dados.pagamentos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 px-3 py-6 text-center text-xs text-neutral-500">Nenhum pagamento informado pelo provedor.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dados.pagamentos.map((p) => (
              <li key={p.id} className={`rounded-xl border p-3 text-xs ${p.resultado === 'revisar' && !p.resolvido_em ? 'border-amber-300 bg-amber-50/40' : 'border-neutral-200 bg-white'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium tabular-nums text-neutral-900">
                    {p.valor_centavos != null ? moeda(p.valor_centavos) : '—'} · {rotuloMeio(p.meio)}
                  </span>
                  <Meta meta={ESTADO_PAGAMENTO_META[p.estado]} />
                </div>
                <p className="mt-1 text-neutral-500">
                  {formatarDataHora(p.criado_em)} · {p.alvo === 'fatura' ? `fatura ${p.fatura_id}` : p.alvo === 'pedido' ? 'compra pela página' : 'sem destino'} · nº {p.pagamento_ref}
                  {p.vezes > 1 ? ` · avisado ${p.vezes}×` : ''}
                </p>
                {motivoDoPagamento(p.detalhe) && <p className="mt-0.5 text-neutral-500">{motivoDoPagamento(p.detalhe)}</p>}
                {p.resultado === 'revisar' && (
                  <div className="mt-2">
                    <ChipSuave tom={p.resolvido_em ? 'neutro' : 'ambar'}>
                      {p.resolvido_em ? `Conferido: ${p.resolucao || ''}` : `Conferir: ${MOTIVO_REVISAR[p.motivo || ''] || p.motivo || 'revisão'}`}
                    </ChipSuave>
                    {!p.resolvido_em && (resolvendo === p.id ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <input
                          value={resolucao}
                          onChange={(e) => setResolucao(e.target.value)}
                          maxLength={300}
                          placeholder="O que foi feito (ex.: estornado no provedor)"
                          className="h-10 min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-3 text-sm"
                        />
                        <button type="button" onClick={() => void resolver(p)} disabled={ocupado !== null} className={BOTAO}>
                          {ocupado === `resolver-${p.id}` && <Loader2 size={14} className="animate-spin" />}
                          Dar por conferido
                        </button>
                        <ErroInline mensagem={erroResolucao} className="w-full" />
                      </div>
                    ) : (
                      <button type="button" onClick={() => { setResolvendo(p.id); setResolucao(''); setErroResolucao(null); }} className={`${BOTAO} mt-2`}>Conferir</button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Avisos de cobrança" className="flex flex-col gap-2 pb-2">
        <h3 className={TITULO_SECAO}>Avisos de cobrança por e-mail</h3>
        {dados.avisos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 px-3 py-6 text-center text-xs text-neutral-500">Nenhum aviso de cobrança ainda.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
            {dados.avisos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs">
                <span className="font-medium text-neutral-900">{AVISO_ROTULO[a.tipo] || a.tipo}</span>
                <span className={a.enviado_em ? 'text-neutral-500' : 'text-rose-700'}>
                  {a.enviado_em
                    ? `enviado em ${formatarDataHora(a.enviado_em)}${a.destinatarios ? ` para ${a.destinatarios}` : ''}`
                    : a.tentativas > 0
                      ? `não saiu (${a.tentativas}×): ${a.erro || 'motivo desconhecido'}`
                      : 'na fila'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
