'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
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

export default function TratamentosBasePage() {
    const { activeClinicId } = useClinica();
    const { showAlert, showConfirm } = useCustomAlert();

    const clinicaId = activeClinicId && activeClinicId !== 'all' ? Number(activeClinicId) : null;

    const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
    const [especialidadesLoading, setEspecialidadesLoading] = useState(false);
    const [selectedEspecialidadeId, setSelectedEspecialidadeId] = useState<string | null>(null);
    const [excluindoEspecialidadeId, setExcluindoEspecialidadeId] = useState<string | null>(null);

    const [tratamentos, setTratamentos] = useState<TratamentoBase[]>([]);
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
        if (!clinicaId) {
            setEspecialidades([]);
            setSelectedEspecialidadeId(null);
            setTratamentos([]);
            return;
        }
        carregarEspecialidades();
    }, [clinicaId]);

    useEffect(() => {
        if (!clinicaId || !selectedEspecialidadeId) {
            setTratamentos([]);
            return;
        }
        carregarTratamentos(selectedEspecialidadeId);
    }, [clinicaId, selectedEspecialidadeId]);

    const especialidadeSelecionada = useMemo(
        () => especialidades.find((esp) => esp.id === selectedEspecialidadeId) || null,
        [especialidades, selectedEspecialidadeId]
    );

    async function carregarEspecialidades(focusId?: string | null) {
        if (!clinicaId) return;
        setEspecialidadesLoading(true);
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
        } catch (err) {
            console.error('[Tratamentos] carregarEspecialidades', err);
            showAlert('Não foi possível carregar as especialidades.', { type: 'error' });
        } finally {
            setEspecialidadesLoading(false);
        }
    }

    async function carregarTratamentos(especialidadeId: string) {
        if (!clinicaId) return;
        setTratamentosLoading(true);
        try {
            const { data, error } = await supabase
                .from('tratamentos_base')
                .select('*')
                .eq('clinica_id', clinicaId)
                .eq('especialidade_id', especialidadeId)
                .order('nome');
            if (error) throw error;
            setTratamentos(data || []);
        } catch (err) {
            console.error('[Tratamentos] carregarTratamentos', err);
            showAlert('Erro ao carregar os tratamentos base.', { type: 'error' });
        } finally {
            setTratamentosLoading(false);
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
        } catch (err) {
            console.error('[Tratamentos] salvarTratamento', err);
            showAlert('Erro ao salvar o tratamento.', { type: 'error' });
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
        <div className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto space-y-6">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-blue-500">
                        <Layers3 size={14} /> Catálogo Base · Ortus
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800">Especialidades e Tratamentos</h1>
                    <p className="text-sm text-slate-500">Defina o catálogo padrão de procedimentos que abastece os planos e fichas clínicas.</p>
                </div>
                <button
                    onClick={() => abrirModalEspecialidade()}
                    className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 text-sm"
                >
                    <Plus size={16} /> Nova especialidade
                </button>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6">
                <aside className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Especialidades</p>
                        {especialidadesLoading && <Loader2 size={16} className="text-blue-500 animate-spin" />}
                    </div>
                    {especialidades.length === 0 && !especialidadesLoading ? (
                        <div className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-4 text-center">
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
                                        className={`p-3 rounded-2xl border flex items-center justify-between gap-3 group ${ativo ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'}`}
                                    >
                                        <span className="font-bold text-sm truncate">{esp.nome}</span>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); abrirModalEspecialidade(esp); }}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                                title="Editar"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleExcluirEspecialidade(esp); }}
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
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

                <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Tratamentos base</p>
                            <h2 className="text-xl font-bold text-slate-800">
                                {especialidadeSelecionada ? especialidadeSelecionada.nome : 'Selecione uma especialidade'}
                            </h2>
                        </div>
                        <button
                            onClick={() => abrirModalTratamento()}
                            disabled={!especialidadeSelecionada}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-500"
                        >
                            <Plus size={16} /> Novo tratamento
                        </button>
                    </div>

                    {!especialidadeSelecionada ? (
                        <div className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-10 text-center">
                            Escolha uma especialidade para visualizar seus tratamentos.
                        </div>
                    ) : tratamentosLoading ? (
                        <div className="flex items-center gap-2 text-slate-500 text-sm">
                            <Loader2 size={18} className="animate-spin" /> Carregando tratamentos...
                        </div>
                    ) : tratamentos.length === 0 ? (
                        <div className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-10 text-center">
                            Nenhum tratamento cadastrado para esta especialidade.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {tratamentos.map((trat) => {
                                const removendo = excluindoTratamentoId === trat.id;
                                return (
                                    <div key={trat.id} className="border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div>
                                                <p className="text-base font-bold text-slate-800">{trat.nome}</p>
                                                <p className="text-xs text-slate-500">Atualizado em {formatDateLabel(trat.updated_at || trat.created_at)}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-black px-3 py-1.5 rounded-full border ${trat.aceita_faces ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'}`}>
                                                    {trat.aceita_faces ? 'Aceita faces' : 'Faces indisponíveis'}
                                                </span>
                                                <button
                                                    onClick={() => abrirModalTratamento(trat)}
                                                    className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:border-blue-200 hover:text-blue-600"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleExcluirTratamento(trat)}
                                                    className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:border-red-200 hover:text-red-600"
                                                    disabled={removendo}
                                                >
                                                    {removendo ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor padrão</p>
                                                <div className="mt-1 inline-flex items-center gap-2 text-sm font-bold text-slate-800">
                                                    <DollarSign size={16} className="text-slate-400" />
                                                    {trat.valor_sugerido !== null ? trat.valor_sugerido.toFixed(2) : '--'}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Custo padrão</p>
                                                <div className="mt-1 inline-flex items-center gap-2 text-sm font-bold text-slate-800">
                                                    <DollarSign size={16} className="text-slate-400" />
                                                    {trat.custo_padrao !== null ? trat.custo_padrao.toFixed(2) : '--'}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Código TUSS</p>
                                                <p className="mt-1 text-sm font-bold text-slate-800">{trat.codigo_tuss_padrao || '—'}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>

            {especialidadeModalAberto && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-3xl border border-slate-100 shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100">
                            <h2 className="text-lg font-bold text-slate-800">{especialidadeEditando ? 'Editar especialidade' : 'Nova especialidade'}</h2>
                            <p className="text-xs text-slate-500">Defina as áreas clínicas utilizadas para organizar o catálogo.</p>
                        </div>
                        <form onSubmit={handleSubmitEspecialidade} className="p-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nome</label>
                                <input
                                    value={especialidadeFormNome}
                                    onChange={(e) => setEspecialidadeFormNome(e.target.value)}
                                    className="w-full mt-1 px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Ex.: Cirurgia, Endodontia, Periodontia"
                                />
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button type="button" onClick={fecharModalEspecialidade} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
                                <button
                                    type="submit"
                                    disabled={especialidadeSalvando}
                                    className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {especialidadeSalvando ? <Loader2 size={16} className="animate-spin" /> : null}
                                    {especialidadeEditando ? 'Salvar alterações' : 'Criar especialidade'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {tratamentoModalAberto && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-2xl rounded-3xl border border-slate-100 shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100">
                            <h2 className="text-lg font-bold text-slate-800">{tratamentoEditando ? 'Editar tratamento' : 'Novo tratamento base'}</h2>
                            <p className="text-xs text-slate-500">Defina o procedimento padrão para {especialidadeSelecionada?.nome || 'a especialidade selecionada'}.</p>
                        </div>
                        <form onSubmit={handleSubmitTratamento} className="p-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nome do tratamento</label>
                                <input
                                    value={tratamentoForm.nome}
                                    onChange={(e) => setTratamentoForm((prev) => ({ ...prev, nome: e.target.value }))}
                                    className="w-full mt-1 px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Ex.: Exodontia simples, Clareamento, Reabilitação"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor padrão (R$)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={tratamentoForm.valor_padrao}
                                        onChange={(e) => setTratamentoForm((prev) => ({ ...prev, valor_padrao: e.target.value }))}
                                        className="w-full mt-1 px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                        placeholder="0,00"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Custo padrão (R$)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={tratamentoForm.custo_padrao}
                                        onChange={(e) => setTratamentoForm((prev) => ({ ...prev, custo_padrao: e.target.value }))}
                                        className="w-full mt-1 px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                        placeholder="0,00"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Código TUSS (opcional)</label>
                                <input
                                    value={tratamentoForm.codigo_tuss}
                                    onChange={(e) => setTratamentoForm((prev) => ({ ...prev, codigo_tuss: e.target.value }))}
                                    className="w-full mt-1 px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Ex.: 30101012"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => setTratamentoForm((prev) => ({ ...prev, aceita_faces: !prev.aceita_faces }))}
                                className={`flex items-center gap-2 px-4 py-2 rounded-2xl border text-xs font-black uppercase tracking-wider ${tratamentoForm.aceita_faces ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500'}`}
                            >
                                {tratamentoForm.aceita_faces ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                Aceita faces
                            </button>
                            <div className="flex items-center justify-end gap-2 pt-4">
                                <button type="button" onClick={fecharModalTratamento} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
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
                    </div>
                </div>
            )}
        </div>
    );
}
