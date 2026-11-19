'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  formatarDataHora,
  mensagemDeErro,
  moeda,
  MOTIVO_CONTA_NAO_CRIADA,
  MOTIVO_REVISAR,
  type PendenciasAssinaturaSaaS,
  type ResumoAssinaturasSaaS,
} from '@/lib/saas';
import { ESTADO_PAGAMENTO_META, STATUS_PEDIDO_META, motivoDoPagamento, rotuloMeio } from '@/lib/assinaturas';
import { ErroInline, SkeletonBloco, SucessoInline } from './Feedback';

/**
 * Aba "Assinaturas" do painel SaaS: a visão da plataforma inteira.
 *
 * Indicadores (em atraso, modo de consulta, compras paradas, pagamentos a
 * conferir, e-mails de cobrança que não saíram), as compras pela página
 * pública com o que aconteceu em cada uma, e os pagamentos que pedem
 * conferência humana. A conferência em si é feita na aba Assinatura da rede.
 */

const BOTAO = 'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50';

function Meta({ meta }: { meta: { rotulo: string; chip: string; ponto: string } }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.chip}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.ponto}`} />
      {meta.rotulo}
    </span>
  );
}

export default function PainelAssinaturas({
  resumo,
  onAbrirRede,
  onAtualizar,
}: {
  resumo: ResumoAssinaturasSaaS | null;
  onAbrirRede: (id: string) => void;
  onAtualizar: () => Promise<void>;
}) {
  const [dados, setDados] = useState<PendenciasAssinaturaSaaS | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('saas_assinaturas_pendencias');
    if (error) setErro(mensagemDeErro(error, 'Não foi possível carregar as assinaturas.'));
    else {
      // Carregou: o aviso de uma falha anterior não fica em cima da lista.
      setErro(null);
      setDados(data as PendenciasAssinaturaSaaS);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function acao(id: string, corpo: Record<string, unknown>, ok: string) {
    setOcupado(id);
    setErro(null);
    setSucesso(null);
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch('/api/super-admin/assinaturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
        body: JSON.stringify(corpo),
      });
      const d = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) setErro(d?.error || 'Não foi possível concluir.');
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

  const t = resumo?.totais;
  const cartoes = [
    { rotulo: 'Cobrança automática', valor: t?.cobranca_automatica, tom: 'neutro' },
    { rotulo: 'Em atraso', valor: t?.em_atraso, tom: (t?.em_atraso ?? 0) > 0 ? 'ambar' : 'neutro' },
    { rotulo: 'Modo de consulta', valor: t?.modo_consulta, tom: (t?.modo_consulta ?? 0) > 0 ? 'rosa' : 'neutro' },
    { rotulo: 'Pagamentos a conferir', valor: t?.pagamentos_revisar, tom: (t?.pagamentos_revisar ?? 0) > 0 ? 'ambar' : 'neutro' },
    { rotulo: 'Compras com problema', valor: t?.compras_com_erro, tom: (t?.compras_com_erro ?? 0) > 0 ? 'rosa' : 'neutro' },
    { rotulo: 'E-mails que não saíram', valor: t?.avisos_com_erro, tom: (t?.avisos_com_erro ?? 0) > 0 ? 'rosa' : 'neutro' },
  ];
  const TOM: Record<string, string> = {
    neutro: 'border-neutral-200 bg-white text-neutral-900',
    ambar: 'border-amber-200 bg-amber-50 text-amber-900',
    rosa: 'border-rose-200 bg-rose-50 text-rose-800',
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:overflow-hidden">
      <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {cartoes.map((c) => (
          <div key={c.rotulo} className={`rounded-xl border px-3 py-2.5 ${TOM[c.tom]}`}>
            <p className="text-[11px] font-medium opacity-75">{c.rotulo}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{c.valor ?? '—'}</p>
          </div>
        ))}
      </div>
      {t && <p className="shrink-0 text-xs text-neutral-500">Recebido pela cobrança nos últimos 30 dias: <span className="font-medium text-neutral-800">{moeda(t.recebido_30d_centavos)}</span></p>}

      <ErroInline mensagem={erro} />
      <SucessoInline mensagem={sucesso} />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
        <section aria-labelledby="titulo-compras" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2.5">
            <h2 id="titulo-compras" className="text-base font-semibold text-neutral-900">Compras pela página</h2>
            <button type="button" onClick={() => { setCarregando(true); void carregar(); }} aria-label="Atualizar compras" className="flex h-10 w-10 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100">
              <RefreshCw size={15} className={carregando ? 'animate-spin' : ''} />
            </button>
          </div>
          {carregando && !dados ? (
            <div className="p-3"><SkeletonBloco className="h-32 w-full" /></div>
          ) : !dados?.pedidos.length ? (
            <p className="px-3 py-10 text-center text-sm text-neutral-500">Nenhuma compra pela página ainda.</p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto overscroll-contain">
              {dados.pedidos.map((p) => {
                const problema = (p.status === 'pago' && p.provisionamento_erro) || (p.status === 'provisionado' && !p.email_acesso_em);
                return (
                  <li key={p.id} className={`px-3 py-3 text-xs ${problema ? 'bg-rose-50/40' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium text-neutral-900">{p.clinica_nome}</span>
                      <Meta meta={STATUS_PEDIDO_META[p.status]} />
                    </div>
                    <p className="mt-1 text-neutral-600">
                      {p.responsavel_nome} · {p.email}
                    </p>
                    <p className="mt-0.5 text-neutral-500">
                      {p.plano_nome} · {moeda(p.valor_centavos)} · {formatarDataHora(p.criado_em)}
                      {p.pagamento_meio ? ` · ${rotuloMeio(p.pagamento_meio)}` : ''}
                    </p>
                    {p.status === 'aguardando_pagamento' && p.pagamento_status && p.pagamento_status !== 'aprovado' && (
                      <p className="mt-0.5 text-neutral-500">
                        {(ESTADO_PAGAMENTO_META as Record<string, { rotulo: string }>)[p.pagamento_status]?.rotulo || p.pagamento_status}
                        {motivoDoPagamento(p.pagamento_detalhe) ? ` — ${motivoDoPagamento(p.pagamento_detalhe)}` : ''}
                      </p>
                    )}
                    {p.status === 'pago' && p.provisionamento_erro && (
                      <p className="mt-1 text-rose-700">A conta não foi criada ({p.provisionamento_tentativas ?? 0}×): {MOTIVO_CONTA_NAO_CRIADA[p.provisionamento_erro] || p.provisionamento_erro}</p>
                    )}
                    {p.status === 'provisionado' && !p.email_acesso_em && (
                      <p className="mt-1 text-rose-700">O link de acesso não saiu{p.email_acesso_erro ? `: ${p.email_acesso_erro}` : '.'}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {p.status === 'aguardando_pagamento' && (
                        <button type="button" disabled={ocupado !== null} onClick={() => void acao(`conferir-${p.id}`, { acao: 'conferir_pedido', pedido: p.id }, 'Compra conferida com o provedor.')} className={BOTAO}>
                          {ocupado === `conferir-${p.id}` ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                          Conferir no provedor
                        </button>
                      )}
                      {p.status === 'pago' && (
                        <button type="button" disabled={ocupado !== null} onClick={() => void acao(`refazer-${p.id}`, { acao: 'reprocessar_pedido', pedido: p.id }, 'Conta criada.')} className={BOTAO}>
                          {ocupado === `refazer-${p.id}` ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                          Criar a conta de novo
                        </button>
                      )}
                      {p.status === 'provisionado' && !p.email_acesso_em && (
                        <button type="button" disabled={ocupado !== null} onClick={() => void acao(`acesso-${p.id}`, { acao: 'reenviar_acesso', pedido: p.id }, 'Link de acesso enviado.')} className={BOTAO}>
                          {ocupado === `acesso-${p.id}` ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                          Reenviar link de acesso
                        </button>
                      )}
                      {p.rede_id && (
                        <button type="button" onClick={() => onAbrirRede(String(p.rede_id))} className={BOTAO}>Abrir rede</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex min-h-0 flex-col gap-3">
          <section aria-labelledby="titulo-revisar" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <h2 id="titulo-revisar" className="shrink-0 border-b border-neutral-100 px-3 py-3 text-base font-semibold text-neutral-900">Pagamentos a conferir</h2>
            {!dados?.revisar.length ? (
              <p className="px-3 py-8 text-center text-sm text-neutral-500">Nada a conferir.</p>
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto overscroll-contain">
                {dados.revisar.map((e) => (
                  <li key={e.id} className="px-3 py-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-neutral-900">{MOTIVO_REVISAR[e.motivo || ''] || e.motivo || 'Revisão'}</span>
                      <Meta meta={ESTADO_PAGAMENTO_META[e.estado]} />
                    </div>
                    <p className="mt-1 text-neutral-500">
                      {e.valor_centavos != null ? moeda(e.valor_centavos) : '—'} · {rotuloMeio(e.meio)} · {formatarDataHora(e.criado_em)} · nº {e.pagamento_ref}
                    </p>
                    <p className="mt-0.5 text-neutral-500">{e.rede_nome || 'Sem rede'}{e.fatura_id ? ` · fatura ${e.fatura_id}` : e.alvo === 'pedido' ? ' · compra pela página' : ''}</p>
                    {e.rede_id && (
                      <button type="button" onClick={() => onAbrirRede(String(e.rede_id))} className={`${BOTAO} mt-2`}>Conferir na rede</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="titulo-avisos" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white lg:max-h-[40%]">
            <h2 id="titulo-avisos" className="shrink-0 border-b border-neutral-100 px-3 py-3 text-base font-semibold text-neutral-900">E-mails de cobrança que não saíram</h2>
            {!dados?.avisos_com_erro.length ? (
              <p className="px-3 py-6 text-center text-sm text-neutral-500">Todos os avisos saíram.</p>
            ) : (
              <ul className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto overscroll-contain">
                {dados.avisos_com_erro.map((a) => (
                  <li key={a.id} className="px-3 py-2.5 text-xs">
                    <p className="font-medium text-neutral-900">{a.rede_nome || 'Rede'} · {a.tipo.replace(/_/g, ' ')}</p>
                    <p className="mt-0.5 text-rose-700">{a.tentativas}× — {a.erro || 'motivo desconhecido'}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
