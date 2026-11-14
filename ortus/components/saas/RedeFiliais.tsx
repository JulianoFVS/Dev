'use client';

import { useState } from 'react';
import { Building2, ChevronRight, HardDrive, Loader2, MoveRight, Pencil, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import CustomSelect from '@/components/ui/CustomSelect';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import {
  formatarBytes,
  mensagemDeErro,
  percentualArmazenamento,
  pluralizar,
  type ClinicaDaRedeSaaS,
  type RedeSaaS,
} from '@/lib/saas';
import { ChipSuave } from './StatusChips';
import { ErroInline, EstadoVazio } from './Feedback';
import ModalClinica from './ModalClinica';

const SEM_REDE = '__sem_rede__';

type Props = {
  redeId: string;
  clinicas: ClinicaDaRedeSaaS[];
  redes: RedeSaaS[];
  onAtualizar: () => Promise<void>;
};

export default function RedeFiliais({ redeId, clinicas, redes, onAtualizar }: Props) {
  const { showConfirm, showAlert } = useCustomAlert();
  const [destinos, setDestinos] = useState<Record<number, string>>({});
  const [movendo, setMovendo] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [modalClinica, setModalClinica] = useState(false);
  const [clinicaEmEdicao, setClinicaEmEdicao] = useState<ClinicaDaRedeSaaS | null>(null);

  const opcoesDestino = [
    ...redes
      .filter((rede) => rede.id !== redeId)
      .map((rede) => ({ value: rede.id, label: rede.nome })),
    { value: SEM_REDE, label: 'Sem rede (avulsa)' },
  ];

  function limparDestino(id: number) {
    setDestinos((atual) => {
      const proximo = { ...atual };
      delete proximo[id];
      return proximo;
    });
  }

  async function mover(clinica: ClinicaDaRedeSaaS, valor: string) {
    if (!valor) return;
    const semRede = valor === SEM_REDE;
    const destinoNome = semRede
      ? 'sem rede'
      : (redes.find((rede) => rede.id === valor)?.nome ?? 'outra rede');

    const ok = await showConfirm(
      semRede
        ? `Mover "${clinica.nome}" para fora da rede? A clínica ficará sem rede e deixará de contar nos totais desta rede.`
        : `Mover "${clinica.nome}" para a rede "${destinoNome}"? Profissionais, pacientes e armazenamento acompanham a clínica.`,
      { title: 'Mover clínica', confirmLabel: 'Mover', cancelLabel: 'Voltar', type: 'warning' },
    );
    if (!ok) {
      limparDestino(clinica.id);
      return;
    }

    setMovendo(clinica.id);
    setErro(null);
    try {
      const { error } = await supabase.rpc('saas_clinica_mover', {
        p_clinica: clinica.id,
        p_rede: semRede ? null : valor,
      });
      if (error) throw error;
      limparDestino(clinica.id);
      await onAtualizar();
      void showAlert(`"${clinica.nome}" foi movida para ${destinoNome}.`, {
        title: 'Clínica movida',
        type: 'success',
      });
    } catch (falha) {
      const mensagem = mensagemDeErro(falha, 'Não foi possível mover a clínica.');
      setErro(mensagem);
      void showAlert(mensagem, { title: 'Não foi possível mover', type: 'error' });
    } finally {
      setMovendo(null);
    }
  }

  function abrirNova() {
    setClinicaEmEdicao(null);
    setModalClinica(true);
  }

  function abrirEdicao(clinica: ClinicaDaRedeSaaS) {
    setClinicaEmEdicao(clinica);
    setModalClinica(true);
  }

  const modal = (
    <ModalClinica
      open={modalClinica}
      redeId={redeId}
      clinica={clinicaEmEdicao}
      onClose={() => setModalClinica(false)}
      onSalvo={onAtualizar}
    />
  );

  if (clinicas.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <EstadoVazio
          icone={<Building2 size={20} />}
          titulo="Esta rede ainda não tem unidades"
          descricao="Cadastre a primeira unidade ou traga uma clínica existente pelo bloco “Clínicas sem rede”."
        />
        <button
          type="button"
          onClick={abrirNova}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 self-start rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
        >
          <Plus size={15} /> Nova unidade
        </button>
        {modal}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-neutral-900">
            {pluralizar(clinicas.length, 'unidade na rede', 'unidades na rede')}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Cada rede aceita até 10 unidades. Mover remove a clínica desta rede.
          </p>
        </div>
        <button
          type="button"
          onClick={abrirNova}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"
        >
          <Plus size={15} /> <span className="max-sm:sr-only sm:inline">Nova unidade</span>
        </button>
      </div>

      <ErroInline mensagem={erro} />

      <ul className="flex flex-col gap-2">
        {clinicas.map((clinica) => {
          const percentual = percentualArmazenamento(
            clinica.armazenamento_bytes,
            clinica.limite_armazenamento_mb,
          );
          const limiteBytes =
            clinica.limite_armazenamento_mb != null
              ? clinica.limite_armazenamento_mb * 1024 * 1024
              : null;
          const cidade = [clinica.cidade, clinica.uf].filter(Boolean).join(' / ');
          return (
            <li key={clinica.id} className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex items-start gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-400">
                  {clinica.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- logo já publicada com URL pública
                    <img src={clinica.logo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Building2 size={17} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="min-w-0 truncate text-sm font-medium text-neutral-900">
                      {clinica.nome}
                    </p>
                    <ChipSuave tom={clinica.is_matriz ? 'verde' : 'neutro'}>
                      {clinica.is_matriz ? 'Matriz' : 'Filial'}
                    </ChipSuave>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                    {cidade || 'Cidade não informada'}
                    {clinica.telefone ? ` · ${clinica.telefone}` : ''}
                  </p>
                  {clinica.email && (
                    <p className="truncate text-[11px] text-neutral-400">{clinica.email}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => abrirEdicao(clinica)}
                  aria-label={`Editar ${clinica.nome}`}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 sm:h-9 sm:w-9"
                >
                  <Pencil size={14} />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-[#fafaf8] px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-neutral-400">Profissionais</p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums text-neutral-900">
                    {clinica.profissionais}
                  </p>
                </div>
                <div className="rounded-lg bg-[#fafaf8] px-2.5 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-neutral-400">Pacientes</p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums text-neutral-900">
                    {clinica.pacientes}
                  </p>
                </div>
              </div>

              <div className="mt-2.5">
                <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                  <span className="inline-flex items-center gap-1">
                    <HardDrive size={12} /> Armazenamento
                  </span>
                  <span className="tabular-nums text-neutral-600">
                    {formatarBytes(clinica.armazenamento_bytes)}
                    {limiteBytes != null ? ` / ${formatarBytes(limiteBytes)}` : ' · sem limite'}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full ${percentual != null && percentual >= 90 ? 'bg-rose-500' : 'bg-neutral-900'}`}
                    style={{ width: `${percentual ?? 0}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 border-t border-black/5 pt-2.5">
                <span className="mb-1.5 block text-[11px] font-medium text-neutral-500">
                  Mover para rede
                </span>
                <div className="flex items-center gap-2">
                  <CustomSelect
                    value={destinos[clinica.id] ?? ''}
                    onChange={(valor) => {
                      setDestinos((atual) => ({ ...atual, [clinica.id]: valor }));
                      void mover(clinica, valor);
                    }}
                    options={opcoesDestino}
                    placeholder="Selecione o destino..."
                    disabled={movendo !== null}
                    searchable={opcoesDestino.length > 6}
                    triggerClassName="!h-11"
                    size="md"
                  />
                  {movendo === clinica.id ? (
                    <Loader2 size={16} className="shrink-0 animate-spin text-neutral-500" />
                  ) : (
                    <MoveRight size={16} className="shrink-0 text-neutral-300" />
                  )}
                </div>
                {opcoesDestino.length === 1 && (
                  <p className="mt-1.5 text-[11px] text-neutral-400">
                    Não há outra rede cadastrada — a clínica só pode ficar sem rede.
                    <ChevronRight size={11} className="ml-1 inline" />
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {modal}
    </div>
  );
}
