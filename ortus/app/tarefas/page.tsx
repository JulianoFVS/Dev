'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { clinicScope, readRouteCache, writeRouteCache } from '@/lib/routeListCache';
import {
    Plus, Search, Calendar, AlertCircle, CheckCircle,
    User, Loader2, X, Save, Trash2, CheckSquare,
    Clock, ChevronUp, ChevronDown, Building2, MoreVertical, ListTodo,
} from 'lucide-react';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import Modal from '@/components/ui/Modal';
import CustomSelect from '@/components/ui/CustomSelect';
import { TAREFA_PRIORIDADE_OPTIONS, TAREFA_STATUS_OPTIONS } from '@/lib/formOptions';
import Link from 'next/link';

const cardShell = 'rounded-[1.35rem] bg-white sm:rounded-[1.5rem]';

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

export default function Tarefas() {
    const { activeClinicId, activeClinic, clinics, loading: clinicLoading } = useClinica();
    const boot = readTarefasBoot();
    const jaCarregou = useRef(!!boot?.tarefas?.length);
    const fetchGen = useRef(0);
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
    const [viewMode, setViewMode] = useState<'lista' | 'kanban'>('kanban');
    
    // Modal
    const [modalOpen, setModalOpen] = useState(false);
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

        const [tarefasRes, vinculosRes, pacsRes] = await Promise.all([
            supabase.from('v_tarefas_completo').select('*').in('clinica_id', clinicasIds).order('data_limite', { ascending: true }),
            supabase.from('profissionais_clinicas').select('profissional_id').in('clinica_id', clinicasIds),
            supabase.from('pacientes').select('id, nome, telefone').in('clinica_id', clinicasIds).order('nome'),
        ]);

        if (gen !== fetchGen.current) return;

        const profissionalIds = [...new Set((vinculosRes.data || []).map((v) => v.profissional_id))];
        const { data: profsData } = profissionalIds.length > 0
            ? await supabase.from('profissionais').select('id, nome').in('id', profissionalIds)
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

        if (tarefaEditando) {
            const { error } = await supabase
                .from('tarefas')
                .update(payload)
                .eq('id', tarefaEditando.id);
            
            if (error) showAlert('Erro ao atualizar: ' + error.message, { type: 'error' });
            else showAlert('Tarefa atualizada!', { type: 'success' });
        } else {
            const { error } = await supabase.from('tarefas').insert([payload]);
            if (error) showAlert('Erro ao criar: ' + error.message, { type: 'error' });
            else showAlert('Tarefa criada!', { type: 'success' });
        }

        setSalvando(false);
        setModalOpen(false);
        carregarDados({ silent: true });
    }

    async function excluirTarefa(id: string) {
        if (!(await showConfirm('Excluir esta tarefa?', { title: 'Excluir', type: 'warning' }))) return;
        
        const { error } = await supabase.from('tarefas').delete().eq('id', id);
        if (error) showAlert('Erro ao excluir: ' + error.message, { type: 'error' });
        else {
            showAlert('Tarefa excluída!', { type: 'success' });
            carregarDados({ silent: true });
        }
    }

    async function moverStatus(id: string, novoStatus: 'a_fazer' | 'em_andamento' | 'concluido') {
        const prev = tarefas;
        setTarefas((list) => list.map((t) => (t.id === id ? { ...t, status: novoStatus } : t)));
        const { error } = await supabase.from('tarefas').update({ status: novoStatus }).eq('id', id);
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

    function getPrioridadeCor(p: string) {
        switch (p) {
            case 'alta': return 'bg-red-100 text-red-700 border-red-200';
            case 'media': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'baixa': return 'bg-neutral-100 text-neutral-800 border-black/10';
            default: return 'bg-neutral-100 text-neutral-600';
        }
    }

    function getStatusLabel(s: string) {
        switch (s) {
            case 'a_fazer': return 'A Fazer';
            case 'em_andamento': return 'Em Andamento';
            case 'concluido': return 'Concluído';
            default: return s;
        }
    }

    function getStatusCor(status: string) {
        switch (status) {
            case 'a_fazer':
                return 'bg-neutral-100 text-neutral-700 border-neutral-200';
            case 'em_andamento':
                return 'bg-neutral-50 text-neutral-800 border-black/10';
            case 'concluido':
                return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            default:
                return 'bg-neutral-100 text-neutral-600 border-neutral-200';
        }
    }

    function renderTarefaCard(t: Tarefa, compact = false) {
        return (
            <div
                key={t.id}
                className={`rounded-[1rem] border border-black/10 bg-white p-3.5 transition-colors hover:border-black/15 sm:p-4 ${
                    t.alerta_data === 'atrasada' && t.status !== 'concluido'
                        ? 'border-red-200/80 bg-red-50/40'
                        : t.alerta_data === 'proxima' && t.status !== 'concluido'
                            ? 'border-amber-200/80 bg-amber-50/30'
                            : ''
                }`}
            >
                <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className={`font-bold text-neutral-800 text-sm ${t.status === 'concluido' ? 'line-through text-neutral-400' : ''}`}>
                        {t.titulo}
                    </h3>
                    <button onClick={() => abrirEditarTarefa(t)} className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 rounded-lg">
                        <MoreVertical size={14}/>
                    </button>
                </div>
                {!compact && t.descricao && <p className="text-xs text-neutral-500 mb-2 line-clamp-2">{t.descricao}</p>}
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className={`font-black uppercase px-2 py-0.5 rounded-full border ${getPrioridadeCor(t.prioridade)}`}>{t.prioridade}</span>
                    {t.responsavel_nome && <span className="flex items-center gap-1 text-neutral-600"><User size={11}/>{t.responsavel_nome}</span>}
                    {t.data_limite && (
                        <span className={`flex items-center gap-1 ${t.alerta_data === 'atrasada' && t.status !== 'concluido' ? 'text-red-600 font-bold' : 'text-neutral-500'}`}>
                            <Calendar size={11}/>{new Date(t.data_limite).toLocaleDateString('pt-BR')}
                        </span>
                    )}
                </div>
                {t.status !== 'concluido' && (
                    <div className="flex gap-1 mt-3">
                        {t.status !== 'a_fazer' && (
                            <button onClick={() => moverStatus(t.id, t.status === 'concluido' ? 'em_andamento' : 'a_fazer')} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-neutral-100 text-neutral-600 hover:bg-neutral-200">← Voltar</button>
                        )}
                        <button onClick={() => moverStatus(t.id, t.status === 'a_fazer' ? 'em_andamento' : 'concluido')} className="text-[10px] font-bold px-2 py-1 rounded-lg bg-neutral-100 text-neutral-800 hover:bg-blue-200 ml-auto">
                            {t.status === 'a_fazer' ? 'Iniciar →' : 'Concluir ✓'}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    const colunasKanban: { id: Tarefa['status']; label: string }[] = [
        { id: 'a_fazer', label: 'A fazer' },
        { id: 'em_andamento', label: 'Em andamento' },
        { id: 'concluido', label: 'Concluído' },
    ];

    const kpiLoading = loading && !jaCarregou.current;
    const totalAbertas = contagemTarefas.a_fazer + contagemTarefas.em_andamento;

    return (
        <div className="w-full space-y-3 px-2.5 py-2.5 pb-12 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Tarefas</h1>
                    <p className="mt-1 text-sm text-neutral-500 sm:text-base">
                        {activeClinic ? getClinicLabel(activeClinic) : 'Todas as clínicas'} · atividades internas da equipe
                    </p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                    <button
                        type="button"
                        onClick={abrirNovaTarefa}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 sm:flex-none"
                    >
                        <Plus size={16} /> Nova tarefa
                    </button>
                </div>
            </div>

            <div className={`${cardShell} flex flex-col gap-3 p-3 sm:p-4`}>
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-neutral-400" aria-hidden />
                    <input
                        type="text"
                        placeholder="Buscar tarefas..."
                        className="h-10 w-full rounded-full border border-black/10 bg-[#f8f8f6] pl-10 pr-4 text-sm font-medium text-neutral-800 outline-none focus:border-neutral-400"
                        value={filtroBusca}
                        onChange={(e) => setFiltroBusca(e.target.value)}
                    />
                </div>
                <div className="grid grid-cols-1 gap-2 border-t border-black/5 pt-3 sm:grid-cols-2 sm:gap-3">
                    <CustomSelect
                        value={filtroStatus}
                        onChange={setFiltroStatus}
                        options={[{ value: 'todos', label: 'Todos os status' }, ...TAREFA_STATUS_OPTIONS]}
                        size="sm"
                    />
                    <CustomSelect
                        value={filtroPrioridade}
                        onChange={setFiltroPrioridade}
                        options={[{ value: 'todos', label: 'Todas as prioridades' }, ...TAREFA_PRIORIDADE_OPTIONS]}
                        size="sm"
                    />
                </div>
                {(filtroStatus !== 'todos' || filtroPrioridade !== 'todos') && (
                    <button
                        type="button"
                        onClick={() => { setFiltroStatus('todos'); setFiltroPrioridade('todos'); }}
                        className="self-start text-xs font-medium text-neutral-500 hover:text-neutral-900"
                    >
                        Limpar filtros
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
                <section className={`${cardShell} p-4 sm:p-5`}>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-neutral-100 p-2 text-neutral-700"><ListTodo size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Backlog</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500">A fazer</p>
                    {kpiLoading ? (
                        <div className="mt-2 h-8 w-16 animate-pulse rounded-xl bg-neutral-100" />
                    ) : (
                        <p className="mt-1 text-xl font-semibold text-neutral-900 sm:text-2xl">{contagemTarefas.a_fazer}</p>
                    )}
                </section>
                <section className={`${cardShell} border border-amber-200/80 p-4 sm:p-5`}>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-amber-100 p-2 text-amber-700"><Clock size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Ativas</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500">Em andamento</p>
                    {kpiLoading ? (
                        <div className="mt-2 h-8 w-16 animate-pulse rounded-xl bg-neutral-100" />
                    ) : (
                        <p className="mt-1 text-xl font-semibold text-amber-900 sm:text-2xl">{contagemTarefas.em_andamento}</p>
                    )}
                </section>
                <section className={`${cardShell} border border-red-200/70 p-4 sm:p-5`}>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-red-100 p-2 text-red-600"><AlertCircle size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600">Prazo</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500">Atrasadas</p>
                    {kpiLoading ? (
                        <div className="mt-2 h-8 w-16 animate-pulse rounded-xl bg-neutral-100" />
                    ) : (
                        <>
                            <p className="mt-1 text-xl font-semibold text-red-700 sm:text-2xl">{contagemTarefas.atrasadas}</p>
                            {contagemTarefas.proximas > 0 && (
                                <p className="mt-1 text-[11px] text-neutral-500">{contagemTarefas.proximas} vencem em breve</p>
                            )}
                        </>
                    )}
                </section>
                <section className="rounded-[1.35rem] border border-neutral-800 bg-neutral-950 p-4 text-white sm:rounded-[1.5rem] sm:p-5">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-white/10 p-2 text-[#c8f053]"><CheckCircle size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Resultado</span>
                    </div>
                    <p className="text-xs font-medium text-white/60">Concluídas</p>
                    {kpiLoading ? (
                        <div className="mt-2 h-8 w-16 animate-pulse rounded-xl bg-white/10" />
                    ) : (
                        <>
                            <p className="mt-1 text-xl font-semibold sm:text-2xl">{contagemTarefas.concluido}</p>
                            <p className="mt-1 text-[11px] text-white/50">{totalAbertas} em aberto</p>
                        </>
                    )}
                </section>
            </div>

            <div className={`${cardShell} overflow-hidden`}>
                <div className="flex flex-col gap-3 border-b border-black/5 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
                    <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[#f3f4f1] p-2 text-neutral-700"><CheckSquare size={18} /></span>
                        <h3 className="text-base font-semibold text-neutral-900 sm:text-lg">
                            {viewMode === 'kanban' ? 'Quadro' : 'Lista de tarefas'}
                        </h3>
                    </div>
                    <div className="flex rounded-full border border-black/10 bg-[#f3f4f1] p-0.5">
                        <button type="button" onClick={() => setViewMode('kanban')} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${viewMode === 'kanban' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Kanban</button>
                        <button type="button" onClick={() => setViewMode('lista')} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${viewMode === 'lista' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Lista</button>
                    </div>
                </div>

                {kpiLoading ? (
                    <div className="space-y-2 p-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex h-16 animate-pulse items-center gap-3 rounded-2xl bg-neutral-50 px-3" />
                        ))}
                    </div>
                ) : tarefasFiltradas.length === 0 ? (
                    <div className="p-12 text-center text-sm text-neutral-400">
                        <CheckCircle size={40} className="mx-auto mb-3 opacity-40" aria-hidden />
                        <p className="font-medium text-neutral-600">Nenhuma tarefa encontrada</p>
                        <p className="mt-1 text-xs">Crie uma nova tarefa para começar</p>
                    </div>
                ) : viewMode === 'kanban' ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x md:divide-black/5">
                        {colunasKanban.map((col) => {
                            const items = tarefasFiltradas.filter((t) => t.status === col.id);
                            return (
                                <div key={col.id} className="min-h-[280px] bg-[#fafaf8] p-4 md:min-h-[320px] md:p-5">
                                    <div className="mb-4 flex items-center justify-between">
                                        <h4 className="text-sm font-semibold text-neutral-800">{col.label}</h4>
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-600 shadow-sm">{items.length}</span>
                                    </div>
                                    <div className="space-y-2.5">
                                        {items.map((t) => renderTarefaCard(t, true))}
                                        {items.length === 0 && (
                                            <p className="py-8 text-center text-xs text-neutral-400">Nenhuma tarefa</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="divide-y divide-black/5">
                            {tarefasFiltradas.map(t => (
                                <div 
                                    key={t.id} 
                                    className={`px-4 py-4 sm:px-5 ${
                                        t.alerta_data === 'atrasada' && t.status !== 'concluido' 
                                            ? 'bg-red-50/30' 
                                            : t.alerta_data === 'proxima' && t.status !== 'concluido'
                                                ? 'bg-amber-50/20'
                                                : ''
                                    }`}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="flex flex-col gap-2 pt-1">
                                            {t.status !== 'concluido' && (
                                                <button 
                                                    onClick={() => moverStatus(t.id, t.status === 'a_fazer' ? 'em_andamento' : 'concluido')}
                                                    className="touch-target p-2 bg-neutral-100 hover:bg-neutral-100 text-neutral-400 hover:text-neutral-900 rounded-lg transition-colors"
                                                    title="Avançar status"
                                                >
                                                    <ChevronUp size={16}/>
                                                </button>
                                            )}
                                            {t.status !== 'a_fazer' && (
                                                <button 
                                                    onClick={() => moverStatus(t.id, t.status === 'concluido' ? 'em_andamento' : 'a_fazer')}
                                                    className="touch-target p-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-400 hover:text-neutral-600 rounded-lg transition-colors"
                                                    title="Voltar status"
                                                >
                                                    <ChevronDown size={16}/>
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                <h3 className={`font-bold text-neutral-800 ${t.status === 'concluido' ? 'line-through text-neutral-400' : ''}`}>
                                                    {t.titulo}
                                                </h3>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full border ${getPrioridadeCor(t.prioridade)}`}>
                                                        {t.prioridade}
                                                    </span>
                                                    <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full border ${getStatusCor(t.status)}`}>
                                                        {getStatusLabel(t.status)}
                                                    </span>
                                                </div>
                                            </div>
                                            {t.descricao && (
                                                <p className="text-sm text-neutral-500 mb-3">{t.descricao}</p>
                                            )}
                                            <div className="flex flex-wrap items-center gap-3 text-xs">
                                                {t.responsavel_nome && (
                                                    <span className="flex items-center gap-1 text-neutral-600">
                                                        <User size={12}/> {t.responsavel_nome}
                                                    </span>
                                                )}
                                                {t.data_limite && (
                                                    <span className={`flex items-center gap-1 ${
                                                        t.alerta_data === 'atrasada' && t.status !== 'concluido' 
                                                            ? 'text-red-600 font-bold' 
                                                            : t.alerta_data === 'proxima' && t.status !== 'concluido'
                                                                ? 'text-amber-600 font-bold'
                                                                : 'text-neutral-500'
                                                    }`}>
                                                        <Calendar size={12}/> 
                                                        {new Date(t.data_limite).toLocaleDateString('pt-BR')}
                                                        {t.alerta_data === 'atrasada' && t.status !== 'concluido' && ' (Atrasada)'}
                                                    </span>
                                                )}
                                                {t.paciente_nome && (
                                                    <Link 
                                                        href={`/pacientes/${t.paciente_id}`}
                                                        className="flex items-center gap-1 text-neutral-900 hover:underline"
                                                    >
                                                        <Building2 size={12}/> {t.paciente_nome}
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button 
                                                onClick={() => abrirEditarTarefa(t)}
                                                className="touch-target p-2 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 rounded-lg transition-colors"
                                                title="Editar"
                                            >
                                                <MoreVertical size={16}/>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                    </div>
                )}
            </div>

            {/* Modal Criar/Editar */}
            <Modal open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="lg" hideCloseButton panelClassName="bg-white rounded-[1.35rem] shadow-2xl flex flex-col max-h-[90vh] border border-black/10">
                        <div className="p-6 border-b border-black/10 flex justify-between items-center bg-neutral-50 rounded-t-[1.35rem] shrink-0">
                            <h3 className="font-black text-xl text-neutral-800">
                                {tarefaEditando ? 'Editar Tarefa' : 'Nova Tarefa'}
                            </h3>
                            <button onClick={() => setModalOpen(false)} className="touch-target p-2 text-neutral-400 hover:bg-neutral-100 rounded-xl transition-colors">
                                <X size={20}/>
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto space-y-4">
                            <div>
                                <label className="text-xs font-bold text-neutral-400 uppercase ml-1">Título *</label>
                                <input 
                                    value={form.titulo}
                                    onChange={e => setForm({...form, titulo: e.target.value})}
                                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 focus:ring-neutral-500 font-bold text-neutral-700"
                                    placeholder="Nome da tarefa"
                                />
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-neutral-400 uppercase ml-1">Descrição</label>
                                <textarea 
                                    value={form.descricao}
                                    onChange={e => setForm({...form, descricao: e.target.value})}
                                    rows={3}
                                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 focus:ring-neutral-500 font-medium text-neutral-700 resize-none"
                                    placeholder="Detalhes da tarefa..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-neutral-400 uppercase ml-1">Responsável</label>
                                    <CustomSelect value={form.responsavel_id} onChange={v => setForm({...form, responsavel_id: v})} options={[{ value: '', label: 'Sem responsável' }, ...profissionais.map(p => ({ value: String(p.id), label: p.nome }))]} size="lg" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-neutral-400 uppercase ml-1">Data Limite</label>
                                    <input 
                                        type="date"
                                        value={form.data_limite}
                                        onChange={e => setForm({...form, data_limite: e.target.value})}
                                        className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:ring-2 focus:ring-neutral-500 font-medium text-neutral-700"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-neutral-400 uppercase ml-1">Prioridade</label>
                                    <CustomSelect value={form.prioridade} onChange={v => setForm({...form, prioridade: v as 'baixa' | 'media' | 'alta'})} options={TAREFA_PRIORIDADE_OPTIONS} size="lg" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-neutral-400 uppercase ml-1">Status</label>
                                    <CustomSelect value={form.status} onChange={v => setForm({...form, status: v as 'a_fazer' | 'em_andamento' | 'concluido'})} options={TAREFA_STATUS_OPTIONS} size="lg" />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-neutral-400 uppercase ml-1">Vincular Paciente (opcional)</label>
                                <CustomSelect value={form.paciente_id} onChange={v => setForm({...form, paciente_id: v})} options={[{ value: '', label: 'Nenhum paciente' }, ...pacientes.map(p => ({ value: p.id, label: p.nome }))]} size="lg" searchable />
                            </div>
                        </div>
                        
                        <div className="p-6 border-t border-neutral-100 bg-neutral-50 flex flex-col sm:flex-row gap-3 rounded-b-3xl">
                            {tarefaEditando && (
                                <button 
                                    onClick={() => excluirTarefa(tarefaEditando.id)}
                                    className="touch-target px-4 py-3 text-red-600 font-bold hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2"
                                >
                                    <Trash2 size={18}/> Excluir
                                </button>
                            )}
                            <button onClick={() => setModalOpen(false)} className="touch-target flex-1 py-3 text-neutral-500 font-bold hover:bg-neutral-200 rounded-xl transition-colors">
                                Cancelar
                            </button>
                            <button 
                                onClick={salvarTarefa}
                                disabled={salvando}
                                className="touch-target flex-1 py-3 bg-neutral-900 text-white font-bold rounded-xl hover:bg-neutral-800 shadow-lg shadow-black/10 transition-all flex items-center justify-center gap-2"
                            >
                                {salvando ? <Loader2 className="animate-spin"/> : <><Save size={18}/> Salvar</>}
                            </button>
                        </div>
            </Modal>
        </div>
    );
}
