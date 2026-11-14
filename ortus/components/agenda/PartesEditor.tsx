'use client';

import { Loader2, Plus, X } from 'lucide-react';
import CampoData from '@/components/ui/CampoData';
import CampoHora from '@/components/ui/CampoHora';
import CustomSelect from '@/components/ui/CustomSelect';
import {
  chaveLocal,
  horaLocal,
  parteVazia,
  resumoPartes,
  type ParteForm,
} from '@/lib/agendaPartes';

const DURACOES = [30, 45, 60, 90, 120] as const;

type Props = {
  partes: ParteForm[];
  onChange: (partes: ParteForm[]) => void;
  carregando?: boolean;
};

function proximaParte(ultima: ParteForm): ParteForm {
  const inicio = new Date(`${ultima.data}T${ultima.hora}:00`);
  const duracao = ultima.duracao || 60;
  if (Number.isNaN(inicio.getTime())) {
    return parteVazia(ultima.data, ultima.hora || '08:00', duracao);
  }
  const fim = new Date(inicio.getTime() + duracao * 60 * 1000);
  return parteVazia(chaveLocal(fim), horaLocal(fim), duracao);
}

function opcoesDuracao(duracao: number): Array<{ value: string; label: string }> {
  const valores = (DURACOES as readonly number[]).includes(duracao)
    ? Array.from(DURACOES)
    : [duracao, ...DURACOES];
  return Array.from(new Set(valores))
    .sort((a, b) => a - b)
    .map((minutos) => ({ value: String(minutos), label: `${minutos} min` }));
}

export default function PartesEditor({ partes, onChange, carregando = false }: Props) {
  function atualizar(key: string, patch: Partial<ParteForm>) {
    onChange(partes.map((parte) => (parte.key === key ? { ...parte, ...patch } : parte)));
  }

  function adicionar() {
    const ultima = partes[partes.length - 1];
    onChange([...partes, ultima ? proximaParte(ultima) : parteVazia(chaveLocal(new Date()))]);
  }

  function remover(key: string) {
    if (partes.length <= 1) return;
    onChange(partes.filter((parte) => parte.key !== key));
  }

  return (
    <div className="space-y-2.5" aria-busy={carregando}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-neutral-500">Partes do atendimento</p>
          <p className="mt-0.5 text-[11px] leading-4 text-neutral-400">
            Um mesmo atendimento pode ter partes em dias ou períodos diferentes.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
          {partes.length}
        </span>
      </div>

      {carregando && (
        <div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-500">
          <Loader2 size={14} className="animate-spin" />
          Carregando todas as partes do atendimento...
        </div>
      )}

      <div className="space-y-2">
        {partes.map((parte, indice) => (
          <div
            key={parte.key}
            className="rounded-lg border border-neutral-200 bg-white p-2.5 sm:p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1 text-[10px] font-semibold text-white">
                  {indice + 1}
                </span>
                <span className="text-xs font-medium text-neutral-600">Parte {indice + 1}</span>
                {parte.titulo.trim() && (
                  <span className="truncate text-[11px] text-neutral-400">· {parte.titulo.trim()}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => remover(parte.key)}
                disabled={partes.length <= 1}
                aria-label={`Remover parte ${indice + 1}`}
                title={partes.length <= 1 ? 'Mantenha ao menos uma parte' : `Remover parte ${indice + 1}`}
                className="touch-target inline-flex shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
              >
                <X size={15} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1.05fr)_minmax(0,0.75fr)_minmax(0,0.8fr)_minmax(0,1.1fr)] sm:gap-x-3">
              <label>
                <span className="mb-1 block text-[11px] font-medium text-neutral-500">Data</span>
                <CampoData
                  value={parte.data}
                  onChange={(v) => atualizar(parte.key, { data: v })}
                  disabled={carregando}
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-medium text-neutral-500">Hora</span>
                <CampoHora
                  value={parte.hora}
                  onChange={(v) => atualizar(parte.key, { hora: v })}
                  passo={30}
                  disabled={carregando}
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-medium text-neutral-500">Duração</span>
                <CustomSelect
                  value={String(parte.duracao)}
                  onChange={(v) => atualizar(parte.key, { duracao: Number(v) || 60 })}
                  options={opcoesDuracao(parte.duracao)}
                  disabled={carregando}
                  size="md"
                />
              </label>
              <label className="col-span-2 sm:col-span-1">
                <span className="mb-1 block text-[11px] font-medium text-neutral-500">Rótulo (opcional)</span>
                <input
                  value={parte.titulo}
                  onChange={(event) => atualizar(parte.key, { titulo: event.target.value })}
                  maxLength={40}
                  disabled={carregando}
                  placeholder="Manhã, Retorno, Sessão 2"
                  className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 disabled:bg-neutral-50"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={adicionar}
        disabled={carregando}
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50 disabled:opacity-50 sm:w-auto"
      >
        <Plus size={15} />
        Adicionar outra parte
      </button>

      <div className="rounded-md bg-neutral-50 px-3 py-2">
        <p className="text-xs font-medium text-neutral-700">{resumoPartes(partes)}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-neutral-400">
          Pode ser outro dia ou outro período do mesmo dia — todas as partes ficam no mesmo atendimento.
        </p>
      </div>
    </div>
  );
}
