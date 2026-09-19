'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { clinicScope, readRouteCache, writeRouteCache } from '@/lib/routeListCache';
import { supabase } from '@/lib/supabase';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import {
    Layers3,
    Plus,
    Loader2,
    Pencil,
    Trash2,
    AlertTriangle,
    ToggleLeft,
    ToggleRight,
    DollarSign,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { bentoModalPanel } from '@/lib/bentoUi';

const cardShell = 'rounded-[1.35rem] bg-white sm:rounded-[1.5rem]';

function fmtMoeda(v: number | null) {
    if (v === null || Number.isNaN(v)) return '—';
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface Especialidade {
    id: string;
    clinica_id: number;
    nome: string;
    descricao: string | null;
    ordem: number | null;
    ativo: boolean;
    created_at?: string;
    updated_at?: string;
}

interface TratamentoBase {
    id: number;
    clinica_id: number;
    especialidade_id: string | null;
    nome: string;
    descricao: string | null;
    aceita_faces: boolean;
    valor_sugerido: number | null;
    custo_padrao: number | null;
    codigo_tuss_padrao: string | null;
    ativo: boolean;
    created_at?: string;
    updated_at?: string;
}

interface TratamentoFormState {
    nome: string;
    valor_padrao: string;
    custo_padrao: string;
    codigo_tuss: string;
    aceita_faces: boolean;
}

const defaultTratamentoForm: TratamentoFormState = {
    nome: '',
    valor_padrao: '',
    custo_padrao: '',
    codigo_tuss: '',
    aceita_faces: false,
};

function formatDateLabel(value?: string) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('pt-BR');
}

const TRAT_CACHE_KEY = 'ortus:tratamentos:v1';

type TratSnapshot = {
    especialidades: Especialidade[];
    selectedEspecialidadeId: string | null;
    tratamentos: TratamentoBase[];
};

function tratScope(clinicaId: number | null) {
    return clinicScope(clinicaId == null ? null : String(clinicaId));
}

function readTratBoot(): TratSnapshot | null {
    if (typeof localStorage === 'undefined') return null;
    const cid = localStorage.getItem('ortus_clinica_id');
    if (!cid || cid === 'all' || cid === 'todas') return null;
    const n = Number(cid);
    if (!Number.isFinite(n)) return null;
    return readRouteCache<TratSnapshot>(TRAT_CACHE_KEY, tratScope(n));
}

export default function TratamentosBasePage() {
    const { activeClinicId, activeClinic, loading: clinicLoading } = useClinica();
    const fetchEspGen = useRef(0);
    const fetchTratGen = useRef(0);
    const bootTrat = readTratBoot();
    const jaCarregou = useRef(!!bootTrat?.especialidades?.length);
    const { showAlert, showConfirm } = useCustomAlert();

    const clinicaId = activeClinicId && activeClinicId !== 'all' ? Number(activeClinicId) : null;

    const [especialidades, setEspecialidades] = useState<Especialidade[]>(() => bootTrat?.especialidades ?? []);
    const [especialidadesLoading, setEspecialidadesLoading] = useState(() => !(bootTrat?.especialidades?.length));
    const [selectedEspecialidadeId, setSelectedEspecialidadeId] = useState<string | null>(() => bootTrat?.selectedEspecialidadeId ?? null);
    const [excluindoEspecialidadeId, setExcluindoEspecialidadeId] = useState<string | null>(null);

    const [tratamentos, setTratamentos] = useState<TratamentoBase[]>(() => bootTrat?.tratamentos ?? []);
    const [tratamentosLoading, setTratamentosLoading] = useState(false);
    const [excluindoTratamentoId, setExcluindoTratamentoId] = useState<number | null>(null);

    const [especialidadeModalAberto, setEspecialidadeModalAberto] = useState(false);
    const [especialidadeFormNome, setEspecialidadeFormNome] = useState('');
    const [especialidadeEditando, setEspecialidadeEditando] = useState<Especialidade | null>(null);
    const [especialidadeSalvando, setEspecialidadeSalvando] = useState(false);

    const [tratamentoModalAberto, setTratamentoModalAberto] = useState(false);
    const [tratamentoEditando, setTratamentoEditando] = useState<TratamentoBase | null>(null);
    const [tratamentoForm, setTratamentoForm] = useState<TratamentoFormState>(defaultTratamentoForm);
    const [tratamentoSalvando, setTratamentoSalvando] = useState(false);

    useEffect(() => {
        if (clinicLoading) return;
        if (!clinicaId) {
            setEspecialidades([]);
            setSelectedEspecialidadeId(null);
            setTratamentos([]);
            return;
        }
        const snap = readRouteCache<TratSnapshot>(TRAT_CACHE_KEY, tratScope(clinicaId));
        if (snap) {
            setEspecialidades(snap.especialidades);
            setSelectedEspecialidadeId(snap.selectedEspecialidadeId);
            setTratamentos(snap.tratamentos);
            setEspecialidadesLoading(false);
        }
        carregarEspecialidades(undefined, { silent: !!snap?.especialidades?.length });
    }, [clinicLoading, clinicaId]);

    useEffect(() => {
        if (!clinicaId || !selectedEspecialidadeId) {
            if (!clinicaId) setTratamentos([]);
            return;
        }
        const snap = readRouteCache<TratSnapshot>(TRAT_CACHE_KEY, tratScope(clinicaId));
        if (snap?.selectedEspecialidadeId === selectedEspecialidadeId && snap.tratamentos.length) {
            setTratamentos(snap.tratamentos);
        }
        carregarTratamentos(selectedEspecialidadeId, { silent: snap?.selectedEspecialidadeId === selectedEspecialidadeId && !!snap.tratamentos.length });
    }, [clinicaId, selectedEspecialidadeId]);

    const especialidadeSelecionada = useMemo(
        () => especialidades.find((esp) => esp.id === selectedEspecialidadeId) || null,
        [especialidades, selectedEspecialidadeId]
    );

    function persistTratSnapshot(partial: Partial<TratSnapshot>) {
        if (!clinicaId) return;
        const prev = readRouteCache<TratSnapshot>(TRAT_CACHE_KEY, tratScope(clinicaId)) ?? {
            especialidades: [],
            selectedEspecialidadeId: null,
            tratamentos: [],
        };
        writeRouteCache(TRAT_CACHE_KEY, tratScope(clinicaId), { ...prev, ...partial });
    }

    async function carregarEspecialidades(focusId?: string | null, opts?: { silent?: boolean }) {
        if (!clinicaId) return;
        const gen = ++fetchEspGen.current;
        if (!opts?.silent) setEspecialidadesLoading(true);
        try {
            const { data, error } = await supabase
                .from('especialidades')
                .select('*')
                .eq('clinica_id', clinicaId)
                .order('ordem', { ascending: true, nullsFirst: true })
                .order('nome');
            if (error) throw error;
            const lista = data || [];
            setEspecialidades(lista);

            let proxima = focusId ?? selectedEspecialidadeId;
            if (proxima && !lista.some((esp) => esp.id === proxima)) {
                proxima = null;
            }
            if (!proxima && lista.length > 0) {
                proxima = lista[0].id;
            }
            setSelectedEspecialidadeId(proxima ?? null);
            if (gen === fetchEspGen.current) {
                persistTratSnapshot({ especialidades: lista, selectedEspecialidadeId: proxima ?? null });
            }
        } catch (err) {
            console.error('[Tratamentos] carregarEspecialidades', err);
            showAlert('Não foi possível carregar as especialidades.', { type: 'error' });
        } finally {
            if (gen === fetchEspGen.current) {
                jaCarregou.current = true;
                setEspecialidadesLoading(false);
            }
        }
    }

    async function carregarTratamentos(especialidadeId: string, opts?: { silent?: boolean }) {
        if (!clinicaId) return;
        const gen = ++fetchTratGen.current;
        if (!opts?.silent) setTratamentosLoading(true);
        try {
            const { data, error } = await supabase
                .from('tratamentos_base')
                .select('*')
                .eq('clinica_id', clinicaId)
                .eq('especialidade_id', especialidadeId)
                .order('nome');
            if (error) throw error;
            const lista = data || [];
            if (gen !== fetchTratGen.current) return;
            setTratamentos(lista);
            persistTratSnapshot({ selectedEspecialidadeId: especialidadeId, tratamentos: lista });
        } catch (err) {
            console.error('[Tratamentos] carregarTratamentos', err);
            showAlert('Erro ao carregar os tratamentos base.', { type: 'error' });
        } finally {
            if (gen === fetchTratGen.current) setTratamentosLoading(false);
        }
    }

    function abrirModalEspecialidade(esp?: Especialidade) {
        setEspecialidadeEditando(esp ?? null);
        setEspecialidadeFormNome(esp?.nome ?? '');
        setEspecialidadeModalAberto(true);
    }

    function fecharModalEspecialidade() {
        setEspecialidadeModalAberto(false);
        setEspecialidadeEditando(null);
        setEspecialidadeFormNome('');
    }

    async function handleSubmitEspecialidade(e: FormEvent) {
        e.preventDefault();
        if (!clinicaId) {
            showAlert('Selecione uma clínica específica para gerenciar o catálogo.', { type: 'warning' });
            return;
        }
        const nome = especialidadeFormNome.trim();
        if (!nome) {
            showAlert('Informe o nome da especialidade.', { type: 'warning' });
            return;
        }
        setEspecialidadeSalvando(true);
        try {
            if (especialidadeEditando) {
                const { error } = await supabase
                    .from('especialidades')
                    .update({ nome })
                    .eq('id', especialidadeEditando.id)
                    .eq('clinica_id', clinicaId);
                if (error) throw error;
                await carregarEspecialidades(especialidadeEditando.id);
                showAlert('Especialidade atualizada com sucesso!', { type: 'success' });
            } else {
                const { data, error } = await supabase
                    .from('especialidades')
                    .insert({ nome, clinica_id: clinicaId })
                    .select()
                    .single();
                if (error) throw error;
                await carregarEspecialidades(data?.id ?? undefined);
                showAlert('Especialidade criada!', { type: 'success' });
            }
            fecharModalEspecialidade();
        } catch (err) {
            console.error('[Tratamentos] salvarEspecialidade', err);
            showAlert('Erro ao salvar a especialidade.', { type: 'error' });
        } finally {
            setEspecialidadeSalvando(false);
        }
    }

    async function handleExcluirEspecialidade(esp: Especialidade) {
        if (!clinicaId) return;
        const confirm = await showConfirm(`Deseja excluir a especialidade "${esp.nome}"?\nTodos os tratamentos base associados serão removidos.`, {
            title: 'Excluir especialidade',
            type: 'warning',
            confirmLabel: 'Excluir',
        });
        if (!confirm) return;
        setExcluindoEspecialidadeId(esp.id);
        try {
            const { error } = await supabase
                .from('especialidades')
                .delete()
                .eq('id', esp.id)
                .eq('clinica_id', clinicaId);
            if (error) throw error;
            showAlert('Especialidade excluída.', { type: 'success' });
            await carregarEspecialidades();
        } catch (err) {
            console.error('[Tratamentos] excluirEspecialidade', err);
            showAlert('Não foi possível excluir esta especialidade.', { type: 'error' });
        } finally {
            setExcluindoEspecialidadeId(null);
        }
    }

    function abrirModalTratamento(trat?: TratamentoBase) {
        if (!selectedEspecialidadeId) {
            showAlert('Selecione uma especialidade primeiro.', { type: 'warning' });
            return;
        }
        if (trat) {
            setTratamentoEditando(trat);
            setTratamentoForm({
                nome: trat.nome,
                valor_padrao: trat.valor_sugerido !== null ? String(trat.valor_sugerido) : '',
                custo_padrao: trat.custo_padrao !== null ? String(trat.custo_padrao) : '',
                codigo_tuss: trat.codigo_tuss_padrao || '',
                aceita_faces: !!trat.aceita_faces,
            });
        } else {
            setTratamentoEditando(null);
            setTratamentoForm(defaultTratamentoForm);
        }
        setTratamentoModalAberto(true);
    }

    function fecharModalTratamento() {
        setTratamentoModalAberto(false);
        setTratamentoEditando(null);
        setTratamentoForm(defaultTratamentoForm);
    }

    function parseNumero(valor: string) {
        const sanitized = valor.replace(',', '.').trim();
        if (!sanitized) return null;
        const numero = Number(sanitized);
        return Number.isFinite(numero) ? numero : null;
    }

    async function handleSubmitTratamento(e: FormEvent) {
        e.preventDefault();
        if (!clinicaId || !selectedEspecialidadeId) {
            showAlert('Selecione uma clínica e uma especialidade.', { type: 'warning' });
            return;
        }
        const nome = tratamentoForm.nome.trim();
        const valor = parseNumero(tratamentoForm.valor_padrao);
        const custo = parseNumero(tratamentoForm.custo_padrao);

        if (!nome) {
            showAlert('Informe o nome do tratamento.', { type: 'warning' });
            return;
        }
        if (valor === null || custo === null) {
            showAlert('Valor e custo padrão são obrigatórios.', { type: 'warning' });
            return;
        }

        setTratamentoSalvando(true);
        try {
            if (tratamentoEditando) {
                const { error } = await supabase
                    .from('tratamentos_base')
                    .update({
                        nome,
                        valor_sugerido: valor,
                        custo_padrao: custo,
                        codigo_tuss_padrao: tratamentoForm.codigo_tuss.trim() || null,
                        aceita_faces: tratamentoForm.aceita_faces,
                    })
                    .eq('id', tratamentoEditando.id)
                    .eq('clinica_id', clinicaId);
                if (error) throw error;
                showAlert('Tratamento atualizado!', { type: 'success' });
            } else {
                const { error } = await supabase
                    .from('tratamentos_base')
                    .insert({
                        clinica_id: clinicaId,
                        especialidade_id: selectedEspecialidadeId,
                        nome,
                        valor_sugerido: valor,
                        custo_padrao: custo,
                        codigo_tuss_padrao: tratamentoForm.codigo_tuss.trim() || null,
                        aceita_faces: tratamentoForm.aceita_faces,
                        ativo: true,
                    });
                if (error) throw error;
                showAlert('Tratamento criado!', { type: 'success' });
            }
            fecharModalTratamento();
            await carregarTratamentos(selectedEspecialidadeId);
        } catch (err: any) {
            console.error('[Tratamentos] salvarTratamento', err);
            const msg = err?.code === '23505'
                ? 'Já existe um tratamento com este nome nesta clínica.'
                : (err?.message || 'Erro ao salvar o tratamento.');
            showAlert(msg, { type: 'error' });
        } finally {
            setTratamentoSalvando(false);
        }
    }

    async function handleExcluirTratamento(trat: TratamentoBase) {
        if (!clinicaId || !selectedEspecialidadeId) return;
        const confirm = await showConfirm(`Excluir o tratamento "${trat.nome}"?`, {
            title: 'Excluir tratamento',
            type: 'warning',
            confirmLabel: 'Excluir',
        });
        if (!confirm) return;
        setExcluindoTratamentoId(trat.id);
        try {
            const { error } = await supabase
                .from('tratamentos_base')
                .delete()
                .eq('id', trat.id)
                .eq('clinica_id', clinicaId);
            if (error) throw error;
            showAlert('Tratamento excluído.', { type: 'success' });
            await carregarTratamentos(selectedEspecialidadeId);
        } catch (err) {
            console.error('[Tratamentos] excluirTratamento', err);
            showAlert('Não foi possível excluir o tratamento.', { type: 'error' });
        } finally {
            setExcluindoTratamentoId(null);
        }
    }

    const kpiLoading = especialidadesLoading && !jaCarregou.current;
    const tratamentosComFaces = useMemo(() => tratamentos.filter((t) => t.aceita_faces).length, [tratamentos]);
    const somaValores = useMemo(
        () => tratamentos.reduce((s, t) => s + (t.valor_sugerido ?? 0), 0),
        [tratamentos],
    );

    if (!clinicaId) {
        return (
            <div className="w-full px-4 py-10 font-poppins sm:px-6">
                <div className={`${cardShell} mx-auto max-w-lg border border-amber-200/80 p-8 text-center`}>
                    <AlertTriangle className="mx-auto mb-3 text-amber-500" size={36} />
                    <h2 className="text-lg font-semibold text-amber-900">Selecione uma clínica</h2>
                    <p className="mt-1 text-sm text-amber-800/90">Escolha uma clínica específica para gerenciar o catálogo de tratamentos base.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full space-y-3 px-2.5 py-2.5 pb-12 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Ajustes</p>
                    <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Tratamentos base</h1>
                    <p className="mt-1 text-sm text-neutral-500 sm:text-base">
                        {activeClinic ? getClinicLabel(activeClinic) : 'Clínica'} · catálogo de especialidades e procedimentos
                    </p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                    <button
                        type="button"
                        onClick={() => abrirModalEspecialidade()}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 sm:flex-none"
                    >
                        <Plus size={16} /> Nova especialidade
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
                <section className={`${cardShell} p-4 sm:p-5`}>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-neutral-100 p-2 text-neutral-700"><Layers3 size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Áreas</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500">Especialidades</p>
                    {kpiLoading ? (
                        <div className="mt-2 h-8 w-16 animate-pulse rounded-xl bg-neutral-100" />
                    ) : (
                        <p className="mt-1 text-xl font-semibold text-neutral-900 sm:text-2xl">{especialidades.length}</p>
                    )}
                </section>
                <section className={`${cardShell} p-4 sm:p-5`}>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-emerald-100 p-2 text-emerald-700"><Plus size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Catálogo</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500">Tratamentos (área ativa)</p>
                    {kpiLoading || tratamentosLoading ? (
                        <div className="mt-2 h-8 w-16 animate-pulse rounded-xl bg-neutral-100" />
                    ) : (
                        <p className="mt-1 text-xl font-semibold text-neutral-900 sm:text-2xl">{tratamentos.length}</p>
                    )}
                </section>
                <section className={`${cardShell} border border-amber-200/80 p-4 sm:p-5`}>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-amber-100 p-2 text-amber-700"><ToggleRight size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Odonto</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500">Aceita faces</p>
                    {kpiLoading || tratamentosLoading ? (
                        <div className="mt-2 h-8 w-16 animate-pulse rounded-xl bg-neutral-100" />
                    ) : (
                        <p className="mt-1 text-xl font-semibold text-amber-900 sm:text-2xl">{tratamentosComFaces}</p>
                    )}
                </section>
                <section className="rounded-[1.35rem] border border-neutral-800 bg-neutral-950 p-4 text-white sm:rounded-[1.5rem] sm:p-5">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-white/10 p-2 text-[#c8f053]"><DollarSign size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Soma</span>
                    </div>
                    <p className="text-xs font-medium text-white/60">Valores padrão</p>
                    {kpiLoading || tratamentosLoading ? (
                        <div className="mt-2 h-8 w-24 animate-pulse rounded-xl bg-white/10" />
                    ) : (
                        <p className="mt-1 text-lg font-semibold sm:text-xl">{fmtMoeda(somaValores)}</p>
                    )}
                </section>
            </div>

            <div className={`${cardShell} overflow-hidden`}>
                <div className="flex flex-col lg:min-h-[420px] lg:flex-row">
                    <div className="border-b border-black/5 p-4 lg:w-[min(100%,280px)] lg:shrink-0 lg:border-b-0 lg:border-r lg:p-5">
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Especialidades</p>
                            {especialidadesLoading && <Loader2 size={16} className="animate-spin text-neutral-400" />}
                        </div>
                        {especialidades.length === 0 && !especialidadesLoading ? (
                            <p className="rounded-xl border border-dashed border-black/10 py-6 text-center text-sm text-neutral-400">
                                Nenhuma especialidade cadastrada.
                            </p>
                        ) : (
                            <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
                                {especialidades.map((esp) => {
                                    const ativo = esp.id === selectedEspecialidadeId;
                                    const removendo = excluindoEspecialidadeId === esp.id;
                                    return (
                                        <div
                                            key={esp.id}
                                            className={`group flex min-w-[140px] shrink-0 items-center justify-between gap-2 rounded-full border px-3 py-2 lg:min-w-0 lg:rounded-xl lg:px-3 lg:py-2.5 ${
                                                ativo ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-black/10 bg-[#f8f8f6] text-neutral-700 hover:border-black/20'
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setSelectedEspecialidadeId(esp.id)}
                                                className="min-w-0 flex-1 truncate text-left text-sm font-medium"
                                            >
                                                {esp.nome}
                                            </button>
                                            <div className={`flex shrink-0 items-center gap-0.5 ${ativo ? 'text-white/80' : 'opacity-0 group-hover:opacity-100'}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => abrirModalEspecialidade(esp)}
                                                    className="rounded-lg p-1 hover:bg-white/10"
                                                    title="Editar"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleExcluirEspecialidade(esp)}
                                                    className="rounded-lg p-1 hover:bg-red-500/20"
                                                    title="Excluir"
                                                    disabled={removendo}
                                                >
                                                    {removendo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-3 border-b border-black/5 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
                            <div>
                                <h3 className="text-base font-semibold text-neutral-900 sm:text-lg">
                                    {especialidadeSelecionada ? especialidadeSelecionada.nome : 'Tratamentos'}
                                </h3>
                                <p className="text-xs text-neutral-500">Procedimentos padrão da especialidade</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => abrirModalTratamento()}
                                disabled={!especialidadeSelecionada}
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-500"
                            >
                                <Plus size={16} /> Novo tratamento
                            </button>
                        </div>

                        {!especialidadeSelecionada ? (
                            <p className="p-10 text-center text-sm text-neutral-400">Escolha uma especialidade para ver os tratamentos.</p>
                        ) : tratamentosLoading && tratamentos.length === 0 ? (
                            <div className="space-y-2 p-4">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="h-16 animate-pulse rounded-2xl bg-neutral-50" />
                                ))}
                            </div>
                        ) : tratamentos.length === 0 ? (
                            <p className="p-10 text-center text-sm text-neutral-400">Nenhum tratamento nesta especialidade.</p>
                        ) : (
                            <div className="divide-y divide-black/5">
                                {tratamentos.map((trat) => {
                                    const removendo = excluindoTratamentoId === trat.id;
                                    return (
                                        <div key={trat.id} className="px-4 py-4 sm:px-5">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-medium text-neutral-900">{trat.nome}</p>
                                                    <p className="mt-0.5 text-[11px] text-neutral-500">
                                                        Atualizado em {formatDateLabel(trat.updated_at || trat.created_at)}
                                                        {trat.aceita_faces && (
                                                            <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">Aceita faces</span>
                                                        )}
                                                    </p>
                                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
                                                        <span>Valor {fmtMoeda(trat.valor_sugerido)}</span>
                                                        <span>Custo {fmtMoeda(trat.custo_padrao)}</span>
                                                        <span>TUSS {trat.codigo_tuss_padrao || '—'}</span>
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => abrirModalTratamento(trat)}
                                                        className="rounded-full border border-black/10 p-2 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                                                        title="Editar"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleExcluirTratamento(trat)}
                                                        className="rounded-full border border-black/10 p-2 text-neutral-500 hover:border-red-200 hover:text-red-600"
                                                        disabled={removendo}
                                                        title="Excluir"
                                                    >
                                                        {removendo ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Modal open={especialidadeModalAberto} onClose={fecharModalEspecialidade} maxWidth="md" hideCloseButton panelClassName={`${bentoModalPanel} overflow-hidden`}>
                    <div className="px-6 py-4 border-b border-neutral-100">
                        <h2 className="text-lg font-bold text-neutral-800">{especialidadeEditando ? 'Editar especialidade' : 'Nova especialidade'}</h2>
                        <p className="text-xs text-neutral-500">Defina as áreas clínicas utilizadas para organizar o catálogo.</p>
                    </div>
                    <form onSubmit={handleSubmitEspecialidade} className="p-6 space-y-4">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Nome</label>
                            <input
                                value={especialidadeFormNome}
                                onChange={(e) => setEspecialidadeFormNome(e.target.value)}
                                className="w-full mt-1 px-3 py-2.5 rounded-2xl border border-neutral-200 bg-neutral-50 text-sm font-bold text-neutral-700 focus:bg-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                                placeholder="Ex.: Cirurgia, Endodontia, Periodontia"
                            />
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button type="button" onClick={fecharModalEspecialidade} className="px-4 py-2 rounded-xl text-sm font-bold text-neutral-500 hover:bg-neutral-50">Cancelar</button>
                            <button
                                type="submit"
                                disabled={especialidadeSalvando}
                                className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 flex items-center gap-2"
                            >
                                {especialidadeSalvando ? <Loader2 size={16} className="animate-spin" /> : null}
                                {especialidadeEditando ? 'Salvar alterações' : 'Criar especialidade'}
                            </button>
                        </div>
                    </form>
            </Modal>

            <Modal open={tratamentoModalAberto} onClose={fecharModalTratamento} maxWidth="2xl" hideCloseButton panelClassName={`${bentoModalPanel} overflow-hidden`}>
                    <div className="px-6 py-4 border-b border-neutral-100">
                        <h2 className="text-lg font-bold text-neutral-800">{tratamentoEditando ? 'Editar tratamento' : 'Novo tratamento base'}</h2>
                        <p className="text-xs text-neutral-500">Defina o procedimento padrão para {especialidadeSelecionada?.nome || 'a especialidade selecionada'}.</p>
                    </div>
                    <form onSubmit={handleSubmitTratamento} className="p-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Nome do tratamento</label>
                                <input
                                    value={tratamentoForm.nome}
                                    onChange={(e) => setTratamentoForm((prev) => ({ ...prev, nome: e.target.value }))}
                                    className="w-full mt-1 px-3 py-2.5 rounded-2xl border border-neutral-200 bg-neutral-50 text-sm font-bold text-neutral-700 focus:bg-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                                    placeholder="Ex.: Exodontia simples, Clareamento, Reabilitação"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Valor padrão (R$)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={tratamentoForm.valor_padrao}
                                        onChange={(e) => setTratamentoForm((prev) => ({ ...prev, valor_padrao: e.target.value }))}
                                        className="w-full mt-1 px-3 py-2.5 rounded-2xl border border-neutral-200 bg-neutral-50 text-sm font-bold text-neutral-700 focus:bg-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                                        placeholder="0,00"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Custo padrão (R$)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={tratamentoForm.custo_padrao}
                                        onChange={(e) => setTratamentoForm((prev) => ({ ...prev, custo_padrao: e.target.value }))}
                                        className="w-full mt-1 px-3 py-2.5 rounded-2xl border border-neutral-200 bg-neutral-50 text-sm font-bold text-neutral-700 focus:bg-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                                        placeholder="0,00"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Código TUSS (opcional)</label>
                                <input
                                    value={tratamentoForm.codigo_tuss}
                                    onChange={(e) => setTratamentoForm((prev) => ({ ...prev, codigo_tuss: e.target.value }))}
                                    className="w-full mt-1 px-3 py-2.5 rounded-2xl border border-neutral-200 bg-neutral-50 text-sm font-bold text-neutral-700 focus:bg-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                                    placeholder="Ex.: 30101012"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => setTratamentoForm((prev) => ({ ...prev, aceita_faces: !prev.aceita_faces }))}
                                className={`flex items-center gap-2 px-4 py-2 rounded-2xl border text-xs font-black uppercase tracking-wider ${tratamentoForm.aceita_faces ? 'bg-neutral-900 border-neutral-900 text-white' : 'bg-white border-neutral-200 text-neutral-500'}`}
                            >
                                {tratamentoForm.aceita_faces ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                Aceita faces
                            </button>
                            <div className="flex items-center justify-end gap-2 pt-4">
                                <button type="button" onClick={fecharModalTratamento} className="px-4 py-2 rounded-xl text-sm font-bold text-neutral-500 hover:bg-neutral-50">Cancelar</button>
                                <button
                                    type="submit"
                                    disabled={tratamentoSalvando}
                                    className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {tratamentoSalvando ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {tratamentoEditando ? 'Salvar alterações' : 'Criar tratamento'}
                                </button>
                            </div>
                        </form>
            </Modal>
        </div>
    );
}
