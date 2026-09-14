'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { clinicScope, readRouteCache, writeRouteCache } from '@/lib/routeListCache';
import { supabase } from '@/lib/supabase';
import { useClinica } from '@/app/context/ClinicaContext';
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
import BentoPageShell from '@/components/bento/BentoPageShell';
import { bentoCard, bentoPrimaryBtn, bentoSection, bentoModalPanel, bentoChipOutline, bentoInput } from '@/lib/bentoUi';

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
    const { activeClinicId, loading: clinicLoading } = useClinica();
    const fetchEspGen = useRef(0);
    const fetchTratGen = useRef(0);
    const bootTrat = readTratBoot();
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
            if (gen === fetchEspGen.current) setEspecialidadesLoading(false);
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

    if (!clinicaId) {
        return (
            <div className="p-10 max-w-3xl mx-auto">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
                    <AlertTriangle className="text-amber-500 mx-auto mb-3" size={36} />
                    <h2 className="text-xl font-bold text-amber-900">Selecione uma clínica</h2>
                    <p className="text-sm text-amber-700 mt-1">Escolha uma clínica específica para gerenciar o catálogo de tratamentos base.</p>
                </div>
            </div>
        );
    }

    return (
        <BentoPageShell
            title="Tratamentos base"
            subtitle="Catálogo de especialidades e procedimentos da clínica"
            eyebrow="Ajustes"
            actions={
                <button type="button" onClick={() => abrirModalEspecialidade()} className={bentoPrimaryBtn}>
                    <Plus size={16} /> Nova especialidade
                </button>
            }
        >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px,1fr]">
                <aside className={`${bentoCard} space-y-4 border border-black/5 p-4`}>
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black uppercase tracking-wider text-neutral-400">Especialidades</p>
                        {especialidadesLoading && <Loader2 size={16} className="text-neutral-600 animate-spin" />}
                    </div>
                    {especialidades.length === 0 && !especialidadesLoading ? (
                        <div className="text-sm text-neutral-500 bg-neutral-50 border border-dashed border-neutral-200 rounded-2xl p-4 text-center">
                            Nenhuma especialidade cadastrada.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {especialidades.map((esp) => {
                                const ativo = esp.id === selectedEspecialidadeId;
                                const removendo = excluindoEspecialidadeId === esp.id;
                                return (
                                    <div
                                        key={esp.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setSelectedEspecialidadeId(esp.id)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                setSelectedEspecialidadeId(esp.id);
                                            }
                                        }}
                                        className={`p-3 rounded-2xl border flex items-center justify-between gap-3 group ${ativo ? 'border-neutral-900 bg-neutral-50 text-neutral-800' : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'}`}
                                    >
                                        <span className="font-bold text-sm truncate">{esp.nome}</span>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); abrirModalEspecialidade(esp); }}
                                                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50"
                                                title="Editar"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleExcluirEspecialidade(esp); }}
                                                className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50"
                                                title="Excluir"
                                                disabled={removendo}
                                            >
                                                {removendo ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </aside>

                <section className="bg-white rounded-[1.35rem] border border-neutral-100 shadow-sm p-6 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-wider text-neutral-400">Tratamentos base</p>
                            <h2 className="text-xl font-bold text-neutral-800">
                                {especialidadeSelecionada ? especialidadeSelecionada.nome : 'Selecione uma especialidade'}
                            </h2>
                        </div>
                        <button
                            onClick={() => abrirModalTratamento()}
                            disabled={!especialidadeSelecionada}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-200 disabled:text-neutral-500"
                        >
                            <Plus size={16} /> Novo tratamento
                        </button>
                    </div>

                    {!especialidadeSelecionada ? (
                        <div className="text-sm text-neutral-500 bg-neutral-50 border border-dashed border-neutral-200 rounded-[1.35rem] p-10 text-center">
                            Escolha uma especialidade para visualizar seus tratamentos.
                        </div>
                    ) : tratamentosLoading ? (
                        <div className="flex items-center gap-2 text-neutral-500 text-sm">
                            <Loader2 size={18} className="animate-spin" /> Carregando tratamentos...
                        </div>
                    ) : tratamentos.length === 0 ? (
                        <div className="text-sm text-neutral-500 bg-neutral-50 border border-dashed border-neutral-200 rounded-[1.35rem] p-10 text-center">
                            Nenhum tratamento cadastrado para esta especialidade.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {tratamentos.map((trat) => {
                                const removendo = excluindoTratamentoId === trat.id;
                                return (
                                    <div key={trat.id} className="border border-neutral-100 rounded-[1.35rem] p-5 shadow-sm space-y-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div>
                                                <p className="text-base font-bold text-neutral-800">{trat.nome}</p>
                                                <p className="text-xs text-neutral-500">Atualizado em {formatDateLabel(trat.updated_at || trat.created_at)}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-black px-3 py-1.5 rounded-full border ${trat.aceita_faces ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-500 border-neutral-200'}`}>
                                                    {trat.aceita_faces ? 'Aceita faces' : 'Faces indisponíveis'}
                                                </span>
                                                <button
                                                    onClick={() => abrirModalTratamento(trat)}
                                                    className="p-2 rounded-xl border border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-900"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleExcluirTratamento(trat)}
                                                    className="p-2 rounded-xl border border-neutral-200 text-neutral-500 hover:border-red-200 hover:text-red-600"
                                                    disabled={removendo}
                                                >
                                                    {removendo ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Valor padrão</p>
                                                <div className="mt-1 inline-flex items-center gap-2 text-sm font-bold text-neutral-800">
                                                    <DollarSign size={16} className="text-neutral-400" />
                                                    {trat.valor_sugerido !== null ? trat.valor_sugerido.toFixed(2) : '--'}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Custo padrão</p>
                                                <div className="mt-1 inline-flex items-center gap-2 text-sm font-bold text-neutral-800">
                                                    <DollarSign size={16} className="text-neutral-400" />
                                                    {trat.custo_padrao !== null ? trat.custo_padrao.toFixed(2) : '--'}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Código TUSS</p>
                                                <p className="mt-1 text-sm font-bold text-neutral-800">{trat.codigo_tuss_padrao || '—'}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
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
        </BentoPageShell>
    );
}
