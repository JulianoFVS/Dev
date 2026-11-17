'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Cloud, Database, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { estadoSyncUI, sincronizarAgoraUI, type EstadoSyncUI } from '@/lib/local/cliente';

/**
 * Indicador fixo de conexão/backup do Ortus Desktop.
 *
 * Mostra, sem atrapalhar o trabalho: local pronto, sincronizando, sem
 * internet — e a hora do último envio bem-sucedido. Clicar abre os detalhes
 * e permite forçar uma sincronização.
 *
 * No site (modo nuvem) não renderiza nada.
 */

function horaCurta(iso: string | null): string {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

const ROTULO: Record<EstadoSyncUI['estado'], string> = {
  iniciando: 'Iniciando…',
  sincronizando: 'Sincronizando',
  sincronizado: 'Sincronizado',
  offline: 'Sem internet',
  erro: 'Falha no backup',
  login: 'Entre para sincronizar',
};

function estilo(estado: EstadoSyncUI['estado']) {
  switch (estado) {
    case 'sincronizado':
      return { cor: 'text-emerald-700', fundo: 'bg-emerald-50', borda: 'border-emerald-200', icone: Check };
    case 'offline':
      return { cor: 'text-amber-800', fundo: 'bg-amber-50', borda: 'border-amber-200', icone: WifiOff };
    case 'erro':
      return { cor: 'text-rose-700', fundo: 'bg-rose-50', borda: 'border-rose-200', icone: AlertTriangle };
    case 'login':
      return { cor: 'text-neutral-600', fundo: 'bg-neutral-100', borda: 'border-neutral-200', icone: Database };
    default:
      return { cor: 'text-neutral-700', fundo: 'bg-white', borda: 'border-neutral-200', icone: Cloud };
  }
}

export default function SyncStatus() {
  const [desktop, setDesktop] = useState(false);
  const [estado, setEstado] = useState<EstadoSyncUI | null>(null);
  const [aberto, setAberto] = useState(false);
  const [forcando, setForcando] = useState(false);
  const [navegadorOffline, setNavegadorOffline] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    fetch('/api/local/status', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((dados: { desktop?: boolean } | null) => {
        if (vivo) setDesktop(Boolean(dados?.desktop));
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  const atualizar = useCallback(async () => {
    const proximo = await estadoSyncUI();
    if (proximo) setEstado(proximo);
  }, []);

  useEffect(() => {
    if (!desktop) return;
    void atualizar();
    const timer = window.setInterval(() => void atualizar(), 4_000);
    return () => window.clearInterval(timer);
  }, [desktop, atualizar]);

  useEffect(() => {
    const on = () => setNavegadorOffline(false);
    const off = () => setNavegadorOffline(true);
    setNavegadorOffline(typeof navigator !== 'undefined' ? navigator.onLine === false : false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (evento: MouseEvent) => {
      if (!raizRef.current?.contains(evento.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [aberto]);

  if (!desktop || !estado) return null;

  const efetivo: EstadoSyncUI['estado'] =
    navegadorOffline && estado.estado !== 'login' ? 'offline' : estado.estado;
  const visual = estilo(efetivo);
  const Icone = visual.icone;

  async function forcar() {
    if (forcando) return;
    setForcando(true);
    const proximo = await sincronizarAgoraUI();
    if (proximo) setEstado(proximo);
    setForcando(false);
  }

  return (
    <div ref={raizRef} className="pointer-events-none fixed bottom-3 right-3 z-[95] lg:bottom-4 lg:right-4">
      <div className="pointer-events-auto flex flex-col items-end gap-2">
        {aberto && (
          <div className="w-[17rem] rounded-xl border border-neutral-200 bg-white p-3 text-neutral-900 shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
            <p className="text-xs font-semibold text-neutral-900">Backup na nuvem</p>
            <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
              O trabalho do dia fica no banco local desta máquina. Com internet, tudo é enviado
              para o servidor da clínica automaticamente.
            </p>
            {efetivo === 'offline' && (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900">
                Agenda, pacientes, tarefas e o histórico do WhatsApp continuam funcionando.
                Super-admin, convites, SMS e links de anamnese voltam quando a conexão voltar.
              </p>
            )}

            <dl className="mt-2.5 space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-neutral-500">Situação</dt>
                <dd className={`font-medium ${visual.cor}`}>{ROTULO[efetivo]}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-neutral-500">Último envio</dt>
                <dd className="font-medium tabular-nums text-neutral-800">{horaCurta(estado.ultimoEnvioOk)}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-neutral-500">Aguardando envio</dt>
                <dd className="font-medium tabular-nums text-neutral-800">{estado.pendentes}</dd>
              </div>
              {estado.conflitos > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-neutral-500">Conflitos</dt>
                  <dd className="font-medium tabular-nums text-amber-700">{estado.conflitos}</dd>
                </div>
              )}
            </dl>

            <button
              type="button"
              onClick={() => void forcar()}
              disabled={forcando}
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {forcando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {forcando ? 'Sincronizando…' : 'Sincronizar agora'}
            </button>

            {estado.conflitos > 0 && (
              <a
                href="/configuracoes/sincronizacao"
                className="mt-2 block text-center text-[11px] font-medium text-amber-700 hover:underline"
              >
                Ver conflitos em Configurações
              </a>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-label={`Backup: ${ROTULO[efetivo]}`}
          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur ${visual.fundo} ${visual.borda} ${visual.cor}`}
        >
          {efetivo === 'sincronizando' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Icone size={13} />
          )}
          <span className="whitespace-nowrap">{ROTULO[efetivo]}</span>
          {estado.pendentes > 0 && (
            <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
              {estado.pendentes}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
