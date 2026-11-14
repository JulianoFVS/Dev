'use client';

import { memo } from 'react';
import {
  nomePaciente,
  type EventoAgenda,
  type RegistroAgendamento,
} from '@/lib/agendaPartes';
import { corStatus } from '@/components/agenda/estilos';

type Props = {
  evento: EventoAgenda;
  corProfissional: string;
  onOpen: (registro: RegistroAgendamento) => void;
};

function ChipEvento({ evento, corProfissional, onOpen }: Props) {
  const props = evento.extendedProps;
  const inicio = new Date(evento.start);
  const horaValida = !Number.isNaN(inicio.getTime());
  const hora = horaValida
    ? inicio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '--:--';
  const paciente = nomePaciente(props) || 'Paciente';
  const tituloParte = props.parte_titulo?.trim();
  const total = Number(props.parte_total) || 1;
  const indice = Number(props.parte_indice) || 0;
  const duracao = Number(props.duracao_minutos) > 0 ? Number(props.duracao_minutos) : 60;
  const cancelado = props.status === 'cancelado';

  const descricao = [
    hora,
    tituloParte || null,
    paciente,
    props.procedimento || null,
    duracao !== 60 ? `${duracao} min` : null,
    total > 1 ? `parte ${indice + 1}/${total}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(props);
      }}
      title={descricao}
      aria-label={descricao}
      data-duracao={duracao}
      className="flex w-full min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-neutral-700 hover:bg-neutral-100"
    >
      <span
        aria-hidden
        className="h-3.5 w-[2px] shrink-0 rounded-full"
        style={{ backgroundColor: corProfissional }}
      />
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${corStatus(props.status)}`} />
      <span className={`min-w-0 truncate ${cancelado ? 'line-through text-neutral-400' : ''}`}>
        <span className="text-neutral-400">{hora}</span>
        {tituloParte && <span className="font-medium text-neutral-500"> · {tituloParte}</span>}
        <span> · {paciente}</span>
      </span>
      {total > 1 && (
        <span className="ml-auto shrink-0 rounded bg-neutral-100 px-1 text-[9px] font-medium leading-4 text-neutral-500">
          {indice + 1}/{total}
        </span>
      )}
    </button>
  );
}

export default memo(ChipEvento);
