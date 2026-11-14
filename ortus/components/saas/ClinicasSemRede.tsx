'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, CheckCircle2, ChevronDown, Link2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import CustomSelect from '@/components/ui/CustomSelect';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import {
  mensagemDeErro,
  pluralizar,
  type ClinicaSemRedeSaaS,
  type RedeSaaS,
} from '@/lib/saas';
import { ErroInline, SkeletonBloco } from './Feedback';

type Props = {
  clinicas: ClinicaSemRedeSaaS[];
  redes: RedeSaaS[];
  carregando: boolean;
  onAtualizar: () => Promise<void>;
};

export default function ClinicasSemRede({ clinicas, redes, carregando, onAtualizar }: Props) {
  const { showConfirm, showAlert } = useCustomAlert();
  const [aberto, setAberto] = useState(false);
  const [destinos, setDestinos] = useState<Record<number, string>>({});
  const [vinculando, setVinculando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const usuarioEscolheu = useRef(false);

  useEffect(() => {
    if (clinicas.length > 0 && !usuarioEscolheu.current) setAberto(true);
  }, [clinicas.length]);

  function alternar() {
    usuarioEscolheu.current = true;
    setAberto((atual) => !atual);
  }

  function limparDestino(id: number) {
    setDestinos((atual) => {
      const proximo = { ...atual };
      delete proximo[id];
      return proximo;
    });
  }

  async function vincular(clinica: ClinicaSemRedeSaaS, redeId: string) {
    if (!redeId) return;
    const rede = redes.find((item) => item.id === redeId);
    const ok = await showConfirm(
      `Vincular a clínica "${clinica.nome}" à rede "${rede?.nome ?? 'selecionada'}"? A clínica passará a contar nos totais e faturas da rede.`,
      { title: 'Vincular clínica', confirmLabel: 'Vincular', cancelLabel: 'Voltar', type: 'warning' },
    );
    if (!ok) {
      limparDestino(clinica.id);
      return;
    }

    setVinculando(clinica.id);
    setErro(null);
    try {
      const { error } = await supabase.rpc('saas_clinica_mover', {
        p_clinica: clinica.id,
        p_rede: redeId,
      });
      if (error) throw error;
      limparDestino(clinica.id);
      await onAtualizar();
      void showAlert(`"${clinica.nome}" agora faz parte de "${rede?.nome ?? 'rede'}".`, {
        title: 'Clínica vinculada',
        type: 'success',
      });
    } catch (falha) {
      const mensagem = mensagemDeErro(falha, 'Não foi possível vincular a clínica.');
      setErro(mensagem);
      void showAlert(mensagem, { title: 'Não foi possível vincular', type: 'error' });
    } finally {
      setVinculando(null);
    }
  }

  const opcoesRedes = redes.map((rede) => ({ value: rede.id, label: rede.nome }));

  return (
    <section className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberto}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f3f4f1] text-neutral-600">
            <Building2 size={14} />
          </span>
          <span className="min-w-0 truncate text-sm font-medium text-neutral-900">
            Clínicas sem rede
          </span>
          <span className="rounded-full bg-[#f3f4f1] px-2 py-0.5 text-[11px] font-medium tabular-nums text-neutral-600">
            {clinicas.length}
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-neutral-400 transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
      </button>

      {aberto && (
        <div className="min-h-0 border-t border-black/5 px-3 py-3 lg:max-h-56 lg:overflow-y-auto">
          {carregando && clinicas.length === 0 ? (
            <div className="space-y-2" aria-busy="true">
              <SkeletonBloco className="h-12 w-full" />
              <SkeletonBloco className="h-12 w-full" />
            </div>
          ) : clinicas.length === 0 ? (
            <p className="flex items-center gap-2 px-1 py-2 text-xs text-neutral-500">
              <CheckCircle2 size={14} className="shrink-0 text-emerald-600" />
              Todas as clínicas da plataforma estão vinculadas a uma rede.
            </p>
          ) : (
            <>
              <p className="mb-2 px-1 text-[11px] leading-relaxed text-neutral-500">
                Clínicas fora de rede não entram nos totais nem nas faturas de nenhuma rede.
              </p>
              <ErroInline mensagem={erro} className="mb-2" />
              <ul className="space-y-2">
                {clinicas.map((clinica) => (
                  <li
                    key={clinica.id}
                    className="flex flex-col gap-2 rounded-lg border border-neutral-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900">
                        {clinica.nome}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {clinica.is_matriz ? 'Matriz' : 'Filial'} · sem rede
                      </p>
                    </div>
                    {redes.length === 0 ? (
                      <p className="text-[11px] text-neutral-500 sm:text-right">
                        Crie uma rede para vincular esta clínica.
                      </p>
                    ) : (
                      <div className="w-full sm:w-56">
                        <CustomSelect
                          value={destinos[clinica.id] ?? ''}
                          onChange={(valor) => {
                            setDestinos((atual) => ({ ...atual, [clinica.id]: valor }));
                            void vincular(clinica, valor);
                          }}
                          options={opcoesRedes}
                          placeholder="Vincular à rede..."
                          disabled={vinculando !== null}
                          searchable={opcoesRedes.length > 6}
                          triggerClassName="!h-11"
                          size="md"
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {vinculando !== null && (
                <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-neutral-500">
                  <Link2 size={12} /> Vinculando clínica...
                </p>
              )}
              {clinicas.length > 1 && (
                <p className="mt-2 px-1 text-[11px] text-neutral-400">
                  {pluralizar(clinicas.length, 'clínica esperando rede', 'clínicas esperando rede')}.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
