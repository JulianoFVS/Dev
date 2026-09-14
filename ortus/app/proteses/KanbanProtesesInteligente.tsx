'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import { useClinica } from '@/app/context/ClinicaContext';
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, CircleDot, ClipboardList, Edit3, Eye, Filter, FlaskConical, Gem, Heart, Loader2, Package, Paintbrush, Plus, Scissors, Search, Shield, Smile, Sparkles, Star, Trash2, Truck, Wrench, X, Zap } from 'lucide-react';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import CustomSelect from '@/components/ui/CustomSelect';
import Modal from '@/components/ui/Modal';

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

const BOARD_CACHE_KEY = 'ortus:proteses-board';
const cardShell = 'rounded-[1.35rem] bg-white sm:rounded-[1.5rem]';

type BoardCache = {
  clinicId: string | null;
  columns: Column[];
  cards: Card[];
  patients: PatientOption[];
};

function readBoardCache(clinicId: string | null): BoardCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(BOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BoardCache;
    if (String(parsed.clinicId ?? '') !== String(clinicId ?? '')) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeBoardCache(payload: BoardCache) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(BOARD_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

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

// Coluna — paleta Bento (neutra, sem rosa/slate legado)
const COLUMN_SHELL = 'rounded-[1.35rem] border border-black/5 bg-[#f3f4f1] text-neutral-800 sm:rounded-[1.5rem]';

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
  const clinicKeyBoot = normalizeClinicId(
    activeClinicId === 'all' || !activeClinicId ? null : activeClinicId,
  );
  const boardCacheRef = useRef(readBoardCache(clinicKeyBoot));
  const [columns, setColumns] = useState<Column[]>(() => boardCacheRef.current?.columns ?? []);
  const [cards, setCards] = useState<Card[]>(() => boardCacheRef.current?.cards ?? []);
  const [patients, setPatients] = useState<PatientOption[]>(() => boardCacheRef.current?.patients ?? []);
  const [loading, setLoading] = useState(() => !(boardCacheRef.current?.columns?.length));
  const jaCarregou = useRef(!!boardCacheRef.current?.columns?.length);
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
  const [statusFilter, setStatusFilter] = useState<StatusKey | 'all'>('all');
  const [flowDropdownOpen, setFlowDropdownOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersActive = periodFilter !== 'all' || statusFilter !== 'all';

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

  const flowBarRef = useRef<HTMLDivElement>(null);
  const [maxVisibleFlow, setMaxVisibleFlow] = useState(99);
  useEffect(() => {
    const el = flowBarRef.current;
    if (!el || columns.length === 0) return;
    const BUTTON_W = 175;
    const OVERFLOW_W = 130;
    function calc() {
      const w = el!.clientWidth;
      if (w < 100) return;
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
    const cached = readBoardCache(nextClinicId);
    if (cached?.columns?.length) {
      boardCacheRef.current = cached;
      setColumns(cached.columns);
      setCards(cached.cards);
      setPatients(cached.patients);
      jaCarregou.current = true;
      setLoading(false);
    }
    const silent = jaCarregou.current && prevClinicRef.current === nextClinicId;
    loadBoard(nextClinicId, { silent });
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
    function handle() { loadBoard(clinicId, { silent: true }); }
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

  async function loadBoard(nextClinicId: string | null, opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    const syncedColumns = await ensureStandardColumns(nextClinicId);

    let cardsQuery = supabase.from('kanban_cartoes').select('*').order('created_at', { ascending: false });
    if (nextClinicId) cardsQuery = cardsQuery.eq('clinica_id', nextClinicId);

    let patientsQuery = supabase.from('pacientes').select('id, nome, telefone, clinica_id').order('nome', { ascending: true });
    if (nextClinicId) patientsQuery = patientsQuery.eq('clinica_id', nextClinicId);

    const [{ data: cardsData, error: cardsError }, { data: patientsData }] = await Promise.all([cardsQuery, patientsQuery]);

    if (cardsError) showToast('warning', 'Não foi possível carregar os cartões: ' + cardsError.message);

    const nextColumns = dedupeColumnsByTitle(syncedColumns);
    const nextCards = (cardsData || []) as Card[];
    const nextPatients = (patientsData || []) as PatientOption[];

    setColumns(nextColumns);
    setCards(nextCards);
    setPatients(nextPatients);
    writeBoardCache({ clinicId: nextClinicId, columns: nextColumns, cards: nextCards, patients: nextPatients });
    jaCarregou.current = true;
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
      if (statusFilter !== 'all' && cardStatus(card) !== statusFilter) return false;
      if (!query) return true;
      const haystack = [card.paciente_nome, card.tipo_protese, card.categoria, card.descricao, card.cor_dente, card.posicao]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [cards, searchQuery, periodFilter, statusFilter]);

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
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Laboratório</h1>
          <p className="mt-1 text-sm text-neutral-500 sm:text-base">
            {filteredCards.length} pedido(s) · fluxo de próteses · arraste entre colunas
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <button
            type="button"
            onClick={openNewColumn}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50 sm:flex-none"
          >
            <Plus size={16} /> Quadro
          </button>
          <button
            type="button"
            onClick={() => openNewOrder()}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 sm:flex-none"
          >
            <Plus size={16} /> Novo pedido
          </button>
        </div>
      </div>

      {toast && (
        <div className={`fixed top-5 right-5 z-[90] max-w-sm rounded-2xl border p-4 shadow-2xl flex gap-3 ${toast.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
          {toast.type === 'warning' ? <AlertTriangle size={20} className="shrink-0" /> : <CheckCircle2 size={20} className="shrink-0" />}
          <p className="text-sm font-bold">{toast.message}</p>
        </div>
      )}

      <div className={`${cardShell} flex shrink-0 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:p-4`}>
        <div className="relative min-w-0 flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar paciente, tipo, cor…"
            className="h-10 w-full rounded-full border border-black/10 bg-[#f8f8f6] py-2 pl-10 pr-9 text-sm font-medium text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-neutral-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              title="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors ${filtersOpen || filtersActive ? 'bg-neutral-900 text-white' : 'border border-black/10 text-neutral-700 hover:bg-neutral-50'}`}
          >
            <Filter size={16} />
            Filtros
            {filtersActive && <span className="h-1.5 w-1.5 rounded-full bg-[#c8f053]" />}
            <ChevronDown size={13} className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>
          {filtersOpen && (
            <>
              <button type="button" aria-label="Fechar filtros" className="fixed inset-0 z-40" onClick={() => setFiltersOpen(false)} />
              <div className="absolute top-full right-0 z-50 mt-2 min-w-[260px] space-y-3 rounded-[1.25rem] border border-black/10 bg-white p-4 shadow-xl">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Período e status</p>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Período</label>
                  <CustomSelect
                    value={periodFilter}
                    onChange={(v) => setPeriodFilter(v as typeof periodFilter)}
                    options={[
                      { value: 'all', label: 'Todos os períodos' },
                      { value: '7d', label: 'Últimos 7 dias' },
                      { value: '30d', label: 'Últimos 30 dias' },
                      { value: '90d', label: 'Últimos 90 dias' },
                    ]}
                    size="sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Status</label>
                  <CustomSelect
                    value={statusFilter}
                    onChange={(v) => setStatusFilter(v as StatusKey | 'all')}
                    options={[
                      { value: 'all', label: 'Todos os status' },
                      ...(['espera', 'lab', 'clinica', 'feito'] as StatusKey[]).map(k => ({ value: k, label: STATUS_TOKENS[k].label })),
                    ]}
                    size="sm"
                  />
                </div>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={() => { setPeriodFilter('all'); setStatusFilter('all'); }}
                    className="w-full text-xs font-bold text-slate-400 hover:text-neutral-600 flex items-center justify-center gap-1 pt-1"
                  >
                    <X size={13} /> Limpar filtros
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 text-xs font-medium text-neutral-400 sm:text-sm">
          {filteredCards.length} de {cards.length} pedido(s)
        </div>
      </div>

      {columns.length > 0 && (
        <div className={`${cardShell} shrink-0 px-4 py-3 sm:py-2.5`}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Fluxo do processo</p>
          <div ref={flowBarRef} className="flex items-center gap-1 flex-wrap">
            {columns.slice(0, maxVisibleFlow).map((col, idx) => {
              const count = cardsByColumn(col.id).length;
              return (
                <div key={col.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => document.getElementById(`coluna-${col.id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })}
                    className="flex items-center gap-2 rounded-full border border-transparent px-3 py-2 text-xs font-semibold text-neutral-600 transition-all hover:border-black/10 hover:bg-[#f3f4f1] hover:text-neutral-900 active:scale-95"
                    title={`Ir para ${col.titulo}`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white">{getColumnIcon(col)}</span>
                    <span className="hidden sm:inline whitespace-nowrap">{col.titulo}</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400 text-[10px] font-black shrink-0">{count}</span>
                  </button>
                  {idx < maxVisibleFlow - 1 && columns.length > 1 && <ChevronRight size={14} className="shrink-0 text-neutral-300" />}
                </div>
              );
            })}

            {columns.length > maxVisibleFlow && (
              <div className="relative shrink-0 ml-1">
                <button
                  type="button"
                  onClick={() => setFlowDropdownOpen(!flowDropdownOpen)}
                  className="flex items-center gap-1.5 rounded-full border border-black/10 bg-[#f3f4f1] px-3 py-2 text-xs font-semibold text-neutral-800 transition-all hover:bg-white active:scale-95"
                >
                  +{columns.length - maxVisibleFlow} etapas
                  <ChevronDown size={13} className={`transition-transform ${flowDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {flowDropdownOpen && (
                  <>
                    <button type="button" aria-label="Fechar" className="fixed inset-0 z-40" onClick={() => setFlowDropdownOpen(false)} />
                    <div className="absolute top-full right-0 z-50 mt-2 min-w-[240px] rounded-[1.25rem] border border-black/10 bg-white py-2 shadow-xl">
                      <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Etapas ({columns.length})</p>
                      {columns.slice(maxVisibleFlow).map((col, idx) => {
                        const count = cardsByColumn(col.id).length;
                        return (
                          <button
                            key={col.id}
                            type="button"
                            onClick={() => {
                              document.getElementById(`coluna-${col.id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                              setFlowDropdownOpen(false);
                            }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-neutral-700 transition-colors hover:bg-[#f3f4f1] hover:text-neutral-900"
                          >
                            <span className="w-5 text-[11px] font-semibold text-neutral-400">{maxVisibleFlow + idx + 1}</span>
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white">{getColumnIcon(col)}</span>
                            <span className="truncate">{col.titulo}</span>
                            <span className="ml-auto px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400 text-[10px] font-black shrink-0">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`${cardShell} flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}>
        {loading && !jaCarregou.current ? (
          <div className="kanban-scrollbar flex min-h-0 flex-1 gap-3 overflow-x-auto px-3 pb-2 pt-3 sm:px-4 sm:pt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-full min-h-[280px] w-72 shrink-0 animate-pulse rounded-[1.35rem] bg-neutral-100 sm:min-h-0 sm:rounded-[1.5rem]" />
            ))}
          </div>
        ) : (
          <div className="kanban-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4">
            <div className="flex h-full min-h-[280px] min-w-min flex-col gap-4 sm:min-h-0 sm:flex-row sm:items-stretch">
              {columns.map((column) => {
                const columnCards = cardsByColumn(column.id);
                const hasChecklist = isChecklistColumn(column);

                return (
                  <section key={column.id} id={`coluna-${column.id}`} className={`flex h-full min-h-[280px] w-full flex-col sm:min-h-0 sm:w-80 sm:flex-none ${COLUMN_SHELL}`}>
                    <div className="flex items-start justify-between gap-3 border-b border-black/5 p-4">
                      <div className="min-w-0">
                        <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-neutral-800">{column.titulo}</h2>
                        <p className="mt-1 text-[11px] font-medium text-neutral-500">{columnCards.length} pedido(s)</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {hasChecklist && (
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-700">Checklist</span>
                        )}
                        <button type="button" onClick={() => openEditColumn(column)} className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-white hover:text-neutral-900" title="Editar quadro">
                          <Edit3 size={13} />
                        </button>
                        <button type="button" onClick={() => deleteColumn(column)} className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-white hover:text-red-600" title="Remover quadro">
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
                      className={`custom-scrollbar flex-1 space-y-3 overflow-y-auto p-3 transition-colors ${dragOverColumn === column.id ? 'bg-white/80 ring-2 ring-neutral-300 ring-inset' : ''}`}
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
                          className={`group cursor-pointer rounded-[1.15rem] border border-black/5 bg-white shadow-sm transition-all hover:shadow-md hover:ring-2 ${tokens.ring} active:cursor-grabbing ${tokens.cardBorder} ${draggedCard?.id === card.id ? 'scale-95 border-dashed border-neutral-400 opacity-50' : ''} ${hasChecklist ? 'p-4' : 'p-3'}`}
                          title="Clique para editar · Arraste para mover"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-neutral-900">{card.paciente_nome}</p>
                              <p className="mt-0.5 truncate text-[11px] font-medium text-neutral-500">
                                {card.tipo_protese || card.categoria || 'Prótese'}
                                {card.cor_dente ? ` · ${card.cor_dente}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${tokens.pill}`}>{tokens.label}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteCard(card.id); }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                title="Excluir pedido"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {hasChecklist && Array.isArray(card.checklist) && card.checklist.length > 0 ? (
                            <p className="text-[10px] font-bold text-violet-600">
                              Provas: {card.checklist.filter(i => i.feito).length}/{card.checklist.length}
                            </p>
                          ) : card.descricao ? (
                            <p className="text-xs text-slate-500 line-clamp-1">{card.descricao}</p>
                          ) : null}
                        </article>
                        );
                      })}

                      {columnCards.length === 0 && (
                        <div className="flex h-32 items-center justify-center rounded-[1rem] border border-dashed border-black/10 bg-white/60 text-xs font-medium text-neutral-400">Arraste pedidos para cá</div>
                      )}
                      <button type="button" onClick={() => openNewOrder(column.id)} className="flex w-full items-center justify-center gap-1 rounded-full border border-dashed border-black/15 bg-white/70 py-2.5 text-xs font-semibold text-neutral-600 transition-all hover:bg-white">
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="2xl" zIndex={85} hideCloseButton panelClassName="flex max-h-[92vh] flex-col overflow-hidden rounded-[1.75rem] border border-black/10 bg-[#eceee9] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-black/5 bg-white p-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-600">{editingCard ? 'Editar pedido' : 'Novo pedido'}</p>
                <h2 className="text-xl font-semibold text-neutral-900">{editingCard ? 'Editar pedido' : 'Novo pedido'}</h2>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
              <section className="rounded-[1.25rem] border border-black/5 bg-white p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="w-7 h-7 rounded-xl bg-neutral-900 text-white flex items-center justify-center text-xs font-black">A</span>
                  <h3 className="font-black text-slate-800">Selecionar paciente</h3>
                </div>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-3.5 text-slate-400" />
                  <input value={patientSearch} onChange={(event) => { const v = event.target.value; setPatientSearch(v); setForm((current) => ({ ...current, paciente_nome: v, paciente_id: current.paciente_nome === v ? current.paciente_id : null })); }} className="w-full pl-10 pr-3 py-3 rounded-2xl bg-slate-50 border border-slate-200 outline-none focus:border-neutral-400 focus:outline-none font-bold text-slate-700" placeholder="Buscar ou digitar nome do paciente" />
                </div>
                {patientSearch.trim() && filteredPatients.length === 0 && !patients.some((p) => p.nome.toLowerCase() === patientSearch.trim().toLowerCase()) && (
                  <button
                    onClick={quickCreatePatient}
                    disabled={creatingPatient}
                    className="mt-3 w-full p-3 rounded-2xl border-2 border-dashed border-black/10 bg-[#f3f4f1]/60 hover:bg-[#f3f4f1] hover:border-neutral-400 text-neutral-800 font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-wait"
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
                      <button key={patient.id} onClick={() => selectPatient(patient)} className={`text-left p-3 rounded-2xl border transition-all ${form.paciente_nome === patient.nome ? 'border-neutral-900 bg-[#f3f4f1] text-neutral-900' : 'border-slate-100 bg-white hover:border-black/10 hover:bg-[#f3f4f1]/40'}`}>
                        <p className="text-sm font-black truncate">{patient.nome}</p>
                        <p className="text-xs text-slate-400 font-bold truncate">{patient.telefone || 'Sem telefone'}</p>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-[1.25rem] border border-black/5 bg-white p-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`w-7 h-7 rounded-xl ${STATUS_TOKENS[form.status].dot} text-white flex items-center justify-center text-xs font-black`}>●</span>
                  <h3 className="font-black text-slate-800">Status atual</h3>
                </div>
                <CustomSelect
                  value={form.status}
                  onChange={(v) => setForm((current) => ({ ...current, status: v as StatusKey }))}
                  options={(['espera', 'lab', 'clinica', 'feito'] as StatusKey[]).map((key) => ({ value: key, label: STATUS_TOKENS[key].label }))}
                  size="lg"
                />
                <p className="text-[11px] text-slate-400 font-bold mt-2">O status acompanha o pedido independente do quadro onde ele esteja.</p>
              </section>

              {form.paciente_nome && (
                <section className="rounded-[1.25rem] border border-black/5 bg-white p-4 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-7 h-7 rounded-xl bg-neutral-900 text-white flex items-center justify-center text-xs font-black">B</span>
                    <h3 className="font-black text-slate-800">Escolher categoria</h3>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {(['Removível', 'Fixa'] as Category[]).map((category) => (
                      <button key={category} onClick={() => selectCategory(category)} className={`p-5 rounded-3xl border-2 text-left transition-all ${form.categoria === category ? 'border-neutral-900 bg-[#f3f4f1] shadow-lg shadow-neutral-100' : 'border-slate-100 bg-slate-50 hover:border-black/10'}`}>
                        <p className="font-black text-slate-900 text-lg">{category}</p>
                        <p className="text-sm text-slate-500 font-medium mt-1">{category === 'Removível' ? 'PPR, PT e flexíveis' : 'Coroas, protocolo e adesivas'}</p>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {form.categoria && (
                <section className="rounded-[1.25rem] border border-black/5 bg-white p-4 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-7 h-7 rounded-xl bg-neutral-900 text-white flex items-center justify-center text-xs font-black">C</span>
                    <h3 className="font-black text-slate-800">Escolher tipo</h3>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {visibleTypes.map((type) => (
                      <button key={type} onClick={() => setForm((current) => ({ ...current, tipo_protese: type }))} className={`p-3 rounded-2xl border text-sm font-black transition-all ${form.tipo_protese === type ? 'border-neutral-900 bg-[#f3f4f1] text-neutral-900' : 'border-slate-100 bg-white hover:border-black/10 hover:bg-[#f3f4f1]/40 text-slate-700'}`}>
                        {type}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {form.tipo_protese && (
                <section className="rounded-[1.25rem] border border-black/5 bg-white p-4 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-7 h-7 rounded-xl bg-neutral-900 text-white flex items-center justify-center text-xs font-black">D</span>
                    <h3 className="font-black text-slate-800">Detalhamentos rápidos</h3>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input value={form.cor_dente} onChange={(event) => setForm((current) => ({ ...current, cor_dente: event.target.value }))} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none focus:border-neutral-400 focus:outline-none" placeholder="Cor do dente: A2, B1..." />
                    <input value={form.cor_gengiva} onChange={(event) => setForm((current) => ({ ...current, cor_gengiva: event.target.value }))} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none focus:border-neutral-400 focus:outline-none" placeholder="Cor da gengiva / STG" />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {(['Superior', 'Inferior', 'Ambas'] as Position[]).map((position) => (
                      <button key={position} onClick={() => setForm((current) => ({ ...current, posicao: position }))} className={`p-3 rounded-2xl border text-xs font-black transition-all ${form.posicao === position ? 'border-neutral-900 bg-[#f3f4f1] text-neutral-900' : 'border-slate-100 bg-white hover:border-black/10 text-slate-600'}`}>
                        {position}
                      </button>
                    ))}
                  </div>
                  <textarea value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} rows={3} className="mt-3 w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-medium outline-none focus:border-neutral-400 focus:outline-none" placeholder="Observações rápidas para laboratório" />
                  <div className="mt-3 rounded-2xl bg-slate-50 border border-slate-100 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Checklist que será criado</p>
                    <div className="space-y-1">
                      {buildChecklist(form.tipo_protese).map((item) => (
                        <p key={item.tarefa} className="text-xs font-bold text-slate-600 flex items-center gap-2"><Check size={13} className="text-neutral-700" /> {item.tarefa}</p>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </div>

            <div className="flex gap-3 border-t border-black/5 bg-white p-5">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-full bg-[#f3f4f1] px-5 py-3 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-200">Cancelar</button>
              <button type="button" onClick={createCard} disabled={saving || !form.paciente_nome || !form.categoria || !form.tipo_protese} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400">
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />} {editingCard ? 'Salvar Pedido' : 'Criar Pedido'}
              </button>
            </div>
      </Modal>

      <Modal open={columnModalOpen} onClose={() => setColumnModalOpen(false)} maxWidth="md" zIndex={86} hideCloseButton panelClassName="flex max-h-[85vh] flex-col overflow-hidden rounded-[1.75rem] border border-black/10 bg-[#eceee9] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-600">{editingColumn ? 'Editar quadro' : 'Novo quadro'}</p>
                <h2 className="text-xl font-semibold text-neutral-900">{editingColumn ? 'Configurar etapa' : 'Criar nova etapa'}</h2>
              </div>
              <button onClick={() => setColumnModalOpen(false)} className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><X size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nome do quadro</label>
                <input autoFocus value={columnTitle} onChange={(event) => setColumnTitle(event.target.value)} className="mt-2 w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none focus:border-neutral-400 focus:outline-none" placeholder="Ex: Ajuste final, Polimento..." />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 block">Ícone do quadro</label>
                <div className="grid grid-cols-8 gap-1.5">
                  {ICON_PICKER_OPTIONS.map((slug) => (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => setColumnIcon(slug)}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${columnIcon === slug ? 'bg-neutral-900 text-white shadow-lg shadow-neutral-200 scale-110' : 'bg-slate-50 text-slate-500 hover:bg-[#f3f4f1] hover:text-neutral-600 border border-slate-100'}`}
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

            <div className="flex shrink-0 gap-3 border-t border-black/5 p-5">
              <button type="button" onClick={() => setColumnModalOpen(false)} className="rounded-full bg-[#f3f4f1] px-5 py-3 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-200">Cancelar</button>
              <button type="button" onClick={saveColumn} disabled={saving || !columnTitle.trim()} className="flex-1 rounded-full bg-neutral-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:bg-neutral-100 disabled:text-neutral-400">
                {editingColumn ? 'Salvar Quadro' : 'Criar Quadro'}
              </button>
            </div>
      </Modal>
    </div>
  );
}
