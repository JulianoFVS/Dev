'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Building2, X } from 'lucide-react';
import {
  formatarData,
  moeda,
  rotuloPlano,
  type RedeDetalheSaaS,
  type RedeSaaS,
} from '@/lib/saas';
import { ChipStatusFinanceiro } from './StatusChips';
import { ErroInline, EstadoVazio, SkeletonBloco } from './Feedback';
import RedeVisaoGeral from './RedeVisaoGeral';
import RedeFiliais from './RedeFiliais';
import RedeEquipe from './RedeEquipe';
import RedeFaturas from './RedeFaturas';
import RedeAssinatura from './RedeAssinatura';

type AbaRede = 'geral' | 'assinatura' | 'filiais' | 'equipe' | 'faturas';

type Props = {
  redeId: string | null;
  resumo: RedeSaaS | null;
  detalhe: RedeDetalheSaaS | null;
  carregando: boolean;
  erro: string | null;
  modo: 'inline' | 'tela';
  redes: RedeSaaS[];
  onFechar: () => void;
  onAtualizar: () => Promise<void>;
  onExcluir: () => Promise<void>;
  onTentarNovamente: () => void;
};

const ABAS: { id: AbaRede; label: string }[] = [
  { id: 'geral', label: 'Visão geral' },
  { id: 'assinatura', label: 'Assinatura' },
  { id: 'filiais', label: 'Filiais' },
  { id: 'equipe', label: 'Equipe' },
  { id: 'faturas', label: 'Faturas' },
];

export default function RedeDetalhe({
  redeId,
  resumo,
  detalhe,
  carregando,
  erro,
  modo,
  redes,
  onFechar,
  onAtualizar,
  onExcluir,
  onTentarNovamente,
}: Props) {
  const [aba, setAba] = useState<AbaRede>('geral');
  const rolagemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAba('geral');
  }, [redeId]);

  useEffect(() => {
    rolagemRef.current?.scrollTo({ top: 0 });
  }, [aba, redeId]);

  if (!redeId) {
    if (modo === 'tela') return null;
    return (
      <div className="flex min-h-[20rem] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/60 px-6 py-10 text-center lg:min-h-0">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f3f4f1] text-neutral-500">
          <Building2 size={22} />
        </span>
        <p className="mt-3 text-sm font-medium text-neutral-900">Selecione uma rede</p>
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-neutral-500">
          Abra uma rede para editar dados comerciais, mover filiais, ver a equipe e cuidar das
          faturas.
        </p>
      </div>
    );
  }

  const rede = detalhe?.rede ?? resumo;
  const nome = detalhe?.rede.nome ?? resumo?.nome ?? 'Rede';
  const status = detalhe?.rede.status_financeiro ?? resumo?.status_financeiro;
  const mensalidade = detalhe?.rede.valor_mensal_centavos ?? resumo?.valor_mensal_centavos ?? 0;
  const diaVencimento = detalhe?.rede.dia_vencimento ?? resumo?.dia_vencimento ?? 0;

  const contagens: Record<AbaRede, number | null> = {
    geral: null,
    assinatura: null,
    filiais: detalhe ? detalhe.clinicas.length : null,
    equipe: detalhe ? detalhe.profissionais.length : null,
    faturas: detalhe ? detalhe.faturas.length : null,
  };

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white ${
        modo === 'tela' ? 'h-full' : 'flex-1 md:min-h-[28rem]'
      }`}
    >
      <div className="shrink-0 border-b border-black/5 px-3 pt-2.5 sm:px-4">
        <div className="flex items-start gap-1.5">
          {modo === 'tela' && (
            <button
              type="button"
              onClick={onFechar}
              aria-label="Voltar para a lista de redes"
              className="-ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
            >
              <ArrowLeft size={19} />
            </button>
          )}
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="min-w-0 max-w-full truncate text-base font-semibold text-neutral-900 sm:text-lg">
                {nome}
              </h2>
              {status && <ChipStatusFinanceiro status={status} />}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-neutral-500">
              {rotuloPlano(rede?.plano)} · {moeda(mensalidade)}/mês
              {diaVencimento > 0 ? ` · vence dia ${diaVencimento}` : ''}
              {rede?.created_at ? ` · desde ${formatarData(rede.created_at)}` : ''}
            </p>
          </div>
          {modo === 'inline' && (
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar detalhe da rede"
              className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
            >
              <X size={17} />
            </button>
          )}
        </div>

        <div className="-mx-1 mt-1 overflow-x-auto pb-2 pt-1">
          <div role="tablist" aria-label="Seções da rede" className="flex min-w-max gap-1 px-1">
            {ABAS.map((item) => {
              const ativa = aba === item.id;
              const contagem = contagens[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  onClick={() => setAba(item.id)}
                  className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors ${
                    ativa
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                  }`}
                >
                  {item.label}
                  {contagem != null && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                        ativa ? 'bg-white/20 text-white' : 'bg-[#f3f4f1] text-neutral-500'
                      }`}
                    >
                      {contagem}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        ref={rolagemRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3 sm:px-4"
      >
        {erro && detalhe && <ErroInline mensagem={erro} className="mb-3" />}

        {!detalhe ? (
          carregando ? (
            <div className="space-y-2" aria-busy="true" aria-label="Carregando detalhe da rede">
              <SkeletonBloco className="h-24 w-full" />
              <SkeletonBloco className="h-16 w-full" />
              <SkeletonBloco className="h-16 w-full" />
              <SkeletonBloco className="h-16 w-full" />
            </div>
          ) : erro ? (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <AlertTriangle size={20} />
              </span>
              <p className="mt-3 text-sm font-medium text-neutral-900">
                Não foi possível abrir esta rede
              </p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-neutral-500">{erro}</p>
              <button
                type="button"
                onClick={onTentarNovamente}
                className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <EstadoVazio
              icone={<Building2 size={20} />}
              titulo="Nada por aqui ainda"
              descricao="Selecione a rede novamente para carregar os detalhes."
            />
          )
        ) : aba === 'geral' ? (
          <RedeVisaoGeral
            key={detalhe.rede.id}
            rede={detalhe.rede}
            possuiClinicas={detalhe.clinicas.length > 0}
            onSalvo={onAtualizar}
            onExcluir={onExcluir}
          />
        ) : aba === 'assinatura' ? (
          <RedeAssinatura key={detalhe.rede.id} redeId={detalhe.rede.id} onAtualizar={onAtualizar} />
        ) : aba === 'filiais' ? (
          <RedeFiliais
            redeId={detalhe.rede.id}
            clinicas={detalhe.clinicas}
            redes={redes}
            onAtualizar={onAtualizar}
          />
        ) : aba === 'equipe' ? (
          <RedeEquipe profissionais={detalhe.profissionais} convites={detalhe.convites} />
        ) : (
          <RedeFaturas
            rede={detalhe.rede}
            faturas={detalhe.faturas}
            onAtualizar={onAtualizar}
          />
        )}
      </div>
    </div>
  );
}
