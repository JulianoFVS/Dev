'use client';

/** Seção "Orçamentos" da ficha do paciente: os orçamentos dele e o botão de criar um novo. */
import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import EditorOrcamento from '@/components/orcamentos/EditorOrcamento';
import DetalheOrcamento from '@/components/orcamentos/DetalheOrcamento';
import { fetchUserEquipe, type ProfissionalEquipe } from '@/lib/clinicScoped';
import { listarOrcamentos } from '@/lib/db/orcamentos';
import {
  COR_STATUS_ORCAMENTO,
  ROTULO_STATUS_ORCAMENTO,
  formatarDia,
  formatarDinheiro,
  statusEfetivo,
  type Orcamento,
  type OrcamentoItem,
} from '@/lib/orcamentos';
import { hojeNoFuso } from '@/lib/fuso';
import { useMeuProfissionalId } from '@/lib/meuProfissional';

type Props = {
  pacienteId: string;
  pacienteNome: string;
  clinicaId: number | null;
  clinicaNome: string | null;
  /** Depois de aprovar: a ficha recarrega os tratamentos. */
  onMudou?: () => void;
};

export default function OrcamentosDoPaciente({ pacienteId, pacienteNome, clinicaId, clinicaNome, onMudou }: Props) {
  const meuId = useMeuProfissionalId();
  const [orcamentos, setOrcamentos] = useState<Orcamento[] | null>(null);
  const [equipe, setEquipe] = useState<ProfissionalEquipe[]>([]);
  const [editor, setEditor] = useState<{ orcamento: Orcamento | null; itens: OrcamentoItem[] } | null>(null);
  const [aberto, setAberto] = useState<Orcamento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!clinicaId) { setOrcamentos([]); return; }
    try {
      const lista = await listarOrcamentos({ clinicaIds: [clinicaId], pacienteId });
      setOrcamentos(lista);
      setAberto((atual) => (atual ? lista.find((o) => o.id === atual.id) ?? atual : atual));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os orçamentos.');
      setOrcamentos([]);
    }
  }, [clinicaId, pacienteId]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { void fetchUserEquipe().then(setEquipe).catch(() => setEquipe([])); }, []);

  const hoje = hojeNoFuso();

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-neutral-900">Orçamentos</h3>
        <button
          type="button"
          onClick={() => setEditor({ orcamento: null, itens: [] })}
          disabled={!clinicaId}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-8 sm:px-2.5"
        >
          <Plus size={14} /> Novo orçamento
        </button>
      </div>
      {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}
      {orcamentos === null ? (
        <div className="h-12 animate-pulse rounded-md bg-neutral-100" />
      ) : orcamentos.length === 0 ? (
        <p className="py-4 text-center text-sm text-neutral-400">Nenhum orçamento para este paciente.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {orcamentos.map((o) => {
            const s = statusEfetivo(o, hoje);
            return (
              <li key={o.id}>
                <button type="button" onClick={() => setAberto(o)} className="flex min-h-[44px] w-full items-center justify-between gap-3 py-2 text-left">
                  <span className="min-w-0">
                    <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${COR_STATUS_ORCAMENTO[s]}`}>{ROTULO_STATUS_ORCAMENTO[s]}</span>
                    <span className="text-xs text-neutral-500">criado em {formatarDia(o.created_at)} · válido até {formatarDia(o.validade)}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900">{formatarDinheiro(o.valor_total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <EditorOrcamento
        open={editor !== null}
        onClose={() => setEditor(null)}
        clinicaId={clinicaId}
        clinicas={clinicaId ? [{ id: clinicaId, nome: clinicaNome || 'Clínica' }] : []}
        paciente={{ id: pacienteId, nome: pacienteNome }}
        orcamento={editor?.orcamento ?? null}
        itens={editor?.itens ?? []}
        equipe={equipe}
        meuProfissionalId={meuId}
        onSalvo={(orc) => { void carregar(); setAberto(orc); }}
      />
      <DetalheOrcamento
        open={aberto !== null}
        onClose={() => setAberto(null)}
        orcamento={aberto}
        equipe={equipe}
        clinicaNome={clinicaNome}
        meuProfissionalId={meuId}
        onEditar={(orc, itens) => { setAberto(null); setEditor({ orcamento: orc, itens }); }}
        onMudou={() => { void carregar(); onMudou?.(); }}
      />
    </div>
  );
}
