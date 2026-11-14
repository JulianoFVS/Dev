'use client';

import { memo } from 'react';
import { corStatus } from '@/components/agenda/estilos';

export type PacienteEmbed = { nome?: string | null };

/** Linha de `agendamentos` embutida no evento da agenda. */
export type RegistroAgendamento = {
  id?: string | number | null;
  status?: string | null;
  profissional_id?: string | number | null;
  procedimento?: string | null;
  pacientes?: PacienteEmbed | PacienteEmbed[] | null;
  [campo: string]: unknown;
};

export type EventoAgenda = {
  id: string | number;
  title?: string;
  start: string;
  end?: string;
  extendedProps?: RegistroAgendamento;
};

export function nomePaciente(registro?: RegistroAgendamento | null): string {
  const embed = registro?.pacientes;
  if (Array.isArray(embed)) return embed[0]?.nome ?? '';
  return embed?.nome ?? '';
}

type Props = {
  evento: EventoAgenda;
  onOpen: (registro: RegistroAgendamento) => void;
};

/**
 * Chip de atendimento da agenda (mesma aparência do baseline):
 * bolinha do status + hora + paciente.
 */
function ChipEvento({ evento, onOpen }: Props) {
  const props = evento.extendedProps ?? {};
  const inicio = new Date(evento.start);
  const horaValida = !Number.isNaN(inicio.getTime());
  const hora = horaValida
    ? inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  const paciente = nomePaciente(props) || 'Paciente';
  const cancelado = props.status === 'cancelado';

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(props);
      }}
      title={`${hora} · ${paciente}`}
      aria-label={`${hora} · ${paciente}`}
      className="flex w-full min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-neutral-700 hover:bg-neutral-100"
    >
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${corStatus(props.status)}`} />
      <span className={`min-w-0 truncate ${cancelado ? 'line-through text-neutral-400' : ''}`}>
        <span className="text-neutral-400">{hora}</span> {paciente}
      </span>
    </button>
  );
}

export default memo(ChipEvento);
