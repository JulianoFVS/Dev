'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Building2,
  Check,
  Copy,
  Loader2,
  UserPlus,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { enviarArquivoClinica } from '@/lib/armazenamento';
import { UF_OPTIONS } from '@/lib/formOptions';
import { mascaraCep, mascaraTelefone } from '@/lib/mascaras';
import { mensagemDeErro } from '@/lib/saas';
import Modal from '@/components/ui/Modal';
import CustomSelect from '@/components/ui/CustomSelect';
import { ErroInline } from './Feedback';

type Props = {
  open: boolean;
  onClose: () => void;
  onCriado: () => void;
};

type FormularioCliente = {
  nomeRede: string;
  nomeMatriz: string;
  nomeDono: string;
  emailDono: string;
  telefone: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

type Credenciais = {
  rede: string;
  email: string;
  senha: string;
};

type RespostaOnboarding = {
  success?: boolean;
  error?: string;
  rede_id?: string;
  clinica_id?: number;
  rede_nome?: string;
  email?: string;
  senha_temporaria?: string;
};

type RespostaViaCep = {
  erro?: boolean;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

const FORM_VAZIO: FormularioCliente = {
  nomeRede: '',
  nomeMatriz: '',
  nomeDono: '',
  emailDono: '',
  telefone: '',
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
};

const CAMPO =
  'box-border h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 disabled:bg-neutral-50';
const ROTULO = 'mb-1.5 block text-xs font-medium text-neutral-500';

export default function ModalNovoCliente({ open, onClose, onCriado }: Props) {
  const [form, setForm] = useState<FormularioCliente>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);
  const [copiado, setCopiado] = useState<'email' | 'senha' | 'tudo' | null>(null);
  const [logoArquivo, setLogoArquivo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [cepAviso, setCepAviso] = useState<string | null>(null);
  const previewUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(FORM_VAZIO);
    setErro(null);
    setAviso(null);
    setCepAviso(null);
    setCredenciais(null);
    setCopiado(null);
    setLogoArquivo(null);
    setLogoPreview('');
    if (previewUrl.current) {
      URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    };
  }, []);

  function atualizar<C extends keyof FormularioCliente>(campo: C, valor: FormularioCliente[C]) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function escolherFoto(arquivo?: File) {
    if (!arquivo) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(arquivo.type)) {
      setErro('Use uma imagem JPG, PNG ou WebP.');
      return;
    }
    if (arquivo.size > 2 * 1024 * 1024) {
      setErro('A foto deve ter no máximo 2MB.');
      return;
    }
    setErro(null);
    setLogoArquivo(arquivo);
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    const url = URL.createObjectURL(arquivo);
    previewUrl.current = url;
    setLogoPreview(url);
  }

  async function buscarCep(valor: string) {
    const cep = mascaraCep(valor);
    atualizar('cep', cep);
    setCepAviso(null);
    const digitos = cep.replace(/\D/g, '');
    if (digitos.length !== 8) return;
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
      if (!resposta.ok) throw new Error('CEP indisponível');
      const dados = (await resposta.json()) as RespostaViaCep;
      if (dados.erro) {
        setCepAviso('CEP não encontrado. Preencha o endereço manualmente.');
        return;
      }
      setForm((atual) => ({
        ...atual,
        cep,
        rua: dados.logradouro || atual.rua,
        bairro: dados.bairro || atual.bairro,
        cidade: dados.localidade || atual.cidade,
        uf: dados.uf || atual.uf,
      }));
    } catch {
      setCepAviso('Não foi possível buscar o CEP. Preencha o endereço manualmente.');
    }
  }

  async function tokenAtual() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || '';
  }

  async function publicarLogo(
    token: string,
    redeId: string,
    clinicaId: number,
    arquivo: File,
  ) {
    const extensao =
      arquivo.type === 'image/jpeg' ? 'jpg' : arquivo.type === 'image/webp' ? 'webp' : 'png';
    const caminho = `clinicas/${clinicaId}/logo-${Date.now()}.${extensao}`;
    const urlPublica = await enviarArquivoClinica(caminho, arquivo, {
      upsert: true,
      contentType: arquivo.type || undefined,
    });
    if (!urlPublica) throw new Error('Não foi possível publicar a foto.');
    const resposta = await fetch('/api/super-admin/rede', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        id: redeId,
        nome: form.nomeRede.trim(),
        clinicaId,
        logo_url: urlPublica,
      }),
    });
    const json = (await resposta.json().catch(() => ({}))) as { error?: string };
    if (!resposta.ok) throw new Error(json.error || 'A foto não foi salva.');
  }

  function fechar() {
    if (salvando) return;
    onClose();
  }

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErro(null);
    setAviso(null);

    const nomeRede = form.nomeRede.trim();
    const nomeMatriz = form.nomeMatriz.trim();
    const nomeDono = form.nomeDono.trim();
    const emailDono = form.emailDono.trim().toLowerCase();
    if (!nomeRede || !nomeMatriz || !nomeDono || !emailDono) {
      setErro('Preencha nome da rede, clínica inicial, nome e e-mail do dono.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailDono)) {
      setErro('Informe um e-mail válido para o dono.');
      return;
    }

    setSalvando(true);
    try {
      const token = await tokenAtual();
      if (!token) throw new Error('Sessão expirada. Entre novamente para continuar.');

      const resposta = await fetch('/api/super-admin/criar-cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nomeRede,
          nomeMatriz,
          nomeDono,
          emailDono,
          telefone: form.telefone,
          cep: form.cep,
          rua: form.rua,
          numero: form.numero,
          complemento: form.complemento,
          bairro: form.bairro,
          cidade: form.cidade,
          uf: form.uf,
        }),
      });
      const json = (await resposta.json().catch(() => ({}))) as RespostaOnboarding;
      if (!resposta.ok || !json.success) {
        throw new Error(json.error || 'Falha no onboarding do cliente.');
      }
      if (!json.rede_nome || !json.email || !json.senha_temporaria) {
        throw new Error('O cliente foi criado, mas as credenciais não foram retornadas.');
      }

      let avisoFoto: string | null = null;
      if (logoArquivo && json.rede_id && json.clinica_id != null) {
        try {
          await publicarLogo(token, json.rede_id, json.clinica_id, logoArquivo);
        } catch (falha) {
          avisoFoto = mensagemDeErro(
            falha,
            'O cliente foi criado, mas a foto da clínica não foi enviada.',
          );
        }
      }

      setCredenciais({
        rede: json.rede_nome,
        email: json.email,
        senha: json.senha_temporaria,
      });
      setAviso(avisoFoto);
      onCriado();
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Não foi possível criar o cliente.'));
    } finally {
      setSalvando(false);
    }
  }

  async function copiar(tipo: 'email' | 'senha' | 'tudo') {
    if (!credenciais) return;
    const texto =
      tipo === 'email'
        ? credenciais.email
        : tipo === 'senha'
          ? credenciais.senha
          : `Bem-vindo(a) à Ortus!\n\nRede: ${credenciais.rede}\nE-mail: ${credenciais.email}\nSenha temporária: ${credenciais.senha}\n\nNo primeiro acesso você será solicitado a trocar a senha.`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(tipo);
      window.setTimeout(() => setCopiado(null), 1800);
    } catch {
      setCopiado(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      maxWidth="2xl"
      hideCloseButton
      panelClassName="max-h-[90vh] overflow-hidden rounded-xl border border-neutral-200 bg-white"
    >
      {credenciais ? (
        <div className="flex flex-col px-5 py-4 sm:px-6 sm:py-5">
          <div className="mb-4 flex items-start justify-between gap-3 border-b border-black/5 pb-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-neutral-900">Cliente criado</h2>
              <p className="mt-0.5 text-xs font-medium text-neutral-400">
                {credenciais.rede}. Envie o acesso ao dono.
              </p>
            </div>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
            >
              <X size={17} />
            </button>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-neutral-500">E-mail</p>
                <p className="truncate text-sm text-neutral-900">{credenciais.email}</p>
              </div>
              <button
                type="button"
                onClick={() => copiar('email')}
                aria-label="Copiar e-mail"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-50"
              >
                {copiado === 'email' ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-neutral-500">Senha temporária</p>
                <p className="truncate font-mono text-sm text-neutral-900">{credenciais.senha}</p>
              </div>
              <button
                type="button"
                onClick={() => copiar('senha')}
                aria-label="Copiar senha"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-50"
              >
                {copiado === 'senha' ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-neutral-500">
              No primeiro acesso o dono troca a senha. Guarde ou envie estes dados agora.
            </p>
            {aviso && <ErroInline mensagem={aviso} />}
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 border-t border-black/5 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => copiar('tudo')}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              {copiado === 'tudo' ? <Check size={15} /> : <Copy size={15} />}
              {copiado === 'tudo' ? 'Copiado' : 'Copiar mensagem'}
            </button>
            <button
              type="button"
              onClick={fechar}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Concluir
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={salvar} className="flex max-h-[90vh] flex-col">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3f4f1] text-neutral-600">
                  <UserPlus size={16} />
                </span>
                <h2 className="text-lg font-semibold text-neutral-900">Novo cliente</h2>
              </div>
              <p className="mt-1 text-xs font-medium text-neutral-400">
                Cria rede, clínica matriz e acesso do dono em um único passo.
              </p>
            </div>
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
            >
              <X size={17} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <ErroInline mensagem={erro} className="mb-3" />

            <div className="mb-4 flex items-center gap-3 rounded-lg border border-neutral-200 bg-[#fafaf8] px-3 py-2.5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-white text-neutral-400">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- pré-visualização local antes do upload
                  <img src={logoPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Building2 size={18} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={ROTULO}>Foto da clínica</p>
                <p className="text-[11px] text-neutral-400">JPG, PNG ou WebP até 2MB</p>
              </div>
              <label className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center rounded-lg border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50">
                Escolher
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    escolherFoto(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className={ROTULO}>
                  Nome da rede <span className="text-rose-500">*</span>
                </span>
                <input
                  value={form.nomeRede}
                  onChange={(event) => atualizar('nomeRede', event.target.value)}
                  className={CAMPO}
                  placeholder="Ex.: Clínica Sorrir"
                  required
                />
              </label>
              <label className="block">
                <span className={ROTULO}>
                  Clínica inicial <span className="text-rose-500">*</span>
                </span>
                <input
                  value={form.nomeMatriz}
                  onChange={(event) => atualizar('nomeMatriz', event.target.value)}
                  className={CAMPO}
                  placeholder="Ex.: Sorrir Centro"
                  required
                />
              </label>
              <label className="block">
                <span className={ROTULO}>Telefone</span>
                <input
                  value={form.telefone}
                  onChange={(event) => atualizar('telefone', mascaraTelefone(event.target.value))}
                  className={CAMPO}
                  placeholder="(11) 99999-0000"
                  inputMode="tel"
                />
              </label>
              <label className="block">
                <span className={ROTULO}>CEP</span>
                <input
                  value={form.cep}
                  onChange={(event) => void buscarCep(event.target.value)}
                  className={CAMPO}
                  placeholder="00000-000"
                  inputMode="numeric"
                />
                {cepAviso && <span className="mt-1 block text-[11px] text-amber-600">{cepAviso}</span>}
              </label>
              <div>
                <span className={ROTULO}>UF</span>
                <CustomSelect
                  value={form.uf}
                  onChange={(uf) => atualizar('uf', uf)}
                  options={UF_OPTIONS.filter((opcao) => opcao.value)}
                  placeholder="Selecione..."
                  triggerClassName="!h-11"
                  size="md"
                  searchable
                />
              </div>
              <label className="block sm:col-span-2">
                <span className={ROTULO}>Rua</span>
                <input
                  value={form.rua}
                  onChange={(event) => atualizar('rua', event.target.value)}
                  className={CAMPO}
                />
              </label>
              <label className="block">
                <span className={ROTULO}>Número</span>
                <input
                  value={form.numero}
                  onChange={(event) => atualizar('numero', event.target.value)}
                  className={CAMPO}
                />
              </label>
              <label className="block">
                <span className={ROTULO}>Complemento</span>
                <input
                  value={form.complemento}
                  onChange={(event) => atualizar('complemento', event.target.value)}
                  className={CAMPO}
                />
              </label>
              <label className="block">
                <span className={ROTULO}>Bairro</span>
                <input
                  value={form.bairro}
                  onChange={(event) => atualizar('bairro', event.target.value)}
                  className={CAMPO}
                />
              </label>
              <label className="block">
                <span className={ROTULO}>Cidade</span>
                <input
                  value={form.cidade}
                  onChange={(event) => atualizar('cidade', event.target.value)}
                  className={CAMPO}
                />
              </label>
              <label className="block">
                <span className={ROTULO}>
                  Nome do dono <span className="text-rose-500">*</span>
                </span>
                <input
                  value={form.nomeDono}
                  onChange={(event) => atualizar('nomeDono', event.target.value)}
                  className={CAMPO}
                  placeholder="Ex.: Dr. João Silva"
                  required
                />
              </label>
              <label className="block">
                <span className={ROTULO}>
                  E-mail do dono <span className="text-rose-500">*</span>
                </span>
                <input
                  type="email"
                  value={form.emailDono}
                  onChange={(event) => atualizar('emailDono', event.target.value)}
                  className={CAMPO}
                  placeholder="dono@clinica.com"
                  inputMode="email"
                  autoComplete="off"
                  required
                />
              </label>
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-black/5 px-5 py-4 sm:px-6">
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
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {salvando ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
              {salvando ? 'Criando cliente...' : 'Criar cliente'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
