'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import { useClinica } from '@/app/context/ClinicaContext';
import { carregarConfig, salvarConfig } from '@/lib/configClinica';
import { ChevronDown, ChevronRight, CircleDot, ClipboardList, Eye, Filter, FlaskConical, Gem, Heart, Loader2, Package, Paintbrush, Pipette, Plus, Scissors, Search, Shield, Smile, Sparkles, Star, Truck, Wrench, X, Zap } from 'lucide-react';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import CustomSelect from '@/components/ui/CustomSelect';
import Modal from '@/components/ui/Modal';
import Aviso from '@/components/ui/Aviso';
import Switch from '@/components/ui/Switch';
import MenuPontos from '@/components/ui/MenuPontos';
import ModalPedidoProtese from '@/components/proteses/ModalPedidoProtese';

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
const cardShell = 'rounded-xl bg-white';

type BoardCache = {
  clinicId: string | null;
  columns: Column[];
  cards: Card[];
  patients: PatientOption[];
  cores?: Record<string, string>;
};

const CORES_QUADRO = ['#94a3b8', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#fb7185', '#22d3ee', '#fb923c'];

function tintaQuadro(hex?: string | null) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const claro = (r * 299 + g * 587 + b * 114) / 1000 > 170;
  return {
    fundo: `rgba(${r}, ${g}, ${b}, 0.08)`,
    borda: `rgba(${r}, ${g}, ${b}, 0.22)`,
    marca: hex,
    texto: claro ? '#171717' : '#fff',
  };
}

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

const STATUS_TOKENS: Record<StatusKey, { label: string }> = {
  espera:  { label: 'Em espera' },
  lab:     { label: 'Pronto no lab' },
  clinica: { label: 'Pronto na clínica' },
  feito:   { label: 'Concluída' },
};

const COLUMN_SHELL = 'rounded-xl border border-neutral-200 bg-white text-neutral-800';

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
  const [coresQuadro, setCoresQuadro] = useState<Record<string, string>>(() => boardCacheRef.current?.cores ?? {});
  const coresQuadroRef = useRef(coresQuadro);
  coresQuadroRef.current = coresQuadro;
  const preservarCoresRef = useRef(false);
  const [loading, setLoading] = useState(() => !(boardCacheRef.current?.columns?.length));
  const jaCarregou = useRef(!!boardCacheRef.current?.columns?.length);
  const [saving, setSaving] = useState(false);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [draggedCard, setDraggedCard] = useState<Card | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [targetColumnId, setTargetColumnId] = useState<number | null>(null);
  const [pacienteModal, setPacienteModal] = useState<PatientOption | null>(null);
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
      setCoresQuadro(cached.cores || {});
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
    setPacienteModal(paciente);
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

  async function loadBoard(nextClinicId: string | null, opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    const syncedColumns = await ensureStandardColumns(nextClinicId);

    let cardsQuery = supabase.from('kanban_cartoes').select('*').order('created_at', { ascending: false });
    if (nextClinicId) cardsQuery = cardsQuery.eq('clinica_id', nextClinicId);

    let patientsQuery = supabase.from('pacientes').select('id, nome, telefone, clinica_id').order('nome', { ascending: true });
    if (nextClinicId) patientsQuery = patientsQuery.eq('clinica_id', nextClinicId);

    const coresPromise = nextClinicId
      ? carregarConfig<Record<string, string>>(nextClinicId, 'kanban_cores_quadros', undefined, {})
      : Promise.resolve({} as Record<string, string>);
    const [{ data: cardsData, error: cardsError }, { data: patientsData }, coresRaw] = await Promise.all([cardsQuery, patientsQuery, coresPromise]);

    if (cardsError) showToast('warning', 'Não foi possível carregar os cartões: ' + cardsError.message);

    const nextColumns = dedupeColumnsByTitle(syncedColumns);
    const nextCards = (cardsData || []) as Card[];
    const nextPatients = (patientsData || []) as PatientOption[];

    const fetchedCores = coresRaw && typeof coresRaw === 'object' && !Array.isArray(coresRaw) ? coresRaw : {};
    const nextCores = preservarCoresRef.current ? { ...fetchedCores, ...coresQuadroRef.current } : fetchedCores;
    preservarCoresRef.current = false;
    setColumns(nextColumns);
    setCards(nextCards);
    setPatients(nextPatients);
    setCoresQuadro(nextCores);
    writeBoardCache({ clinicId: nextClinicId, columns: nextColumns, cards: nextCards, patients: nextPatients, cores: nextCores });
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

  function fecharPedido() {
    setModalOpen(false);
    setEditingCard(null);
    setTargetColumnId(null);
    setPacienteModal(null);
  }

  function openNewOrder(initialColumnId?: number) {
    const requestedColumn = initialColumnId ? columns.find((column) => column.id === initialColumnId) : columns.find((column) => column.titulo === 'Solicitado') || columns[0];
    setEditingCard(null);
    setPacienteModal(null);
    setTargetColumnId(requestedColumn?.id || null);
    setModalOpen(true);
  }

  function openEditOrder(card: Card) {
    setPacienteModal(null);
    setEditingCard(card);
    setTargetColumnId(card.coluna_id);
    setModalOpen(true);
  }

  const [columnIcon, setColumnIcon] = useState<string>('package');
  const [columnChecklist, setColumnChecklist] = useState(false);
  const [columnCor, setColumnCor] = useState('');

  function openNewColumn() {
    setEditingColumn(null);
    setColumnTitle('');
    setColumnIcon('package');
    setColumnChecklist(false);
    setColumnCor('');
    setColumnModalOpen(true);
  }

  function openEditColumn(column: Column) {
    setEditingColumn(column);
    setColumnTitle(column.titulo);
    setColumnIcon(column.icone || DEFAULT_ICONS[column.titulo] || 'package');
    setColumnChecklist(column.checklist_ativo ?? false);
    setColumnCor(coresQuadro[String(column.id)] || '');
    setColumnModalOpen(true);
  }

  async function gravarCorQuadro(id: number | string, hex: string) {
    const next = { ...coresQuadroRef.current };
    if (hex) next[String(id)] = hex;
    else delete next[String(id)];
    coresQuadroRef.current = next;
    setCoresQuadro(next);
    if (clinicId) await salvarConfig(clinicId, 'kanban_cores_quadros', next);
    return next;
  }

  async function saveColumn() {
    const title = columnTitle.trim();
    if (!title) return showToast('warning', 'Informe o nome do quadro.');
    if (!editingColumn && columns.length >= 40) return showToast('warning', 'Limite de 40 quadros atingido.');

    setSaving(true);
    const payload = { titulo: title, icone: columnIcon, checklist_ativo: columnChecklist };
    const { data, error } = editingColumn
      ? await supabase.from('kanban_colunas').update(payload).eq('id', editingColumn.id).select('id').single()
      : await supabase.from('kanban_colunas').insert([{ ...payload, ordem: columns.length + 1, clinica_id: clinicId }]).select('id').single();
    setSaving(false);

    if (error) return showToast('warning', 'Não foi possível salvar o quadro: ' + error.message);
    const savedId = data?.id ?? editingColumn?.id;
    if (savedId != null) {
      await gravarCorQuadro(savedId, columnCor);
      preservarCoresRef.current = true;
    }

    if (savedId != null) {
      setColumns((atual) => {
        const nextColumns = editingColumn
          ? atual.map((column) => column.id === savedId ? { ...column, ...payload } : column)
          : [...atual, { id: savedId, titulo: title, ordem: atual.length + 1, clinica_id: clinicId, icone: columnIcon, checklist_ativo: columnChecklist }];
        writeBoardCache({ clinicId, columns: nextColumns, cards, patients, cores: coresQuadroRef.current });
        return nextColumns;
      });
    }

    setColumnModalOpen(false);
    setEditingColumn(null);
    setColumnTitle('');
    showToast('success', editingColumn ? 'Quadro atualizado.' : 'Novo quadro criado.');
  }

  async function deleteColumn(column: Column) {
    const count = cards.filter((card) => card.coluna_id === column.id).length;
    const message = count > 0
      ? `Remover o quadro "${column.titulo}" também removerá ${count} pedido(s). Continuar?`
      : `Remover o quadro "${column.titulo}"?`;

    if (!(await showConfirm(message, { title: 'Remover Quadro', type: 'warning', confirmLabel: 'Remover' }))) return;

    const { error } = await supabase.from('kanban_colunas').delete().eq('id', column.id);
    if (error) return showToast('warning', 'Não foi possível remover o quadro: ' + error.message);

    await gravarCorQuadro(column.id, '');
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
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-800 hover:bg-neutral-50 sm:flex-none"
          >
            <Plus size={16} /> Quadro
          </button>
          <button
            type="button"
            onClick={() => openNewOrder()}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 sm:flex-none"
          >
            <Plus size={16} /> Novo pedido
          </button>
        </div>
      </div>

      <Aviso mensagem={toast?.message ?? null} />

      <div className={`${cardShell} flex shrink-0 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:p-4`}>
        <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar paciente, tipo, cor…"
              className="h-10 w-full rounded-md border border-neutral-200 bg-white py-2 pl-10 pr-9 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
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

          <div className="hidden min-w-0 shrink-0 gap-2 lg:flex lg:w-[26rem]">
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
              className="min-w-0 flex-1"
            />
            <CustomSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusKey | 'all')}
              options={[
                { value: 'all', label: 'Todos os status' },
                ...(['espera', 'lab', 'clinica', 'feito'] as StatusKey[]).map(k => ({ value: k, label: STATUS_TOKENS[k].label })),
              ]}
              size="sm"
              className="min-w-0 flex-1"
            />
            {filtersActive && (
              <button
                type="button"
                onClick={() => { setPeriodFilter('all'); setStatusFilter('all'); }}
                className="inline-flex h-10 shrink-0 items-center gap-1 px-1 text-sm font-medium text-neutral-500 hover:text-neutral-900"
              >
                <X size={14} /> Limpar
              </button>
            )}
          </div>

          <div className="relative shrink-0 lg:hidden">
            <button
              type="button"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={`inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${filtersOpen || filtersActive ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-700 hover:bg-neutral-50'}`}
            >
              <Filter size={16} />
              Filtros
              {filtersActive && <span className="h-1.5 w-1.5 rounded-full bg-[#c8f053]" />}
              <ChevronDown size={13} className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
            </button>
            {filtersOpen && (
              <>
                <button type="button" aria-label="Fechar filtros" className="fixed inset-0 z-40" onClick={() => setFiltersOpen(false)} />
                <div className="absolute top-full left-0 z-50 mt-2 min-w-[260px] space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-xl">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Período</label>
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
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Status</label>
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
                      className="flex w-full items-center justify-center gap-1 pt-1 text-xs font-bold text-slate-400 hover:text-neutral-600"
                    >
                      <X size={13} /> Limpar filtros
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="ml-auto w-36 shrink-0 text-right text-xs font-medium tabular-nums text-neutral-400 sm:text-sm">
          {filteredCards.length} de {cards.length} pedido(s)
        </div>
      </div>

      {columns.length > 0 && (
        <div className={`${cardShell} shrink-0 px-4 py-3 sm:py-2.5`}>
          <p className="mb-2 text-xs font-medium text-neutral-500">Fluxo do processo</p>
          <div ref={flowBarRef} className="flex items-center gap-1 flex-wrap">
            {columns.slice(0, maxVisibleFlow).map((col, idx) => {
              const count = cardsByColumn(col.id).length;
              const tinta = tintaQuadro(coresQuadro[String(col.id)]);
              return (
                <div key={col.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => document.getElementById(`coluna-${col.id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })}
                    className="flex items-center gap-2 rounded-md border border-transparent px-3 py-2 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-200 hover:bg-[#f3f4f1] hover:text-neutral-900"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600" style={tinta ? { color: tinta.marca } : undefined}>{getColumnIcon(col)}</span>
                    <span className="hidden sm:inline whitespace-nowrap">{col.titulo}</span>
                    <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-500">{count}</span>
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
                  className="flex items-center gap-1.5 rounded-md border border-neutral-200 bg-[#f3f4f1] px-3 py-2 text-xs font-medium text-neutral-800 transition-colors hover:bg-white"
                >
                  +{columns.length - maxVisibleFlow} etapas
                  <ChevronDown size={13} className={`transition-transform ${flowDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {flowDropdownOpen && (
                  <>
                    <button type="button" aria-label="Fechar" className="fixed inset-0 z-40" onClick={() => setFlowDropdownOpen(false)} />
                    <div className="absolute top-full right-0 z-50 mt-2 min-w-[240px] rounded-xl border border-neutral-200 bg-white py-2 shadow-xl">
                      <p className="px-4 py-1.5 text-xs font-medium text-neutral-500">Etapas ({columns.length})</p>
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
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600">{getColumnIcon(col)}</span>
                            <span className="truncate">{col.titulo}</span>
                            <span className="ml-auto shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-500">{count}</span>
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
              <div key={i} className="h-full min-h-[280px] w-72 shrink-0 animate-pulse rounded-xl bg-neutral-100 sm:min-h-0" />
            ))}
          </div>
        ) : (
          <div className="kanban-scrollbar min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-3 pb-3 pt-3 sm:px-4 sm:pb-4 sm:pt-4">
            <div className="flex h-full min-h-[280px] min-w-min flex-col gap-4 sm:min-h-0 sm:flex-row sm:items-stretch">
              {columns.map((column) => {
                const columnCards = cardsByColumn(column.id);
                const hasChecklist = isChecklistColumn(column);
                const corAtiva = columnModalOpen && editingColumn && String(editingColumn.id) === String(column.id)
                  ? columnCor
                  : coresQuadro[String(column.id)];
                const tinta = tintaQuadro(corAtiva);

                return (
                  <section
                    key={column.id}
                    id={`coluna-${column.id}`}
                    style={tinta ? { backgroundColor: tinta.fundo, borderColor: tinta.borda, boxShadow: `inset 0 2px 0 ${tinta.marca}` } : undefined}
                    className={`flex h-full min-h-[280px] w-full flex-col sm:min-h-0 sm:w-80 sm:flex-none ${COLUMN_SHELL}`}
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-black/5 p-4" style={tinta ? { borderColor: tinta.borda } : undefined}>
                      <div className="min-w-0">
                        <h2 className="flex items-center gap-2 truncate text-sm font-semibold text-neutral-900">
                          {tinta ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tinta.marca }} /> : null}
                          <span className="truncate">{column.titulo}</span>
                        </h2>
                        <p className="mt-0.5 text-xs text-neutral-500">{columnCards.length} pedido(s)</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {hasChecklist && (
                          <span className="rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-xs font-medium text-neutral-600">Checklist</span>
                        )}
                        <MenuPontos
                          tamanho={14}
                          className="rounded-md p-1.5 text-neutral-400 hover:bg-white hover:text-neutral-900"
                          itens={[
                            { id: 'editar', label: 'Editar quadro', onClick: () => openEditColumn(column) },
                            { id: 'remover', label: 'Remover quadro', perigo: true, onClick: () => deleteColumn(column) },
                          ]}
                        />
                      </div>
                    </div>

                    <div
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOverColumn(column.id);
                      }}
                      onDragLeave={() => setDragOverColumn(null)}
                      onDrop={(event) => handleDrop(event, column)}
                      className={`custom-scrollbar flex-1 space-y-3 overflow-y-auto bg-white p-3 transition-colors ${dragOverColumn === column.id ? 'ring-2 ring-neutral-300 ring-inset' : ''}`}
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
                          className={`cursor-grab rounded-xl border border-neutral-200 bg-white p-3 transition-colors active:cursor-grabbing ${draggedCard?.id === card.id ? 'border-dashed opacity-50' : ''}`}
                        >
                          <div className="mb-1 flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-neutral-900">{card.paciente_nome}</p>
                              <p className="mt-0.5 truncate text-xs font-medium text-neutral-500">
                                {card.tipo_protese || card.categoria || 'Prótese'}
                                {card.cor_dente ? ` · ${card.cor_dente}` : ''}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                              <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600">{tokens.label}</span>
                              <MenuPontos
                                tamanho={14}
                                className="rounded-md p-1 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-900"
                                itens={[
                                  { id: 'editar', label: 'Editar', onClick: () => openEditOrder(card) },
                                  { id: 'excluir', label: 'Excluir', perigo: true, onClick: () => deleteCard(card.id) },
                                ]}
                              />
                            </div>
                          </div>

                          {hasChecklist && Array.isArray(card.checklist) && card.checklist.length > 0 ? (
                            <p className="text-xs font-medium text-neutral-500">
                              Provas: {card.checklist.filter(i => i.feito).length}/{card.checklist.length}
                            </p>
                          ) : card.descricao ? (
                            <p className="line-clamp-1 text-xs text-neutral-500">{card.descricao}</p>
                          ) : null}
                        </article>
                        );
                      })}

                      {columnCards.length === 0 && (
                        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-neutral-100 bg-white text-xs font-medium text-neutral-300">Arraste pedidos para cá</div>
                      )}
                      <button type="button" onClick={() => openNewOrder(column.id)} className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-neutral-200 bg-white py-2.5 text-xs font-medium text-neutral-400 transition-colors hover:bg-neutral-50">
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

      <ModalPedidoProtese
        open={modalOpen}
        onClose={fecharPedido}
        clinicId={clinicId}
        colunaId={targetColumnId}
        columns={columns}
        patients={patients}
        pedido={editingCard}
        pacienteInicial={pacienteModal}
        totalPedidos={cards.length}
        onSaved={() => loadBoard(clinicId, { silent: true })}
        onPatientCreated={(paciente) => setPatients((current) => [...current, paciente].sort((a, b) => a.nome.localeCompare(b.nome)))}
        onAviso={showToast}
      />
      <Modal open={columnModalOpen} onClose={() => setColumnModalOpen(false)} maxWidth="md" zIndex={86} closeOnBackdrop={false} hideCloseButton panelClassName="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 p-5">
              <div>
                <p className="text-xs font-medium text-neutral-500">{editingColumn ? 'Editar quadro' : 'Novo quadro'}</p>
                <h2 className="text-base font-semibold text-neutral-900">{editingColumn ? 'Configurar etapa' : 'Criar nova etapa'}</h2>
              </div>
              <button onClick={() => setColumnModalOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={16} /></button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div>
                <label className="text-xs font-medium text-neutral-500">Nome do quadro</label>
                <input autoFocus value={columnTitle} onChange={(event) => setColumnTitle(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900" placeholder="Ex: Ajuste final, Polimento..." />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-neutral-500">Cor</label>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setColumnCor(''); }} className={`h-7 w-7 rounded-md border bg-[#f3f4f1] ${columnCor ? 'border-neutral-200' : 'border-neutral-900'}`} aria-label="Sem cor" />
                  {CORES_QUADRO.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setColumnCor(hex); }}
                      className={`h-7 w-7 rounded-md border-2 ${columnCor === hex ? 'border-neutral-900' : 'border-transparent'}`}
                      style={{ backgroundColor: hex }}
                      aria-label={hex}
                    />
                  ))}
                  <label className={`relative flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border-2 ${columnCor && !CORES_QUADRO.includes(columnCor) ? 'border-neutral-900' : 'border-neutral-200'}`} style={{ background: columnCor && !CORES_QUADRO.includes(columnCor) ? columnCor : 'conic-gradient(#94a3b8, #60a5fa, #34d399, #fbbf24, #fb7185, #a78bfa, #94a3b8)' }} aria-label="Cor personalizada">
                    <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(columnCor) ? columnCor : '#94a3b8'} onChange={(event) => setColumnCor(event.target.value)} onClick={(event) => event.stopPropagation()} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                    {columnCor && !CORES_QUADRO.includes(columnCor) && <Pipette size={12} className="pointer-events-none text-white mix-blend-difference" />}
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-neutral-500">Ícone do quadro</label>
                <div className="grid grid-cols-8 gap-1.5">
                  {ICON_PICKER_OPTIONS.map((slug) => (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => setColumnIcon(slug)}
                      className={`flex h-9 w-9 items-center justify-center rounded-md ${columnIcon === slug ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50'}`}
                    >
                      {ICON_MAP[slug]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">Checklist clínico</p>
                  <p className="mt-0.5 text-xs font-medium text-neutral-500">Exibir checklist nos cards desta coluna</p>
                </div>
                <Switch checked={columnChecklist} onChange={setColumnChecklist} />
              </div>
            </div>

            <div className="flex shrink-0 gap-2 border-t border-neutral-200 p-5">
              <button type="button" onClick={() => setColumnModalOpen(false)} className="h-9 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50">Cancelar</button>
              <button type="button" onClick={saveColumn} disabled={saving || !columnTitle.trim()} className="h-9 flex-1 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-100 disabled:text-neutral-400">
                {editingColumn ? 'Salvar Quadro' : 'Criar Quadro'}
              </button>
            </div>
      </Modal>
    </div>
  );
}
