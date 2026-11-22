'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus, RefreshCw, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { dados as tabelas } from '@/lib/local/consulta';
import Modal from '@/components/ui/Modal';
import ModalNovoCliente from '@/components/saas/ModalNovoCliente';
import PainelClinica from '@/components/saas/PainelClinica';
import { SkeletonBloco } from '@/components/saas/Feedback';
import {
  mensagemDeErro,
  moeda,
  normalizarBusca,
  pluralizar,
  rotuloPlano,
  type RedeDetalheSaaS,
  type RedeSaaS,
  type ResumoAssinaturasSaaS,
  type VisaoGeralSaaS,
} from '@/lib/saas';
import { ESTADO_ASSINATURA_META } from '@/lib/assinaturas';

type StatusAcesso = 'verificando' | 'autorizado' | 'negado' | 'erro';

function codigoDoErro(erro: unknown): string {
  if (!erro || typeof erro !== 'object') return '';
  const codigo = (erro as { code?: unknown }).code;
  return typeof codigo === 'string' ? codigo : '';
}

export default function SuperAdminPage() {
  const router = useRouter();
  const [statusAcesso, setStatusAcesso] = useState<StatusAcesso>('verificando');
  const [erroAcesso, setErroAcesso] = useState<string | null>(null);
  const [tentativaAcesso, setTentativaAcesso] = useState(0);

  const [visao, setVisao] = useState<VisaoGeralSaaS | null>(null);
  const [assinaturas, setAssinaturas] = useState<ResumoAssinaturasSaaS | null>(null);
  const [carregandoVisao, setCarregandoVisao] = useState(true);
  const [erroVisao, setErroVisao] = useState<string | null>(null);
  const requisicaoVisao = useRef(0);

  const [busca, setBusca] = useState('');
  const [redeSelecionada, setRedeSelecionada] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<RedeDetalheSaaS | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);
  const requisicaoDetalhe = useRef(0);
  const selecionadaRef = useRef<string | null>(null);

  const [drawerMobile, setDrawerMobile] = useState(false);
  const [novaAberta, setNovaAberta] = useState(false);

  useEffect(() => {
    selecionadaRef.current = redeSelecionada;
  }, [redeSelecionada]);

  const tratarAcessoNegado = useCallback((falha: unknown): boolean => {
    if (codigoDoErro(falha) !== '42501') return false;
    setStatusAcesso('negado');
    router.replace('/dashboard');
    return true;
  }, [router]);

  const carregarVisao = useCallback(async (opcoes?: { silencioso?: boolean }) => {
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
      const resumo = await supabase.rpc('saas_assinaturas_resumo');
      if (geracao === requisicaoVisao.current && !resumo.error && resumo.data) {
        setAssinaturas(resumo.data as unknown as ResumoAssinaturasSaaS);
      }
    } catch (falha) {
      if (geracao !== requisicaoVisao.current) return;
      if (tratarAcessoNegado(falha)) return;
      setErroVisao(mensagemDeErro(falha, 'Não foi possível carregar as clínicas.'));
    } finally {
      if (geracao === requisicaoVisao.current) setCarregandoVisao(false);
    }
  }, [tratarAcessoNegado]);

  const carregarDetalhe = useCallback(async (id: string, opcoes?: { silencioso?: boolean }) => {
    const geracao = ++requisicaoDetalhe.current;
    if (!opcoes?.silencioso) setCarregandoDetalhe(true);
    try {
      const { data, error } = await supabase.rpc('saas_rede_detalhe', { p_rede: id });
      if (geracao !== requisicaoDetalhe.current) return;
      if (error) throw error;
      const payload = data as unknown as RedeDetalheSaaS | null;
      if (!payload?.rede) throw new Error('A clínica não foi encontrada.');
      setDetalhe(payload);
      setErroDetalhe(null);
    } catch (falha) {
      if (geracao !== requisicaoDetalhe.current) return;
      if (tratarAcessoNegado(falha)) return;
      setErroDetalhe(mensagemDeErro(falha, 'Não foi possível abrir a clínica.'));
    } finally {
      if (geracao === requisicaoDetalhe.current) setCarregandoDetalhe(false);
    }
  }, [tratarAcessoNegado]);

  const atualizarTudo = useCallback(async () => {
    await carregarVisao({ silencioso: true });
    const id = selecionadaRef.current;
    if (id) await carregarDetalhe(id, { silencioso: true });
  }, [carregarVisao, carregarDetalhe]);

  useEffect(() => {
    let cancelado = false;
    async function verificarAcesso() {
      setStatusAcesso('verificando');
      setErroAcesso(null);
      try {
        const { data: { session }, error: erroSessao } = await supabase.auth.getSession();
        if (cancelado) return;
        if (erroSessao) throw erroSessao;
        if (!session) {
          router.replace('/login');
          return;
        }
        const { data: perfilData, error: erroPerfil } = await tabelas.from('profissionais')
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
        setErroAcesso(mensagemDeErro(falha, 'Não foi possível confirmar seu acesso ao painel.'));
      }
    }
    void verificarAcesso();
    return () => { cancelado = true; };
  }, [router, carregarVisao, tentativaAcesso]);

  useEffect(() => {
    const consulta = window.matchMedia('(min-width: 768px)');
    const aoMudar = () => { if (consulta.matches) setDrawerMobile(false); };
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, []);

  const redes = visao?.redes ?? [];
  const redesFiltradas = useMemo(() => {
    const termo = normalizarBusca(busca);
    const lista = termo
      ? redes.filter((rede) => [rede.nome, rede.plano, rede.contato_nome, rede.contato_email].some((campo) => normalizarBusca(campo).includes(termo)))
      : [...redes];
    return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  }, [redes, busca]);

  function abrir(id: string) {
    const telaPequena = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
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

  function fechar() {
    requisicaoDetalhe.current += 1;
    setDrawerMobile(false);
    setRedeSelecionada(null);
    setDetalhe(null);
    setErroDetalhe(null);
  }

  async function aoCriar(rede: { id: string; nome: string }) {
    const telaPequena = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    setNovaAberta(false);
    setRedeSelecionada(rede.id);
    setDetalhe(null);
    setDrawerMobile(telaPequena);
    await carregarVisao({ silencioso: true });
    await carregarDetalhe(rede.id);
  }

  if (statusAcesso !== 'autorizado') {
    return (
      <div className="flex flex-col gap-3 px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5" aria-busy={statusAcesso === 'verificando'}>
        {statusAcesso === 'erro' ? (
          <div className="mx-auto mt-6 w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5">
            <h1 className="text-base font-semibold text-neutral-900">Não foi possível confirmar o acesso</h1>
            <p className="mt-1 text-sm text-neutral-500">{erroAcesso}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={() => setTentativaAcesso((atual) => atual + 1)} className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white">
                Tentar novamente
              </button>
              <button type="button" onClick={() => router.replace('/dashboard')} className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-neutral-200 px-4 text-sm text-neutral-700">
                Voltar ao dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <SkeletonBloco className="h-8 w-48" />
            <SkeletonBloco className="h-64 w-full rounded-xl" />
            <span className="sr-only">Verificando seu acesso de dono da plataforma...</span>
          </div>
        )}
      </div>
    );
  }

  const painel = (
    <PainelClinica
      redeId={redeSelecionada}
      detalhe={detalhe}
      estado={redeSelecionada ? assinaturas?.redes?.[redeSelecionada] ?? null : null}
      carregando={carregandoDetalhe}
      erro={erroDetalhe}
      modo="inline"
      onFechar={fechar}
      onAtualizar={atualizarTudo}
      onTentarNovamente={() => { if (redeSelecionada) void carregarDetalhe(redeSelecionada); }}
    />
  );

  return (
    <div className="flex flex-col gap-3 px-2.5 pb-3 pt-2.5 font-poppins sm:px-3 md:px-4 md:pt-3 lg:h-full lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:pb-4 lg:pt-3.5">
      <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Painel SaaS</h1>
          <p className="mt-1 text-sm text-neutral-500 sm:text-base">Clínicas, filiais, acessos e assinatura.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void carregarVisao()} disabled={carregandoVisao} aria-label="Atualizar" className="flex h-10 w-10 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 disabled:opacity-50">
            <RefreshCw size={15} className={carregandoVisao ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={() => setNovaAberta(true)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800">
            <Plus size={15} /> Nova clínica
          </button>
        </div>
      </header>

      {erroVisao && (
        <div role="alert" className="flex shrink-0 items-center justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
          <p className="flex min-w-0 items-start gap-2 text-xs font-medium text-rose-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{erroVisao}</span>
          </p>
          <button type="button" onClick={() => setErroVisao(null)} aria-label="Ocultar aviso" className="flex h-10 w-10 shrink-0 items-center justify-center text-rose-500">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 md:grid md:grid-cols-2 md:items-stretch">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="shrink-0 border-b border-black/5 p-3">
            <label className="relative block">
              <span className="sr-only">Buscar clínica</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar clínica"
                className="h-10 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
              />
            </label>
          </div>
          <Lista
            redes={redesFiltradas}
            assinaturas={assinaturas}
            carregando={carregandoVisao && redes.length === 0}
            busca={busca}
            selecionadaId={redeSelecionada}
            onSelecionar={abrir}
            onLimparBusca={() => setBusca('')}
            onCriar={() => setNovaAberta(true)}
          />
        </section>

        <div className="hidden min-h-0 md:flex">{painel}</div>
      </div>

      <Modal
        open={drawerMobile && !!redeSelecionada}
        onClose={fechar}
        maxWidth="full"
        hideCloseButton
        closeOnBackdrop={false}
        zIndex={60}
        className="!items-stretch !p-0 sm:!items-stretch sm:!p-0"
        panelClassName="!h-[100dvh] !max-h-[100dvh] !max-w-none !rounded-none !border-0 bg-[#f3f4f1]"
      >
        <div className="flex h-full min-h-0 flex-col p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]">
          <PainelClinica
            redeId={redeSelecionada}
            detalhe={detalhe}
            estado={redeSelecionada ? assinaturas?.redes?.[redeSelecionada] ?? null : null}
            carregando={carregandoDetalhe}
            erro={erroDetalhe}
            modo="tela"
            onFechar={fechar}
            onAtualizar={atualizarTudo}
            onTentarNovamente={() => { if (redeSelecionada) void carregarDetalhe(redeSelecionada); }}
          />
        </div>
      </Modal>

      <ModalNovoCliente open={novaAberta} onClose={() => setNovaAberta(false)} onCriado={(rede) => void aoCriar(rede)} />
    </div>
  );
}

function Lista({
  redes,
  assinaturas,
  carregando,
  busca,
  selecionadaId,
  onSelecionar,
  onLimparBusca,
  onCriar,
}: {
  redes: RedeSaaS[];
  assinaturas: ResumoAssinaturasSaaS | null;
  carregando: boolean;
  busca: string;
  selecionadaId: string | null;
  onSelecionar: (id: string) => void;
  onLimparBusca: () => void;
  onCriar: () => void;
}) {
  if (carregando) {
    return (
      <div className="flex flex-col gap-2 p-3" aria-busy="true">
        <SkeletonBloco className="h-16 w-full" />
        <SkeletonBloco className="h-16 w-full" />
      </div>
    );
  }
  if (redes.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-sm font-medium text-neutral-900">{busca.trim() ? 'Nenhuma clínica encontrada' : 'Nenhuma clínica ainda'}</p>
        <p className="mt-1 text-sm text-neutral-500">{busca.trim() ? 'Tente outro nome.' : 'Crie a primeira clínica raiz.'}</p>
        {busca.trim() ? (
          <button type="button" onClick={onLimparBusca} className="mt-3 inline-flex h-10 items-center rounded-md border border-neutral-200 px-3 text-sm text-neutral-700">Limpar busca</button>
        ) : (
          <button type="button" onClick={onCriar} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white">
            <Plus size={14} /> Nova clínica
          </button>
        )}
      </div>
    );
  }
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto p-2">
      {redes.map((rede) => {
        const estado = assinaturas?.redes?.[rede.id];
        const meta = estado && estado.estado !== 'sem_cobranca' && estado.estado !== 'ativa' ? ESTADO_ASSINATURA_META[estado.estado] : null;
        const ativa = rede.id === selecionadaId;
        return (
          <li key={rede.id}>
            <button
              type="button"
              onClick={() => onSelecionar(rede.id)}
              className={`flex w-full flex-col items-start rounded-md px-3 py-2.5 text-left ${ativa ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-50'}`}
            >
              <span className="w-full truncate text-sm font-medium">{rede.nome}</span>
              <span className={`mt-0.5 w-full truncate text-xs ${ativa ? 'text-white/70' : 'text-neutral-500'}`}>
                {rotuloPlano(rede.plano)} · {moeda(rede.valor_mensal_centavos)}/mês · {pluralizar(rede.clinicas, 'unidade', 'unidades')}
              </span>
              {meta && (
                <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${ativa ? 'border-white/20 text-white' : meta.chip}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${ativa ? 'bg-white' : meta.ponto}`} />
                  {meta.rotulo}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
