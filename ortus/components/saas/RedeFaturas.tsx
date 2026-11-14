'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Ban,
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import CustomSelect from '@/components/ui/CustomSelect';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import {
  centavosParaDigitacao,
  competenciaAtualISO,
  diasAtraso,
  digitarMoeda,
  digitosParaCentavos,
  faturaVencida,
  formatarCompetencia,
  formatarData,
  hojeISO,
  mensagemDeErro,
  moeda,
  OPCOES_STATUS_FATURA,
  pluralizar,
  vencimentoSugerido,
  type FaturaSaaS,
  type RedeComercialSaaS,
  type StatusFaturaSaaS,
} from '@/lib/saas';
import { ChipStatusFatura } from './StatusChips';
import { ErroInline, EstadoVazio } from './Feedback';

type FiltroFatura = 'todas' | 'abertas' | 'vencidas' | 'pagas';

type Props = {
  rede: RedeComercialSaaS;
  faturas: FaturaSaaS[];
  onAtualizar: () => Promise<void>;
};

type FormFatura = {
  competencia: string;
  vencimento: string;
  valor: string;
  status: StatusFaturaSaaS;
  pagoEm: string;
  metodo: string;
  observacao: string;
};

const CAMPO =
  'box-border h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900';
const ROTULO = 'mb-1.5 block text-xs font-medium text-neutral-500';
const BOTAO_ACAO =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const OPCOES_FILTRO: { value: FiltroFatura; label: string }[] = [
  { value: 'todas', label: 'Todas' },
  { value: 'abertas', label: 'Abertas' },
  { value: 'vencidas', label: 'Vencidas' },
  { value: 'pagas', label: 'Pagas' },
];

function formularioInicial(rede: RedeComercialSaaS, fatura: FaturaSaaS | null): FormFatura {
  if (fatura) {
    return {
      competencia: fatura.competencia.slice(0, 7),
      vencimento: fatura.vencimento.slice(0, 10),
      valor: centavosParaDigitacao(fatura.valor_centavos),
      status: fatura.status,
      pagoEm: fatura.pago_em?.slice(0, 10) ?? hojeISO(),
      metodo: fatura.metodo ?? '',
      observacao: fatura.observacao ?? '',
    };
  }
  return {
    competencia: competenciaAtualISO().slice(0, 7),
    vencimento: vencimentoSugerido(rede.dia_vencimento),
    valor: centavosParaDigitacao(rede.valor_mensal_centavos),
    status: 'aberta',
    pagoEm: hojeISO(),
    metodo: '',
    observacao: '',
  };
}

function FormularioFatura({
  rede,
  fatura,
  onSalvo,
  onCancelar,
}: {
  rede: RedeComercialSaaS;
  fatura: FaturaSaaS | null;
  onSalvo: () => Promise<void>;
  onCancelar: () => void;
}) {
  const { showAlert } = useCustomAlert();
  const [form, setForm] = useState<FormFatura>(() => formularioInicial(rede, fatura));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function atualizar<C extends keyof FormFatura>(campo: C, valor: FormFatura[C]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);

    if (!/^\d{4}-\d{2}$/.test(form.competencia)) {
      setErro('Informe a competência da fatura.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.vencimento)) {
      setErro('Informe a data de vencimento.');
      return;
    }

    setSalvando(true);
    try {
      const { error } = await supabase.rpc('saas_fatura_salvar', {
        p_rede: rede.id,
        p_competencia: `${form.competencia}-01`,
        p_vencimento: form.vencimento,
        p_valor_centavos: digitosParaCentavos(form.valor),
        p_status: form.status,
        p_observacao: form.observacao.trim() || null,
        p_pago_em: form.status === 'paga' ? form.pagoEm || hojeISO() : null,
        p_metodo: form.status === 'paga' ? form.metodo.trim() || null : null,
      });
      if (error) throw error;
      await onSalvo();
      await showAlert(
        fatura
          ? 'A fatura foi atualizada.'
          : `Fatura de ${formatarCompetencia(`${form.competencia}-01`)} criada para a rede ${rede.nome}.`,
        { title: 'Fatura salva', type: 'success' },
      );
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Não foi possível salvar a fatura.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form
      onSubmit={salvar}
      className="rounded-xl border border-neutral-900/10 bg-[#f8f8f6] p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900">
            {fatura ? 'Editar fatura' : 'Nova fatura'}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">
            Uma fatura por competência — salvar a mesma competência atualiza o registro.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancelar}
          aria-label="Fechar formulário de fatura"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-white hover:text-neutral-900"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className={ROTULO}>Competência *</span>
          <input
            type="month"
            value={form.competencia}
            onChange={(event) => atualizar('competencia', event.target.value)}
            className={CAMPO}
            required
          />
        </label>
        <label className="block">
          <span className={ROTULO}>Vencimento *</span>
          <input
            type="date"
            value={form.vencimento}
            onChange={(event) => atualizar('vencimento', event.target.value)}
            className={CAMPO}
            required
          />
        </label>
      </div>

      <label className="mt-2 block">
        <span className={ROTULO}>Valor</span>
        <span className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-400">
            R$
          </span>
          <input
            value={form.valor}
            onChange={(event) => atualizar('valor', digitarMoeda(event.target.value))}
            inputMode="numeric"
            className={`${CAMPO} pl-9 tabular-nums`}
            placeholder="0,00"
          />
        </span>
      </label>

      <div className="mt-2">
        <span className={ROTULO}>Situação</span>
        <CustomSelect
          value={form.status}
          onChange={(valor) => atualizar('status', valor as StatusFaturaSaaS)}
          options={OPCOES_STATUS_FATURA}
          placeholder="Selecione..."
          triggerClassName="!h-11"
          size="md"
        />
      </div>

      {form.status === 'paga' && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block">
            <span className={ROTULO}>Pago em</span>
            <input
              type="date"
              value={form.pagoEm}
              onChange={(event) => atualizar('pagoEm', event.target.value)}
              className={CAMPO}
            />
          </label>
          <label className="block">
            <span className={ROTULO}>Método</span>
            <input
              value={form.metodo}
              onChange={(event) => atualizar('metodo', event.target.value)}
              className={CAMPO}
              placeholder="Pix, boleto..."
            />
          </label>
        </div>
      )}

      <label className="mt-2 block">
        <span className={ROTULO}>Observação</span>
        <textarea
          value={form.observacao}
          onChange={(event) => atualizar('observacao', event.target.value)}
          rows={2}
          className="box-border w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
          placeholder="Desconto combinado, nota fiscal, etc."
        />
      </label>

      <ErroInline mensagem={erro} className="mt-2" />

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className={`${BOTAO_ACAO} flex-1 border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50`}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={salvando}
          className={`${BOTAO_ACAO} flex-1 bg-neutral-900 text-white hover:bg-neutral-800`}
        >
          {salvando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {salvando ? 'Salvando...' : 'Salvar fatura'}
        </button>
      </div>
    </form>
  );
}

export default function RedeFaturas({ rede, faturas, onAtualizar }: Props) {
  const { showConfirm, showAlert } = useCustomAlert();
  const [filtro, setFiltro] = useState<FiltroFatura>('todas');
  const [formAberto, setFormAberto] = useState(false);
  const [faturaEditando, setFaturaEditando] = useState<FaturaSaaS | null>(null);
  const [processandoId, setProcessandoId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const formularioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!formAberto) return;
    formularioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [formAberto, faturaEditando]);

  const resumo = useMemo(() => {
    let aberto = 0;
    let vencido = 0;
    let pago = 0;
    for (const fatura of faturas) {
      if (fatura.status === 'aberta') {
        aberto += fatura.valor_centavos;
        if (faturaVencida(fatura)) vencido += fatura.valor_centavos;
      } else if (fatura.status === 'paga') {
        pago += fatura.valor_centavos;
      }
    }
    return { aberto, vencido, pago };
  }, [faturas]);

  const filtradas = useMemo(() => {
    if (filtro === 'todas') return faturas;
    if (filtro === 'abertas') return faturas.filter((fatura) => fatura.status === 'aberta');
    if (filtro === 'vencidas') return faturas.filter(faturaVencida);
    return faturas.filter((fatura) => fatura.status === 'paga');
  }, [faturas, filtro]);

  function abrirNova() {
    setFaturaEditando(null);
    setFormAberto(true);
    setErro(null);
  }

  function abrirEdicao(fatura: FaturaSaaS) {
    setFaturaEditando(fatura);
    setFormAberto(true);
    setErro(null);
  }

  function fecharFormulario() {
    setFormAberto(false);
    setFaturaEditando(null);
  }

  async function alterarStatus(fatura: FaturaSaaS, status: StatusFaturaSaaS) {
    if (status === fatura.status) return;
    if (status === 'cancelada') {
      const ok = await showConfirm(
        `Cancelar a fatura de ${formatarCompetencia(fatura.competencia)}? O valor deixa de contar como em aberto.`,
        { title: 'Cancelar fatura', confirmLabel: 'Cancelar fatura', cancelLabel: 'Voltar', type: 'warning' },
      );
      if (!ok) return;
    }

    setProcessandoId(fatura.id);
    setErro(null);
    try {
      const { error } = await supabase.rpc('saas_fatura_status', {
        p_id: fatura.id,
        p_status: status,
        p_pago_em: status === 'paga' ? hojeISO() : null,
        p_metodo: null,
      });
      if (error) throw error;
      await onAtualizar();
      void showAlert(
        status === 'paga'
          ? 'Fatura marcada como paga.'
          : status === 'cancelada'
            ? 'Fatura cancelada.'
            : 'Fatura reaberta.',
        { title: 'Fatura atualizada', type: 'success' },
      );
    } catch (falha) {
      const mensagem = mensagemDeErro(falha, 'Não foi possível atualizar a fatura.');
      setErro(mensagem);
      void showAlert(mensagem, { title: 'Não foi possível atualizar', type: 'error' });
    } finally {
      setProcessandoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900">Faturas da rede</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Cobranças por competência, com vencimento e situação.
          </p>
        </div>
        <button
          type="button"
          onClick={abrirNova}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"
        >
          <Plus size={15} /> Nova fatura
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="min-w-0 rounded-lg border border-neutral-200 bg-white px-2 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
            Em aberto
          </p>
          <p className="mt-0.5 truncate text-[13px] font-semibold tabular-nums text-neutral-900">
            {moeda(resumo.aberto)}
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-neutral-200 bg-white px-2 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Vencido</p>
          <p
            className={`mt-0.5 truncate text-[13px] font-semibold tabular-nums ${resumo.vencido > 0 ? 'text-rose-600' : 'text-neutral-900'}`}
          >
            {moeda(resumo.vencido)}
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-neutral-200 bg-white px-2 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
            Recebido
          </p>
          <p className="mt-0.5 truncate text-[13px] font-semibold tabular-nums text-emerald-700">
            {moeda(resumo.pago)}
          </p>
        </div>
      </div>

      <SegmentedControl
        value={filtro}
        onChange={setFiltro}
        options={OPCOES_FILTRO}
        className="w-full !h-11"
      />

      {erro && <ErroInline mensagem={erro} />}

      {formAberto && (
        <div ref={formularioRef}>
          <FormularioFatura
            key={faturaEditando?.id ?? 'nova'}
            rede={rede}
            fatura={faturaEditando}
            onCancelar={fecharFormulario}
            onSalvo={async () => {
              fecharFormulario();
              await onAtualizar();
            }}
          />
        </div>
      )}

      {faturas.length === 0 ? (
        <EstadoVazio
          icone={<FileText size={20} />}
          titulo="Nenhuma fatura cadastrada"
          descricao="A primeira fatura define a situação financeira da rede no painel — em aberto, em dia ou inadimplente."
          acao={
            <button
              type="button"
              onClick={abrirNova}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
            >
              <Plus size={15} /> Criar primeira fatura
            </button>
          }
        />
      ) : filtradas.length === 0 ? (
        <EstadoVazio
          icone={<FileText size={20} />}
          titulo="Nenhuma fatura neste filtro"
          descricao="Troque o filtro para ver as demais cobranças da rede."
          acao={
            <button
              type="button"
              onClick={() => setFiltro('todas')}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Ver todas
            </button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtradas.map((fatura) => {
            const vencida = faturaVencida(fatura);
            const atraso = diasAtraso(fatura.vencimento);
            const ocupado = processandoId === fatura.id;
            return (
              <li
                key={fatura.id}
                className={`rounded-xl border p-3 ${
                  vencida ? 'border-rose-200 bg-rose-50/30' : 'border-neutral-200 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">
                      {formatarCompetencia(fatura.competencia)}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11px] text-neutral-500">
                      <CalendarDays size={11} className="shrink-0" />
                      Vence {formatarData(fatura.vencimento)}
                      {vencida && (
                        <span className="font-medium text-rose-600">
                          · vencida há {pluralizar(atraso, 'dia', 'dias')}
                        </span>
                      )}
                    </p>
                  </div>
                  <ChipStatusFatura status={fatura.status} vencida={vencida} />
                </div>

                <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-base font-semibold tabular-nums text-neutral-900">
                    {moeda(fatura.valor_centavos)}
                  </span>
                  {fatura.status === 'paga' && fatura.pago_em && (
                    <span className="text-[11px] text-neutral-500">
                      Pago em {formatarData(fatura.pago_em)}
                      {fatura.metodo ? ` · ${fatura.metodo}` : ''}
                    </span>
                  )}
                </div>

                {fatura.observacao && (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-500">
                    {fatura.observacao}
                  </p>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {fatura.status === 'aberta' && (
                    <button
                      type="button"
                      onClick={() => alterarStatus(fatura, 'paga')}
                      disabled={ocupado}
                      className={`${BOTAO_ACAO} col-span-2 bg-neutral-900 text-white hover:bg-neutral-800`}
                    >
                      {ocupado ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={14} />
                      )}
                      Marcar como paga
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => abrirEdicao(fatura)}
                    disabled={ocupado}
                    className={`${BOTAO_ACAO} ${fatura.status === 'aberta' ? '' : 'col-span-2'} border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50`}
                  >
                    <Pencil size={13} /> Editar
                  </button>
                  {fatura.status === 'aberta' && (
                    <button
                      type="button"
                      onClick={() => alterarStatus(fatura, 'cancelada')}
                      disabled={ocupado}
                      className={`${BOTAO_ACAO} border border-neutral-200 bg-white text-neutral-500 hover:bg-rose-50 hover:text-rose-700`}
                    >
                      <Ban size={13} /> Cancelar
                    </button>
                  )}
                  {fatura.status === 'cancelada' && (
                    <button
                      type="button"
                      onClick={() => alterarStatus(fatura, 'aberta')}
                      disabled={ocupado}
                      className={`${BOTAO_ACAO} border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50`}
                    >
                      <RotateCcw size={13} /> Reabrir
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
