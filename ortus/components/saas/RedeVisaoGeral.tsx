'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import CustomSelect from '@/components/ui/CustomSelect';
import Switch from '@/components/ui/Switch';
import {
  centavosParaDigitacao,
  digitosParaCentavos,
  digitarMoeda,
  formatarData,
  mascaraCnpj,
  mensagemDeErro,
  OPCOES_DIA_VENCIMENTO,
  PLANOS_SAAS,
  rotuloPlano,
  type DadosRedeSaaS,
  type RedeComercialSaaS,
} from '@/lib/saas';
import { mascaraTelefone } from '@/lib/mascaras';
import { ErroInline, SucessoInline } from './Feedback';

type Props = {
  rede: RedeComercialSaaS;
  possuiClinicas: boolean;
  onSalvo: () => Promise<void>;
  onExcluir: () => Promise<void>;
};

type FormRede = {
  nome: string;
  plano: string;
  ativa: boolean;
  valor: string;
  diaVencimento: string;
  cnpj: string;
  contatoNome: string;
  contatoEmail: string;
  contatoTelefone: string;
  observacao: string;
};

const CAMPO =
  'box-border h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 disabled:bg-neutral-50';
const ROTULO = 'mb-1.5 block text-xs font-medium text-neutral-500';
const TITULO_SECAO =
  'text-[11px] font-semibold uppercase tracking-wide text-neutral-400';

function formularioDe(rede: RedeComercialSaaS): FormRede {
  return {
    nome: rede.nome ?? '',
    plano: rede.plano ?? 'essencial',
    ativa: rede.ativa !== false,
    valor: centavosParaDigitacao(rede.valor_mensal_centavos),
    diaVencimento: String(rede.dia_vencimento || 10),
    cnpj: rede.cnpj ?? '',
    contatoNome: rede.contato_nome ?? '',
    contatoEmail: rede.contato_email ?? '',
    contatoTelefone: rede.contato_telefone ?? '',
    observacao: rede.observacao ?? '',
  };
}

function textoOuNulo(valor: string): string | null {
  const limpo = valor.trim();
  return limpo ? limpo : null;
}

export default function RedeVisaoGeral({ rede, possuiClinicas, onSalvo, onExcluir }: Props) {
  const [form, setForm] = useState<FormRede>(() => formularioDe(rede));
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  useEffect(() => {
    if (!sucesso) return;
    const timer = window.setTimeout(() => setSucesso(null), 4000);
    return () => window.clearTimeout(timer);
  }, [sucesso]);

  const opcoesPlano = useMemo(() => {
    const opcoes = [...PLANOS_SAAS];
    if (rede.plano && !opcoes.some((opcao) => opcao.value === rede.plano)) {
      opcoes.push({ value: rede.plano, label: rotuloPlano(rede.plano) });
    }
    return opcoes;
  }, [rede.plano]);

  function atualizar<C extends keyof FormRede>(campo: C, valor: FormRede[C]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    setSucesso(null);
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setSucesso(null);

    const nome = form.nome.trim();
    if (!nome) {
      setErro('Informe o nome da rede.');
      return;
    }
    const email = form.contatoEmail.trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setErro('Informe um e-mail de contato válido.');
      return;
    }
    const dia = Number(form.diaVencimento);
    if (!Number.isInteger(dia) || dia < 1 || dia > 28) {
      setErro('Escolha um dia de vencimento entre 1 e 28.');
      return;
    }

    setSalvando(true);
    try {
      const dados: DadosRedeSaaS = {
        nome,
        plano: form.plano,
        ativa: form.ativa,
        valor_mensal_centavos: digitosParaCentavos(form.valor),
        dia_vencimento: dia,
        cnpj: textoOuNulo(form.cnpj),
        contato_nome: textoOuNulo(form.contatoNome),
        contato_email: textoOuNulo(email),
        contato_telefone: textoOuNulo(form.contatoTelefone),
        observacao: textoOuNulo(form.observacao),
      };
      const { error } = await supabase.rpc('saas_rede_salvar', {
        p_id: rede.id,
        p_dados: dados,
      });
      if (error) throw error;
      await onSalvo();
      setSucesso('Dados da rede salvos.');
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Não foi possível salvar os dados da rede.'));
    } finally {
      setSalvando(false);
    }
  }

  async function apagar() {
    setErro(null);
    setExcluindo(true);
    try {
      await onExcluir();
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Não foi possível apagar a rede.'));
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-[#fafaf8] px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-neutral-900">Dados comerciais e contato</p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Plano, mensalidade e situação de cobrança da rede.
          </p>
        </div>
        <span className="shrink-0 text-[11px] text-neutral-400">
          Desde {formatarData(rede.created_at)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <label className="block">
          <span className={ROTULO}>
            Nome da rede <span className="text-rose-500">*</span>
          </span>
          <input
            value={form.nome}
            onChange={(event) => atualizar('nome', event.target.value)}
            className={CAMPO}
            placeholder="Ex.: Clínica Sorrir"
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={ROTULO}>Plano</span>
            <CustomSelect
              value={form.plano}
              onChange={(valor) => atualizar('plano', valor)}
              options={opcoesPlano}
              placeholder="Selecione..."
              triggerClassName="!h-11"
              size="md"
            />
          </div>
          <div>
            <span className={ROTULO}>Dia de vencimento</span>
            <CustomSelect
              value={form.diaVencimento}
              onChange={(valor) => atualizar('diaVencimento', valor)}
              options={OPCOES_DIA_VENCIMENTO}
              placeholder="Dia"
              triggerClassName="!h-11"
              size="md"
            />
          </div>
        </div>

        <label className="block">
          <span className={ROTULO}>Valor mensal</span>
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

        <Switch
          checked={form.ativa}
          onChange={(valor) => atualizar('ativa', valor)}
          disabled={salvando}
          className="w-full justify-between rounded-lg border border-neutral-200 px-3 py-2.5"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-neutral-900">Rede ativa</span>
            <span className="mt-0.5 block text-[11px] text-neutral-500">
              Desligada, a rede fica suspensa em modo de consulta: a equipe entra e lê, mas nada é gravado. Nenhum dado é apagado.
            </span>
          </span>
        </Switch>

        <p className={`${TITULO_SECAO} pt-1`}>Contato comercial</p>

        <label className="block">
          <span className={ROTULO}>Nome do contato</span>
          <input
            value={form.contatoNome}
            onChange={(event) => atualizar('contatoNome', event.target.value)}
            className={CAMPO}
            placeholder="Ex.: Mariana Souza"
          />
        </label>

        <label className="block">
          <span className={ROTULO}>E-mail do contato</span>
          <input
            type="email"
            value={form.contatoEmail}
            onChange={(event) => atualizar('contatoEmail', event.target.value)}
            className={CAMPO}
            placeholder="financeiro@clinica.com"
            inputMode="email"
            autoComplete="off"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={ROTULO}>Telefone</span>
            <input
              value={form.contatoTelefone}
              onChange={(event) =>
                atualizar('contatoTelefone', mascaraTelefone(event.target.value))
              }
              className={CAMPO}
              placeholder="(11) 99999-0000"
              inputMode="tel"
            />
          </label>
          <label className="block">
            <span className={ROTULO}>CNPJ</span>
            <input
              value={form.cnpj}
              onChange={(event) => atualizar('cnpj', mascaraCnpj(event.target.value))}
              className={CAMPO}
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
            />
          </label>
        </div>

        <label className="block">
          <span className={ROTULO}>Observações internas</span>
          <textarea
            value={form.observacao}
            onChange={(event) => atualizar('observacao', event.target.value)}
            rows={3}
            className="box-border w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
            placeholder="Combinações comerciais, histórico de negociação..."
          />
        </label>
      </div>

      <SucessoInline mensagem={sucesso} />
      <ErroInline mensagem={erro} />

      <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3">
        <p className="text-sm font-medium text-neutral-900">Apagar rede</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">
          {possuiClinicas
            ? 'Mova ou remova as clínicas desta rede antes de apagá-la.'
            : 'A rede e as faturas vinculadas serão removidas definitivamente.'}
        </p>
        <button
          type="button"
          onClick={apagar}
          disabled={possuiClinicas || excluindo || salvando}
          className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {excluindo ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          {excluindo ? 'Apagando...' : 'Apagar rede'}
        </button>
      </div>

      <div className="sticky bottom-0 -mx-3 flex flex-col gap-2 border-t border-black/5 bg-white/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex items-center justify-end gap-2">
          <button
            type="submit"
            disabled={salvando}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {salvando ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </form>
  );
}
