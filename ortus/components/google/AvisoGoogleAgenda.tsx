'use client';

/**
 * Avisos do Google Agenda na agenda da Ortus:
 * - AvisoGoogleAgenda: faixa "N consultas não foram enviadas ao Google
 *   Agenda" com "Tentar de novo" (a consulta continua salva no Ortus);
 * - StatusGoogleConsulta: o estado de uma consulta no Google, no popup.
 * Lido da nuvem; sem internet, não aparece.
 */
import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck2, CalendarX2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { chamarApi } from '@/lib/apiAutenticada';

type Linha = { agendamento_id: number; estado: string; ultimo_erro: string | null };

/**
 * Põe as consultas de volta na fila (função do banco: vale no site e no
 * aplicativo de computador) e pede o envio já. No aplicativo o pedido não
 * envia nada e quem envia é a rotina rápida do servidor, em até 2 minutos.
 */
async function tentarEnviarDeNovo(agendamentoIds: number[]) {
  for (const id of agendamentoIds) await supabase.rpc('google_tentar_de_novo', { p_agendamento: id });
  await chamarApi('/api/google/empurrar', { metodo: 'POST', corpo: {} });
}

/** clinicaIds: as clínicas do escopo da agenda, separadas por vírgula. */
export function AvisoGoogleAgenda({ clinicaIds }: { clinicaIds: string }) {
  const [falhas, setFalhas] = useState<Linha[]>([]);
  const [tentando, setTentando] = useState(false);

  const carregar = useCallback(async () => {
    const ids = clinicaIds.split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0 || navigator.onLine === false) { setFalhas([]); return; }
    const { data } = await supabase.from('google_eventos')
      .select('agendamento_id, estado, ultimo_erro')
      .in('clinica_id', ids)
      .eq('estado', 'falha')
      .limit(50);
    setFalhas((data || []) as Linha[]);
  }, [clinicaIds]);

  useEffect(() => {
    void carregar();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void carregar(); }, 60_000);
    const aoEnviar = () => void carregar();
    window.addEventListener('ortus:google-atualizado', aoEnviar);
    return () => { window.clearInterval(timer); window.removeEventListener('ortus:google-atualizado', aoEnviar); };
  }, [carregar]);

  async function tentarDeNovo() {
    setTentando(true);
    await tentarEnviarDeNovo(falhas.slice(0, 20).map((f) => f.agendamento_id));
    setTentando(false);
    void carregar();
  }

  if (falhas.length === 0) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span className="flex items-center gap-1.5">
        <CalendarX2 size={15} />
        {falhas.length === 1 ? '1 consulta não foi enviada ao Google Agenda. No Ortus ela está salva.' : `${falhas.length} consultas não foram enviadas ao Google Agenda. No Ortus elas estão salvas.`}
      </span>
      <button type="button" onClick={tentarDeNovo} disabled={tentando} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 text-sm font-medium hover:bg-amber-100 disabled:opacity-50 sm:h-8">
        {tentando && <Loader2 size={14} className="animate-spin" />} Tentar de novo
      </button>
    </div>
  );
}

export function StatusGoogleConsulta({ agendamentoId }: { agendamentoId: number | null }) {
  const [linha, setLinha] = useState<Linha | null>(null);
  const [tentando, setTentando] = useState(false);

  const carregar = useCallback(async () => {
    if (!agendamentoId || navigator.onLine === false) { setLinha(null); return; }
    const { data } = await supabase.from('google_eventos')
      .select('agendamento_id, estado, ultimo_erro')
      .eq('agendamento_id', agendamentoId)
      .neq('estado', 'removido')
      .limit(1);
    setLinha(((data || []) as Linha[])[0] ?? null);
  }, [agendamentoId]);

  useEffect(() => { void carregar(); }, [carregar]);

  if (!linha) return null;
  if (linha.estado === 'enviado') {
    return <p className="flex items-center gap-1.5 text-xs text-neutral-500"><CalendarCheck2 size={13} className="text-emerald-600" /> No Google Agenda do profissional.</p>;
  }
  if (linha.estado !== 'falha') return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-amber-800">
      <CalendarX2 size={13} /> Não foi enviada ao Google Agenda{linha.ultimo_erro ? ` (${linha.ultimo_erro})` : ''}. No Ortus ela está salva.
      <button
        type="button"
        disabled={tentando}
        onClick={async () => {
          setTentando(true);
          if (agendamentoId) await tentarEnviarDeNovo([agendamentoId]);
          setTentando(false);
          void carregar();
        }}
        className="font-semibold underline underline-offset-2 disabled:opacity-50"
      >
        {tentando ? 'Tentando…' : 'Tentar de novo'}
      </button>
    </p>
  );
}
