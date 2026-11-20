'use client';

/**
 * Perfil → Google Agenda: cada profissional liga a própria agenda do Google.
 * As consultas dele vão para lá (primeiro nome e tipo, sem dado clínico) e,
 * se quiser, os compromissos marcados direto no Google ocupam o horário na
 * Ortus.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import Switch from '@/components/ui/Switch';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { chamarApi } from '@/lib/apiAutenticada';

type Status = {
  integracao: boolean;
  conectado: boolean;
  ativo: boolean;
  email: string | null;
  bloquear_horarios: boolean;
  ultimo_erro: string | null;
  /** Aplicativo de computador: a conexão é feita pelo site. */
  desktop?: boolean;
  site?: string | null;
};

export default function SecaoGoogleAgenda({ className = '' }: { className?: string }) {
  const { showAlert, showConfirm } = useCustomAlert();
  const parametros = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const r = await chamarApi<Status>('/api/google/status');
    if (r.ok) setStatus(r.dados);
    else setStatus({ integracao: false, conectado: false, ativo: false, email: null, bloquear_horarios: true, ultimo_erro: r.dados.error || null });
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  // Volta do Google: ?google=conectado | recusado | erro (um aviso só, mesmo
  // com o efeito rodando duas vezes no modo de desenvolvimento).
  const tratouVolta = useRef(false);
  useEffect(() => {
    const volta = parametros?.get('google');
    if (!volta || tratouVolta.current) return;
    tratouVolta.current = true;
    if (volta === 'conectado') void showAlert('Google Agenda conectada. As suas consultas começam a aparecer lá em instantes.', { type: 'success' });
    else if (volta === 'recusado') void showAlert('A conexão com o Google Agenda foi cancelada.', { type: 'warning' });
    else void showAlert('Não foi possível conectar o Google Agenda. Tente de novo.', { type: 'error' });
    window.history.replaceState(null, '', window.location.pathname);
  }, [parametros, showAlert]);

  async function conectar() {
    setOcupado(true);
    const r = await chamarApi<{ url: string }>('/api/google/conectar', { metodo: 'POST', corpo: {} });
    if (r.ok && r.dados.url) {
      window.location.assign(r.dados.url);
      return;
    }
    setOcupado(false);
    void showAlert(r.dados.error || 'Não foi possível começar a conexão.', { type: 'error' });
  }

  async function desconectar() {
    const ok = await showConfirm('As próximas consultas deixam de ir para o seu Google Agenda. Os eventos que já estão lá ficam.', {
      title: 'Desligar o Google Agenda?', confirmLabel: 'Desligar', type: 'warning',
    });
    if (!ok) return;
    setOcupado(true);
    const r = await chamarApi('/api/google/desconectar', { metodo: 'POST', corpo: {} });
    setOcupado(false);
    if (!r.ok) { void showAlert(r.dados.error || 'Não foi possível desligar.', { type: 'error' }); return; }
    void showAlert('Google Agenda desligada.', { type: 'success' });
    void carregar();
  }

  async function mudarBloqueio(valor: boolean) {
    setStatus((s) => (s ? { ...s, bloquear_horarios: valor } : s));
    const r = await chamarApi('/api/google/preferencias', { metodo: 'POST', corpo: { bloquear_horarios: valor } });
    if (!r.ok) {
      setStatus((s) => (s ? { ...s, bloquear_horarios: !valor } : s));
      void showAlert(r.dados.error || 'Não foi possível salvar.', { type: 'error' });
    }
  }

  return (
    <section className={className}>
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays size={16} className="text-neutral-500" />
        <h2 className="text-sm font-semibold text-neutral-900">Google Agenda</h2>
      </div>
      {status === null ? (
        <div className="h-12 animate-pulse rounded-xl bg-neutral-50" />
      ) : status.desktop ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-neutral-600">No aplicativo de computador, o Google Agenda é ligado e desligado pelo site do Ortus, com o mesmo login. Ligado lá, as consultas marcadas aqui também vão para o Google quando sincronizarem.</p>
          {status.site && (
            <a href={`${status.site}/perfil`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
              Abrir o site
            </a>
          )}
        </div>
      ) : !status.integracao && !status.conectado ? (
        <p className="text-sm text-neutral-500">A integração com o Google Agenda ainda não foi ligada pela Ortus.</p>
      ) : !status.conectado ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-neutral-600">Ligue a sua agenda do Google: as consultas que você atende aparecem lá (só o primeiro nome do paciente e o tipo da consulta).</p>
          <button type="button" onClick={conectar} disabled={ocupado} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-10">
            {ocupado && <Loader2 size={16} className="animate-spin" />} Conectar Google Agenda
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-700">
            Conectada{status.email ? <> a <span className="font-medium text-neutral-900">{status.email}</span></> : null}.
            {!status.ativo && <span className="text-amber-700"> O acesso foi retirado no Google: conecte de novo.</span>}
          </p>
          {status.ultimo_erro && <p className="text-xs text-amber-700">Último problema: {status.ultimo_erro}</p>}
          <Switch checked={status.bloquear_horarios} onChange={(v) => void mudarBloqueio(v)}>
            <span className="text-sm text-neutral-700">Compromissos marcados direto no Google ocupam o meu horário no Ortus</span>
          </Switch>
          <div className="flex flex-wrap gap-2">
            {!status.ativo && (
              <button type="button" onClick={conectar} disabled={ocupado} className="inline-flex h-11 items-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-10">Conectar de novo</button>
            )}
            <button type="button" onClick={desconectar} disabled={ocupado} className="inline-flex h-11 items-center rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 sm:h-10">Desligar</button>
          </div>
        </div>
      )}
    </section>
  );
}
