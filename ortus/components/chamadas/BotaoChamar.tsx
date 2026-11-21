'use client';

/**
 * Chamar na TV: o paciente de um agendamento (BotaoChamar) ou uma senha
 * avulsa para quem chegou sem consulta (BotaoSenha). Com um local só, chama
 * direto; com vários, pergunta onde.
 */
import { useState } from 'react';
import { Loader2, Megaphone, Ticket, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { carregarConfigChamada, chamarPaciente, chamarSenha, textoDaChamada } from '@/lib/chamadas';

type Destino = { titulo: string; executar: (local: string | null) => Promise<string> };

function useEscolherLocal(clinicaId: number | null) {
  const { showAlert } = useCustomAlert();
  const [locais, setLocais] = useState<string[] | null>(null);
  const [destino, setDestino] = useState<Destino | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function iniciar(d: Destino) {
    if (!clinicaId) {
      void showAlert('Escolha uma clínica no menu para chamar na TV.', { type: 'warning' });
      return;
    }
    setOcupado(true);
    try {
      const config = await carregarConfigChamada(clinicaId);
      if (config.locais.length <= 1) {
        const msg = await d.executar(config.locais[0] ?? null);
        void showAlert(msg, { type: 'success' });
      } else {
        setLocais(config.locais);
        setDestino(d);
      }
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Não foi possível chamar.', { type: 'error' });
    } finally {
      setOcupado(false);
    }
  }

  async function escolher(local: string) {
    if (!destino) return;
    setOcupado(true);
    try {
      const msg = await destino.executar(local);
      setDestino(null);
      void showAlert(msg, { type: 'success' });
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Não foi possível chamar.', { type: 'error' });
    } finally {
      setOcupado(false);
    }
  }

  const modal = (
    <Modal open={destino !== null} onClose={() => setDestino(null)} maxWidth="sm" zIndex={120} hideCloseButton panelClassName="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-black/5 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">{destino?.titulo}</h2>
          <p className="mt-0.5 text-sm text-neutral-500">Em qual local?</p>
        </div>
        <button type="button" onClick={() => setDestino(null)} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:h-8 sm:w-8" aria-label="Fechar"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2 px-5 py-4">
        {(locais || []).map((l) => (
          <button key={l} type="button" disabled={ocupado} onClick={() => void escolher(l)} className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-neutral-200 px-3 text-sm font-medium text-neutral-900 hover:border-neutral-900 disabled:opacity-40">
            {l}
          </button>
        ))}
      </div>
    </Modal>
  );

  return { iniciar, ocupado, modal };
}

export function BotaoChamar({ clinicaId, agendamentoId, pacienteId, className = '', compacto = false }: {
  clinicaId: number | null;
  agendamentoId?: number | null;
  pacienteId?: string | null;
  className?: string;
  compacto?: boolean;
}) {
  const { iniciar, ocupado, modal } = useEscolherLocal(clinicaId);
  return (
    <>
      <button
        type="button"
        disabled={ocupado}
        onClick={(e) => {
          e.stopPropagation();
          void iniciar({
            titulo: 'Chamar na TV',
            executar: async (local) => {
              const c = await chamarPaciente({ clinicaId: clinicaId!, agendamentoId, pacienteId, local });
              return `Chamado na TV: ${textoDaChamada(c)}${c.local ? ` · ${c.local}` : ''}.`;
            },
          });
        }}
        className={className || `inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-40 ${compacto ? 'sm:h-8 sm:px-2.5 sm:text-xs' : 'sm:h-9'}`}
        title="Chamar o paciente na TV da sala de espera"
      >
        {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Megaphone size={14} />} Chamar
      </button>
      {modal}
    </>
  );
}

export function BotaoSenha({ clinicaId, className = '' }: { clinicaId: number | null; className?: string }) {
  const { iniciar, ocupado, modal } = useEscolherLocal(clinicaId);
  return (
    <>
      <button
        type="button"
        disabled={ocupado}
        onClick={() => void iniciar({
          titulo: 'Chamar senha',
          executar: async (local) => {
            const c = await chamarSenha({ clinicaId: clinicaId!, local });
            return `${textoDaChamada(c)} chamada na TV${c.local ? ` · ${c.local}` : ''}.`;
          },
        })}
        className={className || 'inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-40'}
        title="Gera a próxima senha do dia e chama na TV"
      >
        {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Ticket size={14} />} Senha
      </button>
      {modal}
    </>
  );
}
