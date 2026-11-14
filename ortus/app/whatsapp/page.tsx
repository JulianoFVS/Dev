'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, MessageCircle } from 'lucide-react';
import { useClinica } from '@/app/context/ClinicaContext';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import Conversas from './Conversas';
import Automacoes from './Automacoes';
import Agendadas from './Agendadas';
import Historico from './Historico';
import { WHATSAPP_ATIVO } from '@/lib/whatsappCliente';
import { chamarWhatsapp, mensagemDeErro, urlWhatsapp, type Sessao } from './api';

type Aba = 'conversas' | 'automaticas' | 'agendadas' | 'historico';

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
  const { showConfirm } = useCustomAlert();
  const [aba, setAba] = useState<Aba>(() => (ABAS.some((a) => a.value === params.get('aba')) ? params.get('aba') as Aba : 'conversas'));
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [rascunho, setRascunho] = useState<{ telefone: string; texto: string } | null>(() => {
    const telefone = params.get('telefone');
    return telefone ? { telefone, texto: params.get('texto') || '' } : null;
  });

  const atualizarStatus = useCallback(async () => {
    if (!clinicaId) return;
    try {
      setSessao(await chamarWhatsapp<Sessao>(urlWhatsapp(clinicaId)));
    } catch (err) {
      setSessao({ configurado: true, status: 'offline', erro: mensagemDeErro(err, 'Falha ao consultar o WhatsApp.') });
    }
  }, [clinicaId]);

  useEffect(() => {
    setSessao(null);
    void atualizarStatus();
  }, [atualizarStatus]);

  useEffect(() => {
    if (!clinicaId || !sessao || sessao.configurado === false) return;
    const intervalo = sessao.status === 'qr' || sessao.status === 'iniciando' ? 2000 : 10_000;
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
      setSessao({ configurado: true, status: 'falha', erro: mensagemDeErro(err, 'Falha ao conectar.') });
    }
  }

  async function desconectar() {
    const ok = await showConfirm('As mensagens automáticas param até você escanear o QR de novo.', {
      title: 'Desconectar o WhatsApp?',
      type: 'warning',
      confirmLabel: 'Desconectar',
    });
    if (!ok) return;
    await chamarWhatsapp('/api/whatsapp', { clinicaId, acao: 'desconectar' }).catch(() => {});
    setSessao({ configurado: true, status: 'desconectado' });
  }

  if (!clinicaId) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-500">
        Selecione uma clínica para usar o WhatsApp dela.
      </div>
    );
  }

  const conectado = sessao?.status === 'conectado';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 pb-0 pt-2.5 sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <header className="mb-2.5 flex shrink-0 flex-col gap-2.5 sm:mb-3 sm:gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl md:text-[2rem]">WhatsApp</h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${conectado ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
              <span className="truncate">
                {conectado
                  ? `${sessao?.nome || 'Conectado'}${sessao?.numero ? ` · ${formatarNumero(sessao.numero)}` : ''}`
                  : `${clinicaNome} · desconectado`}
              </span>
            </p>
          </div>
          {conectado && (
            <button
              type="button"
              onClick={desconectar}
              className="flex h-10 shrink-0 items-center rounded-full border border-neutral-200 bg-white px-3 text-xs font-medium text-neutral-600 lg:hidden"
            >
              Desconectar
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Abas em chips roláveis no celular */}
          <div className="-mx-0.5 flex w-full items-center gap-1.5 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
            {ABAS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setAba(item.value)}
                aria-pressed={aba === item.value}
                className={`h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors ${aba === item.value ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-600'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <SegmentedControl value={aba} onChange={setAba} options={ABAS} size="sm" className="hidden w-[28rem] bg-white lg:flex" />
          {conectado && (
            <button type="button" onClick={desconectar} className="hidden shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-neutral-500 hover:bg-black/[0.04] lg:block">
              Desconectar
            </button>
          )}
        </div>
      </header>

      {!sessao ? (
        <div className="flex flex-1 items-center justify-center text-neutral-400"><Loader2 className="animate-spin" size={22} /></div>
      ) : aba === 'conversas' ? (
        conectado ? (
          <Conversas clinicaId={clinicaId} clinicaNome={clinicaNome} rascunho={rascunho} onRascunhoUsado={rascunhoUsado} />
        ) : (
          <Conexao sessao={sessao} onConectar={conectar} />
        )
      ) : (
        <div className="app-scroll-inner min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4">
          {!conectado && sessao.configurado !== false && (
            <p className="mx-auto mb-3 max-w-5xl rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              O WhatsApp está desconectado. As mensagens ficam guardadas e só saem depois que ele for conectado na aba Conversas.
            </p>
          )}
          {conectado && sessao.agendador === false && (
            <p className="mx-auto mb-3 max-w-5xl rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              O serviço do WhatsApp está sem acesso ao banco, então automáticas e agendadas não saem. Confira NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local da máquina que roda npm run whatsapp.
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

function Conexao({ sessao, onConectar }: { sessao: Sessao; onConectar: () => void }) {
  if (sessao.configurado === false) {
    return (
      <PainelCentral
        titulo="Serviço ainda não configurado"
        texto="O WhatsApp roda num processo separado, com o número da clínica. No .env.local, defina WHATSAPP_GATEWAY_SECRET e suba com npm run whatsapp. No servidor publicado, WHATSAPP_GATEWAY_URL precisa apontar para essa máquina."
      />
    );
  }
  const titulo = sessao.status === 'qr'
    ? 'Escaneie o QR no celular'
    : sessao.status === 'iniciando'
      ? 'Abrindo o WhatsApp'
      : 'Conectar o WhatsApp da clínica';
  return (
    <PainelCentral
      titulo={titulo}
      texto={sessao.erro || 'No celular da clínica, abra o WhatsApp, toque em Aparelhos conectados e escaneie o código. A sessão fica salva e volta sozinha se o serviço reiniciar.'}
    >
      {sessao.status === 'qr' && sessao.qr ? (
        <img src={sessao.qr} alt="QR Code do WhatsApp" className="h-auto w-full max-w-[16rem] rounded-2xl bg-white p-2" />
      ) : sessao.status !== 'offline' ? (
        <button
          type="button"
          onClick={onConectar}
          disabled={sessao.status === 'iniciando'}
          className="inline-flex h-11 items-center gap-2 rounded-md bg-neutral-900 px-5 text-sm font-medium text-white disabled:opacity-60 sm:h-10"
        >
          {sessao.status === 'iniciando' ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} />}
          {sessao.status === 'iniciando' ? 'Abrindo…' : 'Gerar QR Code'}
        </button>
      ) : null}
    </PainelCentral>
  );
}

function PainelCentral({ titulo, texto, children }: { titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[1.5rem] border border-black/[0.06] bg-white px-5 pb-10 pt-8 text-center sm:px-6 sm:pt-10">
      <MessageCircle size={28} className="text-neutral-300" />
      <div>
        <h2 className="text-base font-medium text-neutral-900">{titulo}</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">{texto}</p>
      </div>
      {children}
    </div>
  );
}

export default function WhatsappPage() {
  if (!WHATSAPP_ATIVO) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-500">
        O WhatsApp integrado ainda não está disponível.
      </div>
    );
  }
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center text-neutral-400"><Loader2 className="animate-spin" size={22} /></div>}>
      <WhatsappConteudo />
    </Suspense>
  );
}
