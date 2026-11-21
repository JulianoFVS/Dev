'use client';

/**
 * Cartão "Meta de vendas" do Financeiro: aprovado no mês, quanto falta, o
 * ritmo e, à parte, quanto entrou no caixa. O administrador define a meta
 * (total e por profissional).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, Target, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { fetchUserEquipe, type ProfissionalEquipe } from '@/lib/clinicScoped';
import { carregarMetas, carregarResumoMeta, rotuloDoMes, salvarMetas, type ResumoMeta } from '@/lib/metas';
import { formatarDinheiro, numero } from '@/lib/orcamentos';
import { hojeNoFuso } from '@/lib/fuso';
import { useAdminDaClinica } from '@/lib/meuProfissional';

type Props = {
  clinicaIds: number[];
  /** Clínica escolhida no menu; vazia em "Todas as clínicas" (aí a meta só é mostrada, somada). */
  clinicaFixa: number | null;
  /** AAAA-MM */
  mes: string;
  className?: string;
};

const inputClass = 'box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900';

export default function CartaoMeta({ clinicaIds, clinicaFixa, mes, className = '' }: Props) {
  const { showAlert } = useCustomAlert();
  const admin = useAdminDaClinica(clinicaFixa);
  const [resumo, setResumo] = useState<ResumoMeta | null>(null);
  const [equipe, setEquipe] = useState<ProfissionalEquipe[]>([]);
  const [aberto, setAberto] = useState(false);
  const [detalhe, setDetalhe] = useState(false);
  const [total, setTotal] = useState('');
  const [porProf, setPorProf] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const chave = clinicaIds.join(',');

  const carregar = useCallback(async () => {
    try {
      setResumo(await carregarResumoMeta({ clinicaIds, mes, hoje: hojeNoFuso() }));
    } catch {
      setResumo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, mes]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { void fetchUserEquipe().then(setEquipe).catch(() => setEquipe([])); }, []);

  const equipeDaClinica = useMemo(
    () => (clinicaFixa ? equipe.filter((p) => p.clinicas?.some((c) => Number(c.id) === clinicaFixa)) : []),
    [equipe, clinicaFixa],
  );
  const nomeDe = (id: number) => equipe.find((p) => Number(p.id) === id)?.nome || 'Profissional';

  async function abrirModal() {
    if (!clinicaFixa) return;
    setErro(null);
    try {
      const metas = await carregarMetas([clinicaFixa], mes);
      setTotal(String(metas.find((m) => m.profissional_id == null)?.valor ?? ''));
      const mapa: Record<string, string> = {};
      for (const m of metas) if (m.profissional_id != null) mapa[String(m.profissional_id)] = String(m.valor);
      setPorProf(mapa);
      setAberto(true);
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Não foi possível abrir as metas.', { type: 'error' });
    }
  }

  async function salvar() {
    if (!clinicaFixa) return;
    const valorTotal = total.trim() ? numero(total) : null;
    if (valorTotal != null && valorTotal < 0) { setErro('A meta não pode ser negativa.'); return; }
    setSalvando(true);
    setErro(null);
    try {
      const mapa = new Map<number, number | null>();
      for (const p of equipeDaClinica) {
        const v = porProf[String(p.id)];
        mapa.set(Number(p.id), v && v.trim() ? numero(v) : null);
      }
      await salvarMetas(clinicaFixa, mes, valorTotal, mapa);
      void showAlert('Metas salvas.', { type: 'success' });
      setAberto(false);
      void carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar as metas.');
    } finally {
      setSalvando(false);
    }
  }

  const meta = resumo?.metaTotal ?? null;
  const aprovado = resumo?.aprovado ?? 0;
  const pct = meta && meta > 0 ? Math.min(100, Math.round((aprovado / meta) * 100)) : null;
  const atrasado = meta != null && resumo?.esperadoAteHoje != null && aprovado < resumo.esperadoAteHoje;
  const pessoas = useMemo(() => {
    if (!resumo) return [];
    const ids = new Set<number>([...resumo.metasPorProfissional.keys(), ...resumo.aprovadoPorProfissional.keys()]);
    return Array.from(ids).map((id) => ({ id, meta: resumo.metasPorProfissional.get(id) ?? null, aprovado: resumo.aprovadoPorProfissional.get(id) ?? 0 }))
      .sort((a, b) => b.aprovado - a.aprovado);
  }, [resumo]);

  return (
    <section className={`rounded-xl border border-neutral-200 bg-white p-3 sm:p-4 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-500"><Target size={13} /> Meta de vendas · {rotuloDoMes(mes)}</p>
          {resumo === null ? (
            <div className="mt-2 h-7 w-40 animate-pulse rounded-md bg-neutral-100" />
          ) : (
            <p className="mt-1 text-xl font-semibold text-neutral-900">
              {formatarDinheiro(aprovado)}
              <span className="ml-1.5 text-sm font-normal text-neutral-500">{meta != null ? `aprovados de ${formatarDinheiro(meta)}${pct != null ? ` (${pct}%)` : ''}` : 'aprovados · sem meta definida'}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {pessoas.length > 0 && (
            <button type="button" onClick={() => setDetalhe((v) => !v)} className="inline-flex h-10 items-center gap-1 rounded-md px-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 sm:h-8">
              Por profissional <ChevronDown size={14} className={detalhe ? 'rotate-180' : ''} />
            </button>
          )}
          {admin && clinicaFixa && (
            <button type="button" onClick={abrirModal} className="inline-flex h-10 items-center rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50 sm:h-8">
              {meta != null || pessoas.some((p) => p.meta != null) ? 'Editar meta' : 'Definir meta'}
            </button>
          )}
        </div>
      </div>

      {meta != null && meta > 0 && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
          <div className={`h-full rounded-full ${atrasado ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct ?? 0}%` }} />
        </div>
      )}

      {resumo && (
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-500">
          {resumo.falta != null && <p>Falta <span className="font-medium text-neutral-900">{formatarDinheiro(resumo.falta)}</span></p>}
          {resumo.esperadoAteHoje != null && resumo.diaAtual > 0 && resumo.diaAtual < resumo.diasNoMes && (
            <p>Esperado até hoje <span className={`font-medium ${atrasado ? 'text-amber-700' : 'text-neutral-900'}`}>{formatarDinheiro(resumo.esperadoAteHoje)}</span></p>
          )}
          {resumo.projecao != null && resumo.diaAtual < resumo.diasNoMes && (
            <p>No ritmo atual, fecha o mês em <span className="font-medium text-neutral-900">{formatarDinheiro(resumo.projecao)}</span></p>
          )}
          <p className="basis-full sm:basis-auto">Entrou no caixa <span className="font-medium text-neutral-900">{formatarDinheiro(resumo.caixa)}</span></p>
        </div>
      )}

      {detalhe && pessoas.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100 border-t border-neutral-100">
          {pessoas.map((p) => {
            const pp = p.meta && p.meta > 0 ? Math.min(100, Math.round((p.aprovado / p.meta) * 100)) : null;
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-neutral-800">{nomeDe(p.id)}</span>
                <span className="shrink-0 tabular-nums text-neutral-600">
                  {formatarDinheiro(p.aprovado)}{p.meta != null ? ` de ${formatarDinheiro(p.meta)}` : ''}{pp != null ? ` · ${pp}%` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={aberto} onClose={() => setAberto(false)} maxWidth="md" hideCloseButton panelClassName="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Meta de vendas</h2>
            <p className="mt-0.5 text-sm text-neutral-500">{rotuloDoMes(mes)}: quanto aprovar em orçamentos.</p>
          </div>
          <button type="button" onClick={() => setAberto(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:h-8 sm:w-8" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 sm:px-6">
          <label>
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Meta da clínica (R$)</span>
            <input type="number" min={0} step="100" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={inputClass} placeholder="Ex.: 50000" />
          </label>
          {equipeDaClinica.length > 0 && (
            <div>
              <p className="mb-2 text-base font-semibold text-neutral-900">Por profissional <span className="text-sm font-normal text-neutral-400">(opcional)</span></p>
              <div className="flex flex-col gap-2">
                {equipeDaClinica.map((p) => (
                  <label key={p.id} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3">
                    <span className="truncate text-sm text-neutral-800">{p.nome}</span>
                    <input
                      type="number"
                      min={0}
                      step="100"
                      inputMode="decimal"
                      value={porProf[String(p.id)] ?? ''}
                      onChange={(e) => setPorProf((a) => ({ ...a, [String(p.id)]: e.target.value }))}
                      className={inputClass}
                      aria-label={`Meta de ${p.nome}`}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-neutral-400">Campo vazio tira a meta. Aprovado é o valor final dos orçamentos aprovados no mês.</p>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-black/5 px-5 py-4 sm:px-6">
          <button type="button" onClick={() => setAberto(false)} className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50 sm:h-9">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9">
            {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </div>
      </Modal>
    </section>
  );
}
