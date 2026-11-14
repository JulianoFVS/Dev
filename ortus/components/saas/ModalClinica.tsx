'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Building2, Loader2, Save, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import CustomSelect from '@/components/ui/CustomSelect';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { UF_OPTIONS } from '@/lib/formOptions';
import { mascaraCep } from '@/lib/mascaras';
import { mensagemDeErro, type ClinicaDaRedeSaaS } from '@/lib/saas';
import { ErroInline } from './Feedback';

type Props = {
  open: boolean;
  redeId: string;
  clinica: ClinicaDaRedeSaaS | null;
  onClose: () => void;
  onSalvo: () => Promise<void> | void;
};

type Formulario = {
  nome: string;
  telefone: string;
  email: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  limiteGb: string;
};

const VAZIO: Formulario = {
  nome: '', telefone: '', email: '', cep: '', rua: '', numero: '',
  complemento: '', bairro: '', cidade: '', uf: '', limiteGb: '',
};

function deClinica(clinica: ClinicaDaRedeSaaS | null): Formulario {
  if (!clinica) return { ...VAZIO };
  return {
    nome: clinica.nome ?? '',
    telefone: clinica.telefone ?? '',
    email: clinica.email ?? '',
    cep: clinica.cep ?? '',
    rua: clinica.rua ?? '',
    numero: clinica.numero ?? '',
    complemento: clinica.complemento ?? '',
    bairro: clinica.bairro ?? '',
    cidade: clinica.cidade ?? '',
    uf: clinica.uf ?? '',
    limiteGb: clinica.limite_armazenamento_mb
      ? String(Math.round((clinica.limite_armazenamento_mb / 1024) * 10) / 10).replace('.', ',')
      : '',
  };
}

/**
 * Cadastro e edição de uma unidade da rede.
 *
 * A escrita passa por `saas_clinica_salvar`, que exige `is_super_admin()`
 * no banco — a tela não é a barreira de segurança.
 */
export default function ModalClinica({ open, redeId, clinica, onClose, onSalvo }: Props) {
  const { showConfirm } = useCustomAlert();
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(deClinica(clinica));
    setErro(null);
    setSalvando(false);
    setExcluindo(false);
  }, [open, clinica]);

  const editando = clinica != null;

  function fechar() {
    if (salvando || excluindo) return;
    onClose();
  }

  function campo<K extends keyof Formulario>(chave: K, valor: Formulario[K]) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
  }

  function buscarCep(valor: string) {
    const cep = mascaraCep(valor);
    campo('cep', cep);
    const digitos = cep.replace(/\D/g, '');
    if (digitos.length !== 8) return;
    fetch(`https://viacep.com.br/ws/${digitos}/json/`)
      .then((r) => r.json())
      .then((dados) => {
        if (!dados || dados.erro) return;
        setForm((atual) => ({
          ...atual,
          rua: dados.logradouro || atual.rua,
          bairro: dados.bairro || atual.bairro,
          cidade: dados.localidade || atual.cidade,
          uf: dados.uf || atual.uf,
        }));
      })
      .catch(() => undefined);
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (salvando) return;
    setErro(null);

    const nome = form.nome.trim();
    if (!nome) {
      setErro('Informe o nome da clínica.');
      return;
    }

    const limiteMb = Number(form.limiteGb.replace(',', '.'));
    const dados: Record<string, unknown> = {
      nome,
      telefone: form.telefone,
      email: form.email,
      cep: form.cep,
      rua: form.rua,
      numero: form.numero,
      complemento: form.complemento,
      bairro: form.bairro,
      cidade: form.cidade,
      uf: form.uf,
    };
    if (editando && Number.isFinite(limiteMb) && limiteMb > 0) {
      dados.limite_armazenamento_mb = Math.round(limiteMb * 1024);
    }

    setSalvando(true);
    try {
      const { error } = await supabase.rpc('saas_clinica_salvar', {
        p_id: editando ? clinica.id : null,
        p_rede: redeId,
        p_dados: dados,
      });
      if (error) throw error;
      await onSalvo();
      onClose();
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Não foi possível salvar a clínica.'));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!clinica || excluindo) return;
    const ok = await showConfirm(
      `Remover a unidade "${clinica.nome}"? Pacientes, agenda e arquivos vinculados a ela também saem do ar.`,
      { title: 'Remover unidade', confirmLabel: 'Remover', cancelLabel: 'Voltar', type: 'error' },
    );
    if (!ok) return;

    setErro(null);
    setExcluindo(true);
    try {
      const { error } = await supabase.rpc('saas_clinica_excluir', { p_id: clinica.id });
      if (error) throw error;
      await onSalvo();
      onClose();
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Não foi possível remover a clínica.'));
    } finally {
      setExcluindo(false);
    }
  }

  const campoClasse =
    'box-border h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900';
  const rotuloClasse = 'mb-1.5 block text-xs font-medium text-neutral-500';

  return (
    <Modal
      open={open}
      onClose={fechar}
      maxWidth="lg"
      hideCloseButton
      panelClassName="max-h-[92dvh] overflow-hidden rounded-xl border border-neutral-200 bg-white sm:max-h-[90vh]"
    >
      <form onSubmit={salvar} className="flex max-h-[92dvh] flex-col sm:max-h-[90vh]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-neutral-900">
              {editando ? 'Editar unidade' : 'Nova unidade'}
            </h2>
            <p className="mt-0.5 text-xs font-medium text-neutral-400">
              {editando
                ? 'Endereço, contato e limite de armazenamento desta clínica.'
                : 'A nova filial entra nesta rede e já pode receber equipe e pacientes.'}
            </p>
          </div>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-[#fafaf8] px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-neutral-500">
              <Building2 size={16} />
            </span>
            <p className="text-[11px] leading-relaxed text-neutral-500">
              {editando
                ? 'O limite de armazenamento é por clínica, em GB. A matriz não pode ser removida.'
                : 'O nome aparece no seletor de clínicas da equipe.'}
            </p>
          </div>

          <ErroInline mensagem={erro} className="mb-3" />

          <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={rotuloClasse}>Nome da clínica <span className="text-rose-500">*</span></span>
              <input
                value={form.nome}
                onChange={(e) => campo('nome', e.target.value)}
                className={campoClasse}
                placeholder="Ex.: Sorrir Centro"
                required
                autoFocus
              />
            </label>

            <label>
              <span className={rotuloClasse}>Telefone</span>
              <input
                inputMode="tel"
                value={form.telefone}
                onChange={(e) => campo('telefone', e.target.value)}
                className={campoClasse}
                placeholder="(11) 99999-0000"
              />
            </label>

            <label>
              <span className={rotuloClasse}>E-mail</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => campo('email', e.target.value)}
                className={campoClasse}
                placeholder="contato@clinica.com"
              />
            </label>

            <label>
              <span className={rotuloClasse}>CEP</span>
              <input
                inputMode="numeric"
                value={form.cep}
                onChange={(e) => buscarCep(e.target.value)}
                className={campoClasse}
                placeholder="00000-000"
              />
            </label>

            <div>
              <span className={rotuloClasse}>UF</span>
              <CustomSelect
                value={form.uf}
                onChange={(uf) => campo('uf', uf)}
                options={UF_OPTIONS.filter((op) => op.value)}
                placeholder="Selecione..."
                size="md"
                triggerClassName="!h-11"
              />
            </div>

            <label className="sm:col-span-2">
              <span className={rotuloClasse}>Rua</span>
              <input
                value={form.rua}
                onChange={(e) => campo('rua', e.target.value)}
                className={campoClasse}
              />
            </label>

            <label>
              <span className={rotuloClasse}>Número</span>
              <input
                value={form.numero}
                onChange={(e) => campo('numero', e.target.value)}
                className={campoClasse}
              />
            </label>

            <label>
              <span className={rotuloClasse}>Complemento</span>
              <input
                value={form.complemento}
                onChange={(e) => campo('complemento', e.target.value)}
                className={campoClasse}
              />
            </label>

            <label>
              <span className={rotuloClasse}>Bairro</span>
              <input
                value={form.bairro}
                onChange={(e) => campo('bairro', e.target.value)}
                className={campoClasse}
              />
            </label>

            <label>
              <span className={rotuloClasse}>Cidade</span>
              <input
                value={form.cidade}
                onChange={(e) => campo('cidade', e.target.value)}
                className={campoClasse}
              />
            </label>

            {editando && (
              <label>
                <span className={rotuloClasse}>Armazenamento (GB)</span>
                <input
                  inputMode="decimal"
                  value={form.limiteGb}
                  onChange={(e) => campo('limiteGb', e.target.value.replace(/[^\d.,]/g, ''))}
                  className={campoClasse}
                  placeholder="1"
                />
              </label>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-black/5 px-4 py-4 sm:px-5">
          {editando && !clinica.is_matriz ? (
            <button
              type="button"
              onClick={excluir}
              disabled={excluindo || salvando}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              {excluindo ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              Remover
            </button>
          ) : (
            <span />
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={fechar}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando || excluindo}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {salvando ? 'Salvando...' : editando ? 'Salvar' : 'Criar unidade'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
