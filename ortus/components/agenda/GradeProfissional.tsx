'use client';

import { memo, useMemo, type RefObject } from 'react';
import ChipEvento from '@/components/agenda/ChipEvento';
import {
  chaveLocal,
  mesmoDia,
  type EventoAgenda,
  type RegistroAgendamento,
} from '@/lib/agendaPartes';

export type ColunaProfissional = {
  id: string;
  nome: string;
  cor: string;
  semProfissional?: boolean;
  /** Profissional fora da equipe visível: coluna só para exibir, sem preset. */
  desconhecido?: boolean;
};

type Props = {
  dia: Date;
  horas: number[];
  colunas: ColunaProfissional[];
  eventosPorDia: Map<string, EventoAgenda[]>;
  agora: Date;
  mobile: boolean;
  gradeRef: RefObject<HTMLDivElement | null>;
  onAbrirNoDia: (dia: Date, hora: string, profissionalId?: string) => void;
  onAbrirEvento: (registro: RegistroAgendamento) => void;
  corDoEvento: (registro: RegistroAgendamento) => string;
};

function rotuloHora(hora: number): string {
  return `${String(hora).padStart(2, '0')}:00`;
}

function GradeProfissional({
  dia,
  horas,
  colunas,
  eventosPorDia,
  agora,
  mobile,
  gradeRef,
  onAbrirNoDia,
  onAbrirEvento,
  corDoEvento,
}: Props) {
  const eventosDoDia = useMemo(
    () => eventosPorDia.get(chaveLocal(dia)) ?? [],
    [eventosPorDia, dia],
  );

  const eventosPorProfissionalEHora = useMemo(() => {
    const mapa = new Map<string, EventoAgenda[]>();
    eventosDoDia.forEach((evento) => {
      const profissionalId = evento.extendedProps?.profissional_id;
      const inicio = new Date(evento.start);
      if (Number.isNaN(inicio.getTime())) return;
      const chave = `${profissionalId == null ? '' : String(profissionalId)}|${inicio.getHours()}`;
      const lista = mapa.get(chave) ?? [];
      lista.push(evento);
      mapa.set(chave, lista);
    });
    return mapa;
  }, [eventosDoDia]);

  const contagemPorProfissional = useMemo(() => {
    const mapa = new Map<string, Set<string>>();
    eventosDoDia.forEach((evento) => {
      const props = evento.extendedProps;
      const chaveProfissional = props?.profissional_id == null ? '' : String(props.profissional_id);
      const chaveAtendimento = String(props?.grupo_id || evento.id);
      const grupos = mapa.get(chaveProfissional) ?? new Set<string>();
      grupos.add(chaveAtendimento);
      mapa.set(chaveProfissional, grupos);
    });
    const contagem = new Map<string, number>();
    mapa.forEach((grupos, chave) => contagem.set(chave, grupos.size));
    return contagem;
  }, [eventosDoDia]);

  // No mobile cada coluna ocupa 85% da largura visível (carrossel com snap),
  // para nunca miniaturizar os atendimentos. No desktop, largura mínima fixa.
  const larguraMinima = mobile ? '85%' : '13rem';
  const colunasGrade = `3.25rem repeat(${colunas.length}, minmax(${larguraMinima}, 1fr))`;
  const linhasGrade = `3.25rem repeat(${horas.length}, minmax(3rem, auto))`;

  if (!colunas.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white px-4 py-10 text-center max-sm:min-h-[22rem]">
        <p className="text-sm font-medium text-neutral-700">Nenhum profissional para exibir</p>
        <p className="mt-1 text-xs text-neutral-400">
          Selecione outro filtro ou cadastre profissionais na equipe da clínica.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:min-h-[26rem]">
      <div
        ref={gradeRef}
        className="min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-auto overscroll-contain custom-scrollbar sm:snap-none"
      >
        <div
          className="grid min-w-full"
          style={{ gridTemplateColumns: colunasGrade, gridTemplateRows: linhasGrade }}
        >
          <div
            className="sticky left-0 top-0 z-40 border-b border-r border-neutral-200 bg-white"
            style={{ gridColumn: 1, gridRow: 1 }}
          />
          <div
            className="sticky left-0 z-20 grid bg-white"
            style={{ gridColumn: 1, gridRow: '2 / -1', gridTemplateRows: 'subgrid' }}
          >
            {horas.map((hora) => (
              <div
                key={hora}
                className="border-b border-r border-neutral-100 bg-white px-1 pt-1 text-right text-[11px] text-neutral-400"
              >
                {rotuloHora(hora)}
              </div>
            ))}
          </div>

          {colunas.map((coluna, indice) => {
            const chaveProfissional = coluna.semProfissional ? '' : coluna.id;
            const total = contagemPorProfissional.get(chaveProfissional) ?? 0;
            return (
              <div
                key={coluna.id}
                className="grid min-w-0 snap-center border-l border-neutral-100"
                style={{
                  gridColumn: indice + 2,
                  gridRow: '1 / -1',
                  gridTemplateRows: 'subgrid',
                }}
              >
                <div
                  className="sticky top-0 z-30 flex flex-col justify-center gap-0.5 border-b border-neutral-200 bg-white px-2"
                  style={{ boxShadow: `inset 0 3px 0 ${coluna.cor}` }}
                  title={coluna.nome}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/5"
                      style={{ backgroundColor: coluna.cor }}
                    />
                    <span className="truncate text-xs font-semibold text-neutral-800">{coluna.nome}</span>
                  </div>
                  <span className="truncate text-[10px] font-medium text-neutral-400">
                    {total} {total === 1 ? 'atendimento' : 'atendimentos'}
                  </span>
                </div>

                {horas.map((hora) => {
                  const lista = eventosPorProfissionalEHora.get(`${chaveProfissional}|${hora}`) ?? [];
                  const mostraAgora = mesmoDia(dia, agora) && agora.getHours() === hora;
                  return (
                    <div
                      key={`${coluna.id}-${hora}`}
                      onClick={() =>
                        onAbrirNoDia(
                          dia,
                          rotuloHora(hora),
                          coluna.semProfissional || coluna.desconhecido ? undefined : coluna.id,
                        )
                      }
                      className="relative min-h-12 cursor-pointer border-b border-neutral-100 p-0.5 hover:bg-neutral-50"
                    >
                      {mostraAgora && (
                        <div
                          data-agora=""
                          className="pointer-events-none absolute inset-x-0 z-10"
                          style={{ top: `${(agora.getMinutes() / 60) * 100}%` }}
                        >
                          <span className="absolute left-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
                          <span className="absolute left-0 right-0 h-0.5 -translate-y-1/2 bg-red-500" />
                        </div>
                      )}
                      {lista.map((evento) => (
                        <ChipEvento
                          key={evento.id}
                          evento={evento}
                          corProfissional={corDoEvento(evento.extendedProps)}
                          onOpen={onAbrirEvento}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(GradeProfissional);
