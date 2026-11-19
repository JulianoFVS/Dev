'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, Search, X } from 'lucide-react';
import { dados as tabelas } from '@/lib/local/consulta';
import { fraseDeErro } from '@/lib/fraseDeErro';
import Modal from '@/components/ui/Modal';
import CustomSelect from '@/components/ui/CustomSelect';

type Category = 'Removível' | 'Fixa' | '';
type Position = 'Superior' | 'Inferior' | 'Ambas' | '';
type StatusKey = 'espera' | 'lab' | 'clinica' | 'feito';
type ChecklistItem = { tarefa: string; feito: boolean };

export type PacientePedido = {
  id: string | number;
  nome: string;
  telefone?: string | null;
  clinica_id?: string | null;
};

export type PedidoProtese = {
  id: number;
  coluna_id?: number | null;
  paciente_id?: string | null;
  paciente_nome?: string | null;
  descricao?: string | null;
  categoria?: string | null;
  tipo_protese?: string | null;
  cor_dente?: string | null;
  cor_gengiva?: string | null;
  posicao?: string | null;
  checklist?: ChecklistItem[] | null;
  status?: StatusKey | null;
};

type ColunaPedido = { id: number; titulo: string };

type CardForm = {
  paciente_id: string | null;
  paciente_nome: string;
  categoria: Category;
  tipo_protese: string;
  cor_dente: string;
  cor_gengiva: string;
  posicao: Position;
  descricao: string;
  status: StatusKey;
};

const REMOVABLE_TYPES = ['PPR (Com grampo)', 'PPR (Sem grampo)', 'PT', 'Flexível'];
const FIXED_TYPES = ['Coroa sobre dente', 'Coroa sobre implante', 'Protocolo', 'Fixa adesiva'];

const EMPTY_FORM: CardForm = {
  paciente_id: null,
  paciente_nome: '',
  categoria: '',
  tipo_protese: '',
  cor_dente: '',
  cor_gengiva: '',
  posicao: '',
  descricao: '',
  status: 'espera',
};

const STATUS_TOKENS: Record<StatusKey, { label: string }> = {
  espera: { label: 'Em espera' },
  lab: { label: 'Pronto no lab' },
  clinica: { label: 'Pronto na clínica' },
  feito: { label: 'Concluída' },
};

function buildChecklist(tipo: string): ChecklistItem[] {
  if (tipo === 'PPR (Com grampo)') return [{ tarefa: 'Prova do Grampo', feito: false }, { tarefa: 'Prova do Dente', feito: false }];
  if (tipo === 'PPR (Sem grampo)') return [{ tarefa: 'Prova da Cera', feito: false }, { tarefa: 'Prova do Dente', feito: false }];
  if (tipo === 'PT' || tipo === 'Protocolo') return [{ tarefa: 'Prova dos Dentes', feito: false }, { tarefa: 'Prova da Barra/Estrutura', feito: false }];
  return [{ tarefa: 'Prova da Peça', feito: false }];
}

const marca = 'flex h-7 w-7 items-center justify-center rounded-md border border-[#d7dece] bg-[#eef2e8] text-xs font-medium text-neutral-800';
const SEM_COLUNAS: ColunaPedido[] = [];
const SEM_PACIENTES: PacientePedido[] = [];

type Props = {
  open: boolean;
  onClose: () => void;
  clinicId: string | null;
  colunaId?: number | null;
  columns?: ColunaPedido[];
  patients?: PacientePedido[];
  pedido?: PedidoProtese | null;
  pacienteInicial?: PacientePedido | null;
  totalPedidos?: number;
  onSaved?: () => void;
  onPatientCreated?: (paciente: PacientePedido) => void;
  onAviso?: (tipo: 'success' | 'warning', mensagem: string) => void;
};

export default function ModalPedidoProtese({
  open,
  onClose,
  clinicId,
  colunaId = null,
  columns = SEM_COLUNAS,
  patients = SEM_PACIENTES,
  pedido = null,
  pacienteInicial = null,
  totalPedidos = 0,
  onSaved,
  onPatientCreated,
  onAviso,
}: Props) {
  const [form, setForm] = useState<CardForm>(EMPTY_FORM);
  // Provas do pedido em edição. O quadro só deixa finalizar com todas marcadas e não havia onde marcá-las.
  const [provas, setProvas] = useState<ChecklistItem[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [listaPacientes, setListaPacientes] = useState<PacientePedido[]>(patients);
  const [colunas, setColunas] = useState<ColunaPedido[]>(columns);
  const [saving, setSaving] = useState(false);
  const [creatingPatient, setCreatingPatient] = useState(false);
  const chave = `${open ? '1' : '0'}:${pedido?.id ?? ''}:${pacienteInicial?.id ?? ''}:${colunaId ?? ''}`;

  useEffect(() => {
    if (!open) return;
    const categoria = pedido?.categoria === 'Removível' || pedido?.categoria === 'Fixa' ? pedido.categoria : '';
    const posicao = pedido?.posicao === 'Superior' || pedido?.posicao === 'Inferior' || pedido?.posicao === 'Ambas' ? pedido.posicao : '';
    const status = pedido?.status && pedido.status in STATUS_TOKENS ? pedido.status : 'espera';
    setProvas(pedido && Array.isArray(pedido.checklist) ? pedido.checklist.map((item) => ({ tarefa: String(item.tarefa), feito: Boolean(item.feito) })) : []);
    if (pedido) {
      setForm({
        paciente_id: pedido.paciente_id ? String(pedido.paciente_id) : null,
        paciente_nome: pedido.paciente_nome || '',
        categoria,
        tipo_protese: pedido.tipo_protese || '',
        cor_dente: pedido.cor_dente || '',
        cor_gengiva: pedido.cor_gengiva || '',
        posicao,
        descricao: pedido.descricao || '',
        status,
      });
      setPatientSearch(pedido.paciente_nome || '');
    } else if (pacienteInicial) {
      setForm({ ...EMPTY_FORM, paciente_id: String(pacienteInicial.id), paciente_nome: pacienteInicial.nome });
      setPatientSearch(pacienteInicial.nome);
    } else {
      setForm(EMPTY_FORM);
      setPatientSearch('');
    }
    // A chave já representa o pedido e o paciente desta abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  useEffect(() => {
    if (!open) return;
    if (columns.length > 0) setColunas(columns);
    if (patients.length > 0) setListaPacientes(patients);
    if (columns.length > 0 && patients.length > 0) return;
    // Sem clínica escolhida ("Todas as clínicas"), etapas e pacientes de várias clínicas se
    // misturariam: o popup não carrega nada e o salvar pede a clínica.
    if (!clinicId) return;
    let cancelado = false;
    async function completar() {
      const cols = tabelas.from('kanban_colunas').select('id, titulo').eq('clinica_id', clinicId).order('ordem', { ascending: true });
      const pacs = tabelas.from('pacientes').select('id, nome, telefone, clinica_id').eq('clinica_id', clinicId).order('nome', { ascending: true });
      const [colRes, pacRes] = await Promise.all([
        columns.length > 0 ? Promise.resolve({ data: columns }) : cols,
        patients.length > 0 ? Promise.resolve({ data: patients }) : pacs,
      ]);
      if (cancelado) return;
      if (columns.length === 0) setColunas((colRes.data || []) as ColunaPedido[]);
      if (patients.length === 0) setListaPacientes((pacRes.data || []) as PacientePedido[]);
    }
    completar();
    return () => { cancelado = true; };
  }, [open, clinicId, columns, patients]);

  const visibleTypes = form.categoria === 'Removível' ? REMOVABLE_TYPES : form.categoria === 'Fixa' ? FIXED_TYPES : [];
  // Só o pedido já salvo, e com o mesmo tipo, tem provas para marcar. Trocar o tipo cria um checklist novo ao salvar.
  const provasDoPedido = !!pedido && pedido.tipo_protese === form.tipo_protese && Array.isArray(pedido.checklist) && provas.length > 0;
  const filteredPatients = useMemo(() => {
    const search = patientSearch.trim().toLowerCase();
    if (!search) return listaPacientes.slice(0, 8);
    return listaPacientes.filter((patient) => patient.nome.toLowerCase().includes(search)).slice(0, 8);
  }, [listaPacientes, patientSearch]);

  function selectPatient(patient: PacientePedido) {
    setForm((current) => ({ ...current, paciente_id: String(patient.id), paciente_nome: patient.nome }));
    setPatientSearch(patient.nome);
  }

  async function quickCreatePatient() {
    const nome = patientSearch.trim();
    if (!nome || creatingPatient) return;
    if (!clinicId) {
      onAviso?.('warning', 'Escolha uma clínica no menu para cadastrar o paciente.');
      return;
    }
    setCreatingPatient(true);
    let resultado: { data: unknown; error: unknown };
    try {
      resultado = await tabelas.from('pacientes').insert([{ nome, clinica_id: clinicId }]).select('id, nome, telefone, clinica_id').single();
    } catch (erro) {
      resultado = { data: null, error: erro };
    }
    setCreatingPatient(false);
    const { data, error } = resultado;
    if (error || !data) {
      onAviso?.('warning', fraseDeErro(error, 'Não foi possível cadastrar o paciente agora. Tente de novo.'));
      return;
    }
    const novo = data as PacientePedido;
    setListaPacientes((current) => [...current, novo].sort((a, b) => a.nome.localeCompare(b.nome)));
    selectPatient(novo);
    onPatientCreated?.(novo);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ortus:paciente-changed'));
    onAviso?.('success', `${novo.nome} cadastrado e selecionado.`);
  }

  async function salvar() {
    const coluna = (colunaId ? colunas.find((column) => column.id === colunaId) : null)
      || (pedido?.coluna_id ? colunas.find((column) => column.id === pedido.coluna_id) : null)
      || colunas.find((column) => column.titulo === 'Solicitado')
      || colunas[0];
    if (!clinicId) return onAviso?.('warning', 'Escolha uma clínica no menu para registrar o pedido.');
    if (!coluna || coluna.id < 0) return onAviso?.('warning', 'As etapas padrão ainda não foram carregadas.');
    if (!form.paciente_nome.trim()) return onAviso?.('warning', 'Selecione ou informe o paciente.');
    if (!form.paciente_id) return onAviso?.('warning', 'Selecione o paciente da lista ou clique em “Cadastrar como novo paciente”.');
    if (!form.categoria) return onAviso?.('warning', 'Escolha a categoria da prótese.');
    if (!form.tipo_protese) return onAviso?.('warning', 'Escolha o tipo da prótese.');
    if (!pedido && totalPedidos >= 2000) return onAviso?.('warning', 'Limite de 2000 pedidos atingido.');

    setSaving(true);
    const payload = {
      coluna_id: coluna.id,
      clinica_id: clinicId,
      paciente_id: form.paciente_id,
      paciente_nome: form.paciente_nome.trim(),
      descricao: form.descricao.trim(),
      categoria: form.categoria,
      tipo_protese: form.tipo_protese,
      cor_dente: form.cor_dente.trim(),
      cor_gengiva: form.cor_gengiva.trim(),
      posicao: form.posicao,
      status: form.status,
      checklist: pedido?.tipo_protese === form.tipo_protese && Array.isArray(pedido.checklist) ? provas : buildChecklist(form.tipo_protese),
    };
    // Edição só da clínica escolhida, conferindo que uma linha foi gravada: pedido apagado ou de
    // outra clínica não pode aparecer como "atualizado".
    let erro: unknown = null;
    let gravouAlgo = true;
    try {
      if (pedido) {
        const { data, error } = await tabelas.from('kanban_cartoes').update(payload).eq('id', pedido.id).eq('clinica_id', clinicId).select('id');
        erro = error;
        gravouAlgo = Array.isArray(data) && data.length > 0;
      } else {
        const { error } = await tabelas.from('kanban_cartoes').insert([payload]);
        erro = error;
      }
    } catch (e) {
      erro = e;
    }
    setSaving(false);
    if (erro) return onAviso?.('warning', fraseDeErro(erro, `Não foi possível ${pedido ? 'atualizar' : 'criar'} o pedido agora. Tente de novo.`));
    if (!gravouAlgo) return onAviso?.('warning', 'Este pedido não existe mais nesta clínica. Feche e atualize o quadro.');
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ortus:protese-changed'));
    onAviso?.('success', pedido ? 'Pedido atualizado.' : 'Pedido de prótese criado.');
    onSaved?.();
    onClose();
  }

  return (
    // Altura em dvh: com vh o popup passava da área visível do celular quando a barra do navegador aparece, e o topo saía da tela.
    <Modal open={open} onClose={onClose} maxWidth="2xl" zIndex={85} hideCloseButton panelClassName="flex !max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white sm:!max-h-[92dvh]">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-3 sm:p-5">
        <div className="min-w-0">
          <p className="hidden text-xs font-medium text-neutral-500 sm:block">{pedido ? 'Editar pedido' : 'Novo pedido'}</p>
          <h2 className="text-base font-semibold text-neutral-900">{pedido ? 'Editar pedido' : 'Novo pedido'}</h2>
        </div>
        <button type="button" onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:h-8 sm:w-8" aria-label="Fechar"><X size={16} /></button>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:space-y-5 sm:p-5">
        <section className="rounded-xl border border-neutral-200 bg-[#f3f4f1] p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className={marca}>A</span>
            <h3 className="text-sm font-semibold text-neutral-900">Selecionar paciente <span className="text-red-500">*</span></h3>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-neutral-400" />
            <input value={patientSearch} onChange={(event) => { const v = event.target.value; setPatientSearch(v); setForm((current) => ({ ...current, paciente_nome: v, paciente_id: current.paciente_nome === v ? current.paciente_id : null })); }} aria-label="Paciente" className="h-10 w-full rounded-md border border-neutral-200 bg-white pl-10 pr-3 text-sm font-medium text-neutral-900 outline-none placeholder:text-sm focus:border-neutral-900" placeholder="Buscar ou digitar nome do paciente" />
          </div>
          {patientSearch.trim() && filteredPatients.length === 0 && !listaPacientes.some((p) => p.nome.toLowerCase() === patientSearch.trim().toLowerCase()) && (
            <button type="button" onClick={quickCreatePatient} disabled={creatingPatient} className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-neutral-300 bg-white px-3 py-2.5 text-sm font-medium text-neutral-800 hover:border-neutral-900 disabled:cursor-wait disabled:opacity-60">
              {creatingPatient ? <><Loader2 size={16} className="animate-spin" /> Cadastrando...</> : <><Plus size={16} /> Cadastrar &quot;<span className="font-semibold">{patientSearch.trim()}</span>&quot; como novo paciente</>}
            </button>
          )}
          {patientSearch && filteredPatients.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {filteredPatients.map((patient) => (
                <button key={patient.id} type="button" onClick={() => selectPatient(patient)} className={`rounded-md border p-3 text-left ${form.paciente_nome === patient.nome ? 'border-neutral-900 bg-white text-neutral-900' : 'border-neutral-200 bg-white hover:bg-neutral-50'}`}>
                  <p className="break-words text-sm font-semibold sm:truncate">{patient.nome}</p>
                  <p className="truncate text-xs font-medium text-neutral-500">{patient.telefone || 'Sem telefone'}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className={marca}>●</span>
            <h3 className="text-sm font-semibold text-neutral-900">Status atual</h3>
          </div>
          <CustomSelect
            value={form.status}
            onChange={(v) => setForm((current) => ({ ...current, status: v as StatusKey }))}
            options={(['espera', 'lab', 'clinica', 'feito'] as StatusKey[]).map((key) => ({ value: key, label: STATUS_TOKENS[key].label }))}
            size="lg"
          />
          <p className="mt-2 text-xs font-medium text-neutral-500">O status acompanha o pedido independente do quadro onde ele esteja.</p>
        </section>

        {form.paciente_nome && (
          <section className="rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-3">
              <span className={marca}>B</span>
              <h3 className="text-sm font-semibold text-neutral-900">Escolher categoria <span className="text-red-500">*</span></h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
              {(['Removível', 'Fixa'] as Category[]).map((category) => (
                <button key={category} type="button" aria-pressed={form.categoria === category} onClick={() => setForm((current) => ({ ...current, categoria: category, tipo_protese: '' }))} className={`rounded-xl border p-3 text-left sm:p-4 ${form.categoria === category ? 'border-neutral-900 bg-[#f3f4f1]' : 'border-neutral-200 bg-white hover:bg-neutral-50'}`}>
                  <p className="text-base font-semibold text-neutral-900">{category}</p>
                  <p className="mt-1 text-sm font-medium text-neutral-500">{category === 'Removível' ? 'PPR, PT e flexíveis' : 'Coroas, protocolo e adesivas'}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {form.categoria && (
          <section className="rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-3">
              <span className={marca}>C</span>
              <h3 className="text-sm font-semibold text-neutral-900">Escolher tipo <span className="text-red-500">*</span></h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleTypes.map((type) => (
                <button key={type} type="button" aria-pressed={form.tipo_protese === type} onClick={() => setForm((current) => ({ ...current, tipo_protese: type }))} className={`min-h-[40px] rounded-md border px-3 py-2.5 text-left text-sm font-medium ${form.tipo_protese === type ? 'border-neutral-900 bg-[#f3f4f1] text-neutral-900' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
                  {type}
                </button>
              ))}
            </div>
          </section>
        )}

        {form.tipo_protese && (
          <section className="rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
            <div className="mb-3 flex items-center gap-3">
              <span className={marca}>D</span>
              <h3 className="text-sm font-semibold text-neutral-900">Detalhamentos rápidos</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={form.cor_dente} onChange={(event) => setForm((current) => ({ ...current, cor_dente: event.target.value }))} aria-label="Cor do dente" className="h-10 min-w-0 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900" placeholder="Cor do dente: A2, B1..." />
              <input value={form.cor_gengiva} onChange={(event) => setForm((current) => ({ ...current, cor_gengiva: event.target.value }))} aria-label="Cor da gengiva" className="h-10 min-w-0 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900" placeholder="Cor da gengiva / STG" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(['Superior', 'Inferior', 'Ambas'] as Position[]).map((position) => (
                <button key={position} type="button" aria-pressed={form.posicao === position} onClick={() => setForm((current) => ({ ...current, posicao: position }))} className={`h-10 rounded-md border px-1 text-xs font-medium sm:h-auto sm:px-3 sm:py-2.5 ${form.posicao === position ? 'border-neutral-900 bg-[#f3f4f1] text-neutral-900' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'}`}>
                  {position}
                </button>
              ))}
            </div>
            <textarea value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} rows={3} aria-label="Observações para o laboratório" className="mt-3 w-full resize-none rounded-md border border-neutral-200 bg-white p-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900" placeholder="Observações rápidas para laboratório" />
            {provasDoPedido ? (
              <div className="mt-3 rounded-md border border-neutral-200 bg-[#f3f4f1] p-3">
                <p className="mb-2 text-xs font-medium text-neutral-500">Provas feitas ({provas.filter((item) => item.feito).length}/{provas.length})</p>
                <div className="space-y-1">
                  {provas.map((item, index) => (
                    <label key={`${index}-${item.tarefa}`} className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-neutral-900"
                        checked={item.feito}
                        onChange={(event) => {
                          const feito = event.target.checked;
                          setProvas((atual) => atual.map((prova, i) => (i === index ? { ...prova, feito } : prova)));
                        }}
                      />
                      <span className="min-w-0 break-words">{item.tarefa}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-neutral-500">Com todas marcadas e o pedido salvo, ele pode ir para Finalizado / Entregue.</p>
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-neutral-200 bg-[#f3f4f1] p-3">
                <p className="mb-2 text-xs font-medium text-neutral-500">Checklist que será criado</p>
                <div className="space-y-1">
                  {buildChecklist(form.tipo_protese).map((item) => (
                    <p key={item.tarefa} className="flex items-center gap-2 text-xs font-medium text-neutral-700"><Check size={13} className="text-neutral-700" /> {item.tarefa}</p>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-neutral-200 bg-white p-3 sm:p-5">
        <button type="button" onClick={onClose} className="h-11 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50 sm:h-9">Cancelar</button>
        <button type="button" onClick={salvar} disabled={saving || !form.paciente_nome || !form.categoria || !form.tipo_protese} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 sm:h-9">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />} {pedido ? 'Salvar Pedido' : 'Criar Pedido'}
        </button>
      </div>
    </Modal>
  );
}
