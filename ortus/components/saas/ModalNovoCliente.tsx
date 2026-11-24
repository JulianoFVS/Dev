'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { mascaraTelefone } from '@/lib/mascaras';
import { mensagemDeErro } from '@/lib/saas';
import Modal from '@/components/ui/Modal';
import { ErroInline, SucessoInline } from './Feedback';

type Props = {
  open: boolean;
  onClose: () => void;
  onCriado: (rede: { id: string; nome: string }) => void;
};

type Credenciais = {
  redeId: string;
  nome: string;
  email: string;
  senha: string;
};

const CAMPO = 'h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 disabled:bg-neutral-50';
const ROTULO = 'mb-1.5 block text-xs font-medium text-neutral-500';

export default function ModalNovoCliente({ open, onClose, onCriado }: Props) {
  const [nome, setNome] = useState('');
  const [filial, setFilial] = useState('');
  const [dentista, setDentista] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome('');
    setFilial('');
    setDentista('');
    setEmail('');
    setTelefone('');
    setSalvando(false);
    setErro(null);
    setCredenciais(null);
    setCopiado(false);
  }, [open]);

  function fechar() {
    if (salvando) return;
    onClose();
  }

  async function criar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    const nomeClinica = nome.trim();
    const nomeDentista = dentista.trim();
    const emailDentista = email.trim().toLowerCase();
    if (!nomeClinica || !nomeDentista || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailDentista)) {
      setErro('Informe o nome da clínica, o nome do dentista e um e-mail válido.');
      return;
    }
    setSalvando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Sessão expirada. Entre novamente para continuar.');
      const resposta = await fetch('/api/super-admin/criar-cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nomeRede: nomeClinica,
          nomeMatriz: filial.trim() || nomeClinica,
          nomeDono: nomeDentista,
          emailDono: emailDentista,
          telefone,
        }),
      });
      const json = (await resposta.json().catch(() => ({}))) as {
        error?: string;
        rede_id?: string;
        email?: string;
        senha_temporaria?: string;
      };
      if (!resposta.ok || !json.rede_id) throw new Error(json.error || 'Não foi possível criar a clínica.');
      setCredenciais({
        redeId: json.rede_id,
        nome: nomeClinica,
        email: json.email || emailDentista,
        senha: json.senha_temporaria || '',
      });
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Não foi possível criar a clínica.'));
    } finally {
      setSalvando(false);
    }
  }

  async function copiarSenha() {
    if (!credenciais?.senha) return;
    try {
      await navigator.clipboard.writeText(credenciais.senha);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <Modal open={open} onClose={fechar} maxWidth="md" hideCloseButton panelClassName="rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-black/5 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-900">Nova clínica</h2>
          <p className="mt-0.5 text-sm text-neutral-500">A clínica raiz e o login do dentista.</p>
        </div>
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
        >
          <X size={16} />
        </button>
      </div>

      {credenciais ? (
        <div className="px-4 py-3 sm:px-5">
          <SucessoInline mensagem={`${credenciais.nome} foi criada.`} />
          <p className="mt-3 text-sm text-neutral-600">
            Entregue esta senha ao dentista. No primeiro acesso o Ortus pede para trocá-la.
          </p>
          <dl className="mt-3 grid gap-2">
            <div>
              <dt className={ROTULO}>E-mail</dt>
              <dd className="truncate text-sm text-neutral-900">{credenciais.email}</dd>
            </div>
            <div>
              <dt className={ROTULO}>Senha temporária</dt>
              <dd className="flex items-center gap-2">
                <span className="font-mono text-sm text-neutral-900">{credenciais.senha}</span>
                <button
                  type="button"
                  onClick={() => void copiarSenha()}
                  className="inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  {copiado ? <Check size={14} /> : <Copy size={14} />}
                  {copiado ? 'Copiada' : 'Copiar'}
                </button>
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => onCriado({ id: credenciais.redeId, nome: credenciais.nome })}
              className="inline-flex h-10 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Abrir clínica
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => void criar(event)} className="px-4 py-3 sm:px-5">
          <ErroInline mensagem={erro} className="mb-3" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className={ROTULO}>Nome da clínica <span className="text-red-500">*</span></span>
              <input value={nome} onChange={(event) => setNome(event.target.value)} className={CAMPO} placeholder="Dente Top" required />
            </label>
            <label className="block">
              <span className={ROTULO}>Filial</span>
              <input value={filial} onChange={(event) => setFilial(event.target.value)} className={CAMPO} placeholder="Deixe vazio para só a clínica" />
            </label>
            <label className="block">
              <span className={ROTULO}>Nome do dentista <span className="text-red-500">*</span></span>
              <input value={dentista} onChange={(event) => setDentista(event.target.value)} className={CAMPO} placeholder="Dra. Ana Souza" required />
            </label>
            <label className="block">
              <span className={ROTULO}>E-mail <span className="text-red-500">*</span></span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={CAMPO} placeholder="ana@clinica.com" autoComplete="off" required />
            </label>
            <label className="block sm:col-span-2">
              <span className={ROTULO}>Telefone</span>
              <input value={telefone} onChange={(event) => setTelefone(mascaraTelefone(event.target.value))} className={CAMPO} placeholder="(11) 99999-0000" inputMode="tel" />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={fechar} className="inline-flex h-10 shrink-0 items-center justify-center rounded-md px-3 text-sm text-neutral-600 hover:bg-neutral-50">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
              {salvando && <Loader2 size={15} className="animate-spin" />}
              {salvando ? 'Criando...' : 'Criar clínica'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
