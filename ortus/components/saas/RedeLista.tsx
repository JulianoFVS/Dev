'use client';

import { Building2, ChevronRight, Plus, Search, SearchX, X } from 'lucide-react';
import CustomSelect from '@/components/ui/CustomSelect';
import {
  formatarData,
  iniciais,
  moeda,
  OPCOES_ORDENACAO,
  pluralizar,
  rotuloPlano,
  type OrdenacaoSaaS,
  type RedeSaaS,
  type ResumoAssinaturaRedeSaaS,
} from '@/lib/saas';
import { ESTADO_ASSINATURA_META } from '@/lib/assinaturas';
import { ChipStatusFinanceiro } from './StatusChips';
import { EstadoVazio, SkeletonBloco } from './Feedback';

type Props = {
  /** Estado da assinatura por id de rede (saas_assinaturas_resumo). null = ainda carregando. */
  assinaturas?: Record<string, ResumoAssinaturaRedeSaaS> | null;
  redes: RedeSaaS[];
  total: number;
  carregando: boolean;
  erro: string | null;
  busca: string;
  onBuscaChange: (valor: string) => void;
  ordenacao: OrdenacaoSaaS;
  onOrdenacaoChange: (valor: OrdenacaoSaaS) => void;
  selecionadaId: string | null;
  onSelecionar: (id: string) => void;
  onCriarRede: () => void;
  onNovoCliente: () => void;
  onTentarNovamente: () => void;
};

/** Só mostra quando a cobrança é automática ou quando a rede está fora do normal. */
function ChipAssinatura({ resumo }: { resumo?: ResumoAssinaturaRedeSaaS }) {
  if (!resumo || resumo.estado === 'sem_cobranca' || resumo.estado === 'ativa') return null;
  const meta = ESTADO_ASSINATURA_META[resumo.estado];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.chip}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.ponto}`} />
      {meta.rotulo}
    </span>
  );
}

export default function RedeLista({
  assinaturas = null,
  redes,
  total,
  carregando,
  erro,
  busca,
  onBuscaChange,
  ordenacao,
  onOrdenacaoChange,
  selecionadaId,
  onSelecionar,
  onCriarRede,
  onNovoCliente,
  onTentarNovamente,
}: Props) {
  const buscando = busca.trim().length > 0;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Redes</h2>
          <span className="rounded-full bg-[#f3f4f1] px-2 py-0.5 text-[11px] font-medium tabular-nums text-neutral-600">
            {carregando && redes.length === 0 ? '—' : total}
          </span>
        </div>
        <span className="text-[11px] text-neutral-400">
          {carregando && redes.length === 0
            ? 'carregando redes...'
            : pluralizar(total, 'rede cadastrada', 'redes cadastradas')}
        </span>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-b border-black/5 px-3 pb-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            value={busca}
            onChange={(event) => onBuscaChange(event.target.value)}
            placeholder="Buscar por nome, CNPJ ou contato"
            aria-label="Buscar redes"
            className="h-11 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-11 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
          />
          {buscando && (
            <button
              type="button"
              onClick={() => onBuscaChange('')}
              aria-label="Limpar busca"
              className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-r-lg text-neutral-400 hover:text-neutral-900"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <div className="w-full sm:w-52">
          <CustomSelect
            value={ordenacao}
            onChange={(valor) => onOrdenacaoChange(valor as OrdenacaoSaaS)}
            options={OPCOES_ORDENACAO}
            placeholder="Ordenar por"
            triggerClassName="!h-11"
            size="md"
          />
        </div>
      </div>

      <div className="min-h-0 lg:flex-1 lg:overflow-y-auto">
        {carregando && redes.length === 0 ? (
          <div className="space-y-2 p-3" aria-busy="true" aria-label="Carregando redes">
            {Array.from({ length: 6 }).map((_, indice) => (
              <div
                key={indice}
                className="rounded-xl border border-neutral-200 bg-white px-3 py-3"
              >
                <div className="flex items-center gap-2">
                  <SkeletonBloco className="h-9 w-9 rounded-full" />
                  <div className="flex-1">
                    <SkeletonBloco className="h-3.5 w-32" />
                    <SkeletonBloco className="mt-1.5 h-2.5 w-20" />
                  </div>
                  <SkeletonBloco className="h-6 w-20 rounded-full" />
                </div>
                <SkeletonBloco className="mt-3 h-10 w-full" />
              </div>
            ))}
          </div>
        ) : erro && redes.length === 0 ? (
          <EstadoVazio
            icone={<Building2 size={20} />}
            titulo="Não foi possível carregar as redes"
            descricao={erro}
            acao={
              <button
                type="button"
                onClick={onTentarNovamente}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Tentar novamente
              </button>
            }
          />
        ) : redes.length === 0 ? (
          <EstadoVazio
            icone={buscando ? <SearchX size={20} /> : <Building2 size={20} />}
            titulo={buscando ? 'Nenhuma rede encontrada' : 'Nenhuma rede cadastrada'}
            descricao={
              buscando
                ? `Não encontramos redes para "${busca.trim()}". Tente outro nome, CNPJ ou contato.`
                : 'Crie uma rede avulsa ou faça o onboarding completo de um cliente com matriz e dono.'
            }
            acao={
              buscando ? (
                <button
                  type="button"
                  onClick={() => onBuscaChange('')}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Limpar busca
                </button>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={onCriarRede}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    <Plus size={15} /> Nova rede
                  </button>
                  <button
                    type="button"
                    onClick={onNovoCliente}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
                  >
                    Novo cliente
                  </button>
                </div>
              )
            }
          />
        ) : (
          <>
            {/* Celular e tablet: cartões empilhados, sem tabela com rolagem horizontal. */}
            <ul className="space-y-2 p-3 lg:hidden">
              {redes.map((rede) => {
                const selecionada = rede.id === selecionadaId;
                return (
                  <li key={rede.id}>
                    <button
                      type="button"
                      onClick={() => onSelecionar(rede.id)}
                      aria-label={`Abrir detalhes da rede ${rede.nome}`}
                      className={`w-full rounded-xl border p-3 text-left transition-colors active:bg-neutral-50 ${
                        selecionada
                          ? 'border-neutral-900/20 ring-1 ring-neutral-900/5'
                          : 'border-neutral-200'
                      }`}
                    >
                      <span className="flex items-start gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f4f1] text-[11px] font-medium text-neutral-500">
                          {iniciais(rede.nome)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-neutral-900">
                            {rede.nome}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-neutral-500">
                            {rotuloPlano(rede.plano)} · desde {formatarData(rede.created_at)}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <ChipStatusFinanceiro status={rede.status_financeiro} />
                          <ChipAssinatura resumo={assinaturas?.[rede.id]} />
                        </span>
                      </span>

                      <span className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                        <span className="min-w-0">
                          <span className="block text-[11px] text-neutral-500">Clínicas</span>
                          <span className="block text-sm font-medium tabular-nums text-neutral-900">
                            {rede.clinicas}
                          </span>
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] text-neutral-500">Profissionais</span>
                          <span className="block text-sm font-medium tabular-nums text-neutral-900">
                            {rede.profissionais}
                          </span>
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] text-neutral-500">Mensalidade</span>
                          <span className="block truncate text-sm font-medium tabular-nums text-neutral-900">
                            {moeda(rede.valor_mensal_centavos)}
                          </span>
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] text-neutral-500">Próximo vencimento</span>
                          <span className="block truncate text-sm font-medium tabular-nums text-neutral-900">
                            {formatarData(rede.proximo_vencimento)}
                          </span>
                        </span>
                      </span>

                      <span className="mt-2.5 flex items-center justify-between gap-2 border-t border-black/5 pt-2 text-[11px]">
                        <span
                          className={
                            rede.vencido_centavos > 0
                              ? 'font-medium text-rose-600'
                              : 'text-neutral-500'
                          }
                        >
                          {rede.vencido_centavos > 0
                            ? `Vencido: ${moeda(rede.vencido_centavos)}`
                            : rede.faturas_abertas > 0
                              ? pluralizar(rede.faturas_abertas, 'fatura em aberto', 'faturas em aberto')
                              : 'Sem faturas em aberto'}
                        </span>
                        <span className="inline-flex items-center gap-1 font-medium text-neutral-900">
                          Abrir <ChevronRight size={14} />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Desktop: tabela com as colunas gerenciais. */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[35rem] border-collapse text-sm">
                <thead className="bg-white [&_th]:whitespace-nowrap">
                  <tr className="border-b border-black/5">
                    <th className="px-3 py-2 text-left text-[11px] font-medium text-neutral-400">
                      Rede
                    </th>
                    <th className="px-2 py-2 text-center text-[11px] font-medium text-neutral-400">
                      Clínicas
                    </th>
                    <th className="px-2 py-2 text-center text-[11px] font-medium text-neutral-400">
                      Profissionais
                    </th>
                    <th className="px-2 py-2 text-right text-[11px] font-medium text-neutral-400">
                      Mensalidade
                    </th>
                    <th className="px-2 py-2 text-left text-[11px] font-medium text-neutral-400">
                      Status
                    </th>
                    <th className="px-2 py-2 text-right text-[11px] font-medium text-neutral-400">
                      Próx. venc.
                    </th>
                    <th className="px-3 py-2 text-right text-[11px] font-medium text-neutral-400">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {redes.map((rede) => {
                    const selecionada = rede.id === selecionadaId;
                    return (
                      <tr
                        key={rede.id}
                        onClick={() => onSelecionar(rede.id)}
                        className={`cursor-pointer border-b border-black/[0.04] last:border-0 ${
                          selecionada ? 'bg-[#f7f8f4]' : 'hover:bg-neutral-50/70'
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3f4f1] text-[10px] font-medium text-neutral-500">
                              {iniciais(rede.nome)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-neutral-900" title={rede.nome}>
                                {rede.nome}
                              </p>
                              <p className="truncate text-[11px] text-neutral-500">
                                {rotuloPlano(rede.plano)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-center tabular-nums text-neutral-600">
                          {rede.clinicas}
                        </td>
                        <td className="px-2 py-2.5 text-center tabular-nums text-neutral-600">
                          {rede.profissionais}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <p className="whitespace-nowrap tabular-nums text-neutral-900">
                            {moeda(rede.valor_mensal_centavos)}
                          </p>
                          {rede.vencido_centavos > 0 && (
                            <p
                              className="whitespace-nowrap text-[11px] font-medium text-rose-600"
                              title={`Valor vencido: ${moeda(rede.vencido_centavos)}`}
                            >
                              {moeda(rede.vencido_centavos)} vencido
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="flex flex-col items-start gap-1">
                            <ChipStatusFinanceiro status={rede.status_financeiro} />
                            <ChipAssinatura resumo={assinaturas?.[rede.id]} />
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-neutral-600">
                          {formatarData(rede.proximo_vencimento)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelecionar(rede.id);
                            }}
                            aria-label={`Abrir detalhes da rede ${rede.nome}`}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                          >
                            <ChevronRight size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
