'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, Check, Cloud, Database, Loader2, RefreshCw, ShieldCheck, WifiOff,
} from 'lucide-react';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import {
  estadoSyncUI, lerSessaoCacheUI, listarConflitosUI, resolverConflitoUI, sincronizarAgoraUI,
  type ConflitoSyncUI as ConflitoSync, type EstadoSyncUI,
} from '@/lib/local/cliente';

/**
 * Configurações → Sincronização.
 *
 * Existe só dentro do Ortus Desktop. Mostra o estado do backup na nuvem e a
 * lista de conflitos — duas edições do mesmo registro em computadores
 * diferentes. Vence o `updated_at` mais novo; a versão que perdeu fica
 * guardada aqui para a clínica não perder o dado em silêncio.
 */

const ROTULO: Record<EstadoSyncUI['estado'], string> = {
  iniciando: 'Iniciando',
  sincronizando: 'Sincronizando',
  sincronizado: 'Sincronizado',
  offline: 'Sem internet',
  erro: 'Falha no backup',
  login: 'Entre para sincronizar',
};

function quando(iso?: string | null): string {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function resumo(versao: Record<string, unknown> | null): string {
  if (!versao) return '—';
  const campos = ['nome', 'titulo', 'procedimento', 'descricao', 'texto', 'chave', 'status', 'updated_at'];
  const partes = campos
    .filter((campo) => versao[campo] !== undefined && versao[campo] !== null)
    .slice(0, 3)
    .map((campo) => `${campo}: ${String(versao[campo]).slice(0, 60)}`);
  return partes.join(' · ') || '(sem campos de referência)';
}

export default function SincronizacaoPage() {
  const { showAlert, showConfirm } = useCustomAlert();
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [estado, setEstado] = useState<EstadoSyncUI | null>(null);
  const [conflitos, setConflitos] = useState<ConflitoSync[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [forcando, setForcando] = useState(false);

  const carregar = useCallback(async () => {
    const status = await estadoSyncUI();
    setEstado(status);
    const lista = await listarConflitosUI();
    setConflitos(lista);
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const sessao = await lerSessaoCacheUI().catch(() => null);
      const resposta = await fetch('/api/local/status', { cache: 'no-store' }).catch(() => null);
      const dados = resposta && resposta.ok ? ((await resposta.json()) as { desktop?: boolean }) : null;
      if (!vivo) return;
      const ehDesktop = Boolean(dados?.desktop) || Boolean(sessao);
      setDesktop(ehDesktop);
      if (ehDesktop) await carregar();
      if (vivo) setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [carregar]);

  useEffect(() => {
    if (!desktop) return;
    const timer = window.setInterval(() => void carregar(), 8_000);
    return () => window.clearInterval(timer);
  }, [desktop, carregar]);

  async function forcar() {
    setForcando(true);
    const proximo = await sincronizarAgoraUI();
    if (proximo) setEstado(proximo);
    await carregar();
    setForcando(false);
  }

  async function resolver(conflito: ConflitoSync, escolha: 'local' | 'remoto') {
    const texto = escolha === 'local'
      ? 'Manter a versão deste computador? Ela será enviada para a nuvem.'
      : 'Manter a versão da nuvem? A alteração feita aqui será substituída.';
    const ok = await showConfirm(texto, {
      type: 'warning',
      title: 'Resolver conflito',
      confirmLabel: escolha === 'local' ? 'Manter local' : 'Manter nuvem',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;

    try {
      await resolverConflitoUI(conflito.id, escolha);
      await carregar();
    } catch (err) {
      await showAlert(err instanceof Error ? err.message : 'Falha ao resolver.', { type: 'error' });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-3 sm:px-5 sm:py-4">
      <header className="flex flex-col gap-2">
        <Link
          href="/configuracoes"
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-900"
        >
          <ArrowLeft size={13} /> Configurações
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Sincronização</h1>
        <p className="text-sm text-neutral-500">
          O trabalho do dia fica no banco desta máquina. Com internet, cada alteração sobe para a nuvem
          como backup — e o que for feito em outro computador desce para cá.
        </p>
      </header>

      {carregando && (
        <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
          <Loader2 size={16} className="animate-spin" /> Lendo o estado do backup…
        </div>
      )}

      {!carregando && desktop === false && (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-6">
          <p className="flex items-center gap-2 text-sm font-medium text-neutral-800">
            <ShieldCheck size={16} /> Recurso do aplicativo desktop
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            No navegador o Ortus fala direto com a nuvem. O banco local e o backup automático existem
            apenas na versão instalada na clínica.
          </p>
        </div>
      )}

      {!carregando && desktop !== false && (
        <>
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Situação</p>
                <p className="mt-1 flex items-center gap-1.5 text-lg font-semibold text-neutral-900">
                  {estado?.estado === 'sincronizado' ? <Check size={17} className="text-emerald-600" /> : null}
                  {estado?.estado === 'offline' ? <WifiOff size={17} className="text-amber-600" /> : null}
                  {estado?.estado === 'erro' ? <AlertTriangle size={17} className="text-rose-600" /> : null}
                  {estado?.estado === 'sincronizando' ? <Loader2 size={17} className="animate-spin text-neutral-500" /> : null}
                  {estado ? ROTULO[estado.estado] : '—'}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Último envio bem-sucedido: <span className="tabular-nums">{quando(estado?.ultimoEnvioOk)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => void forcar()}
                disabled={forcando}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
              >
                {forcando ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Sincronizar agora
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-[#fafaf8] px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-neutral-400">Aguardando envio</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900">{estado?.pendentes ?? 0}</dd>
              </div>
              <div className="rounded-lg bg-[#fafaf8] px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-neutral-400">Conflitos</dt>
                <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${(estado?.conflitos ?? 0) > 0 ? 'text-amber-700' : 'text-neutral-900'}`}>
                  {estado?.conflitos ?? 0}
                </dd>
              </div>
              <div className="rounded-lg bg-[#fafaf8] px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-neutral-400">Cópia inicial</dt>
                <dd className="mt-0.5 flex items-center gap-1 text-sm font-medium text-neutral-900">
                  {estado?.bootstrap ? <><Database size={13} /> Baixada</> : <><Cloud size={13} /> Pendente</>}
                </dd>
              </div>
            </dl>

            {estado?.estado === 'offline' && (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Sem internet agora. A clínica continua trabalhando normalmente: as alterações ficam
                guardadas nesta máquina e sobem sozinhas quando a conexão voltar.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-black/5 px-4 py-3">
              <h2 className="text-sm font-semibold text-neutral-900">Conflitos</h2>
              <span className="text-xs text-neutral-400">{conflitos.length} pendente(s)</span>
            </div>

            {conflitos.length === 0 ? (
              <p className="px-4 py-6 text-sm text-neutral-500">
                Nenhum conflito. Quando o mesmo registro for alterado em dois computadores, a versão
                que perdeu aparece aqui para você decidir.
              </p>
            ) : (
              <ul className="divide-y divide-black/5">
                {conflitos.map((conflito) => (
                  <li key={conflito.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-700">
                        {conflito.tabela}
                      </span>
                      <span className="text-[11px] text-neutral-400">{quando(conflito.detectado_em)}</span>
                      <span className="ml-auto text-[11px] font-medium text-neutral-500">
                        Venceu: {conflito.escolhido === 'local' ? 'este computador' : 'a nuvem'}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-neutral-200 px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Aqui</p>
                        <p className="mt-0.5 break-words text-xs text-neutral-700">{resumo(conflito.versao_local)}</p>
                      </div>
                      <div className="rounded-lg border border-neutral-200 px-3 py-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Na nuvem</p>
                        <p className="mt-0.5 break-words text-xs text-neutral-700">{resumo(conflito.versao_remota)}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void resolver(conflito, 'local')}
                        className="inline-flex h-9 items-center rounded-md border border-neutral-200 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        Manter este computador
                      </button>
                      <button
                        type="button"
                        onClick={() => void resolver(conflito, 'remoto')}
                        className="inline-flex h-9 items-center rounded-md border border-neutral-200 px-3 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        Manter a nuvem
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
