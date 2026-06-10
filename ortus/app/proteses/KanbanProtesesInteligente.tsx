'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import { useClinica } from '@/app/context/ClinicaContext';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, CircleDot, ClipboardList, Edit3, Eye, Filter, FlaskConical, Gem, GripVertical, Heart, Loader2, Package, Paintbrush, Plus, Scissors, Search, Shield, Smile, Sparkles, Star, Trash2, Truck, Wrench, X, Zap } from 'lucide-react';
import { useCustomAlert } from '@/components/ui/CustomAlert';

type ColumnTitle = 'Solicitado' | 'No Laboratório' | 'Em Prova Clínica' | 'Aguardando Ajuste' | 'Finalizado / Entregue';
type Category = 'Removível' | 'Fixa' | '';
type Position = 'Superior' | 'Inferior' | 'Ambas' | '';
type ChecklistItem = { tarefa: string; feito: boolean };
type Column = { id: number; titulo: string; ordem: number; clinica_id?: string | null; icone?: string | null; checklist_ativo?: boolean };
type PatientOption = { id: string | number; nome: string; telefone?: string | null; clinica_id?: string | null };
type StatusKey = 'espera' | 'lab' | 'clinica' | 'feito';
type Card = {
  id: number;
  coluna_id: number;
  clinica_id?: string | null;
  paciente_id?: string | null;
  paciente_nome: string;
  descricao?: string | null;
  categoria?: string | null;
  tipo_protese?: string | null;
  cor_dente?: string | null;
  cor_gengiva?: string | null;
  posicao?: string | null;
  checklist?: ChecklistItem[] | null;
  data_entrega?: string | null;
  valor?: number | string | null;
  created_at?: string | null;
  status?: StatusKey | null;
};

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

const STANDARD_COLUMNS: ColumnTitle[] = [
  'Solicitado',
  'No Laboratório',
  'Em Prova Clínica',
  'Aguardando Ajuste',
  'Finalizado / Entregue',
];

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

function normalizeClinicId(value: string | null) {
  if (!value || value === 'todas') return null;
  return value;
}

function buildChecklist(tipo: string): ChecklistItem[] {
  if (tipo === 'PPR (Com grampo)') {
    return [
      { tarefa: 'Prova do Grampo', feito: false },
      { tarefa: 'Prova do Dente', feito: false },
    ];
  }

  if (tipo === 'PPR (Sem grampo)') {
    return [
      { tarefa: 'Prova da Cera', feito: false },
      { tarefa: 'Prova do Dente', feito: false },
    ];
  }

  if (tipo === 'PT' || tipo === 'Protocolo') {
    return [
      { tarefa: 'Prova dos Dentes', feito: false },
      { tarefa: 'Prova da Barra/Estrutura', feito: false },
    ];
  }

  return [{ tarefa: 'Prova da Peça', feito: false }];
}

function isChecklistDone(checklist?: ChecklistItem[] | null) {
  const items = Array.isArray(checklist) ? checklist : [];
  return items.length === 0 || items.every((item) => item.feito);
}

const VALID_STATUS: StatusKey[] = ['espera', 'lab', 'clinica', 'feito'];

function cardStatus(card: Card | null | undefined): StatusKey {
  const value = card?.status;
  if (value && (VALID_STATUS as string[]).includes(value)) return value as StatusKey;
  return 'espera';
}

const STATUS_TOKENS: Record<StatusKey, { label: string; cardBorder: string; pill: string; ring: string; dot: string }> = {
  espera:  { label: 'Em espera',         cardBorder: 'border-l-4 border-l-blue-400',    pill: 'bg-blue-100 text-blue-700',       ring: 'ring-blue-200',     dot: 'bg-blue-500' },
  lab:     { label: 'Pronto no lab',     cardBorder: 'border-l-4 border-l-emerald-500', pill: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-200',  dot: 'bg-emerald-500' },
  clinica: { label: 'Pronto na clínica', cardBorder: 'border-l-4 border-l-violet-500',  pill: 'bg-violet-100 text-violet-700',   ring: 'ring-violet-200',   dot: 'bg-violet-500' },
  feito:   { label: 'Concluída',         cardBorder: 'border-l-4 border-l-slate-400',   pill: 'bg-slate-200 text-slate-600',     ring: 'ring-slate-200',    dot: 'bg-slate-400' },
};

// Coluna é apenas organizacional — paleta neutra única
const COLUMN_NEUTRAL = 'border-slate-200 bg-slate-50/60 text-slate-700';

function dedupeColumnsByTitle(items: Column[]) {
  const seen = new Set<string>();
  return items.filter((column) => {
    const key = column.titulo.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function KanbanProtesesInteligente() {
  const searchParams = useSearchParams();
  const pacientePreSelecionado = searchParams?.get('paciente');
  const { openPatient } = usePatientSlideOver();
  const { activeClinicId, loading: clinicLoading } = useClinica();
  const { showConfirm } = useCustomAlert();
  const [columns, setColumns] = useState<Column[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [draggedCard, setDraggedCard] = useState<Card | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [targetColumnId, setTargetColumnId] = useState<number | null>(null);
  const [form, setForm] = useState<CardForm>(EMPTY_FORM);
  const [patientSearch, setPatientSearch] = useState('');
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<Column | null>(null);
  const [columnTitle, setColumnTitle] = useState('');
  const [toast, setToast] = useState<{ type: 'warning' | 'success'; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'all' | '7d' | '30d' | '90d'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusKey[]>([]);
  const [flowDropdownOpen, setFlowDropdownOpen] = useState(false);

  // Mapa de ícones por slug (persiste no DB como string)
  const ICON_MAP: Record<string, React.ReactNode> = {
    'clipboard-list': <ClipboardList size={14} />,
    'flask-conical': <FlaskConical size={14} />,
    'smile': <Smile size={14} />,
    'wrench': <Wrench size={14} />,
    'truck': <Truck size={14} />,
    'package': <Package size={14} />,
    'sparkles': <Sparkles size={14} />,
    'heart': <Heart size={14} />,
    'star': <Star size={14} />,
    'zap': <Zap size={14} />,
    'shield': <Shield size={14} />,
    'eye': <Eye size={14} />,
    'paintbrush': <Paintbrush size={14} />,
    'scissors': <Scissors size={14} />,
    'gem': <Gem size={14} />,
    'circle-dot': <CircleDot size={14} />,
  };
  const ICON_PICKER_OPTIONS = Object.keys(ICON_MAP);

  // Fallback para colunas padrão sem icone no DB
  const DEFAULT_ICONS: Record<string, string> = {
    'Solicitado': 'clipboard-list',
    'No Laboratório': 'flask-conical',
    'Em Prova Clínica': 'smile',
    'Aguardando Ajuste': 'wrench',
    'Finalizado / Entregue': 'truck',
  };
  function getColumnIcon(col: Column) { return ICON_MAP[col.icone || DEFAULT_ICONS[col.titulo] || 'package'] || <Package size={14} />; }

  // Calcula quantas etapas cabem dinamicamente no container
  const flowBarRef = useRef<HTMLDivElement>(null);
  const [maxVisibleFlow, setMaxVisibleFlow] = useState(99);
  useEffect(() => {
    const el = flowBarRef.current;
    if (!el || columns.length === 0) return;
    const BUTTON_W = 175;
    const OVERFLOW_W = 130;
    function calc() {
      const w = el!.clientWidth;
      if (w < 100) return; // DOM não renderizou ainda
      const fits = Math.max(2, Math.floor((w - OVERFLOW_W) / BUTTON_W));
      setMaxVisibleFlow(columns.length <= fits ? columns.length : fits);
    }
    const raf = requestAnimationFrame(calc);
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [columns.length, loading]);

  // Sincroniza clinicId com contexto global (reativo) — evita reload desnecessário
  const prevClinicRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (clinicLoading) return;
    const nextClinicId = normalizeClinicId(activeClinicId === 'all' ? null : activeClinicId ?? null);
    if (prevClinicRef.current === nextClinicId && columns.length > 0) return;
    prevClinicRef.current = nextClinicId;
    setClinicId(nextClinicId);
    loadBoard(nextClinicId);
  }, [clinicLoading, activeClinicId]);

  useEffect(() => {
    if (!pacientePreSelecionado || patients.length === 0 || columns.length === 0) return;
    const paciente = patients.find((p) => String(p.id) === String(pacientePreSelecionado));
    if (!paciente) return;
    const solicitado = columns.find((column) => column.titulo === 'Solicitado') || columns[0];
    setForm({ ...EMPTY_FORM, paciente_id: String(paciente.id), paciente_nome: paciente.nome });
    setPatientSearch(paciente.nome);
    setEditingCard(null);
    setTargetColumnId(solicitado?.id || null);
    setModalOpen(true);
  }, [pacientePreSelecionado, patients, columns]);

  // Revalida quando o Action Hub criar uma prótese in-place
  useEffect(() => {
    function handle() { loadBoard(clinicId); }
    window.addEventListener('ortus:protese-changed', handle);
    return () => window.removeEventListener('ortus:protese-changed', handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId]);

  const provaClinicaColumn = columns.find((column) => column.titulo === 'Em Prova Clínica');
  function isChecklistColumn(column: Column) { return column.checklist_ativo || column.id === provaClinicaColumn?.id; }
  const visibleTypes = form.categoria === 'Removível' ? REMOVABLE_TYPES : form.categoria === 'Fixa' ? FIXED_TYPES : [];

  const filteredPatients = useMemo(() => {
    const search = patientSearch.trim().toLowerCase();
    if (!search) return patients.slice(0, 8);
    return patients.filter((patient) => patient.nome.toLowerCase().includes(search)).slice(0, 8);
  }, [patients, patientSearch]);

  async function loadBoard(nextClinicId: string | null) {
    setLoading(true);
    const syncedColumns = await ensureStandardColumns(nextClinicId);

    let cardsQuery = supabase.from('kanban_cartoes').select('*').order('created_at', { ascending: false });
    if (nextClinicId) cardsQuery = cardsQuery.eq('clinica_id', nextClinicId);

    let patientsQuery = supabase.from('pacientes').select('id, nome, telefone, clinica_id').order('nome', { ascending: true });
    if (nextClinicId) patientsQuery = patientsQuery.eq('clinica_id', nextClinicId);

    const [{ data: cardsData, error: cardsError }, { data: patientsData }] = await Promise.all([cardsQuery, patientsQuery]);

    if (cardsError) showToast('warning', 'Não foi possível carregar os cartões: ' + cardsError.message);

    setColumns(dedupeColumnsByTitle(syncedColumns));
    setCards((cardsData || []) as Card[]);
    setPatients((patientsData || []) as PatientOption[]);
    setLoading(false);
  }

  async function ensureStandardColumns(nextClinicId: string | null) {
    let query = supabase.from('kanban_colunas').select('*').order('ordem', { ascending: true });
    if (nextClinicId) query = query.eq('clinica_id', nextClinicId);
    else query = query.is('clinica_id', null);

    const { data: existingData } = await query;
    const existing = (existingData || []) as Column[];
    const missing = existing.length === 0 ? STANDARD_COLUMNS : [];

    if (missing.length) {
      const payload = missing.map((title) => ({
        titulo: title,
        ordem: STANDARD_COLUMNS.indexOf(title) + 1,
        clinica_id: nextClinicId,
      }));

      const { error } = await supabase.from('kanban_colunas').insert(payload);
      if (error) showToast('warning', 'Não foi possível criar as etapas padrão: ' + error.message);
    }

    let refreshedQuery = supabase.from('kanban_colunas').select('*').order('ordem', { ascending: true });
    if (nextClinicId) refreshedQuery = refreshedQuery.eq('clinica_id', nextClinicId);
    else refreshedQuery = refreshedQuery.is('clinica_id', null);

    const { data: refreshedData } = await refreshedQuery;
    const refreshed = (refreshedData || []) as Column[];

    return dedupeColumnsByTitle(refreshed);
  }

  function openNewOrder(initialColumnId?: number) {
    const requestedColumn = initialColumnId ? columns.find((column) => column.id === initialColumnId) : columns.find((column) => column.titulo === 'Solicitado') || columns[0];
    setForm({ ...EMPTY_FORM });
    setEditingCard(null);
    setTargetColumnId(requestedColumn?.id || null);
    setPatientSearch('');
    setModalOpen(true);
    if (requestedColumn?.titulo !== 'Solicitado') showToast('success', `Novo pedido será criado em ${requestedColumn?.titulo || 'Solicitado'}.`);
  }

  function openEditOrder(card: Card) {
    const category = card.categoria === 'Removível' || card.categoria === 'Fixa' ? card.categoria : '';
    const position = card.posicao === 'Superior' || card.posicao === 'Inferior' || card.posicao === 'Ambas' ? card.posicao : '';

    setEditingCard(card);
    setTargetColumnId(card.coluna_id);
    setPatientSearch(card.paciente_nome);
    setForm({
      paciente_id: card.paciente_id ? String(card.paciente_id) : null,
      paciente_nome: card.paciente_nome || '',
      categoria: category,
      tipo_protese: card.tipo_protese || '',
      cor_dente: card.cor_dente || '',
      cor_gengiva: card.cor_gengiva || '',
      posicao: position,
      descricao: card.descricao || '',
      status: cardStatus(card),
    });
    setModalOpen(true);
  }

  function selectPatient(patient: PatientOption) {
    setForm((current) => ({ ...current, paciente_id: String(patient.id), paciente_nome: patient.nome }));
    setPatientSearch(patient.nome);
  }

  const [creatingPatient, setCreatingPatient] = useState(false);

  async function quickCreatePatient() {
    const nome = patientSearch.trim();
    if (!nome || creatingPatient) return;

    setCreatingPatient(true);
    const payload: { nome: string; clinica_id?: string } = { nome };
    if (clinicId) payload.clinica_id = clinicId;

    const { data, error } = await supabase
      .from('pacientes')
      .insert([payload])
      .select('id, nome, telefone, clinica_id')
      .single();

    setCreatingPatient(false);

    if (error || !data) {
      showToast('warning', 'Não foi possível criar o paciente: ' + (error?.message || 'erro desconhecido'));
      return;
    }

    const novo = data as PatientOption;
    setPatients((current) => [...current, novo].sort((a, b) => a.nome.localeCompare(b.nome)));
    selectPatient(novo);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ortus:paciente-changed'));
    }
    showToast('success', `${novo.nome} cadastrado e selecionado.`);
  }

  function selectCategory(category: Category) {
    setForm((current) => ({ ...current, categoria: category, tipo_protese: '' }));
  }

  async function createCard() {
    const requestedColumn = targetColumnId ? columns.find((column) => column.id === targetColumnId) : columns.find((column) => column.titulo === 'Solicitado') || columns[0];
    if (!requestedColumn || requestedColumn.id < 0) return showToast('warning', 'As etapas padrão ainda não foram carregadas.');
    if (!form.paciente_nome.trim()) return showToast('warning', 'Selecione ou informe o paciente.');
    if (!form.paciente_id) return showToast('warning', 'Selecione o paciente da lista ou clique em “Cadastrar como novo paciente”.');
    if (!form.categoria) return showToast('warning', 'Escolha a categoria da prótese.');
    if (!form.tipo_protese) return showToast('warning', 'Escolha o tipo da prótese.');

    setSaving(true);
    const payload = {
      coluna_id: requestedColumn.id,
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
      checklist: editingCard?.tipo_protese === form.tipo_protese && Array.isArray(editingCard.checklist) ? editingCard.checklist : buildChecklist(form.tipo_protese),
    };

    const { error } = editingCard
      ? await supabase.from('kanban_cartoes').update(payload).eq('id', editingCard.id)
      : await supabase.from('kanban_cartoes').insert([payload]);
    setSaving(false);

    if (error) return showToast('warning', `Erro ao ${editingCard ? 'atualizar' : 'criar'} pedido: ${error.message}`);

    setModalOpen(false);
    setEditingCard(null);
    setTargetColumnId(null);
    setForm({ ...EMPTY_FORM });
    showToast('success', editingCard ? 'Pedido atualizado.' : 'Pedido de prótese criado.');
    loadBoard(clinicId);
  }

  const [columnIcon, setColumnIcon] = useState<string>('package');
  const [columnChecklist, setColumnChecklist] = useState(false);

  function openNewColumn() {
    setEditingColumn(null);
    setColumnTitle('');
    setColumnIcon('package');
    setColumnChecklist(false);
    setColumnModalOpen(true);
  }

  function openEditColumn(column: Column) {
    setEditingColumn(column);
    setColumnTitle(column.titulo);
    setColumnIcon(column.icone || DEFAULT_ICONS[column.titulo] || 'package');
    setColumnChecklist(column.checklist_ativo ?? false);
    setColumnModalOpen(true);
  }

  async function saveColumn() {
    const title = columnTitle.trim();
    if (!title) return showToast('warning', 'Informe o nome do quadro.');

    setSaving(true);
    const payload = { titulo: title, icone: columnIcon, checklist_ativo: columnChecklist };
    const { error } = editingColumn
      ? await supabase.from('kanban_colunas').update(payload).eq('id', editingColumn.id)
      : await supabase.from('kanban_colunas').insert([{ ...payload, ordem: columns.length + 1, clinica_id: clinicId }]);
    setSaving(false);

    if (error) return showToast('warning', 'Não foi possível salvar o quadro: ' + error.message);

    setColumnModalOpen(false);
    setEditingColumn(null);
    setColumnTitle('');
    showToast('success', editingColumn ? 'Quadro atualizado.' : 'Novo quadro criado.');
    loadBoard(clinicId);
  }

  async function deleteColumn(column: Column) {
    const count = cards.filter((card) => card.coluna_id === column.id).length;
    const message = count > 0
      ? `Remover o quadro "${column.titulo}" também removerá ${count} pedido(s). Continuar?`
      : `Remover o quadro "${column.titulo}"?`;

    if (!(await showConfirm(message, { title: 'Remover Quadro', type: 'warning', confirmLabel: 'Remover' }))) return;

    const { error } = await supabase.from('kanban_colunas').delete().eq('id', column.id);
    if (error) return showToast('warning', 'Não foi possível remover o quadro: ' + error.message);

    showToast('success', 'Quadro removido.');
    loadBoard(clinicId);
  }

  function showToast(type: 'warning' | 'success', message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4200);
  }

  const filteredCards = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let cutoff: number | null = null;
    if (periodFilter !== 'all') {
      const days = periodFilter === '7d' ? 7 : periodFilter === '30d' ? 30 : 90;
      cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    }

    return cards.filter((card) => {
      if (cutoff !== null) {
        const created = card.created_at ? new Date(card.created_at).getTime() : 0;
        if (!created || created < cutoff) return false;
      }
      if (statusFilter.length > 0 && !statusFilter.includes(cardStatus(card))) return false;
      if (!query) return true;
      const haystack = [card.paciente_nome, card.tipo_protese, card.categoria, card.descricao, card.cor_dente, card.posicao]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [cards, searchQuery, periodFilter, statusFilter]);

  function toggleStatusFilter(key: StatusKey) {
    setStatusFilter((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key]
    );
  }

  function cardsByColumn(columnId: number) {
    return filteredCards.filter((card) => card.coluna_id === columnId);
  }

  function canMoveToColumn(card: Card, column: Column) {
    if (column.titulo !== 'Finalizado / Entregue') return true;
    if (isChecklistDone(card.checklist)) return true;
    showToast('warning', 'Conclua todos os itens do checklist antes de finalizar a prótese.');
    return false;
  }

  async function moveCard(card: Card, column: Column) {
    if (card.coluna_id === column.id) return;
    if (!canMoveToColumn(card, column)) return;

    const previousCards = cards;
    setCards((current) => current.map((item) => item.id === card.id ? { ...item, coluna_id: column.id } : item));

    const { error } = await supabase.from('kanban_cartoes').update({ coluna_id: column.id }).eq('id', card.id);
    if (error) {
      setCards(previousCards);
      showToast('warning', 'Não foi possível mover o cartão: ' + error.message);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>, column: Column) {
    event.preventDefault();
    setDragOverColumn(null);
    if (!draggedCard) return;
    moveCard(draggedCard, column);
    setDraggedCard(null);
  }

  async function toggleChecklist(card: Card, index: number) {
    const checklist = Array.isArray(card.checklist) ? card.checklist : [];
    const nextChecklist = checklist.map((item, itemIndex) => itemIndex === index ? { ...item, feito: !item.feito } : item);
    const previousCards = cards;

    setCards((current) => current.map((item) => item.id === card.id ? { ...item, checklist: nextChecklist } : item));
    const { error } = await supabase.from('kanban_cartoes').update({ checklist: nextChecklist }).eq('id', card.id);

    if (error) {
      setCards(previousCards);
      showToast('warning', 'Não foi possível atualizar o checklist: ' + error.message);
    }
  }

  async function deleteCard(cardId: number) {
    if (!(await showConfirm('Excluir este pedido de prótese?', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
    const previousCards = cards;
    setCards((current) => current.filter((card) => card.id !== cardId));

    const { error } = await supabase.from('kanban_cartoes').delete().eq('id', cardId);
    if (error) {
      setCards(previousCards);
      showToast('warning', 'Não foi possível excluir: ' + error.message);
    }
  }

  function patientIdByName(name: string) {
    return patients.find((patient) => patient.nome === name)?.id;
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-5 flex flex-col gap-4 pb-16 min-h-screen animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="sticky top-0 z-20 bg-white rounded-3xl border border-slate-200 shadow-sm p-5 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center gap-4 shrink-0 w-full max-w-full min-w-0">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-50 text-pink-700 text-[10px] font-black uppercase tracking-wider mb-2">
            <Sparkles size={13} /> Kanban inteligente
          </div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Smile className="text-pink-500" size={28} /> Controle de Próteses
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">Fluxo universal com checklist clínico contextual por tipo de prótese.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <button onClick={openNewColumn} className="px-5 py-3 rounded-2xl bg-slate-100 text-slate-600 font-black text-sm hover:bg-slate-200 border border-slate-200 flex items-center justify-center gap-2 active:scale-95 transition-all">
            <Plus size={18} /> Novo Quadro
          </button>
          <button onClick={() => openNewOrder()} className="px-5 py-3 rounded-2xl bg-pink-600 text-white font-black text-sm hover:bg-pink-700 shadow-lg shadow-pink-100 flex items-center justify-center gap-2 active:scale-95 transition-all">
            <Plus size={18} /> Novo Pedido de Prótese
          </button>
        </div>
      </div>

      {toast && (
        <div className={`fixed top-5 right-5 z-[90] max-w-sm rounded-2xl border p-4 shadow-2xl flex gap-3 ${toast.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
          {toast.type === 'warning' ? <AlertTriangle size={20} className="shrink-0" /> : <CheckCircle2 size={20} className="shrink-0" />}
          <p className="text-sm font-bold">{toast.message}</p>
        </div>
      )}

      {/* BARRA DE FILTROS: busca + período + legenda de cores */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 flex flex-col lg:flex-row lg:items-center gap-3 shrink-0 w-full max-w-full min-w-0">
        <div className="relative flex-1 min-w-0 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por paciente, tipo, cor..."
            className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-pink-300 focus:ring-2 focus:ring-pink-100 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              title="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-400 uppercase tracking-wider shrink-0">
          <Filter size={13} /> Período:
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl gap-0.5 shrink-0">
          {([
            { id: 'all', label: 'Todos' },
            { id: '7d', label: '7 dias' },
            { id: '30d', label: '30 dias' },
            { id: '90d', label: '90 dias' },
          ] as const).map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriodFilter(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${periodFilter === p.id ? 'bg-white text-pink-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* FILTRO DE STATUS (chips clicáveis com cor) */}
        <div className="flex items-center gap-1.5 lg:ml-auto pl-0 lg:pl-3 lg:border-l border-slate-200 shrink-0 flex-wrap">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mr-1">Status:</span>
          {(['espera', 'lab', 'clinica', 'feito'] as StatusKey[]).map((k) => {
            const active = statusFilter.includes(k);
            const noneSelected = statusFilter.length === 0;
            const dim = !active && !noneSelected;
            return (
              <button
                key={k}
                onClick={() => toggleStatusFilter(k)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border transition-all ${active ? `${STATUS_TOKENS[k].pill} border-current shadow-sm` : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'} ${dim ? 'opacity-40' : ''}`}
                title={active ? 'Remover filtro' : 'Filtrar por este status'}
              >
                <span className={`w-2 h-2 rounded-full ${STATUS_TOKENS[k].dot}`}></span>
                {STATUS_TOKENS[k].label}
              </button>
            );
          })}
          {statusFilter.length > 0 && (
            <button
              onClick={() => setStatusFilter([])}
              className="px-2 py-1 rounded-lg text-[10px] font-black text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center gap-1"
              title="Limpar filtro de status"
            >
              <X size={11} /> Limpar
            </button>
          )}
        </div>

        <div className="text-[11px] font-bold text-slate-400 shrink-0">
          {filteredCards.length} de {cards.length} pedido(s)
        </div>
      </div>

      {/* FLUXO DO PROCESSO - Navegação por etapa */}
      {!loading && columns.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm shrink-0 w-full max-w-full min-w-0 px-5 py-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Fluxo do Processo</p>
          <div ref={flowBarRef} className="flex items-center gap-1 flex-wrap">
            {columns.slice(0, maxVisibleFlow).map((col, idx) => {
              const count = cardsByColumn(col.id).length;
              return (
                <div key={col.id} className="flex items-center">
                  <button
                    onClick={() => document.getElementById(`coluna-${col.id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black transition-all hover:bg-pink-50 hover:text-pink-700 text-slate-600 border border-transparent hover:border-pink-200 active:scale-95"
                  >
                    <span className="w-7 h-7 rounded-lg bg-pink-50 text-pink-500 flex items-center justify-center shrink-0">{getColumnIcon(col)}</span>
                    <span className="hidden sm:inline whitespace-nowrap">{col.titulo}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400 text-[10px] font-black shrink-0">{count}</span>
                  </button>
                  {idx < maxVisibleFlow - 1 && columns.length > 1 && <ChevronRight size={14} className="text-slate-300 shrink-0" />}
                </div>
              );
            })}

            {/* Overflow: +N etapas dropdown */}
            {columns.length > maxVisibleFlow && (
              <div className="relative shrink-0 ml-1">
                <button
                  onClick={() => setFlowDropdownOpen(!flowDropdownOpen)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black bg-pink-50 text-pink-600 border border-pink-200 hover:bg-pink-100 transition-all active:scale-95"
                >
                  +{columns.length - maxVisibleFlow} etapas
                  <ChevronDown size={13} className={`transition-transform ${flowDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {flowDropdownOpen && (
                  <div className="absolute top-full right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 min-w-[240px] py-2 animate-in fade-in slide-in-from-top-2">
                    <p className="px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Etapas do Fluxo ({columns.length} no total)</p>
                    {columns.slice(maxVisibleFlow).map((col, idx) => {
                      const count = cardsByColumn(col.id).length;
                      return (
                        <button
                          key={col.id}
                          onClick={() => { document.getElementById(`coluna-${col.id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); setFlowDropdownOpen(false); }}
                          className="w-full text-left px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-pink-50 hover:text-pink-700 flex items-center gap-3 transition-colors"
                        >
                          <span className="text-[11px] font-black text-slate-400 w-5">{maxVisibleFlow + idx + 1}</span>
                          <span className="w-6 h-6 rounded-lg bg-pink-50 text-pink-500 flex items-center justify-center shrink-0">{getColumnIcon(col)}</span>
                          <span className="truncate">{col.titulo}</span>
                          <span className="ml-auto px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400 text-[10px] font-black shrink-0">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-0 w-full max-w-full min-w-0">
        {loading ? (
          <div className="h-full flex items-center justify-center text-slate-400 font-bold gap-2">
            <Loader2 className="animate-spin text-pink-600" /> Carregando produção...
          </div>
        ) : (
          <div className="h-full w-full max-w-full min-w-0 flex-1 overflow-x-auto overflow-y-hidden kanban-scrollbar p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row gap-4 sm:h-full sm:min-w-max">
              {columns.map((column) => {
                const columnCards = cardsByColumn(column.id);
                const hasChecklist = isChecklistColumn(column);

                return (
                  <section key={column.id} id={`coluna-${column.id}`} className={`w-full sm:w-80 sm:flex-none sm:h-full rounded-3xl border flex flex-col min-h-0 ${COLUMN_NEUTRAL}`}>
                    <div className="p-4 border-b border-white/60 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-black text-xs uppercase tracking-wider text-slate-800 truncate">{column.titulo}</h2>
                        <p className="text-[11px] font-bold opacity-70 mt-1">{columnCards.length} pedido(s)</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {hasChecklist && <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-white/80 text-violet-700">Checklist</span>}
                        <button onClick={() => openEditColumn(column)} className="p-1.5 rounded-lg bg-white/60 text-slate-400 hover:text-blue-600 hover:bg-white transition-colors" title="Editar quadro">
                          <Edit3 size={13} />
                        </button>
                        <button onClick={() => deleteColumn(column)} className="p-1.5 rounded-lg bg-white/60 text-slate-400 hover:text-red-600 hover:bg-white transition-colors" title="Remover quadro">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOverColumn(column.id);
                      }}
                      onDragLeave={() => setDragOverColumn(null)}
                      onDrop={(event) => handleDrop(event, column)}
                      className={`flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 transition-colors ${dragOverColumn === column.id ? 'bg-white/70 ring-2 ring-pink-200 ring-inset' : ''}`}
                    >
                      {columnCards.map((card) => {
                        const status = cardStatus(card);
                        const tokens = STATUS_TOKENS[status];
                        return (
                        <article
                          key={card.id}
                          draggable
                          onDragStart={() => setDraggedCard(card)}
                          onDragEnd={() => {
                            setDraggedCard(null);
                            setDragOverColumn(null);
                          }}
                          onClick={() => openEditOrder(card)}
                          className={`bg-white border rounded-2xl shadow-sm hover:shadow-lg hover:ring-2 ${tokens.ring} transition-all cursor-pointer active:cursor-grabbing group ${tokens.cardBorder} ${draggedCard?.id === card.id ? 'opacity-50 scale-95 border-dashed border-slate-400' : 'border-slate-200'} ${hasChecklist ? 'p-4' : 'p-3'}`}
                          title="Clique para editar · Arraste para mover"
                        >
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="min-w-0">
                              <p className="font-black text-slate-900 text-sm truncate max-w-[210px]">{card.paciente_nome}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${tokens.pill}`}>{tokens.label}</span>
                                <p className="text-[10px] font-black uppercase tracking-wider text-pink-600 truncate">{card.tipo_protese || 'Prótese'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <GripVertical size={16} className="text-slate-300" />
                              <button
                                onClick={(e) => { e.stopPropagation(); const patientId = patientIdByName(card.paciente_nome); if (patientId) openPatient(patientId); }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
                                title="Abrir paciente"
                              >
                                <Search size={14} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteCard(card.id); }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                title="Excluir pedido"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                              <p className="text-[9px] font-black uppercase text-slate-400">Posição</p>
                              <p className="text-xs font-bold text-slate-700">{card.posicao || '--'}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 border border-slate-100 p-2">
                              <p className="text-[9px] font-black uppercase text-slate-400">Cor</p>
                              <p className="text-xs font-bold text-slate-700">{card.cor_dente || '--'}</p>
                            </div>
                          </div>

                          {hasChecklist ? (
                            <div className="space-y-2 rounded-2xl bg-violet-50/60 border border-violet-100 p-3" onClick={(e) => e.stopPropagation()}>
                              <p className="text-[10px] font-black uppercase tracking-wider text-violet-700">Provas clínicas</p>
                              {(Array.isArray(card.checklist) && card.checklist.length ? card.checklist : buildChecklist(card.tipo_protese || '')).map((item, index) => (
                                <label key={`${card.id}-${item.tarefa}`} className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                                  <input type="checkbox" checked={item.feito} onChange={() => toggleChecklist(card, index)} className="w-4 h-4 accent-violet-600" />
                                  <span className={item.feito ? 'line-through text-slate-400' : ''}>{item.tarefa}</span>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 line-clamp-2 min-h-[32px]">{card.descricao || `${card.categoria || 'Pedido'} · ${card.cor_gengiva ? `Gengiva ${card.cor_gengiva}` : 'Sem observações adicionais'}`}</p>
                          )}
                        </article>
                        );
                      })}

                      {columnCards.length === 0 && (
                        <div className="h-32 rounded-2xl border border-dashed border-white/80 bg-white/40 flex items-center justify-center text-xs font-bold opacity-60">Arraste pedidos para cá</div>
                      )}
                      <button onClick={() => openNewOrder(column.id)} className="w-full py-2.5 rounded-2xl border border-dashed border-white/80 bg-white/50 text-xs font-black opacity-70 hover:opacity-100 hover:bg-white transition-all flex items-center justify-center gap-1">
                        <Plus size={13} /> Adicionar pedido
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[85] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-3xl shadow-2xl border border-slate-100 flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 bg-gradient-to-br from-pink-50 to-white">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-pink-600">{editingCard ? 'Editar pedido' : 'Novo pedido'}</p>
                <h2 className="text-xl font-black text-slate-900">{editingCard ? 'Ajustar dados da prótese' : 'Prótese em menos de 30 segundos'}</h2>
                <p className="text-sm text-slate-500 font-medium mt-1">{editingCard ? 'Atualize os detalhes sem perder o checklist já marcado.' : 'Preencha apenas o que importa agora. O checklist nasce automaticamente.'}</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
              <section className="rounded-3xl border border-slate-200 p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-7 h-7 rounded-xl bg-pink-600 text-white flex items-center justify-center text-xs font-black">A</span>
                  <h3 className="font-black text-slate-800">Selecionar paciente</h3>
                </div>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-3.5 text-slate-400" />
                  <input value={patientSearch} onChange={(event) => { const v = event.target.value; setPatientSearch(v); setForm((current) => ({ ...current, paciente_nome: v, paciente_id: current.paciente_nome === v ? current.paciente_id : null })); }} className="w-full pl-10 pr-3 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:ring-2 focus:ring-pink-500 font-bold text-slate-700" placeholder="Buscar ou digitar nome do paciente" />
                </div>
                {patientSearch.trim() && filteredPatients.length === 0 && !patients.some((p) => p.nome.toLowerCase() === patientSearch.trim().toLowerCase()) && (
                  <button
                    onClick={quickCreatePatient}
                    disabled={creatingPatient}
                    className="mt-3 w-full p-3 rounded-2xl border-2 border-dashed border-pink-200 bg-pink-50/60 hover:bg-pink-50 hover:border-pink-400 text-pink-700 font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-wait"
                    title="Cadastrar este paciente rapidamente"
                  >
                    {creatingPatient ? (
                      <><Loader2 size={16} className="animate-spin"/> Cadastrando...</>
                    ) : (
                      <><Plus size={16}/> Cadastrar &quot;<span className="font-black">{patientSearch.trim()}</span>&quot; como novo paciente</>
                    )}
                  </button>
                )}
                {patientSearch && filteredPatients.length > 0 && (
                  <div className="mt-3 grid sm:grid-cols-2 gap-2">
                    {filteredPatients.map((patient) => (
                      <button key={patient.id} onClick={() => selectPatient(patient)} className={`text-left p-3 rounded-2xl border transition-all ${form.paciente_nome === patient.nome ? 'border-pink-500 bg-pink-50 text-pink-800' : 'border-slate-100 bg-white hover:border-pink-200 hover:bg-pink-50/40'}`}>
                        <p className="text-sm font-black truncate">{patient.nome}</p>
                        <p className="text-xs text-slate-400 font-bold truncate">{patient.telefone || 'Sem telefone'}</p>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 p-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`w-7 h-7 rounded-xl ${STATUS_TOKENS[form.status].dot} text-white flex items-center justify-center text-xs font-black`}>●</span>
                  <h3 className="font-black text-slate-800">Status atual</h3>
                </div>
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as StatusKey }))}
                  className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none focus:ring-2 focus:ring-pink-500"
                >
                  {(['espera', 'lab', 'clinica', 'feito'] as StatusKey[]).map((key) => (
                    <option key={key} value={key}>{STATUS_TOKENS[key].label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 font-bold mt-2">O status acompanha o pedido independente do quadro onde ele esteja.</p>
              </section>

              {form.paciente_nome && (
                <section className="rounded-3xl border border-slate-200 p-4 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-7 h-7 rounded-xl bg-pink-600 text-white flex items-center justify-center text-xs font-black">B</span>
                    <h3 className="font-black text-slate-800">Escolher categoria</h3>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {(['Removível', 'Fixa'] as Category[]).map((category) => (
                      <button key={category} onClick={() => selectCategory(category)} className={`p-5 rounded-3xl border-2 text-left transition-all ${form.categoria === category ? 'border-pink-600 bg-pink-50 shadow-lg shadow-pink-50' : 'border-slate-100 bg-slate-50 hover:border-pink-200'}`}>
                        <p className="font-black text-slate-900 text-lg">{category}</p>
                        <p className="text-sm text-slate-500 font-medium mt-1">{category === 'Removível' ? 'PPR, PT e flexíveis' : 'Coroas, protocolo e adesivas'}</p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {form.categoria && (
                <section className="rounded-3xl border border-slate-200 p-4 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-7 h-7 rounded-xl bg-pink-600 text-white flex items-center justify-center text-xs font-black">C</span>
                    <h3 className="font-black text-slate-800">Escolher tipo</h3>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {visibleTypes.map((type) => (
                      <button key={type} onClick={() => setForm((current) => ({ ...current, tipo_protese: type }))} className={`p-3 rounded-2xl border text-sm font-black transition-all ${form.tipo_protese === type ? 'border-pink-600 bg-pink-50 text-pink-800' : 'border-slate-100 bg-white hover:border-pink-200 hover:bg-pink-50/40 text-slate-700'}`}>
                        {type}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {form.tipo_protese && (
                <section className="rounded-3xl border border-slate-200 p-4 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-7 h-7 rounded-xl bg-pink-600 text-white flex items-center justify-center text-xs font-black">D</span>
                    <h3 className="font-black text-slate-800">Detalhamentos rápidos</h3>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input value={form.cor_dente} onChange={(event) => setForm((current) => ({ ...current, cor_dente: event.target.value }))} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none focus:ring-2 focus:ring-pink-500" placeholder="Cor do dente: A2, B1..." />
                    <input value={form.cor_gengiva} onChange={(event) => setForm((current) => ({ ...current, cor_gengiva: event.target.value }))} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none focus:ring-2 focus:ring-pink-500" placeholder="Cor da gengiva / STG" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {(['Superior', 'Inferior', 'Ambas'] as Position[]).map((position) => (
                      <button key={position} onClick={() => setForm((current) => ({ ...current, posicao: position }))} className={`p-3 rounded-2xl border text-xs font-black transition-all ${form.posicao === position ? 'border-pink-600 bg-pink-50 text-pink-800' : 'border-slate-100 bg-white hover:border-pink-200 text-slate-600'}`}>
                        {position}
                      </button>
                    ))}
                  </div>
                  <textarea value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} rows={3} className="mt-3 w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-medium outline-none focus:ring-2 focus:ring-pink-500" placeholder="Observações rápidas para laboratório" />
                  <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-100 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Checklist que será criado</p>
                    <div className="space-y-1">
                      {buildChecklist(form.tipo_protese).map((item) => (
                        <p key={item.tarefa} className="text-xs font-bold text-slate-600 flex items-center gap-2"><Check size={13} className="text-pink-500" /> {item.tarefa}</p>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 bg-white flex gap-3">
              <button onClick={() => setModalOpen(false)} className="px-5 py-3 rounded-2xl bg-slate-100 text-slate-500 font-black hover:bg-slate-200 transition-colors">Cancelar</button>
              <button onClick={createCard} disabled={saving || !form.paciente_nome || !form.categoria || !form.tipo_protese} className="flex-1 px-5 py-3 rounded-2xl bg-pink-600 text-white font-black hover:bg-pink-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />} {editingCard ? 'Salvar Pedido' : 'Criar Pedido'}
              </button>
            </div>
          </div>
        </div>
      )}

      {columnModalOpen && (
        <div className="fixed inset-0 z-[86] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-pink-600">{editingColumn ? 'Editar quadro' : 'Novo quadro'}</p>
                <h2 className="text-xl font-black text-slate-900">{editingColumn ? 'Configurar etapa' : 'Criar nova etapa'}</h2>
              </div>
              <button onClick={() => setColumnModalOpen(false)} className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nome do quadro</label>
                <input autoFocus value={columnTitle} onChange={(event) => setColumnTitle(event.target.value)} className="mt-2 w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none focus:ring-2 focus:ring-pink-500" placeholder="Ex: Ajuste final, Polimento..." />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 block">Ícone do quadro</label>
                <div className="grid grid-cols-8 gap-1.5">
                  {ICON_PICKER_OPTIONS.map((slug) => (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => setColumnIcon(slug)}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${columnIcon === slug ? 'bg-pink-600 text-white shadow-lg shadow-pink-200 scale-110' : 'bg-slate-50 text-slate-500 hover:bg-pink-50 hover:text-pink-600 border border-slate-100'}`}
                      title={slug}
                    >
                      {ICON_MAP[slug]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-slate-50">
                <div>
                  <p className="font-black text-sm text-slate-800">Checklist clínico</p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Exibir checklist nos cards desta coluna</p>
                </div>
                <button
                  type="button"
                  onClick={() => setColumnChecklist(!columnChecklist)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${columnChecklist ? 'bg-violet-600' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${columnChecklist ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 flex gap-3 shrink-0">
              <button onClick={() => setColumnModalOpen(false)} className="px-5 py-3 rounded-2xl bg-slate-100 text-slate-500 font-black hover:bg-slate-200 transition-colors">Cancelar</button>
              <button onClick={saveColumn} disabled={saving || !columnTitle.trim()} className="flex-1 px-5 py-3 rounded-2xl bg-slate-900 text-white font-black hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 transition-colors">
                {editingColumn ? 'Salvar Quadro' : 'Criar Quadro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
