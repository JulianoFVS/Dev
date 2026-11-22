'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Building2, Check, Copy, Loader2, Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import CustomSelect from '@/components/ui/CustomSelect';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import {
  centavosParaDigitacao,
  digitarMoeda,
  digitosParaCentavos,
  mensagemDeErro,
  moeda,
  OPCOES_DIA_VENCIMENTO,
  PLANOS_SAAS,
  rotuloPlano,
  type ProfissionalDaRedeSaaS,
  type RedeDetalheSaaS,
  type ResumoAssinaturaRedeSaaS,
} from '@/lib/saas';
import { ESTADO_ASSINATURA_META } from '@/lib/assinaturas';
import { ErroInline, SkeletonBloco, SucessoInline } from './Feedback';

type Props = {
  redeId: string | null;
  detalhe: RedeDetalheSaaS | null;
  estado: ResumoAssinaturaRedeSaaS | null;
  carregando: boolean;
  erro: string | null;
  modo: 'inline' | 'tela';
  onFechar: () => void;
  onAtualizar: () => Promise<void>;
  onTentarNovamente: () => void;
};

const CAMPO = 'h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 disabled:bg-neutral-50';
const ROTULO = 'mb-1.5 block text-xs font-medium text-neutral-500';
const TITULO = 'text-base font-semibold text-neutral-900';

async function tokenDaSessao() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente para continuar.');
  return token;
}

function mesmosIds(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const conjunto = new Set(a);
  return b.every((id) => conjunto.has(id));
}

export default function PainelClinica({
  redeId,
  detalhe,
  estado,
  carregando,
  erro,
  modo,
  onFechar,
  onAtualizar,
  onTentarNovamente,
}: Props) {
  if (!redeId) {
    if (modo === 'tela') return null;
    return (
      <div className="flex min-h-[16rem] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white/70 px-6 py-8 text-center lg:min-h-0">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f3f4f1] text-neutral-500">
          <Building2 size={20} />
        </span>
        <p className="mt-3 text-sm font-medium text-neutral-900">Selecione uma clínica</p>
        <p className="mt-1 max-w-xs text-sm text-neutral-500">Abra uma clínica para criar filial, login e cuidar da assinatura.</p>
      </div>
    );
  }

  const nome = detalhe?.clinicas.find((c) => c.is_matriz)?.nome || detalhe?.rede.nome || 'Clínica';

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white ${modo === 'tela' ? 'h-full' : 'flex-1'}`}>
      <div className="flex shrink-0 items-center gap-1 border-b border-black/5 px-2 py-2 sm:px-3">
        {modo === 'tela' && (
          <button type="button" onClick={onFechar} aria-label="Voltar para a lista" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-neutral-900">{nome}</h2>
          <p className="truncate text-xs text-neutral-500">
            {rotuloPlano(detalhe?.rede.plano)} · {moeda(detalhe?.rede.valor_mensal_centavos)}/mês
          </p>
        </div>
        {modo === 'inline' && (
          <button type="button" onClick={onFechar} aria-label="Fechar clínica" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        {!detalhe ? (
          carregando ? (
            <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando clínica">
              <SkeletonBloco className="h-24 w-full" />
              <SkeletonBloco className="h-24 w-full" />
              <SkeletonBloco className="h-24 w-full" />
            </div>
          ) : (
            <div className="flex flex-col items-center px-4 py-8 text-center">
              <AlertTriangle size={18} className="text-rose-600" />
              <p className="mt-2 text-sm font-medium text-neutral-900">Não foi possível abrir esta clínica</p>
              <p className="mt-1 text-sm text-neutral-500">{erro || 'Tente de novo.'}</p>
              <button type="button" onClick={onTentarNovamente} className="mt-3 inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white">
                Tentar novamente
              </button>
            </div>
          )
        ) : (
          <Conteudo redeId={redeId} detalhe={detalhe} estado={estado} onAtualizar={onAtualizar} />
        )}
      </div>
    </div>
  );
}

function Conteudo({
  redeId,
  detalhe,
  estado,
  onAtualizar,
}: {
  redeId: string;
  detalhe: RedeDetalheSaaS;
  estado: ResumoAssinaturaRedeSaaS | null;
  onAtualizar: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Filiais redeId={redeId} detalhe={detalhe} onAtualizar={onAtualizar} />
      <Acessos redeId={redeId} detalhe={detalhe} onAtualizar={onAtualizar} />
      <Assinatura redeId={redeId} detalhe={detalhe} estado={estado} onAtualizar={onAtualizar} />
    </div>
  );
}

function Filiais({ redeId, detalhe, onAtualizar }: { redeId: string; detalhe: RedeDetalheSaaS; onAtualizar: () => Promise<void> }) {
  const { showConfirm, showAlert } = useCustomAlert();
  const [nome, setNome] = useState('');
  const [pendente, setPendente] = useState<string | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState('');
  const [ocultas, setOcultas] = useState<number[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const clinicas = detalhe.clinicas.filter((c) => !ocultas.includes(c.id));

  async function adicionar() {
    const limpo = nome.trim();
    if (!limpo) {
      setErro('Informe o nome da filial.');
      return;
    }
    setErro(null);
    setNome('');
    setPendente(limpo);
    setOcupado(true);
    try {
      const { data, error } = await supabase.rpc('saas_clinica_salvar', {
        p_id: null,
        p_rede: redeId,
        p_dados: { nome: limpo },
      });
      if (error) throw error;
      const criada = data as { id?: number } | null;
      const novoId = Number(criada?.id);
      const admins = detalhe.profissionais.filter((p) => p.nivel_acesso === 'admin' && p.is_super_admin !== true);
      let dentistaEntrou = false;
      if (Number.isInteger(novoId) && novoId > 0 && admins.length) {
        const token = await tokenDaSessao();
        const respostas = await Promise.all(admins.map((admin) => fetch('/api/super-admin/acesso', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            profissionalId: admin.id,
            redeId,
            clinicas: [...new Set([...admin.clinicas_rede.map((c) => c.id), novoId])],
          }),
        })));
        dentistaEntrou = respostas.every((resposta) => resposta.ok);
      }
      setPendente(null);
      await onAtualizar();
      void showAlert(
        dentistaEntrou ? `A filial "${limpo}" foi criada. O dentista já entra nela.` : `A filial "${limpo}" foi criada.`,
        { title: 'Filial criada', type: 'success' },
      );
    } catch (falha) {
      setNome(limpo);
      setPendente(null);
      setErro(mensagemDeErro(falha, 'Não foi possível criar a filial.'));
    } finally {
      setOcupado(false);
    }
  }

  async function renomear(id: number, matriz: boolean) {
    const limpo = nomeEdicao.trim();
    if (!limpo) {
      setErro('Informe o nome.');
      return;
    }
    setErro(null);
    setOcupado(true);
    try {
      const { error } = await supabase.rpc('saas_clinica_salvar', {
        p_id: id,
        p_rede: redeId,
        p_dados: { nome: limpo },
      });
      if (error) throw error;
      if (matriz) {
        const { error: redeErr } = await supabase.rpc('saas_rede_salvar', { p_id: redeId, p_dados: { nome: limpo } });
        if (redeErr) throw redeErr;
      }
      setEditando(null);
      await onAtualizar();
      void showAlert('Nome atualizado.', { title: 'Salvo', type: 'success' });
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Não foi possível renomear.'));
    } finally {
      setOcupado(false);
    }
  }

  async function apagar(id: number, nomeFilial: string) {
    const ok = await showConfirm(`Apagar a filial "${nomeFilial}"?`, {
      title: 'Apagar filial',
      confirmLabel: 'Apagar',
      cancelLabel: 'Cancelar',
      type: 'warning',
    });
    if (!ok) return;
    setOcultas((atual) => [...atual, id]);
    setErro(null);
    const { error } = await supabase.rpc('saas_clinica_excluir', { p_id: id });
    if (error) {
      setOcultas((atual) => atual.filter((item) => item !== id));
      setErro(mensagemDeErro(error, 'Não foi possível apagar a filial.'));
      return;
    }
    await onAtualizar();
    void showAlert(`A filial "${nomeFilial}" foi apagada.`, { title: 'Filial apagada', type: 'success' });
  }

  return (
    <section>
      <h3 className={TITULO}>Filiais</h3>
      <p className="mt-0.5 text-sm text-neutral-500">A raiz é a clínica principal. As outras unidades nascem aqui.</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {clinicas.map((clinica) => {
          const matriz = clinica.is_matriz === true;
          const aberto = editando === clinica.id;
          return (
            <li key={clinica.id} className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-2">
              {aberto ? (
                <input
                  value={nomeEdicao}
                  onChange={(event) => setNomeEdicao(event.target.value)}
                  className={`${CAMPO} min-w-0 flex-1`}
                  aria-label="Novo nome"
                />
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-neutral-900">{clinica.nome}</p>
                  <p className="text-xs text-neutral-500">{matriz ? 'Raiz' : 'Filial'}</p>
                </div>
              )}
              {aberto ? (
                <button type="button" disabled={ocupado} onClick={() => void renomear(clinica.id, matriz)} className="inline-flex h-10 shrink-0 items-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white disabled:opacity-50">
                  Salvar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setEditando(clinica.id); setNomeEdicao(clinica.nome); }}
                  className="inline-flex h-10 shrink-0 items-center rounded-md px-2 text-sm text-neutral-600 hover:bg-neutral-50"
                >
                  Renomear
                </button>
              )}
              {!matriz && !aberto && (
                <button type="button" onClick={() => void apagar(clinica.id, clinica.nome)} className="inline-flex h-10 shrink-0 items-center rounded-md px-2 text-sm text-rose-600 hover:bg-rose-50">
                  Apagar
                </button>
              )}
            </li>
          );
        })}
        {pendente && (
          <li className="rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-500">{pendente}</li>
        )}
      </ul>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="block min-w-0">
          <span className={ROTULO}>Nome da filial <span className="text-red-500">*</span></span>
          <input value={nome} onChange={(event) => setNome(event.target.value)} className={CAMPO} placeholder="Unidade Centro" />
        </label>
        <button type="button" disabled={ocupado} onClick={() => void adicionar()} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
          {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Adicionar
        </button>
      </div>
      <ErroInline mensagem={erro} className="mt-2" />
    </section>
  );
}

function Acessos({ redeId, detalhe, onAtualizar }: { redeId: string; detalhe: RedeDetalheSaaS; onAtualizar: () => Promise<void> }) {
  const pessoas = useMemo(
    () => detalhe.profissionais.filter((p) => p.is_super_admin !== true),
    [detalhe.profissionais],
  );
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [marcadas, setMarcadas] = useState<number[]>([]);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [senha, setSenha] = useState<{ email: string; senha: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  function alternar(id: number) {
    setMarcadas((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]));
  }

  async function criar() {
    setErro(null);
    if (!nome.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setErro('Informe o nome e um e-mail válido.');
      return;
    }
    if (marcadas.length === 0) {
      setErro('Selecione ao menos uma filial.');
      return;
    }
    setCriando(true);
    try {
      const token = await tokenDaSessao();
      const resposta = await fetch('/api/admin/criar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          cargo: 'Funcionário',
          clinicas: marcadas,
        }),
      });
      const json = (await resposta.json().catch(() => ({}))) as { error?: string; email?: string; senha_temporaria?: string };
      if (!resposta.ok) throw new Error(json.error || 'Não foi possível criar o login.');
      setSenha({ email: json.email || email.trim().toLowerCase(), senha: json.senha_temporaria || '' });
      setAberto(false);
      setNome('');
      setEmail('');
      setMarcadas([]);
      await onAtualizar();
    } catch (falha) {
      setErro(mensagemDeErro(falha, 'Não foi possível criar o login.'));
    } finally {
      setCriando(false);
    }
  }

  return (
    <section>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={TITULO}>Acessos</h3>
          <p className="mt-0.5 text-sm text-neutral-500">Cada login entra só nas filiais marcadas.</p>
        </div>
        <button type="button" onClick={() => { setAberto((atual) => !atual); setErro(null); }} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800">
          <Plus size={14} /> Novo
        </button>
      </div>

      {senha && (
        <div className="mt-2 rounded-md border border-neutral-200 px-3 py-2">
          <SucessoInline mensagem="Senha temporária, mostrada uma vez." />
          <p className="mt-2 truncate text-sm text-neutral-900">{senha.email}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-sm text-neutral-900">{senha.senha}</span>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(senha.senha).then(() => setCopiado(true)).catch(() => setCopiado(false))}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              {copiado ? <Check size={14} /> : <Copy size={14} />}
              {copiado ? 'Copiada' : 'Copiar'}
            </button>
          </div>
        </div>
      )}

      {aberto && (
        <div className="mt-2 rounded-md border border-neutral-200 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className={ROTULO}>Nome <span className="text-red-500">*</span></span>
              <input value={nome} onChange={(event) => setNome(event.target.value)} className={CAMPO} />
            </label>
            <label className="block">
              <span className={ROTULO}>E-mail <span className="text-red-500">*</span></span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={CAMPO} autoComplete="off" />
            </label>
          </div>
          <Marcadores clinicas={detalhe.clinicas} marcadas={marcadas} onAlternar={alternar} />
          <ErroInline mensagem={erro} className="mt-2" />
          <div className="mt-2 flex justify-end">
            <button type="button" disabled={criando} onClick={() => void criar()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50">
              {criando && <Loader2 size={14} className="animate-spin" />}
              Criar login
            </button>
          </div>
        </div>
      )}

      <ul className="mt-2 flex flex-col gap-2">
        {pessoas.length === 0 && <li className="text-sm text-neutral-500">Ninguém entra nesta clínica ainda.</li>}
        {pessoas.map((pessoa) => (
          <AcessoPessoa key={pessoa.id} redeId={redeId} pessoa={pessoa} clinicas={detalhe.clinicas} onAtualizar={onAtualizar} />
        ))}
      </ul>
    </section>
  );
}

function Marcadores({
  clinicas,
  marcadas,
  onAlternar,
}: {
  clinicas: RedeDetalheSaaS['clinicas'];
  marcadas: number[];
  onAlternar: (id: number) => void;
}) {
  return (
    <fieldset className="mt-2">
      <legend className={ROTULO}>Filiais <span className="text-red-500">*</span></legend>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {clinicas.map((clinica) => (
          <label key={clinica.id} className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-neutral-200 px-3 text-sm text-neutral-900">
            <input
              type="checkbox"
              checked={marcadas.includes(clinica.id)}
              onChange={() => onAlternar(clinica.id)}
              className="h-4 w-4 accent-neutral-900"
            />
            <span className="truncate">{clinica.nome}</span>
            <span className="shrink-0 text-xs text-neutral-400">{clinica.is_matriz ? 'raiz' : 'filial'}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function AcessoPessoa({
  redeId,
  pessoa,
  clinicas,
  onAtualizar,
}: {
  redeId: string;
  pessoa: ProfissionalDaRedeSaaS;
  clinicas: RedeDetalheSaaS['clinicas'];
  onAtualizar: () => Promise<void>;
}) {
  const origem = pessoa.clinicas_rede.map((c) => c.id);
  const [marcadas, setMarcadas] = useState<number[]>(origem);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const dentista = pessoa.nivel_acesso === 'admin';
  const mudou = !mesmosIds(marcadas, origem);

  useEffect(() => {
    setMarcadas(pessoa.clinicas_rede.map((c) => c.id));
  }, [pessoa]);

  function alternar(id: number) {
    setMarcadas((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]));
    setErro(null);
  }

  async function salvar() {
    if (marcadas.length === 0) {
      setErro('Selecione ao menos uma filial.');
      return;
    }
    const anterior = origem;
    setSalvando(true);
    setErro(null);
    try {
      const token = await tokenDaSessao();
      const resposta = await fetch('/api/super-admin/acesso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ profissionalId: pessoa.id, redeId, clinicas: marcadas }),
      });
      const json = (await resposta.json().catch(() => ({}))) as { error?: string };
      if (!resposta.ok) throw new Error(json.error || 'Não foi possível salvar o acesso.');
      await onAtualizar();
    } catch (falha) {
      setMarcadas(anterior);
      setErro(mensagemDeErro(falha, 'Não foi possível salvar o acesso.'));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <li className="rounded-md border border-neutral-200 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-neutral-900">{pessoa.nome}</p>
          <p className="truncate text-xs text-neutral-500">{pessoa.email || 'Sem e-mail'} · {dentista ? 'Dentista' : 'Funcionário'}</p>
        </div>
        {mudou && (
          <button type="button" disabled={salvando} onClick={() => void salvar()} className="inline-flex h-10 shrink-0 items-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        )}
      </div>
      <Marcadores clinicas={clinicas} marcadas={marcadas} onAlternar={alternar} />
      <ErroInline mensagem={erro} className="mt-2" />
    </li>
  );
}

function Assinatura({
  redeId,
  detalhe,
  estado,
  onAtualizar,
}: {
  redeId: string;
  detalhe: RedeDetalheSaaS;
  estado: ResumoAssinaturaRedeSaaS | null;
  onAtualizar: () => Promise<void>;
}) {
  const { showConfirm, showAlert } = useCustomAlert();
  const rede = detalhe.rede;
  const [plano, setPlano] = useState(rede.plano || 'essencial');
  const [valor, setValor] = useState(centavosParaDigitacao(rede.valor_mensal_centavos));
  const [dia, setDia] = useState(String(rede.dia_vencimento || 10));
  const [motivo, setMotivo] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const meta = estado ? ESTADO_ASSINATURA_META[estado.estado] : null;
  const opcoes = useMemo(() => {
    const lista = [...PLANOS_SAAS];
    if (rede.plano && !lista.some((item) => item.value === rede.plano)) lista.push({ value: rede.plano, label: rotuloPlano(rede.plano) });
    return lista;
  }, [rede.plano]);

  useEffect(() => {
    setPlano(rede.plano || 'essencial');
    setValor(centavosParaDigitacao(rede.valor_mensal_centavos));
    setDia(String(rede.dia_vencimento || 10));
  }, [rede.id, rede.plano, rede.valor_mensal_centavos, rede.dia_vencimento]);

  async function salvar() {
    const diaNumero = Number(dia);
    if (!Number.isInteger(diaNumero) || diaNumero < 1 || diaNumero > 28) {
      setErro('Escolha um dia de vencimento entre 1 e 28.');
      return;
    }
    setOcupado('salvar');
    setErro(null);
    const { error } = await supabase.rpc('saas_rede_salvar', {
      p_id: redeId,
      p_dados: { plano, valor_mensal_centavos: digitosParaCentavos(valor), dia_vencimento: diaNumero },
    });
    if (error) setErro(mensagemDeErro(error, 'Não foi possível salvar a assinatura.'));
    else {
      await onAtualizar();
      void showAlert('Plano e valor atualizados.', { title: 'Assinatura salva', type: 'success' });
    }
    setOcupado(null);
  }

  async function cancelar() {
    if (!motivo.trim()) {
      setErro('Informe o motivo do cancelamento.');
      return;
    }
    const ok = await showConfirm('A clínica para de ser cobrada e a equipe fica em modo de consulta. Nada é apagado.', {
      title: 'Cancelar a assinatura?',
      confirmLabel: 'Cancelar assinatura',
      cancelLabel: 'Voltar',
      type: 'warning',
    });
    if (!ok) return;
    setOcupado('cancelar');
    setErro(null);
    const { error } = await supabase.rpc('saas_assinatura_cancelar', { p_rede: redeId, p_motivo: motivo.trim() });
    if (error) setErro(mensagemDeErro(error, 'Não foi possível cancelar.'));
    else {
      setCancelando(false);
      setMotivo('');
      await onAtualizar();
      void showAlert('Assinatura cancelada.', { title: 'Cancelada', type: 'success' });
    }
    setOcupado(null);
  }

  async function reativar() {
    setOcupado('reativar');
    setErro(null);
    const { error } = await supabase.rpc('saas_assinatura_reativar', { p_rede: redeId });
    if (error) setErro(mensagemDeErro(error, 'Não foi possível reativar.'));
    else {
      await onAtualizar();
      void showAlert('Assinatura reativada.', { title: 'Reativada', type: 'success' });
    }
    setOcupado(null);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className={TITULO}>Assinatura</h3>
        {meta && (
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.chip}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.ponto}`} />
            {meta.rotulo}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-sm text-neutral-500">O plano e o valor valem para esta clínica e para as filiais dela.</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <span className={ROTULO}>Plano</span>
          <CustomSelect value={plano} onChange={setPlano} options={opcoes} placeholder="Plano" triggerClassName="!h-10 !rounded-md" size="md" />
        </div>
        <label className="block">
          <span className={ROTULO}>Valor mensal</span>
          <span className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">R$</span>
            <input value={valor} onChange={(event) => setValor(digitarMoeda(event.target.value))} inputMode="numeric" className={`${CAMPO} pl-9 tabular-nums`} />
          </span>
        </label>
        <div>
          <span className={ROTULO}>Vencimento</span>
          <CustomSelect value={dia} onChange={setDia} options={OPCOES_DIA_VENCIMENTO} placeholder="Dia" triggerClassName="!h-10 !rounded-md" size="md" />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        {estado?.estado === 'cancelada' ? (
          <button type="button" disabled={ocupado !== null} onClick={() => void reativar()} className="inline-flex h-10 items-center rounded-md border border-neutral-200 px-3 text-sm text-neutral-800 hover:bg-neutral-50 disabled:opacity-50">
            Reativar
          </button>
        ) : (
          <button type="button" onClick={() => { setCancelando((atual) => !atual); setErro(null); }} className="inline-flex h-10 items-center rounded-md px-3 text-sm text-rose-600 hover:bg-rose-50">
            Cancelar assinatura
          </button>
        )}
        <button type="button" disabled={ocupado !== null} onClick={() => void salvar()} className="inline-flex h-10 items-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-50">
          {ocupado === 'salvar' ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
      {cancelando && estado?.estado !== 'cancelada' && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="block">
            <span className={ROTULO}>Motivo <span className="text-red-500">*</span></span>
            <input value={motivo} onChange={(event) => setMotivo(event.target.value)} className={CAMPO} placeholder="Por que a assinatura acaba" />
          </label>
          <button type="button" disabled={ocupado !== null} onClick={() => void cancelar()} className="inline-flex h-10 items-center justify-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white disabled:opacity-50">
            Confirmar cancelamento
          </button>
        </div>
      )}
      <ErroInline mensagem={erro} className="mt-2" />
    </section>
  );
}
