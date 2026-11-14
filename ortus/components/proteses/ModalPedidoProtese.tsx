'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
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
    let cancelado = false;
    async function completar() {
      let cols = supabase.from('kanban_colunas').select('id, titulo').order('ordem', { ascending: true });
      let pacs = supabase.from('pacientes').select('id, nome, telefone, clinica_id').order('nome', { ascending: true });
      if (clinicId) {
        cols = cols.eq('clinica_id', clinicId);
        pacs = pacs.eq('clinica_id', clinicId);
      }
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
    setCreatingPatient(true);
    const payload: { nome: string; clinica_id?: string } = { nome };
    if (clinicId) payload.clinica_id = clinicId;
    const { data, error } = await supabase.from('pacientes').insert([payload]).select('id, nome, telefone, clinica_id').single();
    setCreatingPatient(false);
    if (error || !data) {
      onAviso?.('warning', 'Não foi possível criar o paciente: ' + (error?.message || 'erro desconhecido'));
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
      checklist: pedido?.tipo_protese === form.tipo_protese && Array.isArray(pedido.checklist) ? pedido.checklist : buildChecklist(form.tipo_protese),
    };
    const { error } = pedido
      ? await supabase.from('kanban_cartoes').update(payload).eq('id', pedido.id)
      : await supabase.from('kanban_cartoes').insert([payload]);
    setSaving(false);
    if (error) return onAviso?.('warning', `Erro ao ${pedido ? 'atualizar' : 'criar'} pedido: ${error.message}`);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ortus:protese-changed'));
    onAviso?.('success', pedido ? 'Pedido atualizado.' : 'Pedido de prótese criado.');
    onSaved?.();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth="2xl" zIndex={85} hideCloseButton panelClassName="flex max-h-[92vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 bg-white p-5">
        <div>
          <p className="text-xs font-medium text-neutral-500">{pedido ? 'Editar pedido' : 'Novo pedido'}</p>
          <h2 className="text-base font-semibold text-neutral-900">{pedido ? 'Editar pedido' : 'Novo pedido'}</h2>
        </div>
        <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={16} /></button>
      </div>

      <div className="custom-scrollbar flex-1 space-y-5 overflow-y-auto p-5">
        <section className="rounded-xl border border-neutral-200 bg-[#f3f4f1] p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className={marca}>A</span>
            <h3 className="text-sm font-semibold text-neutral-900">Selecionar paciente</h3>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-neutral-400" />
            <input value={patientSearch} onChange={(event) => { const v = event.target.value; setPatientSearch(v); setForm((current) => ({ ...current, paciente_nome: v, paciente_id: current.paciente_nome === v ? current.paciente_id : null })); }} className="h-10 w-full rounded-md border border-neutral-200 bg-white pl-10 pr-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900" placeholder="Buscar ou digitar nome do paciente" />
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
                  <p className="truncate text-sm font-semibold">{patient.nome}</p>
                  <p className="truncate text-xs font-medium text-neutral-500">{patient.telefone || 'Sem telefone'}</p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-neutral-200 bg-white p-4">
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
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-3">
              <span className={marca}>B</span>
              <h3 className="text-sm font-semibold text-neutral-900">Escolher categoria</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['Removível', 'Fixa'] as Category[]).map((category) => (
                <button key={category} type="button" onClick={() => setForm((current) => ({ ...current, categoria: category, tipo_protese: '' }))} className={`rounded-xl border p-4 text-left ${form.categoria === category ? 'border-neutral-900 bg-[#f3f4f1]' : 'border-neutral-200 bg-white hover:bg-neutral-50'}`}>
                  <p className="text-base font-semibold text-neutral-900">{category}</p>
                  <p className="mt-1 text-sm font-medium text-neutral-500">{category === 'Removível' ? 'PPR, PT e flexíveis' : 'Coroas, protocolo e adesivas'}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {form.categoria && (
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-3">
              <span className={marca}>C</span>
              <h3 className="text-sm font-semibold text-neutral-900">Escolher tipo</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleTypes.map((type) => (
                <button key={type} type="button" onClick={() => setForm((current) => ({ ...current, tipo_protese: type }))} className={`rounded-md border px-3 py-2.5 text-left text-sm font-medium ${form.tipo_protese === type ? 'border-neutral-900 bg-[#f3f4f1] text-neutral-900' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}>
                  {type}
                </button>
              ))}
            </div>
          </section>
        )}

        {form.tipo_protese && (
          <section className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-3">
              <span className={marca}>D</span>
              <h3 className="text-sm font-semibold text-neutral-900">Detalhamentos rápidos</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={form.cor_dente} onChange={(event) => setForm((current) => ({ ...current, cor_dente: event.target.value }))} className="h-10 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900" placeholder="Cor do dente: A2, B1..." />
              <input value={form.cor_gengiva} onChange={(event) => setForm((current) => ({ ...current, cor_gengiva: event.target.value }))} className="h-10 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900" placeholder="Cor da gengiva / STG" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(['Superior', 'Inferior', 'Ambas'] as Position[]).map((position) => (
                <button key={position} type="button" onClick={() => setForm((current) => ({ ...current, posicao: position }))} className={`rounded-md border px-3 py-2.5 text-xs font-medium ${form.posicao === position ? 'border-neutral-900 bg-[#f3f4f1] text-neutral-900' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'}`}>
                  {position}
                </button>
              ))}
            </div>
            <textarea value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} rows={3} className="mt-3 w-full resize-none rounded-md border border-neutral-200 bg-white p-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900" placeholder="Observações rápidas para laboratório" />
            <div className="mt-3 rounded-md border border-neutral-200 bg-[#f3f4f1] p-3">
              <p className="mb-2 text-xs font-medium text-neutral-500">Checklist que será criado</p>
              <div className="space-y-1">
                {buildChecklist(form.tipo_protese).map((item) => (
                  <p key={item.tarefa} className="flex items-center gap-2 text-xs font-medium text-neutral-700"><Check size={13} className="text-neutral-700" /> {item.tarefa}</p>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      <div className="flex gap-2 border-t border-neutral-200 bg-white p-5">
        <button type="button" onClick={onClose} className="h-9 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50">Cancelar</button>
        <button type="button" onClick={salvar} disabled={saving || !form.paciente_nome || !form.categoria || !form.tipo_protese} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />} {pedido ? 'Salvar Pedido' : 'Criar Pedido'}
        </button>
      </div>
    </Modal>
  );
}
