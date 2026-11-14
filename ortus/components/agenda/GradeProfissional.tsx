'use client';

import { memo, useMemo, type RefObject } from 'react';
import ChipEvento, { type EventoAgenda, type RegistroAgendamento } from '@/components/agenda/ChipEvento';

export type ColunaProfissional = {
  id: string;
  nome: string;
  cor: string;
  /** Coluna dos atendimentos sem profissional vinculado. */
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
  gradeRef: RefObject<HTMLDivElement | null>;
  onAbrirNoDia: (dia: Date, hora: string, profissionalId?: string) => void;
  onAbrirEvento: (registro: RegistroAgendamento) => void;
};

function chaveLocal(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function rotuloHora(hora: number): string {
  return `${String(hora).padStart(2, '0')}:00`;
}

function chaveProfissional(coluna: ColunaProfissional): string {
  return coluna.semProfissional ? '' : coluna.id;
}

/**
 * Visão da agenda com uma coluna por profissional.
 *
 * Reaproveita a mesma grade de horas da visão Dia. No mobile as colunas
 * viram um carrossel horizontal com snap (cada uma ocupa 85% da tela para
 * nunca miniaturizar os atendimentos); a partir de `sm` elas dividem a
 * largura disponível com um mínimo confortável de 13rem.
 */
function GradeProfissional({
  dia,
  horas,
  colunas,
  eventosPorDia,
  agora,
  gradeRef,
  onAbrirNoDia,
  onAbrirEvento,
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
    const mapa = new Map<string, number>();
    eventosDoDia.forEach((evento) => {
      const profissionalId = evento.extendedProps?.profissional_id;
      const chave = profissionalId == null ? '' : String(profissionalId);
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
    });
    return mapa;
  }, [eventosDoDia]);

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

  const classeColuna =
    'min-w-[85%] flex-1 shrink-0 snap-center border-l border-neutral-100 sm:min-w-[13rem]';

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:min-h-[26rem]">
      <div
        ref={gradeRef}
        className="min-h-0 flex-1 snap-x snap-mandatory scroll-pl-[3.25rem] overflow-x-auto overflow-y-auto overscroll-contain sm:snap-none"
      >
        <div className="min-w-full">
          <div className="sticky top-0 z-30 flex bg-white">
            <div className="sticky left-0 z-40 w-[3.25rem] shrink-0 border-b border-r border-neutral-200 bg-white" />
            {colunas.map((coluna) => {
              const total = contagemPorProfissional.get(chaveProfissional(coluna)) ?? 0;
              return (
                <div
                  key={coluna.id}
                  className={`${classeColuna} border-b border-neutral-200 bg-white px-2 py-1.5`}
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
                  <span className="mt-0.5 block truncate text-[10px] font-medium text-neutral-400">
                    {total} {total === 1 ? 'atendimento' : 'atendimentos'}
                  </span>
                </div>
              );
            })}
          </div>

          {horas.map((hora) => (
            <div key={hora} className="flex">
              <div className="sticky left-0 z-20 w-[3.25rem] shrink-0 border-b border-r border-neutral-100 bg-white px-1 pt-1 text-right text-[11px] text-neutral-400">
                {rotuloHora(hora)}
              </div>
              {colunas.map((coluna) => {
                const lista = eventosPorProfissionalEHora.get(`${chaveProfissional(coluna)}|${hora}`) ?? [];
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
                    className={`${classeColuna} relative min-h-12 cursor-pointer border-b border-neutral-100 p-0.5 hover:bg-neutral-50`}
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
                      <ChipEvento key={evento.id} evento={evento} onOpen={onAbrirEvento} />
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(GradeProfissional);
