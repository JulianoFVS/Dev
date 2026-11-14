'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Building2, Loader2, Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import { mensagemDeErro } from '@/lib/saas';
import { ErroInline } from './Feedback';

type Props = {
  open: boolean;
  onClose: () => void;
  onCriada: (rede: { id: string; nome: string }) => void;
};

type RespostaCriarRede = { id?: string; nome?: string };

export default function ModalNovaRede({ open, onClose, onCriada }: Props) {
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNome('');
    setErro(null);
    setSalvando(false);
  }, [open]);

  function fechar() {
    if (salvando) return;
    onClose();
  }

  async function criar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    const nomeLimpo = nome.trim();
    if (!nomeLimpo) {
      setErro('Informe o nome da rede.');
      return;
    }
    setSalvando(true);
    try {
      const { data, error } = await supabase.rpc('saas_rede_criar', { p_nome: nomeLimpo });
      if (error) throw error;
      const criada = data as unknown as RespostaCriarRede | null;
      if (!criada?.id) throw new Error('A rede foi criada, mas o servidor não retornou o identificador.');
      onCriada({ id: criada.id, nome: criada.nome ?? nomeLimpo });
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Não foi possível criar a rede.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      maxWidth="md"
      hideCloseButton
      panelClassName="max-h-[90vh] overflow-hidden rounded-xl border border-neutral-200 bg-white"
    >
      <form onSubmit={criar} className="flex max-h-[90vh] flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-neutral-900">Nova rede</h2>
            <p className="mt-0.5 text-xs font-medium text-neutral-400">
              Cadastro avulso, sem clínica ou acesso. Para o onboarding completo use “Novo cliente”.
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-[#fafaf8] px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-neutral-500">
              <Building2 size={16} />
            </span>
            <p className="text-[11px] leading-relaxed text-neutral-500">
              Depois de criar, você poderá definir plano, mensalidade, contatos e faturas no
              detalhe da rede.
            </p>
          </div>

          <ErroInline mensagem={erro} className="mb-3" />

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">
              Nome da rede <span className="text-rose-500">*</span>
            </span>
            <input
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              className="box-border h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
              placeholder="Ex.: Clínica Sorrir"
              required
              autoFocus
            />
          </label>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-black/5 px-5 py-4">
          <button
            type="button"
            onClick={fechar}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {salvando ? 'Criando...' : 'Criar rede'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
