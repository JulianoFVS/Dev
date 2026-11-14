'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus, RefreshCw, ShieldCheck, UserPlus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import SaaSKpis from '@/components/saas/SaaSKpis';
import RedeLista from '@/components/saas/RedeLista';
import RedeDetalhe from '@/components/saas/RedeDetalhe';
import ClinicasSemRede from '@/components/saas/ClinicasSemRede';
import ModalNovaRede from '@/components/saas/ModalNovaRede';
import ModalNovoCliente from '@/components/saas/ModalNovoCliente';
import { SkeletonBloco } from '@/components/saas/Feedback';
import {
  mensagemDeErro,
  normalizarBusca,
  type OrdenacaoSaaS,
  type RedeDetalheSaaS,
  type RedeSaaS,
  type VisaoGeralSaaS,
} from '@/lib/saas';

type StatusAcesso = 'verificando' | 'autorizado' | 'negado' | 'erro';

function compararRedes(a: RedeSaaS, b: RedeSaaS, ordenacao: OrdenacaoSaaS): number {
  switch (ordenacao) {
    case 'nome_desc':
      return b.nome.localeCompare(a.nome, 'pt-BR', { sensitivity: 'base' });
    case 'clinicas_desc':
      return (
        b.clinicas - a.clinicas ||
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
      );
    case 'vencido_desc':
      return (
        b.vencido_centavos - a.vencido_centavos ||
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
      );
    case 'vencimento_asc': {
      const vencimentoA = a.proximo_vencimento ?? '9999-12-31';
      const vencimentoB = b.proximo_vencimento ?? '9999-12-31';
      return (
        vencimentoA.localeCompare(vencimentoB) ||
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
      );
    }
    case 'recentes':
      return (
        (b.created_at ?? '').localeCompare(a.created_at ?? '') ||
        a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
      );
    case 'nome_asc':
    default:
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
  }
}

function codigoDoErro(erro: unknown): string {
  if (!erro || typeof erro !== 'object') return '';
  const codigo = (erro as { code?: unknown }).code;
  return typeof codigo === 'string' ? codigo : '';
}

export default function SuperAdminPage() {
  const router = useRouter();
  const { showAlert, showConfirm } = useCustomAlert();

  const [statusAcesso, setStatusAcesso] = useState<StatusAcesso>('verificando');
  const [erroAcesso, setErroAcesso] = useState<string | null>(null);
  const [tentativaAcesso, setTentativaAcesso] = useState(0);

  const [visao, setVisao] = useState<VisaoGeralSaaS | null>(null);
  const [carregandoVisao, setCarregandoVisao] = useState(true);
  const [erroVisao, setErroVisao] = useState<string | null>(null);
  const requisicaoVisao = useRef(0);

  const [busca, setBusca] = useState('');
  const [ordenacao, setOrdenacao] = useState<OrdenacaoSaaS>('nome_asc');

  const [redeSelecionada, setRedeSelecionada] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<RedeDetalheSaaS | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);
  const requisicaoDetalhe = useRef(0);
  const selecionadaRef = useRef<string | null>(null);

  const [drawerMobile, setDrawerMobile] = useState(false);
  const [novaRedeAberta, setNovaRedeAberta] = useState(false);
  const [novoClienteAberto, setNovoClienteAberto] = useState(false);

  useEffect(() => {
    selecionadaRef.current = redeSelecionada;
  }, [redeSelecionada]);

  const tratarAcessoNegado = useCallback(
    (falha: unknown): boolean => {
      if (codigoDoErro(falha) !== '42501') return false;
      setStatusAcesso('negado');
      router.replace('/dashboard');
      return true;
    },
    [router],
  );

  const carregarVisao = useCallback(
    async (opcoes?: { silencioso?: boolean }) => {
      const geracao = ++requisicaoVisao.current;
      if (!opcoes?.silencioso) setCarregandoVisao(true);
      try {
        const { data, error } = await supabase.rpc('saas_visao_geral');
        if (geracao !== requisicaoVisao.current) return;
        if (error) throw error;
        const payload = data as unknown as VisaoGeralSaaS | null;
        if (!payload || !Array.isArray(payload.redes) || !payload.totais) {
          throw new Error('O servidor devolveu uma visão geral inesperada.');
        }
        setVisao(payload);
        setErroVisao(null);
      } catch (falha) {
        if (geracao !== requisicaoVisao.current) return;
        if (tratarAcessoNegado(falha)) return;
        setErroVisao(
          mensagemDeErro(falha, 'Não foi possível carregar a visão geral da plataforma.'),
        );
      } finally {
        if (geracao === requisicaoVisao.current) setCarregandoVisao(false);
      }
    },
    [tratarAcessoNegado],
  );

  const carregarDetalhe = useCallback(
    async (id: string, opcoes?: { silencioso?: boolean }) => {
      const geracao = ++requisicaoDetalhe.current;
      if (!opcoes?.silencioso) setCarregandoDetalhe(true);
      try {
        const { data, error } = await supabase.rpc('saas_rede_detalhe', { p_rede: id });
        if (geracao !== requisicaoDetalhe.current) return;
        if (error) throw error;
        const payload = data as unknown as RedeDetalheSaaS | null;
        if (!payload?.rede) throw new Error('A rede não foi encontrada.');
        setDetalhe(payload);
        setErroDetalhe(null);
      } catch (falha) {
        if (geracao !== requisicaoDetalhe.current) return;
        if (tratarAcessoNegado(falha)) return;
        setErroDetalhe(mensagemDeErro(falha, 'Não foi possível carregar os detalhes da rede.'));
      } finally {
        if (geracao === requisicaoDetalhe.current) setCarregandoDetalhe(false);
      }
    },
    [tratarAcessoNegado],
  );

  const atualizarTudo = useCallback(async () => {
    await carregarVisao({ silencioso: true });
    const id = selecionadaRef.current;
    if (id) await carregarDetalhe(id, { silencioso: true });
  }, [carregarVisao, carregarDetalhe]);

  // A autorização é decidida no banco: só renderiza o painel depois que a
  // consulta em `profissionais.is_super_admin` confirma o acesso.
  useEffect(() => {
    let cancelado = false;

    async function verificarAcesso() {
      setStatusAcesso('verificando');
      setErroAcesso(null);
      try {
        const {
          data: { session },
          error: erroSessao,
        } = await supabase.auth.getSession();
        if (cancelado) return;
        if (erroSessao) throw erroSessao;
        if (!session) {
          router.replace('/login');
          return;
        }

        const { data: perfilData, error: erroPerfil } = await supabase
          .from('profissionais')
          .select('is_super_admin')
          .eq('user_id', session.user.id)
          .single();
        if (cancelado) return;
        if (erroPerfil && erroPerfil.code !== 'PGRST116') throw erroPerfil;

        const perfil = perfilData as { is_super_admin?: boolean } | null;
        if (perfil?.is_super_admin !== true) {
          setStatusAcesso('negado');
          router.replace('/dashboard');
          return;
        }

        setStatusAcesso('autorizado');
        await carregarVisao();
      } catch (falha) {
        if (cancelado) return;
        setStatusAcesso('erro');
        setErroAcesso(
          mensagemDeErro(falha, 'Não foi possível confirmar seu acesso ao painel da plataforma.'),
        );
      }
    }

    void verificarAcesso();
    return () => {
      cancelado = true;
    };
  }, [router, carregarVisao, tentativaAcesso]);

  useEffect(() => {
    const consulta = window.matchMedia('(min-width: 768px)');
    const aoMudar = () => {
      if (consulta.matches) setDrawerMobile(false);
    };
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, []);

  const redes = visao?.redes ?? [];

  const redesFiltradas = useMemo(() => {
    const termo = normalizarBusca(busca);
    const lista = termo
      ? (visao?.redes ?? []).filter((rede) =>
          [rede.nome, rede.plano, rede.cnpj, rede.contato_nome, rede.contato_email].some((campo) =>
            normalizarBusca(campo).includes(termo),
          ),
        )
      : [...(visao?.redes ?? [])];
    return lista.sort((a, b) => compararRedes(a, b, ordenacao));
  }, [visao, busca, ordenacao]);

  const resumoSelecionado = useMemo(
    () => redes.find((rede) => rede.id === redeSelecionada) ?? null,
    [redes, redeSelecionada],
  );

  function abrirNoDispositivo(id: string) {
    const telaPequena =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    if (id === redeSelecionada && detalhe) {
      if (telaPequena) setDrawerMobile(true);
      return;
    }
    setRedeSelecionada(id);
    setDetalhe(null);
    setErroDetalhe(null);
    setDrawerMobile(telaPequena);
    void carregarDetalhe(id);
  }

  function fecharDetalhe() {
    requisicaoDetalhe.current += 1;
    setDrawerMobile(false);
    setRedeSelecionada(null);
    setDetalhe(null);
    setErroDetalhe(null);
  }

  function atualizarPainel() {
    void carregarVisao();
    if (redeSelecionada) void carregarDetalhe(redeSelecionada, { silencioso: true });
  }

  async function aoCriarRede(rede: { id: string; nome: string }) {
    const telaPequena =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    setNovaRedeAberta(false);
    setRedeSelecionada(rede.id);
    setDetalhe(null);
    setErroDetalhe(null);
    setDrawerMobile(telaPequena);
    await carregarVisao({ silencioso: true });
    await carregarDetalhe(rede.id, { silencioso: true });
    await showAlert(
      `Rede "${rede.nome}" criada. Defina plano e mensalidade para começar a faturar.`,
      { title: 'Rede criada', type: 'success' },
    );
  }

  async function excluirRedeSelecionada() {
    const id = redeSelecionada;
    if (!id) return;
    const nome = detalhe?.rede.nome ?? resumoSelecionado?.nome ?? 'esta rede';
    const confirmado = await showConfirm(
      `Apagar a rede "${nome}"? Esta ação não pode ser desfeita.`,
      { title: 'Apagar rede', confirmLabel: 'Apagar', cancelLabel: 'Cancelar', type: 'warning' },
    );
    if (!confirmado) return;

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Sessão expirada. Entre novamente para continuar.');
      const resposta = await fetch('/api/super-admin/rede', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const json = (await resposta.json().catch(() => ({}))) as { error?: string };
      if (!resposta.ok) throw new Error(json.error || 'Não foi possível apagar a rede.');
      fecharDetalhe();
      await carregarVisao({ silencioso: true });
      await showAlert(`A rede "${nome}" foi apagada.`, {
        title: 'Rede removida',
        type: 'success',
      });
    } catch (falha) {
      throw new Error(mensagemDeErro(falha, 'Não foi possível apagar a rede.'));
    }
  }

  if (statusAcesso !== 'autorizado') {
    return (
      <div
        className="flex flex-col gap-3 px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5 lg:min-h-0 lg:flex-1"
        aria-busy={statusAcesso === 'verificando'}
      >
        {statusAcesso === 'erro' ? (
          <div className="mx-auto mt-6 w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <AlertTriangle size={18} />
            </span>
            <h1 className="mt-3 text-base font-semibold text-neutral-900">
              Não foi possível confirmar o acesso
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-neutral-500">{erroAcesso}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => setTentativaAcesso((atual) => atual + 1)}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={() => router.replace('/dashboard')}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Voltar ao dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3" aria-label="Verificando acesso ao painel">
            <div>
              <SkeletonBloco className="h-8 w-48" />
              <SkeletonBloco className="mt-2 h-4 w-72 max-w-full" />
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, indice) => (
                <SkeletonBloco key={indice} className="h-[76px] w-full rounded-xl" />
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <SkeletonBloco className="h-72 w-full rounded-xl" />
              <SkeletonBloco className="hidden h-72 w-full rounded-xl md:block" />
            </div>
            <span className="sr-only">Verificando seu acesso de dono da plataforma...</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-2.5 pb-28 pt-2.5 font-poppins sm:px-3 md:px-4 md:pt-3 lg:h-full lg:min-h-0 lg:flex-1 lg:gap-3.5 lg:overflow-hidden lg:pb-4 lg:pt-3.5">
      <header className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[1.75rem]">
                Painel SaaS
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-500">
                <ShieldCheck size={12} /> Donos da plataforma
              </span>
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              Redes, clínicas, equipes e financeiro de toda a plataforma.
            </p>
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={atualizarPainel}
              disabled={carregandoVisao}
              aria-label="Atualizar dados da plataforma"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 disabled:opacity-50"
            >
              <RefreshCw size={16} className={carregandoVisao ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => setNovaRedeAberta(true)}
              className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:flex-none"
            >
              <Plus size={15} className="hidden sm:block" />
              <span className="truncate">Nova rede</span>
            </button>
            <button
              type="button"
              onClick={() => setNovoClienteAberto(true)}
              className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 sm:flex-none"
            >
              <UserPlus size={15} className="hidden sm:block" />
              <span className="truncate">Novo cliente</span>
            </button>
          </div>
        </div>

        <SaaSKpis totais={visao?.totais ?? null} carregando={carregandoVisao} />
      </header>

      {erroVisao && (
        <div
          role="alert"
          className="flex shrink-0 flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-2 text-xs font-medium text-rose-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="min-w-0">{erroVisao}</span>
          </p>
          <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => void carregarVisao()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-rose-200 bg-white px-2.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
            >
              Tentar novamente
            </button>
            <button
              type="button"
              onClick={() => setErroVisao(null)}
              aria-label="Ocultar aviso de erro"
              className="flex h-11 w-11 items-center justify-center rounded-md text-rose-500 hover:bg-rose-100"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 md:grid md:grid-cols-2 md:items-start lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">
        <div className="flex min-w-0 flex-col gap-3 lg:min-h-0">
          <RedeLista
            redes={redesFiltradas}
            total={redesFiltradas.length}
            carregando={carregandoVisao}
            erro={erroVisao}
            busca={busca}
            onBuscaChange={setBusca}
            ordenacao={ordenacao}
            onOrdenacaoChange={setOrdenacao}
            selecionadaId={redeSelecionada}
            onSelecionar={abrirNoDispositivo}
            onCriarRede={() => setNovaRedeAberta(true)}
            onNovoCliente={() => setNovoClienteAberto(true)}
            onTentarNovamente={() => void carregarVisao()}
          />
          <ClinicasSemRede
            clinicas={visao?.sem_rede ?? []}
            redes={redes}
            carregando={carregandoVisao}
            onAtualizar={atualizarTudo}
          />
        </div>

        <div className="hidden min-w-0 flex-col md:flex lg:min-h-0">
          <RedeDetalhe
            redeId={redeSelecionada}
            resumo={resumoSelecionado}
            detalhe={detalhe}
            carregando={carregandoDetalhe}
            erro={erroDetalhe}
            modo="inline"
            redes={redes}
            onFechar={fecharDetalhe}
            onAtualizar={atualizarTudo}
            onExcluir={excluirRedeSelecionada}
            onTentarNovamente={() => {
              if (redeSelecionada) void carregarDetalhe(redeSelecionada);
            }}
          />
        </div>
      </div>

      <Modal
        open={drawerMobile && !!redeSelecionada}
        onClose={fecharDetalhe}
        maxWidth="full"
        hideCloseButton
        closeOnBackdrop={false}
        zIndex={60}
        className="!items-stretch !p-0 sm:!items-stretch sm:!p-0"
        panelClassName="!h-[100dvh] !max-h-[100dvh] !max-w-none !rounded-none !border-0 bg-[#f3f4f1]"
      >
        <div className="flex h-full min-h-0 flex-col p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]">
          <RedeDetalhe
            redeId={redeSelecionada}
            resumo={resumoSelecionado}
            detalhe={detalhe}
            carregando={carregandoDetalhe}
            erro={erroDetalhe}
            modo="tela"
            redes={redes}
            onFechar={fecharDetalhe}
            onAtualizar={atualizarTudo}
            onExcluir={excluirRedeSelecionada}
            onTentarNovamente={() => {
              if (redeSelecionada) void carregarDetalhe(redeSelecionada);
            }}
          />
        </div>
      </Modal>

      <ModalNovaRede
        open={novaRedeAberta}
        onClose={() => setNovaRedeAberta(false)}
        onCriada={(rede) => void aoCriarRede(rede)}
      />

      <ModalNovoCliente
        open={novoClienteAberto}
        onClose={() => setNovoClienteAberto(false)}
        onCriado={() => void carregarVisao({ silencioso: true })}
      />
    </div>
  );
}
