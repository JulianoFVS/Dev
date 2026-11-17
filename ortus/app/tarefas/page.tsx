'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { dados as tabelas } from '@/lib/local/consulta';
import { modoDados, listar, inserir, atualizar, remover } from '@/lib/local/cliente';
import { clinicScope, readRouteCache, writeRouteCache } from '@/lib/routeListCache';
import {
    Plus, Search, Calendar,
    User, Loader2, X, Trash2,
    ChevronLeft, ChevronRight, Pencil, Pipette,
} from 'lucide-react';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import Modal from '@/components/ui/Modal';
import CustomSelect from '@/components/ui/CustomSelect';
import CampoData from '@/components/ui/CampoData';
import { TAREFA_PRIORIDADE_OPTIONS, TAREFA_STATUS_OPTIONS } from '@/lib/formOptions';

interface Tarefa {
    id: string;
    titulo: string;
    descricao: string;
    responsavel_id: number | null;
    prioridade: 'baixa' | 'media' | 'alta';
    status: 'a_fazer' | 'em_andamento' | 'concluido';
    data_limite: string | null;
    paciente_id: string | null;
    created_at: string;
    responsavel_nome?: string;
    paciente_nome?: string;
    paciente_telefone?: string;
    alerta_data?: 'atrasada' | 'proxima' | 'normal';
}

interface Profissional {
    id: number;
    nome: string;
}

interface Paciente {
    id: string;
    nome: string;
    telefone: string | null;
}

const TAREFAS_CACHE_KEY = 'ortus:tarefas:v1';
const TAREFAS_CORES_KEY = 'ortus:tarefas:cores';
const CORES_PASTEL = ['#fde68a', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74'];

function tintaSuave(hex?: string) {
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return {
        fundo: `rgba(${r}, ${g}, ${b}, 0.34)`,
        borda: `rgba(${r}, ${g}, ${b}, 0.62)`,
        marca: hex,
    };
}

function DicaBotao({ texto, children }: { texto: string; children: React.ReactNode }) {
    const [visivel, setVisivel] = useState(false);
    return (
        <span
            className="relative inline-flex"
            onMouseEnter={() => setVisivel(true)}
            onMouseLeave={() => setVisivel(false)}
            onPointerDown={() => setVisivel(false)}
        >
            {children}
            {visivel && (
                <span className="pointer-events-none absolute top-full left-1/2 z-30 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white">
                    {texto}
                </span>
            )}
        </span>
    );
}

function readCoresQuadro(): Record<string, string> {
    if (typeof localStorage === 'undefined') return {};
    try {
        const raw = localStorage.getItem(TAREFAS_CORES_KEY);
        return raw ? JSON.parse(raw) as Record<string, string> : {};
    } catch {
        return {};
    }
}

type TarefasSnapshot = {
    tarefas: Tarefa[];
    profissionais: Profissional[];
    pacientes: Paciente[];
};

function readTarefasBoot(): TarefasSnapshot | null {
    if (typeof localStorage === 'undefined') return null;
    const cid = localStorage.getItem('ortus_clinica_id');
    const clinicId = !cid || cid === 'all' || cid === 'todas' ? 'all' : cid;
    return readRouteCache<TarefasSnapshot>(TAREFAS_CACHE_KEY, clinicScope(clinicId));
}

function mensagemErro(err: unknown, padrao: string): string {
    return err instanceof Error && err.message ? err.message : padrao;
}

/** Replica no cliente o `alerta_data` da view `v_tarefas_completo`. */
function alertaDataLocal(dataLimite: string | null, status: Tarefa['status']): Tarefa['alerta_data'] {
    if (!dataLimite || status === 'concluido') return 'normal';
    const [ano, mes, dia] = dataLimite.slice(0, 10).split('-').map(Number);
    if (!ano || !mes || !dia) return 'normal';
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const limite = new Date(ano, mes - 1, dia);
    const dias = Math.round((limite.getTime() - hoje.getTime()) / 86_400_000);
    if (dias < 0) return 'atrasada';
    if (dias <= 3) return 'proxima';
    return 'normal';
}

function ordenarPorDataLimite(a: Tarefa, b: Tarefa): number {
    if (!a.data_limite && !b.data_limite) return 0;
    if (!a.data_limite) return 1;
    if (!b.data_limite) return -1;
    return a.data_limite.localeCompare(b.data_limite);
}

type CacheProfissionaisLocal = { tentado: boolean; lista: Profissional[] };

/**
 * Monta o snapshot que a tela consome a partir do SQLite local.
 * `v_tarefas_completo` não existe offline, então os relacionamentos são
 * resolvidos aqui (pacientes). `profissionais` não é espelhada no SQLite;
 * quando não existe, o cartão cai para o id do responsável.
 */
async function carregarSnapshotLocal(
    clinicasIds: number[],
    cacheProfissionais: CacheProfissionaisLocal,
): Promise<TarefasSnapshot> {
    const [tarefasBase, pacientes] = await Promise.all([
        listar<Tarefa>('tarefas', {
            filtros: [{ col: 'clinica_id', op: 'in', valor: clinicasIds }],
            ordem: [{ col: 'data_limite', asc: true }],
        }),
        listar<Paciente>('pacientes', {
            filtros: [{ col: 'clinica_id', op: 'in', valor: clinicasIds }],
            ordem: [{ col: 'nome', asc: true }],
        }),
    ]);

    const responsavelIds = [...new Set(
        tarefasBase
            .map((t) => t.responsavel_id)
            .filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
    )];

    if (!cacheProfissionais.tentado && responsavelIds.length > 0) {
        cacheProfissionais.tentado = true;
        try {
            cacheProfissionais.lista = await listar<Profissional>('profissionais', {
                filtros: [{ col: 'id', op: 'in', valor: responsavelIds }],
            });
        } catch {
            // Tabela não espelhada no desktop: seguimos com o id do responsável.
            cacheProfissionais.lista = [];
        }
    }

    const pacientesPorId = new Map<string, Paciente>(
        pacientes.map((p): [string, Paciente] => [p.id, p]),
    );
    const profissionaisPorId = new Map<number, Profissional>(
        cacheProfissionais.lista.map((p): [number, Profissional] => [Number(p.id), p]),
    );

    const tarefas = tarefasBase
        .slice()
        .sort(ordenarPorDataLimite)
        .map((t): Tarefa => {
            const paciente = t.paciente_id ? pacientesPorId.get(t.paciente_id) : undefined;
            const responsavel = t.responsavel_id != null ? profissionaisPorId.get(Number(t.responsavel_id)) : undefined;
            return {
                ...t,
                responsavel_nome: responsavel?.nome ?? (t.responsavel_id != null ? String(t.responsavel_id) : undefined),
                paciente_nome: paciente?.nome,
                paciente_telefone: paciente?.telefone ?? undefined,
                alerta_data: alertaDataLocal(t.data_limite, t.status),
            };
        });

    return { tarefas, profissionais: cacheProfissionais.lista, pacientes };
}

export default function Tarefas() {
    const { activeClinicId, activeClinic, clinics, loading: clinicLoading } = useClinica();
    const boot = readTarefasBoot();
    const jaCarregou = useRef(!!boot?.tarefas?.length);
    const fetchGen = useRef(0);
    const cacheProfissionaisLocal = useRef<CacheProfissionaisLocal>({ tentado: false, lista: [] });
    const { showAlert, showConfirm } = useCustomAlert();

    const [tarefas, setTarefas] = useState<Tarefa[]>(() => boot?.tarefas ?? []);
    const [profissionais, setProfissionais] = useState<Profissional[]>(() => boot?.profissionais ?? []);
    const [pacientes, setPacientes] = useState<Paciente[]>(() => boot?.pacientes ?? []);
    const [loading, setLoading] = useState(() => !(boot?.tarefas?.length));
    const clinicas = useMemo(() => clinics, [clinics]);

    // Filtros
    const [filtroStatus, setFiltroStatus] = useState<string>('todos');
    const [filtroPrioridade, setFiltroPrioridade] = useState<string>('todos');
    const [filtroBusca, setFiltroBusca] = useState('');
    // Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [coresQuadro, setCoresQuadro] = useState<Record<string, string>>(readCoresQuadro);
    const [pintando, setPintando] = useState<string | null>(null);
    const [tarefaEditando, setTarefaEditando] = useState<Tarefa | null>(null);
    const [salvando, setSalvando] = useState(false);
    
    const [form, setForm] = useState({
        titulo: '',
        descricao: '',
        responsavel_id: '',
        prioridade: 'media' as 'baixa' | 'media' | 'alta',
        status: 'a_fazer' as 'a_fazer' | 'em_andamento' | 'concluido',
        data_limite: '',
        paciente_id: ''
    });

    // No desktop a tabela `profissionais` pode não existir: mantemos o id visível
    // em vez de o seletor cair para "Sem responsável".
    const opcoesResponsavel = useMemo(() => {
        const opcoes = profissionais.map((p) => ({ value: String(p.id), label: p.nome }));
        if (form.responsavel_id && !opcoes.some((o) => o.value === form.responsavel_id)) {
            opcoes.unshift({ value: form.responsavel_id, label: `Responsável ${form.responsavel_id}` });
        }
        return opcoes;
    }, [profissionais, form.responsavel_id]);

    useEffect(() => {
        if (clinicLoading) return;
        const scope = clinicScope(activeClinicId);
        const snap = readRouteCache<TarefasSnapshot>(TAREFAS_CACHE_KEY, scope);
        if (snap) {
            setTarefas(snap.tarefas);
            setProfissionais(snap.profissionais);
            setPacientes(snap.pacientes);
            setLoading(false);
        }
        carregarDados({ silent: !!snap });
    }, [activeClinicId, clinicLoading]);

    const clinicasIds = useMemo(() => {
        if (activeClinicId && activeClinicId !== 'all') return [Number(activeClinicId)].filter(Number.isFinite);
        return clinics.map((c) => Number(c.id)).filter(Number.isFinite);
    }, [activeClinicId, clinics]);

    async function carregarDados(opts?: { silent?: boolean }) {
        const gen = ++fetchGen.current;
        if (!opts?.silent) setLoading(true);

        if (clinicasIds.length === 0) {
            if (gen === fetchGen.current) setLoading(false);
            return;
        }

        if (await modoDados() === 'local') {
            try {
                const snapshot = await carregarSnapshotLocal(clinicasIds, cacheProfissionaisLocal.current);
                if (gen !== fetchGen.current) return;
                writeRouteCache(TAREFAS_CACHE_KEY, clinicScope(activeClinicId), snapshot);
                setTarefas(snapshot.tarefas);
                setProfissionais(snapshot.profissionais);
                setPacientes(snapshot.pacientes);
                jaCarregou.current = true;
            } catch (err) {
                if (gen === fetchGen.current) {
                    showAlert('Erro ao carregar tarefas: ' + mensagemErro(err, 'banco local indisponível.'), { type: 'error' });
                }
            } finally {
                if (gen === fetchGen.current) setLoading(false);
            }
            return;
        }

        const [tarefasRes, vinculosRes, pacsRes] = await Promise.all([
            tabelas.from('v_tarefas_completo').select('*').in('clinica_id', clinicasIds).order('data_limite', { ascending: true }),
            tabelas.from('profissionais_clinicas').select('profissional_id').in('clinica_id', clinicasIds),
            tabelas.from('pacientes').select('id, nome, telefone').in('clinica_id', clinicasIds).order('nome'),
        ]);

        if (gen !== fetchGen.current) return;

        const profissionalIds = [...new Set((vinculosRes.data || []).map((v: { profissional_id?: string | number | null }) => v.profissional_id))];
        const { data: profsData } = profissionalIds.length > 0
            ? await tabelas.from('profissionais').select('id, nome').in('id', profissionalIds)
            : { data: [] as Profissional[] };

        if (gen !== fetchGen.current) return;

        const snapshot: TarefasSnapshot = {
            tarefas: (tarefasRes.data || []) as Tarefa[],
            profissionais: profsData || [],
            pacientes: (pacsRes.data || []) as Paciente[],
        };
        writeRouteCache(TAREFAS_CACHE_KEY, clinicScope(activeClinicId), snapshot);

        setTarefas(snapshot.tarefas);
        setProfissionais(snapshot.profissionais);
        setPacientes(snapshot.pacientes);
        jaCarregou.current = true;
        setLoading(false);
    }

    function abrirNovaTarefa() {
        setTarefaEditando(null);
        setForm({
            titulo: '',
            descricao: '',
            responsavel_id: '',
            prioridade: 'media',
            status: 'a_fazer',
            data_limite: '',
            paciente_id: ''
        });
        setModalOpen(true);
    }

    function abrirEditarTarefa(t: Tarefa) {
        setTarefaEditando(t);
        setForm({
            titulo: t.titulo,
            descricao: t.descricao || '',
            responsavel_id: t.responsavel_id?.toString() || '',
            prioridade: t.prioridade,
            status: t.status,
            data_limite: t.data_limite || '',
            paciente_id: t.paciente_id?.toString() || ''
        });
        setModalOpen(true);
    }

    async function salvarTarefa() {
        if (!form.titulo.trim()) {
            showAlert('Título é obrigatório', { type: 'warning' });
            return;
        }

        const clinicasIds = clinicas.map(c => c.id);
        const clinicaId = activeClinicId && activeClinicId !== 'all' 
            ? activeClinicId 
            : clinicasIds[0];
        
        if (!clinicaId) {
            showAlert('Selecione uma clínica', { type: 'warning' });
            return;
        }

        setSalvando(true);

        const payload = {
            clinica_id: clinicaId,
            titulo: form.titulo.trim(),
            descricao: form.descricao.trim() || null,
            responsavel_id: form.responsavel_id ? parseInt(form.responsavel_id) : null,
            prioridade: form.prioridade,
            status: form.status,
            data_limite: form.data_limite || null,
            paciente_id: form.paciente_id || null
        };

        if (await modoDados() === 'local') {
            try {
                if (tarefaEditando) {
                    await atualizar<Tarefa>('tarefas', tarefaEditando.id, payload);
                    showAlert('Tarefa atualizada!', { type: 'success' });
                } else {
                    await inserir<Tarefa>('tarefas', payload);
                    showAlert('Tarefa criada!', { type: 'success' });
                }
                setModalOpen(false);
                void carregarDados({ silent: true });
            } catch (err) {
                showAlert(
                    'Erro ao ' + (tarefaEditando ? 'atualizar: ' : 'criar: ') + mensagemErro(err, 'banco local indisponível.'),
                    { type: 'error' },
                );
            } finally {
                setSalvando(false);
            }
            return;
        }

        if (tarefaEditando) {
            const { error } = await tabelas.from('tarefas')
                .update(payload)
                .eq('id', tarefaEditando.id);
            
            if (error) showAlert('Erro ao atualizar: ' + error.message, { type: 'error' });
            else showAlert('Tarefa atualizada!', { type: 'success' });
        } else {
            const { error } = await tabelas.from('tarefas').insert([payload]);
            if (error) showAlert('Erro ao criar: ' + error.message, { type: 'error' });
            else showAlert('Tarefa criada!', { type: 'success' });
        }

        setSalvando(false);
        setModalOpen(false);
        carregarDados({ silent: true });
    }

    async function excluirTarefa(id: string) {
        if (!(await showConfirm('Excluir esta tarefa?', { title: 'Excluir', type: 'warning' }))) return;

        if (await modoDados() === 'local') {
            try {
                await remover('tarefas', id);
                showAlert('Tarefa excluída!', { type: 'success' });
                void carregarDados({ silent: true });
            } catch (err) {
                showAlert('Erro ao excluir: ' + mensagemErro(err, 'banco local indisponível.'), { type: 'error' });
            }
            return;
        }

        const { error } = await tabelas.from('tarefas').delete().eq('id', id);
        if (error) showAlert('Erro ao excluir: ' + error.message, { type: 'error' });
        else {
            showAlert('Tarefa excluída!', { type: 'success' });
            carregarDados({ silent: true });
        }
    }

    function proximoStatus(t: Tarefa, direcao: 'avancar' | 'voltar'): Tarefa['status'] {
        if (direcao === 'avancar') return t.status === 'a_fazer' ? 'em_andamento' : 'concluido';
        return t.status === 'concluido' ? 'em_andamento' : 'a_fazer';
    }

    async function moverStatus(id: string, novoStatus: 'a_fazer' | 'em_andamento' | 'concluido') {
        const prev = tarefas;
        setTarefas((list) => list.map((t) => (t.id === id ? { ...t, status: novoStatus } : t)));

        if (await modoDados() === 'local') {
            try {
                await atualizar('tarefas', id, { status: novoStatus });
                const next = prev.map((t) => (t.id === id ? { ...t, status: novoStatus } : t));
                writeRouteCache(TAREFAS_CACHE_KEY, clinicScope(activeClinicId), { tarefas: next, profissionais, pacientes });
            } catch (err) {
                setTarefas(prev);
                showAlert('Erro ao mover: ' + mensagemErro(err, 'banco local indisponível.'), { type: 'error' });
            }
            return;
        }

        const { error } = await tabelas.from('tarefas').update({ status: novoStatus }).eq('id', id);
        if (error) {
            setTarefas(prev);
            showAlert('Erro ao mover: ' + error.message, { type: 'error' });
        } else {
            const next = prev.map((t) => (t.id === id ? { ...t, status: novoStatus } : t));
            writeRouteCache(TAREFAS_CACHE_KEY, clinicScope(activeClinicId), { tarefas: next, profissionais, pacientes });
        }
    }

    // Filtrar tarefas
    const tarefasFiltradas = tarefas.filter(t => {
        if (filtroStatus !== 'todos' && t.status !== filtroStatus) return false;
        if (filtroPrioridade !== 'todos' && t.prioridade !== filtroPrioridade) return false;
        if (filtroBusca) {
            const busca = filtroBusca.toLowerCase();
            return t.titulo.toLowerCase().includes(busca) ||
                   (t.descricao?.toLowerCase().includes(busca)) ||
                   (t.paciente_nome?.toLowerCase().includes(busca));
        }
        return true;
    });

    const contagemTarefas = {
        a_fazer: tarefas.filter(t => t.status === 'a_fazer').length,
        em_andamento: tarefas.filter(t => t.status === 'em_andamento').length,
        concluido: tarefas.filter(t => t.status === 'concluido').length,
        atrasadas: tarefas.filter(t => t.alerta_data === 'atrasada' && t.status !== 'concluido').length,
        proximas: tarefas.filter(t => t.alerta_data === 'proxima' && t.status !== 'concluido').length
    };

    function prioridadeDe(p: string) {
        if (p === 'alta') return { label: 'Alta', dot: 'bg-red-500', text: 'text-red-700' };
        if (p === 'media') return { label: 'Média', dot: 'bg-amber-500', text: 'text-amber-700' };
        return { label: 'Baixa', dot: 'bg-neutral-400', text: 'text-neutral-500' };
    }

    function renderTarefaCard(t: Tarefa) {
        return (
            <div key={t.id} className="rounded-md border border-neutral-200 bg-white px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                    <h3 className={`text-sm font-medium text-neutral-900 ${t.status === 'concluido' ? 'text-neutral-400 line-through' : ''}`}>
                        {t.titulo}
                    </h3>
                    <button type="button" onClick={() => abrirEditarTarefa(t)} className="rounded-md p-1 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-900" aria-label="Editar tarefa">
                        <Pencil size={14}/>
                    </button>
                </div>
                {t.descricao && <p className="mt-1 line-clamp-1 text-xs text-neutral-400">{t.descricao}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                        <span className={`inline-flex items-center gap-1.5 ${prioridadeDe(t.prioridade).text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${prioridadeDe(t.prioridade).dot}`} />
                            {prioridadeDe(t.prioridade).label}
                        </span>
                        {t.responsavel_nome && <span className="inline-flex items-center gap-1"><User size={11}/>{t.responsavel_nome}</span>}
                        {t.data_limite && (
                            <span className={`inline-flex items-center gap-1 ${t.alerta_data === 'atrasada' && t.status !== 'concluido' ? 'text-red-600' : ''}`}>
                                <Calendar size={11}/>{new Date(t.data_limite).toLocaleDateString('pt-BR')}
                            </span>
                        )}
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                        <DicaBotao texto="Voltar status">
                            <button type="button" disabled={t.status === 'a_fazer'} onClick={() => moverStatus(t.id, proximoStatus(t, 'voltar'))} aria-label="Voltar status" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-50 disabled:opacity-30"><ChevronLeft size={16} /></button>
                        </DicaBotao>
                        <DicaBotao texto="Avançar status">
                            <button type="button" disabled={t.status === 'concluido'} onClick={() => moverStatus(t.id, proximoStatus(t, 'avancar'))} aria-label="Avançar status" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-50 disabled:opacity-30"><ChevronRight size={16} /></button>
                        </DicaBotao>
                    </div>
                </div>
            </div>
        );
    }

    const colunasKanban: { id: Tarefa['status']; label: string }[] = [
        { id: 'a_fazer', label: 'A fazer' },
        { id: 'em_andamento', label: 'Em andamento' },
        { id: 'concluido', label: 'Concluído' },
    ];

    const kpiLoading = loading && !jaCarregou.current;

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
            <div className="mb-3 shrink-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">
                            Tarefas
                            <span className="text-neutral-400"> · {activeClinic ? getClinicLabel(activeClinic) : 'Todas as clínicas'}</span>
                        </h1>
                    </div>
                    <button
                        type="button"
                        onClick={abrirNovaTarefa}
                        className="inline-flex h-10 shrink-0 items-center gap-1.5 self-start rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 sm:self-auto"
                    >
                        <Plus size={14} /> Nova tarefa
                    </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
                    <p className="text-sm text-neutral-500"><span className="font-medium tabular-nums text-neutral-900">{kpiLoading ? '—' : contagemTarefas.a_fazer}</span> a fazer</p>
                    <p className="text-sm text-neutral-500"><span className="font-medium tabular-nums text-neutral-900">{kpiLoading ? '—' : contagemTarefas.em_andamento}</span> em andamento</p>
                    <p className="text-sm text-neutral-500"><span className="font-medium tabular-nums text-neutral-900">{kpiLoading ? '—' : contagemTarefas.atrasadas}</span> atrasadas</p>
                    <p className="text-sm text-neutral-500"><span className="font-medium tabular-nums text-neutral-900">{kpiLoading ? '—' : contagemTarefas.concluido}</span> concluídas</p>
                </div>
            </div>

            <div className="mb-3 flex shrink-0 flex-col gap-2 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" aria-hidden />
                    <input
                        type="text"
                        placeholder="Buscar tarefas..."
                        className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                        value={filtroBusca}
                        onChange={(e) => setFiltroBusca(e.target.value)}
                    />
                </div>
                <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[28rem]">
                    <CustomSelect
                        value={filtroStatus}
                        onChange={setFiltroStatus}
                        options={[{ value: 'todos', label: 'Todos os status' }, ...TAREFA_STATUS_OPTIONS]}
                        size="md"
                    />
                    <CustomSelect
                        value={filtroPrioridade}
                        onChange={setFiltroPrioridade}
                        options={[{ value: 'todos', label: 'Todas as prioridades' }, ...TAREFA_PRIORIDADE_OPTIONS]}
                        size="md"
                    />
                </div>
                {(filtroStatus !== 'todos' || filtroPrioridade !== 'todos') && (
                    <button
                        type="button"
                        onClick={() => { setFiltroStatus('todos'); setFiltroPrioridade('todos'); }}
                        className="h-10 shrink-0 text-sm font-medium text-neutral-500 hover:text-neutral-900"
                    >
                        Limpar
                    </button>
                )}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-3 md:overflow-hidden">
                {colunasKanban.map((col) => {
                    const items = tarefasFiltradas.filter((t) => t.status === col.id);
                    const tinta = tintaSuave(coresQuadro[col.id]);
                    return (
                        <section key={col.id} className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white md:min-h-0" style={tinta ? { backgroundColor: tinta.fundo, borderColor: tinta.borda, boxShadow: `inset 0 2px 0 ${tinta.marca}` } : undefined}>
                            <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2.5">
                                <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-neutral-900">
                                    <span className="truncate">{col.label}</span>
                                    <span className="text-xs font-medium tabular-nums text-neutral-400">{kpiLoading ? '—' : items.length}</span>
                                </h2>
                                <div className="flex shrink-0 items-center">
                                    <div className={`grid transition-[grid-template-columns,opacity] duration-200 ease-out ${pintando === col.id ? 'grid-cols-[1fr] opacity-100' : 'grid-cols-[0fr] opacity-0'}`}>
                                        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                                            <button
                                                type="button"
                                                aria-label="Sem cor"
                                                className="h-5 w-5 shrink-0 rounded-md border border-neutral-300 bg-white"
                                                onClick={() => {
                                                    const next = { ...coresQuadro };
                                                    delete next[col.id];
                                                    setCoresQuadro(next);
                                                    localStorage.setItem(TAREFAS_CORES_KEY, JSON.stringify(next));
                                                    setPintando(null);
                                                }}
                                            />
                                            {CORES_PASTEL.map((hex) => (
                                                <button
                                                    key={hex}
                                                    type="button"
                                                    aria-label={hex}
                                                    className="h-5 w-5 shrink-0 rounded-md border border-black/10"
                                                    style={{ backgroundColor: hex }}
                                                    onClick={() => {
                                                        const next = { ...coresQuadro, [col.id]: hex };
                                                        setCoresQuadro(next);
                                                        localStorage.setItem(TAREFAS_CORES_KEY, JSON.stringify(next));
                                                        setPintando(null);
                                                    }}
                                                />
                                            ))}
                                            <label className="relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-md border border-neutral-200" style={{ background: 'conic-gradient(#94a3b8, #60a5fa, #34d399, #fbbf24, #fb7185, #a78bfa, #94a3b8)' }} aria-label="Cor personalizada">
                                                <input
                                                    type="color"
                                                    value={/^#[0-9a-fA-F]{6}$/.test(coresQuadro[col.id] || '') ? coresQuadro[col.id] : '#94a3b8'}
                                                    onChange={(event) => {
                                                        const next = { ...coresQuadro, [col.id]: event.target.value };
                                                        setCoresQuadro(next);
                                                        localStorage.setItem(TAREFAS_CORES_KEY, JSON.stringify(next));
                                                    }}
                                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                                />
                                            </label>
                                        </div>
                                    </div>
                                    <button type="button" aria-label={pintando === col.id ? 'Fechar cores' : 'Cor do quadro'} className={`flex h-5 w-5 items-center justify-center rounded-md hover:bg-white/70 hover:text-neutral-900 ${coresQuadro[col.id] ? 'text-neutral-700' : 'text-neutral-400'}`} onClick={() => setPintando(pintando === col.id ? null : col.id)}>
                                        <Pipette size={13} />
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2 px-3 pb-3 md:min-h-0 md:flex-1 md:overflow-y-auto">
                                {kpiLoading ? (
                                    Array.from({ length: 2 }).map((_, i) => (
                                        <div key={i} className="h-12 animate-pulse rounded-md bg-neutral-50" />
                                    ))
                                ) : (
                                    <>
                                        {items.map((t) => renderTarefaCard(t))}
                                        {items.length === 0 && (
                                            <p className="py-6 text-center text-xs text-neutral-400">Nenhuma tarefa</p>
                                        )}
                                    </>
                                )}
                            </div>
                        </section>
                    );
                })}
            </div>

                        {/* Modal Criar/Editar */}
            <Modal open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="lg" hideCloseButton panelClassName="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
                            <div>
                                <h2 className="text-base font-semibold text-neutral-900">{tarefaEditando ? 'Editar tarefa' : 'Nova tarefa'}</h2>
                                <p className="mt-0.5 text-sm text-neutral-500">Título, prazo e responsável.</p>
                            </div>
                            <button type="button" onClick={() => setModalOpen(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100" aria-label="Fechar">
                                <X size={16}/>
                            </button>
                        </div>
                        
                        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 sm:px-6">
                            <label>
                                <span className="mb-1.5 block text-xs font-medium text-neutral-500">Título <span className="text-red-500">*</span></span>
                                <input 
                                    value={form.titulo}
                                    onChange={e => setForm({...form, titulo: e.target.value})}
                                    className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                                    placeholder="Nome da tarefa"
                                />
                            </label>
                            
                            <label>
                                <span className="mb-1.5 block text-xs font-medium text-neutral-500">Descrição</span>
                                <textarea 
                                    value={form.descricao}
                                    onChange={e => setForm({...form, descricao: e.target.value})}
                                    rows={2}
                                    className="w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
                                    placeholder="Detalhes da tarefa"
                                />
                            </label>

                            <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2">
                                <label>
                                    <span className="mb-1.5 block text-xs font-medium text-neutral-500">Responsável</span>
                                    <CustomSelect value={form.responsavel_id} onChange={v => setForm({...form, responsavel_id: v})} options={[{ value: '', label: 'Sem responsável' }, ...opcoesResponsavel]} size="md" />
                                </label>
                                <label>
                                    <span className="mb-1.5 block text-xs font-medium text-neutral-500">Data limite</span>
                                    <CampoData value={form.data_limite} onChange={(iso) => setForm({ ...form, data_limite: iso })} />
                                </label>
                                <label>
                                    <span className="mb-1.5 block text-xs font-medium text-neutral-500">Prioridade</span>
                                    <CustomSelect value={form.prioridade} onChange={v => setForm({...form, prioridade: v as 'baixa' | 'media' | 'alta'})} options={TAREFA_PRIORIDADE_OPTIONS} size="md" />
                                </label>
                                <label>
                                    <span className="mb-1.5 block text-xs font-medium text-neutral-500">Status</span>
                                    <CustomSelect value={form.status} onChange={v => setForm({...form, status: v as 'a_fazer' | 'em_andamento' | 'concluido'})} options={TAREFA_STATUS_OPTIONS} size="md" />
                                </label>
                            </div>

                            <label>
                                <span className="mb-1.5 block text-xs font-medium text-neutral-500">Paciente</span>
                                <CustomSelect value={form.paciente_id} onChange={v => setForm({...form, paciente_id: v})} options={[{ value: '', label: 'Nenhum paciente' }, ...pacientes.map(p => ({ value: p.id, label: p.nome }))]} size="md" searchable />
                            </label>
                        </div>
                        
                        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-black/5 px-5 py-4 sm:px-6">
                            {tarefaEditando ? (
                                <button type="button" onClick={() => excluirTarefa(tarefaEditando.id)} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-rose-600 hover:bg-rose-50">
                                    <Trash2 size={14}/> Excluir
                                </button>
                            ) : <span />}
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={() => setModalOpen(false)} className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50">Cancelar</button>
                                <button type="button" onClick={salvarTarefa} disabled={salvando} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
                                    {salvando ? <Loader2 size={14} className="animate-spin"/> : null} Salvar
                                </button>
                            </div>
                        </div>
            </Modal>
        </div>
    );
}
