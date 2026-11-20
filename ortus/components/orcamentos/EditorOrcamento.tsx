'use client';

/**
 * Criar ou editar um orçamento: paciente, profissional, comercial, validade,
 * itens do catálogo (com o preço do plano do paciente) e desconto.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import CustomSelect from '@/components/ui/CustomSelect';
import CampoData from '@/components/ui/CampoData';
import ProcedureCombobox, { type ProcedimentoOption } from '@/components/forms/ProcedureCombobox';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { dados as tabelas } from '@/lib/local/consulta';
import { lerTudo } from '@/lib/paginar';
import { salvarOrcamento, type ItemEditado } from '@/lib/db/orcamentos';
import {
  VALIDADE_PADRAO_DIAS,
  formatarDinheiro,
  numero,
  somarDias,
  somarItens,
  valorFinal,
  type Orcamento,
  type OrcamentoItem,
} from '@/lib/orcamentos';
import { tratamentosVisiveis, valorNaAgenda, type LinhaPreco, type PlanoTipo } from '@/lib/precoTratamento';
import { hojeNoFuso } from '@/lib/fuso';
import type { ProfissionalEquipe } from '@/lib/clinicScoped';

type PacienteOpcao = { id: string; nome: string; telefone: string | null; plano_id: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Clínica do orçamento; vazia em "Todas as clínicas" (aí a pessoa escolhe). */
  clinicaId: number | null;
  clinicas: { id: number; nome: string }[];
  paciente?: { id: string; nome: string } | null;
  orcamento?: Orcamento | null;
  itens?: OrcamentoItem[];
  equipe: ProfissionalEquipe[];
  meuProfissionalId: number | null;
  onSalvo: (orc: Orcamento) => void;
};

type LinhaItem = ItemEditado & { chave: string };

const inputClass =
  'box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900';

function linhaVazia(): LinhaItem {
  return { chave: crypto.randomUUID(), tratamento_base_id: null, procedimento: '', dente: null, quantidade: 1, valor_unitario: 0 };
}

export default function EditorOrcamento({
  open, onClose, clinicaId, clinicas, paciente, orcamento, itens, equipe, meuProfissionalId, onSalvo,
}: Props) {
  const { showAlert } = useCustomAlert();
  const [clinica, setClinica] = useState<string>('');
  const [pacienteId, setPacienteId] = useState('');
  const [profissionalId, setProfissionalId] = useState('');
  const [comercialId, setComercialId] = useState('');
  const [validade, setValidade] = useState('');
  const [desconto, setDesconto] = useState('0');
  const [observacoes, setObservacoes] = useState('');
  const [linhas, setLinhas] = useState<LinhaItem[]>([linhaVazia()]);
  const [catalogo, setCatalogo] = useState<ProcedimentoOption[]>([]);
  const [planos, setPlanos] = useState<PlanoTipo[]>([]);
  const [precos, setPrecos] = useState<LinhaPreco[]>([]);
  const [pacientes, setPacientes] = useState<PacienteOpcao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Preenche o formulário ao abrir.
  useEffect(() => {
    if (!open) return;
    setErro(null);
    setClinica(String(orcamento?.clinica_id ?? clinicaId ?? (clinicas.length === 1 ? clinicas[0].id : '')));
    setPacienteId(orcamento?.paciente_id ?? paciente?.id ?? '');
    setProfissionalId(orcamento?.profissional_id != null ? String(orcamento.profissional_id) : meuProfissionalId != null ? String(meuProfissionalId) : '');
    setComercialId(orcamento?.comercial_id != null ? String(orcamento.comercial_id) : '');
    setValidade(orcamento?.validade ?? somarDias(hojeNoFuso(), VALIDADE_PADRAO_DIAS));
    setDesconto(String(orcamento?.desconto ?? 0));
    setObservacoes(orcamento?.observacoes ?? '');
    setLinhas(
      itens && itens.length > 0
        ? itens.map((i) => ({
          chave: i.id,
          id: i.id,
          tratamento_base_id: i.tratamento_base_id,
          procedimento: i.procedimento,
          dente: i.dente,
          quantidade: i.quantidade,
          valor_unitario: i.valor_unitario,
        }))
        : [linhaVazia()],
    );
    // Só ao abrir: refazer a cada render da tela de trás apagaria o que está sendo digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Catálogo, planos e pacientes da clínica escolhida.
  useEffect(() => {
    if (!open || !clinica) return;
    let cancelado = false;
    (async () => {
      try {
        const id = Number(clinica);
        const [tr, pl, lp, pac] = await Promise.all([
          tabelas.from('tratamentos_base').select('id, nome, valor_sugerido, especialidade_id').eq('clinica_id', id).eq('ativo', true).order('nome'),
          tabelas.from('planos').select('id, tipo').eq('clinica_id', id),
          tabelas.from('planos_tratamentos').select('plano_id, tratamento_id, valor, ativo').eq('clinica_id', id),
          paciente || orcamento
            ? tabelas.from('pacientes').select('id, nome, telefone, plano_id').eq('id', orcamento?.paciente_id ?? paciente!.id)
            : lerTudo<PacienteOpcao>((de, ate) =>
              tabelas.from('pacientes').select('id, nome, telefone, plano_id').eq('clinica_id', id).order('nome').order('id').range(de, ate) as unknown as PromiseLike<{ data: PacienteOpcao[] | null; error: { message: string } | null }>,
            ).then((data) => ({ data, error: null })),
        ]);
        if (cancelado) return;
        setCatalogo((tr.data || []) as ProcedimentoOption[]);
        setPlanos((pl.data || []) as PlanoTipo[]);
        setPrecos((lp.data || []) as LinhaPreco[]);
        setPacientes(((pac as { data: PacienteOpcao[] | null }).data || []) as PacienteOpcao[]);
      } catch {
        // Sem catálogo, o procedimento é digitado.
      }
    })();
    return () => { cancelado = true; };
  }, [open, clinica, paciente, orcamento]);

  const planoDoPaciente = useMemo(() => {
    const p = pacientes.find((x) => x.id === pacienteId);
    if (!p?.plano_id) return null;
    return planos.find((x) => x.id === p.plano_id) ?? null;
  }, [pacientes, pacienteId, planos]);

  const catalogoVisivel = useMemo(
    () => tratamentosVisiveis(catalogo, planoDoPaciente, precos),
    [catalogo, planoDoPaciente, precos],
  );

  const equipeDaClinica = useMemo(
    () => equipe.filter((p) => p.clinicas?.some((c) => String(c.id) === clinica)),
    [equipe, clinica],
  );
  const opcoesEquipe = equipeDaClinica.map((p) => ({ value: String(p.id), label: p.nome }));

  const subtotal = somarItens(linhas);
  const total = valorFinal(linhas, numero(desconto));

  function mudarLinha(chave: string, parcial: Partial<LinhaItem>) {
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...parcial } : l)));
  }

  async function salvar() {
    setErro(null);
    if (!clinica) { setErro('Escolha a clínica do orçamento.'); return; }
    if (!pacienteId) { setErro('Escolha o paciente.'); return; }
    const validas = linhas.filter((l) => l.procedimento.trim());
    if (validas.length === 0) { setErro('Inclua pelo menos um procedimento.'); return; }
    if (numero(desconto) > subtotal) { setErro('O desconto é maior que a soma dos itens.'); return; }
    setSalvando(true);
    try {
      const salvo = await salvarOrcamento(
        {
          id: orcamento?.id,
          clinica_id: Number(clinica),
          paciente_id: pacienteId,
          profissional_id: profissionalId ? Number(profissionalId) : null,
          comercial_id: comercialId ? Number(comercialId) : null,
          validade: validade || null,
          desconto: numero(desconto),
          observacoes,
          criado_por: meuProfissionalId,
        },
        validas,
      );
      void showAlert(orcamento ? 'Orçamento salvo.' : 'Orçamento criado.', { type: 'success' });
      onSalvo(salvo);
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o orçamento.');
    } finally {
      setSalvando(false);
    }
  }

  const pacienteFixo = Boolean(paciente || orcamento);
  const nomePacienteFixo = orcamento?.pacientes?.nome || paciente?.nome || pacientes.find((p) => p.id === pacienteId)?.nome || 'Paciente';

  return (
    <Modal open={open} onClose={onClose} maxWidth="3xl" hideCloseButton panelClassName="flex max-h-[90dvh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-neutral-900">{orcamento ? 'Editar orçamento' : 'Novo orçamento'}</h2>
          <p className="mt-0.5 truncate text-sm text-neutral-500">{pacienteFixo ? nomePacienteFixo : 'Paciente, procedimentos e validade.'}</p>
        </div>
        <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:h-8 sm:w-8" aria-label="Fechar">
          <X size={16} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 sm:px-6">
        {!clinicaId && !orcamento && clinicas.length > 1 && (
          <label>
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Clínica <span className="text-red-500">*</span></span>
            <CustomSelect value={clinica} onChange={(v) => { setClinica(v); setPacienteId(paciente?.id ?? ''); }} options={clinicas.map((c) => ({ value: String(c.id), label: c.nome }))} placeholder="Selecione..." size="md" />
          </label>
        )}

        {!pacienteFixo && (
          <label>
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Paciente <span className="text-red-500">*</span></span>
            <CustomSelect
              value={pacienteId}
              onChange={setPacienteId}
              options={pacientes.map((p) => ({ value: p.id, label: p.nome }))}
              placeholder={clinica ? 'Buscar paciente' : 'Selecione a clínica primeiro'}
              disabled={!clinica}
              searchable
              size="md"
            />
          </label>
        )}

        <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-3">
          <label>
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Profissional</span>
            <CustomSelect value={profissionalId} onChange={setProfissionalId} options={[{ value: '', label: 'Sem profissional' }, ...opcoesEquipe]} size="md" />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Comercial</span>
            <CustomSelect value={comercialId} onChange={setComercialId} options={[{ value: '', label: 'Sem comercial' }, ...opcoesEquipe]} size="md" />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Válido até</span>
            <CampoData value={validade} onChange={setValidade} />
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-base font-semibold text-neutral-900">Procedimentos <span className="text-red-500">*</span></span>
            <button type="button" onClick={() => setLinhas((a) => [...a, linhaVazia()])} className="inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 sm:h-8">
              <Plus size={14} /> Adicionar
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {linhas.map((linha) => {
              const travado = Boolean(itens?.find((i) => i.id === linha.id)?.tratamento_id);
              return (
                <div key={linha.chave} className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-200 p-2.5 sm:grid-cols-[minmax(0,1fr)_6rem_4.5rem_7rem_auto] sm:items-end sm:border-0 sm:p-0">
                  <div className="col-span-2 sm:col-span-1">
                    <span className="mb-1 block text-xs font-medium text-neutral-500 sm:sr-only">Procedimento</span>
                    {catalogoVisivel.length > 0 ? (
                      <ProcedureCombobox
                        clinicaId={clinica}
                        tratamentos={catalogoVisivel}
                        value={linha.procedimento}
                        disabled={travado}
                        onChange={(nome, t) => {
                          const preco = valorNaAgenda(t, planoDoPaciente, precos);
                          mudarLinha(linha.chave, {
                            procedimento: nome,
                            tratamento_base_id: t ? Number(t.id) : null,
                            valor_unitario: preco != null ? numero(preco) : linha.valor_unitario,
                          });
                        }}
                      />
                    ) : (
                      <input
                        value={linha.procedimento}
                        onChange={(e) => mudarLinha(linha.chave, { procedimento: e.target.value, tratamento_base_id: null })}
                        disabled={travado}
                        className={inputClass}
                        placeholder="Procedimento"
                      />
                    )}
                  </div>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-neutral-500 sm:sr-only">Dente</span>
                    <input value={linha.dente ?? ''} onChange={(e) => mudarLinha(linha.chave, { dente: e.target.value })} disabled={travado} className={inputClass} placeholder="Dente" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-neutral-500 sm:sr-only">Quantidade</span>
                    <input type="number" min={1} max={999} value={linha.quantidade} onChange={(e) => mudarLinha(linha.chave, { quantidade: Math.max(1, Math.round(numero(e.target.value) || 1)) })} disabled={travado} className={inputClass} aria-label="Quantidade" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-neutral-500 sm:sr-only">Valor unitário</span>
                    <input type="number" min={0} step="0.01" value={linha.valor_unitario} onChange={(e) => mudarLinha(linha.chave, { valor_unitario: Math.max(0, numero(e.target.value)) })} disabled={travado} className={inputClass} aria-label="Valor unitário" />
                  </label>
                  <button
                    type="button"
                    onClick={() => setLinhas((a) => (a.length > 1 ? a.filter((l) => l.chave !== linha.chave) : [linhaVazia()]))}
                    disabled={travado}
                    className="inline-flex h-10 w-10 items-center justify-center justify-self-end rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-rose-600 disabled:opacity-30"
                    aria-label="Remover procedimento"
                    title="Remover"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <label>
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Desconto (R$)</span>
            <input type="number" min={0} step="0.01" value={desconto} onChange={(e) => setDesconto(e.target.value)} className={inputClass} />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Observações</span>
            <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={4000} className={inputClass} placeholder="Condições de pagamento, etapas, combinados..." />
          </label>
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}
      </div>

      <div className="flex shrink-0 flex-col gap-3 border-t border-black/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-neutral-500">
          Subtotal {formatarDinheiro(subtotal)} · <span className="font-semibold text-neutral-900">Total {formatarDinheiro(total)}</span>
        </p>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50 sm:h-9">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9">
            {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}
