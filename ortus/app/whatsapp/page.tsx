'use client';

import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, MessageCircle } from 'lucide-react';
import { useClinica } from '@/app/context/ClinicaContext';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { readRouteCache, writeRouteCache } from '@/lib/routeListCache';
import Conversas from './Conversas';
import Automacoes from './Automacoes';
import Agendadas from './Agendadas';
import Historico from './Historico';
import { WHATSAPP_ATIVO } from '@/lib/whatsappCliente';
import { formatarTelefone, linkWhatsappDoAparelho } from '@/lib/whatsappTelefone';
import { chamarWhatsapp, mensagemDeErro, urlWhatsapp, type Sessao } from './api';

type Aba = 'conversas' | 'automaticas' | 'agendadas' | 'historico';

type Rascunho = { telefone: string; texto: string; nome?: string; pacienteId?: string };

const CACHE_SESSAO = 'ortus:whatsapp:sessao:v1';
const AJUDA_DO_WHATSAPP = '/ajuda/guia?topico=whatsapp';

const BOTAO_PRIMARIO = 'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60';
const BOTAO_NEUTRO = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50';
const AVISO = 'mx-auto mb-3 max-w-5xl rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800';

/** Último estado confirmado: a tela abre no lugar certo enquanto o servidor responde. */
function lerSessaoGuardada(clinicaId: string): Sessao | null {
  return clinicaId ? readRouteCache<Sessao>(CACHE_SESSAO, clinicaId) : null;
}

function guardarSessao(clinicaId: string, sessao: Sessao) {
  // Estado de passagem (QR, abrindo, sem resposta) não é guardado: o QR vence e o resto muda em segundos.
  if (sessao.status !== 'conectado' && sessao.status !== 'desconectado') return;
  writeRouteCache<Sessao>(CACHE_SESSAO, clinicaId, { ...sessao, qr: null, erro: null });
}

const ABAS: { value: Aba; label: string }[] = [
  { value: 'conversas', label: 'Conversas' },
  { value: 'automaticas', label: 'Automáticas' },
  { value: 'agendadas', label: 'Agendadas' },
  { value: 'historico', label: 'Histórico' },
];

function formatarNumero(numero?: string | null) {
  const d = String(numero || '');
  if (d.length === 13 && d.startsWith('55')) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith('55')) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return d;
}

function WhatsappConteudo() {
  const { activeClinicId, clinicaNome, clinics, setActiveClinicById } = useClinica();
  const clinicaId = activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : '';
  const params = useSearchParams();
  const clinicaPedida = params.get('clinica');
  const clinicaAplicada = useRef(false);

  useEffect(() => {
    if (clinicaAplicada.current || !clinicaPedida || !clinics.length) return;
    clinicaAplicada.current = true;
    if (clinicaPedida !== clinicaId && clinics.some((c) => String(c.id) === clinicaPedida)) {
      setActiveClinicById(clinicaPedida);
    }
  }, [clinicaPedida, clinicaId, clinics, setActiveClinicById]);
  const router = useRouter();
  const { showAlert, showConfirm } = useCustomAlert();
  const [aba, setAba] = useState<Aba>(() => (ABAS.some((a) => a.value === params.get('aba')) ? params.get('aba') as Aba : 'conversas'));
  const [sessao, setSessao] = useState<Sessao | null>(() => lerSessaoGuardada(clinicaId));
  const [conversaAberta, setConversaAberta] = useState(false);
  const clinicaAtual = useRef(clinicaId);
  clinicaAtual.current = clinicaId;
  const [rascunho, setRascunho] = useState<Rascunho | null>(() => {
    const telefone = params.get('telefone');
    if (!telefone) return null;
    return {
      telefone,
      texto: params.get('texto') || '',
      nome: params.get('nome') || undefined,
      pacienteId: params.get('paciente') || undefined,
    };
  });

  const atualizarStatus = useCallback(async () => {
    if (!clinicaId) return;
    try {
      const nova = await chamarWhatsapp<Sessao>(urlWhatsapp(clinicaId));
      // A resposta de uma clínica não pode pintar a tela de outra, escolhida no meio do caminho.
      if (clinicaAtual.current !== clinicaId) return;
      guardarSessao(clinicaId, nova);
      setSessao(nova);
    } catch (err) {
      if (clinicaAtual.current !== clinicaId) return;
      setSessao((atual) => ({
        configurado: true,
        modo: atual?.modo,
        podeConectar: atual?.podeConectar,
        podeConversar: atual?.podeConversar,
        status: 'offline',
        erro: mensagemDeErro(err, 'Não foi possível consultar o WhatsApp.'),
      }));
    }
  }, [clinicaId]);

  useEffect(() => {
    setSessao(lerSessaoGuardada(clinicaId));
    void atualizarStatus();
  }, [clinicaId, atualizarStatus]);

  useEffect(() => {
    if (!clinicaId || !sessao) return;
    const emPassagem = sessao.status === 'qr' || sessao.status === 'iniciando' || sessao.status === 'offline';
    // Sem serviço neste endereço não há o que acompanhar de perto.
    const intervalo = sessao.configurado === false ? 60_000 : emPassagem ? 3000 : 10_000;
    const id = window.setInterval(() => { void atualizarStatus(); }, intervalo);
    return () => window.clearInterval(id);
  }, [clinicaId, sessao?.status, sessao?.configurado, atualizarStatus]);

  const rascunhoUsado = useCallback(() => {
    setRascunho(null);
    router.replace('/whatsapp');
  }, [router]);

  async function conectar() {
    setSessao((atual) => ({ ...(atual || { configurado: true }), status: 'iniciando', erro: null }));
    try {
      setSessao(await chamarWhatsapp<Sessao>('/api/whatsapp', { clinicaId, acao: 'iniciar' }));
    } catch (err) {
      setSessao((atual) => ({
        configurado: true,
        modo: atual?.modo,
        podeConectar: atual?.podeConectar,
        podeConversar: atual?.podeConversar,
        status: 'falha',
        erro: mensagemDeErro(err, 'Não foi possível conectar. Tente de novo.'),
      }));
    }
  }

  async function desconectar() {
    const ok = await showConfirm('As mensagens automáticas e agendadas param até você escanear o QR de novo.', {
      title: 'Desconectar o WhatsApp?',
      type: 'warning',
      confirmLabel: 'Desconectar',
    });
    if (!ok) return;
    try {
      await chamarWhatsapp('/api/whatsapp', { clinicaId, acao: 'desconectar' });
    } catch (err) {
      // Sem a resposta do servidor a sessão pode continuar ligada: a tela não finge que desconectou.
      await showAlert(mensagemDeErro(err, 'Não foi possível desconectar. Tente de novo.'), { type: 'warning' });
      return;
    }
    const nova: Sessao = {
      configurado: true,
      modo: sessao?.modo,
      status: 'desconectado',
      podeConectar: sessao?.podeConectar,
      podeConversar: sessao?.podeConversar,
    };
    guardarSessao(clinicaId, nova);
    setSessao(nova);
  }

  if (!clinicaId) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-500">
        Selecione uma clínica para usar o WhatsApp dela.
      </div>
    );
  }

  const conectado = sessao?.status === 'conectado';
  const semServico = sessao?.configurado === false;
  // Só o administrador da clínica (não convidado) desconecta; o servidor confere de novo.
  const podeDesconectar = conectado && sessao?.podeConectar !== false;
  // No celular a conversa aberta ocupa a tela toda: título e abas saem de cena e voltam no Voltar.
  const telaCheia = aba === 'conversas' && conectado && conversaAberta;
  const estado = !sessao
    ? 'Consultando…'
    : conectado
      ? `${sessao.nome || 'Conectado'}${sessao.numero ? ` · ${formatarNumero(sessao.numero)}` : ''}`
      : semServico
        ? 'Indisponível neste acesso'
        : 'Desconectado';

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${telaCheia ? 'lg:px-4 lg:py-3.5' : 'px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5'}`}>
      <header className={`mb-3 shrink-0 flex-col gap-3 lg:flex lg:flex-row lg:items-end lg:justify-between ${telaCheia ? 'hidden' : 'flex'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">
              WhatsApp
              <span className="hidden text-neutral-400 md:inline"> · {clinicaNome}</span>
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${conectado ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
              <span className="truncate">{estado}</span>
            </p>
          </div>
          {podeDesconectar && (
            <button type="button" onClick={desconectar} className="inline-flex h-10 shrink-0 items-center rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-black/[0.04] active:bg-black/[0.06] lg:hidden">
              Desconectar
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Celular: abas com 40px de toque e largura pelo texto. O controle do computador tem botões de 26px. */}
          <div role="tablist" aria-label="Seções do WhatsApp" className="flex w-full gap-1 rounded-xl border border-neutral-200 bg-white p-1 lg:hidden">
            {ABAS.map((item) => {
              const ativa = aba === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  onClick={() => setAba(item.value)}
                  className={`flex h-10 min-w-0 flex-auto items-center justify-center whitespace-nowrap rounded-lg px-0.5 text-xs font-medium min-[360px]:px-1.5 min-[360px]:text-[13px] ${ativa ? 'bg-neutral-900 text-white' : 'text-neutral-600 active:bg-neutral-100'}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="hidden lg:block lg:w-[28rem]">
            <SegmentedControl value={aba} onChange={setAba} options={ABAS} size="sm" className="w-full bg-white" />
          </div>
          {podeDesconectar && (
            <button type="button" onClick={desconectar} className="hidden shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:bg-black/[0.04] lg:block">
              Desconectar
            </button>
          )}
        </div>
      </header>

      {aba === 'conversas' ? (
        !sessao ? (
          <EsperaDoEstado />
        ) : conectado && sessao.podeConversar === false ? (
          <PainelCentral
            titulo="As conversas do WhatsApp não estão liberadas para você"
            texto="Elas fazem parte do módulo Ficha do Paciente. Peça ao administrador da clínica para liberar esse módulo para você na tela Equipe."
          />
        ) : conectado ? (
          <Conversas
            clinicaId={clinicaId}
            clinicaNome={clinicaNome}
            rascunho={rascunho}
            onRascunhoUsado={rascunhoUsado}
            onConversaAberta={setConversaAberta}
          />
        ) : semServico ? (
          <SemServico rascunho={rascunho} />
        ) : (
          <Conexao sessao={sessao} rascunho={rascunho} onConectar={conectar} onTentar={atualizarStatus} />
        )
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {semServico && (
            <p className={AVISO}>
              Este acesso não envia mensagens. O que for ligado ou agendado aqui sai pelo aplicativo de computador da clínica, quando ele estiver aberto e com o WhatsApp conectado.
            </p>
          )}
          {sessao && !semServico && !conectado && (
            <p className={AVISO}>
              O WhatsApp está desconectado. As agendadas ficam guardadas e saem quando ele for conectado na aba Conversas; as automáticas só saem com ele conectado.
            </p>
          )}
          {conectado && sessao?.agendador === false && (
            <p className={AVISO}>
              As mensagens automáticas e agendadas não estão saindo {sessao.modo === 'aplicativo' ? 'neste computador' : 'neste servidor'}. As conversas funcionam; avise o suporte.
            </p>
          )}
          {aba === 'automaticas' && <Automacoes clinicaId={clinicaId} clinicaNome={clinicaNome} />}
          {aba === 'agendadas' && <Agendadas clinicaId={clinicaId} />}
          {aba === 'historico' && <Historico clinicaId={clinicaId} />}
        </div>
      )}
    </div>
  );
}

/** Primeira visita, antes de o servidor dizer o estado: o lugar da lista, sem bloquear título nem abas. */
function EsperaDoEstado() {
  return (
    <div aria-busy="true" aria-label="Consultando o WhatsApp" className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-[1.5rem] border border-black/[0.06] bg-white p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-neutral-100" />
          <span className="h-10 flex-1 animate-pulse rounded-md bg-neutral-100" />
        </div>
      ))}
    </div>
  );
}

/**
 * Quem chegou com um número na URL (a Ajuda faz isso para falar com o suporte)
 * não fica sem saída quando o WhatsApp do Ortus não está no ar: a conversa abre
 * no WhatsApp do próprio aparelho.
 */
function AbrirNoAparelho({ rascunho }: { rascunho: Rascunho | null }) {
  const link = rascunho ? linkWhatsappDoAparelho(rascunho.telefone, rascunho.texto) : null;
  if (!rascunho || !link) return null;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className={BOTAO_NEUTRO}>
      <MessageCircle size={16} className="shrink-0" />
      <span>Falar com {rascunho.nome || formatarTelefone(rascunho.telefone)} pelo WhatsApp deste aparelho</span>
    </a>
  );
}

/** Não há serviço do WhatsApp neste endereço: explica onde ele funciona, sem botão de conectar. */
function SemServico({ rascunho }: { rascunho: Rascunho | null }) {
  return (
    <PainelCentral
      titulo="O WhatsApp não funciona por este acesso"
      texto="O WhatsApp do Ortus roda no aplicativo de computador ou em um servidor que fica sempre ligado. Este endereço não tem nenhum dos dois, por isso não dá para conectar nem conversar por aqui."
    >
      <Link href={AJUDA_DO_WHATSAPP} className={BOTAO_PRIMARIO}>Ver como usar na Ajuda</Link>
      <AbrirNoAparelho rascunho={rascunho} />
      <p className="text-xs text-neutral-400">
        As abas Automáticas, Agendadas e Histórico continuam valendo: se a clínica usa o aplicativo de computador, é ele que envia.
      </p>
    </PainelCentral>
  );
}

function Conexao({ sessao, rascunho, onConectar, onTentar }: { sessao: Sessao; rascunho: Rascunho | null; onConectar: () => void; onTentar: () => void }) {
  // A sessão fica na máquina que gerou o QR; o texto diz qual é.
  const guardada = sessao.modo === 'aplicativo'
    ? 'A conexão fica guardada neste computador: fechar o Ortus não desconecta.'
    : 'A conexão fica guardada no servidor do Ortus e volta sozinha quando ele reinicia.';

  if (sessao.status === 'offline') {
    return (
      <PainelCentral titulo="O WhatsApp não respondeu" texto={sessao.erro || 'Tente de novo em alguns segundos.'}>
        <button type="button" onClick={onTentar} className={BOTAO_PRIMARIO}>Tentar de novo</button>
        <AbrirNoAparelho rascunho={rascunho} />
        <Link href={AJUDA_DO_WHATSAPP} className="inline-flex h-10 items-center px-3 text-sm font-medium text-neutral-500 hover:text-neutral-900">Ver a Ajuda</Link>
      </PainelCentral>
    );
  }

  // O QR só chega a quem pode conectar: quem o escaneia decide por qual número a clínica fala.
  if (sessao.podeConectar === false) {
    const conectando = sessao.status === 'qr' || sessao.status === 'iniciando';
    return (
      <PainelCentral
        titulo={conectando ? 'O WhatsApp da clínica está sendo conectado' : 'O WhatsApp da clínica está desconectado'}
        texto="Só o administrador da clínica conecta o WhatsApp ao Ortus. Quando ele escanear o código, as conversas aparecem aqui."
      >
        <AbrirNoAparelho rascunho={rascunho} />
      </PainelCentral>
    );
  }

  if (sessao.status === 'qr' && sessao.qr) {
    return (
      <PainelCentral
        titulo="Escaneie o código com o celular da clínica"
        texto={(
          <>
            No celular que tem o WhatsApp da clínica: <strong className="font-medium text-neutral-800">WhatsApp &gt; Dispositivos conectados &gt; Conectar dispositivo</strong>. Depois aponte a câmera para o código.
          </>
        )}
      >
        <img src={sessao.qr} alt="Código QR para conectar o WhatsApp" className="aspect-square w-full max-w-[16rem] rounded-2xl border border-neutral-200 bg-white p-2" />
        <div className="space-y-1.5 text-xs text-neutral-500">
          <p>No Android o caminho fica no menu de três pontos; no iPhone, em Configurações. Em versões antigas aparece como Aparelhos conectados &gt; Conectar um aparelho.</p>
          <p className="lg:hidden">Se você está vendo esta tela no próprio celular da clínica, abra o Ortus em outro aparelho: é a câmera dele que lê o código.</p>
          <p>{guardada}</p>
        </div>
      </PainelCentral>
    );
  }

  const abrindo = sessao.status === 'iniciando';
  return (
    <PainelCentral
      titulo={abrindo ? 'Abrindo o WhatsApp' : 'Conectar o WhatsApp da clínica'}
      texto={sessao.erro || (abrindo
        ? 'Isso leva alguns segundos. O código para escanear aparece aqui.'
        : `Gere o código e escaneie com o celular que tem o WhatsApp da clínica. ${guardada}`)}
    >
      <button type="button" onClick={onConectar} disabled={abrindo} className={BOTAO_PRIMARIO}>
        {abrindo ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
        {abrindo ? 'Abrindo…' : 'Gerar QR Code'}
      </button>
      <AbrirNoAparelho rascunho={rascunho} />
    </PainelCentral>
  );
}

function PainelCentral({ titulo, texto, children }: { titulo: string; texto: ReactNode; children?: ReactNode }) {
  return (
    // A margem automática centraliza quando sobra espaço e deixa rolar desde o topo quando falta (celular baixo com o QR).
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-[1.5rem] border border-black/[0.06] bg-white">
      <div className="m-auto flex w-full max-w-md flex-col items-center gap-4 px-5 py-8 text-center sm:px-6 sm:py-10">
        <MessageCircle size={28} className="shrink-0 text-neutral-300" />
        <div>
          <h2 className="text-base font-semibold text-neutral-900">{titulo}</h2>
          <p className="mt-1 text-sm text-neutral-500">{texto}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A aba está desligada (NEXT_PUBLIC_WHATSAPP_ATIVO=0), mas alguém chegou pelo endereço. */
function WhatsappDesligado() {
  const params = useSearchParams();
  const telefone = params.get('telefone');
  const rascunho: Rascunho | null = telefone
    ? { telefone, texto: params.get('texto') || '', nome: params.get('nome') || undefined }
    : null;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <PainelCentral
        titulo="O WhatsApp do Ortus não está ativo aqui"
        texto="Ele roda no aplicativo de computador ou em um servidor que fica sempre ligado. Neste endereço está desligado."
      >
        <Link href="/ajuda/guia?topico=aplicativo" className={BOTAO_PRIMARIO}>Ver a Ajuda</Link>
        <AbrirNoAparelho rascunho={rascunho} />
      </PainelCentral>
    </div>
  );
}

export default function WhatsappPage() {
  return (
    <Suspense fallback={null}>
      {WHATSAPP_ATIVO ? <WhatsappConteudo /> : <WhatsappDesligado />}
    </Suspense>
  );
}
