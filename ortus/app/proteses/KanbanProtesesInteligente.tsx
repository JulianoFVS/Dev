'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { dados as tabelas } from '@/lib/local/consulta';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { carregarConfig, salvarConfig } from '@/lib/configClinica';
import { fraseDeErro } from '@/lib/fraseDeErro';
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleDot, ClipboardList, Eye, Filter, FlaskConical, Gem, Heart, Package, Paintbrush, Pipette, Plus, Scissors, Search, Shield, Smile, Sparkles, Star, Truck, Wrench, X, Zap } from 'lucide-react';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import CustomSelect from '@/components/ui/CustomSelect';
import Modal from '@/components/ui/Modal';
import Aviso from '@/components/ui/Aviso';
import Switch from '@/components/ui/Switch';
import MenuPontos from '@/components/ui/MenuPontos';
import ModalPedidoProtese from '@/components/proteses/ModalPedidoProtese';

function SetaEtapa({
  texto,
  label,
  disabled,
  onClick,
  children,
}: {
  texto: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const [visivel, setVisivel] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisivel(true)}
      onMouseLeave={() => setVisivel(false)}
      onPointerDown={() => setVisivel(false)}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-50 disabled:opacity-30"
      >
        {children}
      </button>
      {visivel && !disabled && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white">
          {texto}
        </span>
      )}
    </span>
  );
}

type ColumnTitle = 'Solicitado' | 'No Laboratório' | 'Em Prova Clínica' | 'Aguardando Ajuste' | 'Finalizado / Entregue';
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

const STANDARD_COLUMNS: ColumnTitle[] = [
  'Solicitado',
  'No Laboratório',
  'Em Prova Clínica',
  'Aguardando Ajuste',
  'Finalizado / Entregue',
];

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

/** Quantas etapas o resumo do fluxo mostra no celular antes de "+N etapas". */
const ETAPAS_VISIVEIS_CELULAR = 6;
/** Escolha por toque aberta a partir de um cartão: para qual etapa mover ou qual status marcar. */
type FolhaCartao = { tipo: 'etapa' | 'status'; cardId: number };

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
  const { activeClinicId, activeClinic, loading: clinicLoading } = useClinica();
  const { showConfirm } = useCustomAlert();
  const clinicKeyBoot = normalizeClinicId(
    activeClinicId === 'all' || !activeClinicId ? null : activeClinicId,
  );
  // "Todas as clínicas" (ou nenhuma escolhida): cada clínica tem as próprias etapas, então não há um quadro só para mostrar.
  const semClinica = !clinicLoading && clinicKeyBoot === null;
  // Sem clínica não há quadro: um cache sem clínica seria resto de carga antiga sem filtro.
  const boardCacheRef = useRef(clinicKeyBoot ? readBoardCache(clinicKeyBoot) : null);
  const [columns, setColumns] = useState<Column[]>(() => boardCacheRef.current?.columns ?? []);
  const [cards, setCards] = useState<Card[]>(() => boardCacheRef.current?.cards ?? []);
  const [patients, setPatients] = useState<PatientOption[]>(() => boardCacheRef.current?.patients ?? []);
  const [coresQuadro, setCoresQuadro] = useState<Record<string, string>>(() => boardCacheRef.current?.cores ?? {});
  const coresQuadroRef = useRef(coresQuadro);
  coresQuadroRef.current = coresQuadro;
  const preservarCoresRef = useRef(false);
  const [loading, setLoading] = useState(() => !(boardCacheRef.current?.columns?.length));
  const jaCarregou = useRef(!!boardCacheRef.current?.columns?.length);
  // Cada carga do quadro ganha um número e só a mais recente chega à tela: trocar de clínica no meio de uma carga não mistura as duas.
  const cargaRef = useRef(0);
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
  const toastTimer = useRef<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'all' | '7d' | '30d' | '90d'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusKey | 'all'>('all');
  const [flowDropdownOpen, setFlowDropdownOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersActive = periodFilter !== 'all' || statusFilter !== 'all';
  const [etapasAbertas, setEtapasAbertas] = useState(false);
  // `folha` guarda a última escolha mesmo fechada: o popup ainda é desenhado durante a animação de saída.
  const [folha, setFolha] = useState<FolhaCartao | null>(null);
  const [folhaAberta, setFolhaAberta] = useState(false);

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
    // Compara antes de gravar no ref: depois dele a comparação dava sempre "mesma clínica".
    const mesmaClinica = prevClinicRef.current === nextClinicId;
    if (mesmaClinica && columns.length > 0) return;
    prevClinicRef.current = nextClinicId;
    setClinicId(nextClinicId);
    const cached = nextClinicId ? readBoardCache(nextClinicId) : null;
    if (cached?.columns?.length) {
      boardCacheRef.current = cached;
      setColumns(cached.columns);
      setCards(cached.cards);
      setPatients(cached.patients);
      setCoresQuadro(cached.cores || {});
      jaCarregou.current = true;
      setLoading(false);
    } else if (!mesmaClinica) {
      // O cache guarda uma clínica só. Sem ele, o quadro na tela é da clínica anterior: sai (volta o esqueleto) até a carga
      // desta chegar. Antes ele ficava, e "Avançar" num pedido dele gravava na clínica nova sem mudar nada.
      boardCacheRef.current = null;
      setColumns([]);
      setCards([]);
      setPatients([]);
      setCoresQuadro({});
      jaCarregou.current = false;
    }
    if (!nextClinicId) {
      // "Todas as clínicas": nada a carregar. Descarta a carga que ainda estiver a caminho.
      cargaRef.current += 1;
      setLoading(false);
      return;
    }
    loadBoard(nextClinicId, { silent: jaCarregou.current });
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
    // Sem clínica não há etapas para ler nem para criar (etapa sem clínica a RLS recusa). E só a clínica da tela:
    // uma recarga pedida antes da troca (ao fim de uma gravação) não pode trazer de volta o quadro da anterior.
    if (!nextClinicId || nextClinicId !== prevClinicRef.current) return;
    const carga = ++cargaRef.current;
    if (!opts?.silent) setLoading(true);
    const syncedColumns = await ensureStandardColumns(nextClinicId);

    const cardsQuery = tabelas.from('kanban_cartoes').select('*').order('created_at', { ascending: false }).eq('clinica_id', nextClinicId);
    const patientsQuery = tabelas.from('pacientes').select('id, nome, telefone, clinica_id').order('nome', { ascending: true }).eq('clinica_id', nextClinicId);
    const coresPromise = carregarConfig<Record<string, string>>(nextClinicId, 'kanban_cores_quadros', undefined, {});
    const [{ data: cardsData, error: cardsError }, { data: patientsData }, coresRaw] = await Promise.all([cardsQuery, patientsQuery, coresPromise]);

    // Outra carga começou depois desta (troca de clínica, gravação): esta chegou tarde e não mexe na tela.
    if (carga !== cargaRef.current) return;
    if (!syncedColumns || cardsError) {
      // Leitura falhou: o quadro na tela (do cache ou da última carga) fica como está, em vez de virar um quadro vazio.
      showToast('warning', fraseDeErro(cardsError, 'Não foi possível carregar o quadro. Confira a internet e tente de novo.'));
      setLoading(false);
      return;
    }

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

  /** Etapas da clínica, criando as padrão na primeira vez. `null` quando a leitura falhou. */
  async function ensureStandardColumns(nextClinicId: string): Promise<Column[] | null> {
    const query = tabelas.from('kanban_colunas').select('*').order('ordem', { ascending: true }).eq('clinica_id', nextClinicId);

    const { data: existingData, error: readError } = await query;
    // Sem conseguir ler não dá para saber se faltam etapas: criar agora duplicaria as que já existem.
    if (readError) return null;
    const existing = (existingData || []) as Column[];
    const missing = existing.length === 0 ? STANDARD_COLUMNS : [];

    if (missing.length) {
      const payload = missing.map((title) => ({
        titulo: title,
        ordem: STANDARD_COLUMNS.indexOf(title) + 1,
        clinica_id: nextClinicId,
      }));

      const { error } = await tabelas.from('kanban_colunas').insert(payload);
      if (error) showToast('warning', fraseDeErro(error, 'Não foi possível criar as etapas padrão.'));
    }

    const refreshedQuery = tabelas.from('kanban_colunas').select('*').order('ordem', { ascending: true }).eq('clinica_id', nextClinicId);
    const { data: refreshedData, error: refreshError } = await refreshedQuery;
    if (refreshError) return null;
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

  /**
   * Grava a cor do quadro nas configurações da clínica, que só o administrador altera (membro comum cria quadro, mas não pinta).
   * Devolve null quando gravou. Se o banco recusar, a cor volta à anterior na tela e volta a frase do motivo, para quem chamou avisar.
   */
  async function gravarCorQuadro(id: number | string, hex: string): Promise<string | null> {
    const chave = String(id);
    const corAnterior = coresQuadroRef.current[chave];
    const next = { ...coresQuadroRef.current };
    if (hex) next[chave] = hex;
    else delete next[chave];
    coresQuadroRef.current = next;
    setCoresQuadro(next);
    if (!clinicId) return null;
    try {
      await salvarConfig(clinicId, 'kanban_cores_quadros', next);
      return null;
    } catch (erro) {
      // Desfaz só a cor deste quadro: a tela não mostra cor que o banco não guardou.
      const desfeito = { ...coresQuadroRef.current };
      if (corAnterior) desfeito[chave] = corAnterior;
      else delete desfeito[chave];
      coresQuadroRef.current = desfeito;
      setCoresQuadro(desfeito);
      // salvarConfig guarda o retorno do banco em `cause`: é ele que diz se foi recusa de permissão.
      const causa = erro instanceof Error && erro.cause ? erro.cause : erro;
      if ((causa as { code?: unknown } | null)?.code === '42501') return 'Só o administrador da clínica muda as cores dos quadros.';
      return fraseDeErro(causa, 'Tente de novo em instantes.');
    }
  }

  async function saveColumn() {
    const title = columnTitle.trim();
    if (!title) return showToast('warning', 'Informe o nome do quadro.');
    // Etapa sem clínica a RLS recusa: em "Todas as clínicas" o botão já fica desligado, isto é a segunda trava.
    if (!clinicId) return showToast('warning', 'Selecione uma clínica para criar o quadro.');
    // Quadros de mesmo nome são fundidos na leitura (dedupeColumnsByTitle): o segundo sumiria depois de salvo.
    const repetido = columns.some((column) => column.id !== editingColumn?.id && column.titulo.trim().toLowerCase() === title.toLowerCase());
    if (repetido) return showToast('warning', 'Já existe um quadro com esse nome.');
    if (!editingColumn && columns.length >= 40) return showToast('warning', 'Limite de 40 quadros atingido.');

    // O botão fica desligado até a cor também terminar: antes ele voltava no meio e um segundo toque gravava outro quadro.
    setSaving(true);
    try {
      const payload = { titulo: title, icone: columnIcon, checklist_ativo: columnChecklist };
      const { data, error } = editingColumn
        ? await tabelas.from('kanban_colunas').update(payload).eq('id', editingColumn.id).eq('clinica_id', clinicId).select('id').single()
        : await tabelas.from('kanban_colunas').insert([{ ...payload, ordem: columns.length + 1, clinica_id: clinicId }]).select('id').single();

      // Recusa do banco, ou edição que não achou o quadro nesta clínica (zero linhas): o popup fica aberto com o aviso.
      const savedId = data?.id;
      if (error || savedId == null) return showToast('warning', fraseDeErro(error, 'Não foi possível salvar o quadro.'));

      // A cor só vai ao banco quando mudou. Antes ia sempre, e a recusa (membro comum) derrubava o salvamento:
      // o quadro ficava gravado, o popup aberto, e tocar de novo gravava outro igual.
      const corMudou = columnCor !== (coresQuadroRef.current[String(savedId)] || '');
      const motivoCor = corMudou ? await gravarCorQuadro(savedId, columnCor) : null;
      if (corMudou && !motivoCor) preservarCoresRef.current = true;

      setColumns((atual) => {
        const nextColumns = editingColumn
          ? atual.map((column) => column.id === savedId ? { ...column, ...payload } : column)
          : [...atual, { id: savedId, titulo: title, ordem: atual.length + 1, clinica_id: clinicId, icone: columnIcon, checklist_ativo: columnChecklist }];
        writeBoardCache({ clinicId, columns: nextColumns, cards, patients, cores: coresQuadroRef.current });
        return nextColumns;
      });

      // O quadro foi salvo, então o popup fecha. Se só a cor ficou de fora, o aviso diz por quê.
      setColumnModalOpen(false);
      setEditingColumn(null);
      setColumnTitle('');
      const feito = editingColumn ? 'Quadro atualizado' : 'Novo quadro criado';
      showToast(motivoCor ? 'warning' : 'success', motivoCor ? `${feito}, mas a cor não foi salva. ${motivoCor}` : `${feito}.`);
    } catch (erro) {
      showToast('warning', fraseDeErro(erro, 'Não foi possível salvar o quadro.'));
    } finally {
      setSaving(false);
    }
  }

  async function deleteColumn(column: Column) {
    const count = cards.filter((card) => card.coluna_id === column.id).length;
    const message = count > 0
      ? `Remover o quadro "${column.titulo}" também removerá ${count} pedido(s). Continuar?`
      : `Remover o quadro "${column.titulo}"?`;

    if (!(await showConfirm(message, { title: 'Remover Quadro', type: 'warning', confirmLabel: 'Remover' }))) return;
    if (!clinicId) return;

    // Pede de volta o que apagou: zero linhas (quadro de outra clínica ou já removido) não é "Quadro removido".
    const { data, error } = await tabelas.from('kanban_colunas').delete().eq('id', column.id).eq('clinica_id', clinicId).select('id');
    if (error) return showToast('warning', fraseDeErro(error, 'Não foi possível remover o quadro.'));
    if (!Array.isArray(data) || data.length === 0) {
      showToast('warning', 'Não foi possível remover: este quadro já não existe nesta clínica. A tela foi atualizada.');
      await loadBoard(clinicId, { silent: true });
      return;
    }

    // O banco apagou a etapa e os pedidos dela (ON DELETE CASCADE): a tela acompanha já, e a recarga confirma.
    setColumns((atual) => atual.filter((item) => item.id !== column.id));
    setCards((atual) => atual.filter((card) => card.coluna_id !== column.id));
    showToast('success', 'Quadro removido.');
    // Limpa a cor que ele tinha. Se o banco recusar (membro comum), sobra só a cor de um quadro que não existe mais: nada a avisar.
    if (coresQuadroRef.current[String(column.id)]) await gravarCorQuadro(column.id, '');
    await loadBoard(clinicId, { silent: true });
  }

  function showToast(type: 'warning' | 'success', message: string) {
    setToast({ type, message });
    // Um aviso logo depois do outro (dois "Avançar" seguidos) não pode ser apagado pelo relógio do anterior.
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
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
    showToast('warning', 'Marque todas as provas do pedido (em Editar) antes de finalizar a prótese.');
    return false;
  }

  async function moveCard(card: Card, column: Column, opts?: { avisar?: boolean }) {
    if (card.coluna_id === column.id) return;
    if (!canMoveToColumn(card, column)) return;

    setCards((current) => current.map((item) => item.id === card.id ? { ...item, coluna_id: column.id } : item));

    let query = tabelas.from('kanban_cartoes').update({ coluna_id: column.id }).eq('id', card.id);
    if (clinicId) query = query.eq('clinica_id', clinicId);
    // Pede a linha de volta: com o filtro da clínica, um pedido de fora dela volta vazio, sem erro, e não pode virar "movido".
    const { data, error } = await query.select('id');
    if (error || !Array.isArray(data) || data.length === 0) {
      // Desfaz só este pedido: a lista pode ter sido recarregada (outra clínica) enquanto a gravação ia.
      setCards((current) => current.map((item) => item.id === card.id ? { ...item, coluna_id: card.coluna_id } : item));
      showToast('warning', error ? fraseDeErro(error, 'Não foi possível mover o pedido.') : 'O pedido não foi movido: ele não está mais nesta clínica.');
      if (!error) void loadBoard(clinicId, { silent: true });
      return;
    }
    // Arrastando, o gesto já mostra o destino. Pelo toque o cartão some da etapa, então a tela diz para onde ele foi.
    if (opts?.avisar) showToast('success', `Pedido movido para ${column.titulo}.`);
  }

  async function mudarStatus(card: Card, status: StatusKey) {
    if (cardStatus(card) === status) return;

    setCards((current) => current.map((item) => item.id === card.id ? { ...item, status } : item));

    let query = tabelas.from('kanban_cartoes').update({ status }).eq('id', card.id);
    if (clinicId) query = query.eq('clinica_id', clinicId);
    // Como em moveCard: zero linhas gravadas é falha, não "Status do pedido…".
    const { data, error } = await query.select('id');
    if (error || !Array.isArray(data) || data.length === 0) {
      setCards((current) => current.map((item) => item.id === card.id ? { ...item, status: card.status } : item));
      showToast('warning', error ? fraseDeErro(error, 'Não foi possível mudar o status.') : 'O status não mudou: este pedido não está mais nesta clínica.');
      if (!error) void loadBoard(clinicId, { silent: true });
      return;
    }
    showToast('success', `Status do pedido: ${STATUS_TOKENS[status].label}.`);
  }

  const ultimoAvanco = useRef(0);
  function avancar(card: Card, column: Column) {
    // Ao avançar, o cartão sai da etapa e o de baixo sobe para o mesmo lugar: sem esta trava, um toque duplo moveria os dois.
    const agora = Date.now();
    if (agora - ultimoAvanco.current < 600) return;
    ultimoAvanco.current = agora;
    void moveCard(card, column, { avisar: true });
  }

  function abrirFolha(tipo: FolhaCartao['tipo'], card: Card) {
    setFolha({ tipo, cardId: card.id });
    setFolhaAberta(true);
  }

  function irParaColuna(columnId: number) {
    const alvo = document.getElementById(`coluna-${columnId}`);
    if (!alvo) return;
    // Empilhadas (celular), a etapa sobe para o topo da página; lado a lado, ela vem para o meio do quadro.
    const empilhado = window.matchMedia('(max-width: 767px)').matches;
    alvo.scrollIntoView({ behavior: 'smooth', inline: 'center', block: empilhado ? 'start' : 'nearest' });
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>, column: Column) {
    event.preventDefault();
    setDragOverColumn(null);
    if (!draggedCard) return;
    moveCard(draggedCard, column);
    setDraggedCard(null);
  }

  async function deleteCard(cardId: number) {
    if (!(await showConfirm('Excluir este pedido de prótese?', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
    const previousCards = cards;
    setCards((current) => current.filter((card) => card.id !== cardId));

    let query = tabelas.from('kanban_cartoes').delete().eq('id', cardId);
    if (clinicId) query = query.eq('clinica_id', clinicId);
    const { data, error } = await query.select('id');
    if (error) {
      setCards(previousCards);
      showToast('warning', fraseDeErro(error, 'Não foi possível excluir o pedido.'));
      return;
    }
    // Zero linhas apagadas: o pedido já não está nesta clínica (excluído em outro lugar). Não é "excluído"; a recarga acerta a tela.
    if (!Array.isArray(data) || data.length === 0) {
      showToast('warning', 'Este pedido já não está nesta clínica. A tela foi atualizada.');
      void loadBoard(clinicId, { silent: true });
      return;
    }
    showToast('success', 'Pedido excluído.');
  }

  // Com uma etapa só de sobra não vale esconder: o botão "+1" ocuparia a mesma linha que ela.
  const fluxoRecolhe = columns.length > ETAPAS_VISIVEIS_CELULAR + 1;
  const cardDaFolha = folha ? cards.find((card) => card.id === folha.cardId) ?? null : null;
  const opcoesFolha: { id: string; label: string; atual: boolean; escolher: () => Promise<void> }[] = !folha || !cardDaFolha
    ? []
    : folha.tipo === 'etapa'
      ? columns.map((column) => ({
          id: String(column.id),
          label: column.titulo,
          atual: column.id === cardDaFolha.coluna_id,
          escolher: () => moveCard(cardDaFolha, column, { avisar: true }),
        }))
      : VALID_STATUS.map((status) => ({
          id: status,
          label: STATUS_TOKENS[status].label,
          atual: cardStatus(cardDaFolha) === status,
          escolher: () => mudarStatus(cardDaFolha, status),
        }));

  return (
    // Celular (abaixo de md): as etapas ficam empilhadas na altura do conteúdo e a página inteira rola.
    // De md para cima a tela cabe na viewport e só o quadro rola, como sempre foi.
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:overflow-hidden md:px-4 md:py-3.5">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">
            Laboratório
            <span className="hidden text-neutral-400 md:inline"> · {activeClinic ? getClinicLabel(activeClinic) : 'Todas as clínicas'}</span>
          </h1>
          <p className="mt-1 text-sm text-neutral-500 sm:text-base">
            {semClinica ? 'Fluxo de próteses' : `${filteredCards.length} pedido(s) · fluxo de próteses`}
          </p>
        </div>
        {/* Sem clínica escolhida não há onde gravar etapa nem pedido (a RLS recusa sem clínica). */}
        <div className="flex w-full gap-2 sm:w-auto">
          <button
            type="button"
            onClick={openNewColumn}
            disabled={semClinica}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-neutral-200 bg-white px-4 py-0 text-sm font-medium leading-none text-neutral-800 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:bg-white disabled:text-neutral-400 sm:h-10 sm:flex-none"
          >
            <Plus size={16} /> Quadro
          </button>
          <button
            type="button"
            onClick={() => openNewOrder()}
            disabled={semClinica}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 py-0 text-sm font-medium leading-none text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400 sm:h-10 sm:flex-none"
          >
            <Plus size={16} /> Novo pedido
          </button>
        </div>
      </div>

      <Aviso mensagem={toast?.message ?? null} />

      <div className={`${cardShell} flex shrink-0 flex-col gap-2 p-3 sm:p-4`}>
       <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            {/* Ao lado do botão de filtros, a dica longa aparecia cortada no celular: lá o campo usa a curta. */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar"
              aria-label="Buscar paciente, tipo ou cor"
              className="h-10 w-full rounded-md border border-neutral-200 bg-white py-2 pl-10 pr-9 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 md:hidden"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar paciente, tipo, cor…"
              aria-label="Buscar paciente, tipo ou cor"
              className="hidden h-10 w-full rounded-md border border-neutral-200 bg-white py-2 pl-10 pr-9 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 md:block"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="alvo-toque absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                title="Limpar busca"
                aria-label="Limpar busca"
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

          <button
            type="button"
            onClick={() => setFiltersOpen(!filtersOpen)}
            aria-expanded={filtersOpen}
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors lg:hidden ${filtersOpen || filtersActive ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-700 hover:bg-neutral-50'}`}
          >
            <Filter size={16} />
            Filtros
            {filtersActive && <span className="h-1.5 w-1.5 rounded-full bg-[#c8f053]" />}
            <ChevronDown size={13} className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* No celular o subtítulo da página já traz a contagem filtrada. */}
        <div className="ml-auto hidden w-36 shrink-0 text-right text-xs font-medium tabular-nums text-neutral-400 sm:block sm:text-sm">
          {filteredCards.length} de {cards.length} pedido(s)
        </div>
       </div>

        {/* Os filtros abrem dentro do cartão: a caixa flutuante de antes saía pela lateral da tela do celular. */}
        {filtersOpen && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">
            <label className="min-w-0">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Período</span>
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
            </label>
            <label className="min-w-0">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Status</span>
              <CustomSelect
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as StatusKey | 'all')}
                options={[
                  { value: 'all', label: 'Todos os status' },
                  ...(['espera', 'lab', 'clinica', 'feito'] as StatusKey[]).map(k => ({ value: k, label: STATUS_TOKENS[k].label })),
                ]}
                size="sm"
              />
            </label>
            {filtersActive && (
              <button
                type="button"
                onClick={() => { setPeriodFilter('all'); setStatusFilter('all'); }}
                className="inline-flex h-10 items-center justify-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-900 sm:col-span-2"
              >
                <X size={14} /> Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {!semClinica && columns.length > 0 && (
        <div className={`${cardShell} shrink-0 px-3 py-3 sm:py-2.5 md:px-4`}>
          <p className="mb-2 text-xs font-medium text-neutral-500">Fluxo do processo</p>

          {/* Celular: todas as etapas com o nome inteiro e a contagem, em duas colunas. Tocar leva até a etapa.
              A barra do computador só cabia com ícones soltos e escondia o resto atrás de "+3 etapas". */}
          <div className="grid grid-cols-2 gap-1.5 md:hidden">
            {(etapasAbertas || !fluxoRecolhe ? columns : columns.slice(0, ETAPAS_VISIVEIS_CELULAR)).map((col) => {
              const tinta = tintaQuadro(coresQuadro[String(col.id)]);
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => irParaColuna(col.id)}
                  className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-left active:bg-neutral-50"
                >
                  <span className="shrink-0 text-neutral-500" style={tinta ? { color: tinta.marca } : undefined}>{getColumnIcon(col)}</span>
                  <span className="min-w-0 flex-1 break-words text-[13px] font-medium leading-tight text-neutral-800">{col.titulo}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-900">{cardsByColumn(col.id).length}</span>
                </button>
              );
            })}
            {fluxoRecolhe && (
              <button
                type="button"
                onClick={() => setEtapasAbertas((v) => !v)}
                aria-expanded={etapasAbertas}
                className="col-span-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-neutral-200 bg-[#f3f4f1] px-3 text-[13px] font-medium text-neutral-800"
              >
                {etapasAbertas ? 'Mostrar menos' : `+${columns.length - ETAPAS_VISIVEIS_CELULAR} etapas`}
                <ChevronDown size={14} className={`transition-transform ${etapasAbertas ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          <div ref={flowBarRef} className="hidden flex-wrap items-center gap-1 md:flex">
            {columns.slice(0, maxVisibleFlow).map((col, idx) => {
              const count = cardsByColumn(col.id).length;
              const tinta = tintaQuadro(coresQuadro[String(col.id)]);
              return (
                <div key={col.id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => irParaColuna(col.id)}
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
                              irParaColuna(col.id);
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

      {/* No celular o quadro perde a moldura branca e a altura fixa: cada etapa é um bloco da página, sem rolagem própria. */}
      <div className="flex min-w-0 flex-none flex-col md:min-h-0 md:flex-1 md:overflow-hidden md:rounded-xl md:bg-white">
        {semClinica ? (
          // Antes tentava criar etapas sem clínica (a RLS recusa, e o texto cru do banco ia para a tela) e o quadro ficava vazio.
          <div className="flex min-h-[10rem] flex-1 items-center justify-center rounded-xl bg-white px-4 py-10">
            <p className="text-center text-sm text-neutral-500">Selecione uma clínica no menu para ver as etapas e os pedidos de prótese.</p>
          </div>
        ) : loading && !jaCarregou.current ? (
          <div className="kanban-scrollbar flex flex-col gap-3 md:min-h-0 md:flex-1 md:flex-row md:overflow-x-auto md:px-4 md:pb-2 md:pt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 w-full animate-pulse rounded-xl bg-white md:h-full md:min-h-0 md:w-72 md:shrink-0 md:bg-neutral-100" />
            ))}
          </div>
        ) : (
          <div className="kanban-scrollbar md:min-h-0 md:flex-1 md:overflow-x-auto md:overflow-y-hidden md:px-4 md:pb-4 md:pt-4">
            <div className="flex flex-col gap-3 md:h-full md:min-h-0 md:min-w-min md:flex-row md:items-stretch md:gap-4">
              {columns.map((column, columnIndex) => {
                const columnCards = cardsByColumn(column.id);
                const hasChecklist = isChecklistColumn(column);
                const proximaColuna = columns[columnIndex + 1];
                const colunaAnterior = columns[columnIndex - 1];
                const corAtiva = columnModalOpen && editingColumn && String(editingColumn.id) === String(column.id)
                  ? columnCor
                  : coresQuadro[String(column.id)];
                const tinta = tintaQuadro(corAtiva);

                return (
                  <section
                    key={column.id}
                    id={`coluna-${column.id}`}
                    style={tinta ? { backgroundColor: tinta.fundo, borderColor: tinta.borda, boxShadow: `inset 0 2px 0 ${tinta.marca}` } : undefined}
                    className={`flex w-full scroll-mt-2 flex-col md:h-full md:min-h-0 md:w-80 md:flex-none ${COLUMN_SHELL}`}
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-black/5 p-4" style={tinta ? { borderColor: tinta.borda } : undefined}>
                      <div className="min-w-0">
                        <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900 md:truncate">
                          {tinta ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tinta.marca }} /> : null}
                          <span className="min-w-0 break-words md:truncate">{column.titulo}</span>
                        </h2>
                        <p className="mt-0.5 text-xs text-neutral-500">{columnCards.length} pedido(s)</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {hasChecklist && (
                          <span className="rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-xs font-medium text-neutral-600">Checklist</span>
                        )}
                        <MenuPontos
                          tamanho={14}
                          className="-my-1.5 -mr-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-neutral-400 hover:bg-white hover:text-neutral-900 md:m-0 md:h-auto md:w-auto md:p-1.5"
                          itens={[
                            { id: 'editar', label: 'Editar quadro', onClick: () => openEditColumn(column) },
                            {
                              id: 'remover',
                              label: 'Remover quadro',
                              perigo: true,
                              // O menu não espera a promessa: uma falha inesperada vira aviso, não erro solto.
                              onClick: () => { deleteColumn(column).catch((erro) => showToast('warning', fraseDeErro(erro, 'Não foi possível remover o quadro.'))); },
                            },
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
                      className={`custom-scrollbar flex flex-1 flex-col gap-3 rounded-b-xl bg-white p-3 transition-colors md:block md:space-y-3 md:overflow-y-auto ${dragOverColumn === column.id ? 'ring-2 ring-neutral-300 ring-inset' : ''}`}
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
                              <p className="break-words text-sm font-semibold text-neutral-900 md:truncate">{card.paciente_nome}</p>
                              <p className="mt-0.5 break-words text-xs font-medium text-neutral-500 md:truncate">
                                {card.tipo_protese || card.categoria || 'Prótese'}
                                {card.cor_dente ? ` · ${card.cor_dente}` : ''}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                              {/* No celular o status aparece no botão de baixo, que também serve para trocá-lo. */}
                              <span className="hidden rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600 md:inline">{tokens.label}</span>
                              <MenuPontos
                                tamanho={14}
                                className="-mr-2 -mt-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-50 hover:text-neutral-900 md:m-0 md:h-auto md:w-auto md:p-1"
                                itens={[
                                  { id: 'editar', label: 'Editar', onClick: () => openEditOrder(card) },
                                  { id: 'mover', label: 'Mover para…', onClick: () => abrirFolha('etapa', card) },
                                  { id: 'status', label: 'Mudar status…', onClick: () => abrirFolha('status', card) },
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
                            <p className="line-clamp-2 break-words text-xs text-neutral-500 md:line-clamp-1">{card.descricao}</p>
                          ) : null}

                          <div className="mt-2 hidden items-center justify-end gap-0.5 md:flex" onPointerDown={(e) => e.stopPropagation()}>
                            <SetaEtapa
                              texto="Voltar etapa"
                              label="Voltar etapa"
                              disabled={!colunaAnterior}
                              onClick={() => colunaAnterior && avancar(card, colunaAnterior)}
                            >
                              <ChevronLeft size={16} />
                            </SetaEtapa>
                            <SetaEtapa
                              texto="Avançar etapa"
                              label="Avançar etapa"
                              disabled={!proximaColuna}
                              onClick={() => proximaColuna && avancar(card, proximaColuna)}
                            >
                              <ChevronRight size={16} />
                            </SetaEtapa>
                          </div>

                          {/* Celular: arrastar com o dedo não funciona bem, então o cartão traz o status e o passo seguinte como botões. */}
                          <div className="mt-2.5 flex flex-wrap items-center gap-2 md:hidden">
                            <button
                              type="button"
                              onClick={() => abrirFolha('status', card)}
                              aria-label={`Status: ${tokens.label}. Tocar para mudar.`}
                              className="inline-flex h-10 min-w-0 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 active:bg-neutral-50"
                            >
                              <span className="truncate">{tokens.label}</span>
                              <ChevronDown size={14} className="shrink-0 text-neutral-400" />
                            </button>
                            {colunaAnterior && (
                              <button
                                type="button"
                                onClick={() => avancar(card, colunaAnterior)}
                                aria-label={`Voltar para ${colunaAnterior.titulo}`}
                                className="inline-flex h-10 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium text-neutral-500 active:bg-neutral-100"
                              >
                                <ChevronLeft size={16} /> Voltar
                              </button>
                            )}
                            {proximaColuna && (
                              <button
                                type="button"
                                onClick={() => avancar(card, proximaColuna)}
                                aria-label={`Avançar para ${proximaColuna.titulo}`}
                                className="ml-auto inline-flex h-10 items-center justify-center gap-1 rounded-full bg-neutral-900 pl-4 pr-3 text-sm font-medium text-white active:bg-neutral-700"
                              >
                                Avançar <ChevronRight size={16} />
                              </button>
                            )}
                          </div>
                        </article>
                        );
                      })}

                      {/* O convite para arrastar só vale no computador. No celular o cabeçalho já diz "0 pedido(s)" e a etapa vazia fica curta. */}
                      {columnCards.length === 0 && (
                        <div className="hidden h-32 items-center justify-center rounded-xl border border-dashed border-neutral-100 bg-white text-xs font-medium text-neutral-300 md:flex">Arraste pedidos para cá</div>
                      )}
                      <button type="button" onClick={() => openNewOrder(column.id)} className="flex h-10 w-full items-center justify-center gap-1 rounded-md border border-dashed border-neutral-200 bg-white text-xs font-medium text-neutral-400 transition-colors hover:bg-neutral-50 md:h-auto md:py-2.5">
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

      {/* Caminho por toque para o que no computador se faz arrastando: escolher a etapa (ou o status) numa lista. */}
      <Modal open={folhaAberta} onClose={() => setFolhaAberta(false)} maxWidth="sm" zIndex={86} hideCloseButton panelClassName="flex !max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white sm:!max-h-[90dvh]">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-neutral-900">{folha?.tipo === 'status' ? 'Status do pedido' : 'Mover para'}</h2>
              <p className="mt-0.5 break-words text-sm text-neutral-500">{cardDaFolha?.paciente_nome}</p>
            </div>
            <button type="button" onClick={() => setFolhaAberta(false)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:h-8 sm:w-8" aria-label="Fechar"><X size={16} /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            {opcoesFolha.map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                disabled={opcao.atual}
                onClick={() => { setFolhaAberta(false); void opcao.escolher(); }}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium ${opcao.atual ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100'}`}
              >
                <span className="min-w-0 flex-1 break-words">{opcao.label}</span>
                {opcao.atual && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-neutral-500"><Check size={14} /> Atual</span>
                )}
              </button>
            ))}
          </div>
      </Modal>

      <Modal open={columnModalOpen} onClose={() => setColumnModalOpen(false)} maxWidth="md" zIndex={86} closeOnBackdrop={false} hideCloseButton panelClassName="flex !max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white sm:!max-h-[90dvh]">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 p-4 sm:p-5">
              <div>
                <p className="text-xs font-medium text-neutral-500">{editingColumn ? 'Editar quadro' : 'Novo quadro'}</p>
                <h2 className="text-base font-semibold text-neutral-900">{editingColumn ? 'Configurar etapa' : 'Criar nova etapa'}</h2>
              </div>
              <button type="button" onClick={() => setColumnModalOpen(false)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:h-8 sm:w-8" aria-label="Fechar"><X size={16} /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
              <div>
                <label htmlFor="quadro-nome" className="text-xs font-medium text-neutral-500">Nome do quadro <span className="text-red-500">*</span></label>
                <input id="quadro-nome" autoFocus value={columnTitle} onChange={(event) => setColumnTitle(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-900 outline-none focus:border-neutral-900" placeholder="Ex: Ajuste final, Polimento..." />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-neutral-500">Cor</label>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setColumnCor(''); }} className={`h-10 w-10 rounded-md border bg-[#f3f4f1] sm:h-7 sm:w-7 ${columnCor ? 'border-neutral-200' : 'border-neutral-900'}`} aria-label="Sem cor" />
                  {CORES_QUADRO.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setColumnCor(hex); }}
                      className={`h-10 w-10 rounded-md border-2 sm:h-7 sm:w-7 ${columnCor === hex ? 'border-neutral-900' : 'border-transparent'}`}
                      style={{ backgroundColor: hex }}
                      aria-label={hex}
                    />
                  ))}
                  <label className={`relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border-2 sm:h-7 sm:w-7 ${columnCor && !CORES_QUADRO.includes(columnCor) ? 'border-neutral-900' : 'border-neutral-200'}`} style={{ background: columnCor && !CORES_QUADRO.includes(columnCor) ? columnCor : 'conic-gradient(#94a3b8, #60a5fa, #34d399, #fbbf24, #fb7185, #a78bfa, #94a3b8)' }} aria-label="Cor personalizada">
                    <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(columnCor) ? columnCor : '#94a3b8'} onChange={(event) => setColumnCor(event.target.value)} onClick={(event) => event.stopPropagation()} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                    {columnCor && !CORES_QUADRO.includes(columnCor) && <Pipette size={12} className="pointer-events-none text-white mix-blend-difference" />}
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-neutral-500">Ícone do quadro</label>
                {/* Oito ícones de 36px por linha não cabem no popup do celular: lá são seis por linha, com 40px de altura. */}
                <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                  {ICON_PICKER_OPTIONS.map((slug) => (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => setColumnIcon(slug)}
                      aria-label={`Ícone ${slug}`}
                      aria-pressed={columnIcon === slug}
                      className={`flex h-10 w-full items-center justify-center rounded-md sm:h-9 sm:w-9 ${columnIcon === slug ? 'bg-neutral-900 text-white' : 'border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50'}`}
                    >
                      {ICON_MAP[slug]}
                    </button>
                  ))}
                </div>
              </div>

              {/* A linha inteira é o rótulo do switch: o trilho sozinho tem 20px de altura, pouco para o dedo. */}
              <Switch checked={columnChecklist} onChange={setColumnChecklist} className="!flex w-full justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-neutral-900">Checklist clínico</span>
                  <span className="mt-0.5 block text-xs font-medium text-neutral-500">Exibir checklist nos cards desta coluna</span>
                </span>
              </Switch>
            </div>

            <div className="flex shrink-0 gap-2 border-t border-neutral-200 p-4 sm:p-5">
              <button type="button" onClick={() => setColumnModalOpen(false)} className="h-11 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50 sm:h-9">Cancelar</button>
              <button type="button" onClick={saveColumn} disabled={saving || !columnTitle.trim()} className="h-11 flex-1 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-100 disabled:text-neutral-400 sm:h-9">
                {editingColumn ? 'Salvar Quadro' : 'Criar Quadro'}
              </button>
            </div>
      </Modal>
    </div>
  );
}
