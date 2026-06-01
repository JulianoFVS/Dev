'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useClinica } from '@/app/context/ClinicaContext';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import {
    Loader2,
    Plus,
    Layers3,
    ToggleLeft,
    ToggleRight,
    DollarSign,
    AlertTriangle,
    Check,
} from 'lucide-react';

interface Plano {
    id: string;
    clinica_id: number;
    nome: string;
    tipo: string;
    ativo: boolean;
}

interface Especialidade {
    id: string;
    clinica_id: number;
    nome: string;
    descricao: string | null;
    ordem: number | null;
    ativo: boolean;
}

interface TratamentoBase {
    id: number;
    clinica_id: number;
    especialidade_id: string | null;
    nome: string;
    descricao: string | null;
    aceita_faces: boolean;
    valor_sugerido: number | null;
    codigo_tuss_padrao: string | null;
    ativo: boolean;
}

interface PlanoTratamentoForm {
    valor: string;
    custo: string;
    codigo_tuss: string;
    aceita_faces: boolean;
    ativo: boolean;
}

export default function PlanosPage() {
    const { activeClinicId } = useClinica();
    const { showAlert } = useCustomAlert();

    const clinicaId = activeClinicId && activeClinicId !== 'all' ? Number(activeClinicId) : null;

    const [planos, setPlanos] = useState<Plano[]>([]);
    const [planosLoading, setPlanosLoading] = useState(false);
    const [selectedPlanoId, setSelectedPlanoId] = useState<string | null>(null);

    const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
    const [tratamentosBase, setTratamentosBase] = useState<TratamentoBase[]>([]);
    const [estruturaLoading, setEstruturaLoading] = useState(false);
    const [especialidadeAtiva, setEspecialidadeAtiva] = useState<string | 'all' | null>('all');

    const [planoTratamentosLoading, setPlanoTratamentosLoading] = useState(false);
    const [tratamentoForms, setTratamentoForms] = useState<Record<number, PlanoTratamentoForm>>({});
    const [dirtyTratamentos, setDirtyTratamentos] = useState<Record<number, boolean>>({});
    const [salvandoTratamentoId, setSalvandoTratamentoId] = useState<number | null>(null);

    const [modalPlanoAberto, setModalPlanoAberto] = useState(false);
    const [novoPlanoNome, setNovoPlanoNome] = useState('');
    const [opcaoCopia, setOpcaoCopia] = useState<'copiar' | 'vazio'>('copiar');
    const [criandoPlano, setCriandoPlano] = useState(false);

    const possuiPlanoPadrao = useMemo(() => planos.some((p) => p.tipo === 'particular'), [planos]);

    useEffect(() => {
        if (!clinicaId) {
            setPlanos([]);
            setEspecialidades([]);
            setTratamentosBase([]);
            setSelectedPlanoId(null);
            return;
        }
        carregarPlanos();
        carregarEstrutura();
    }, [clinicaId]);

    useEffect(() => {
        if (!selectedPlanoId || !clinicaId || tratamentosBase.length === 0) return;
        carregarPlanoTratamentos(selectedPlanoId);
    }, [selectedPlanoId, clinicaId, tratamentosBase]);

    useEffect(() => {
        if (!possuiPlanoPadrao && opcaoCopia === 'copiar') {
            setOpcaoCopia('vazio');
        }
    }, [possuiPlanoPadrao, opcaoCopia]);

    async function carregarPlanos(planoIdToSelect?: string) {
        if (!clinicaId) return;
        setPlanosLoading(true);
        try {
            const { data, error } = await supabase
                .from('planos')
                .select('id, clinica_id, nome, tipo, ativo')
                .eq('clinica_id', clinicaId)
                .order('nome');
            if (error) throw error;
            setPlanos(data || []);
            if (data && data.length > 0) {
                const novoSelecionado = planoIdToSelect
                    ? planoIdToSelect
                    : (selectedPlanoId && data.some((p) => p.id === selectedPlanoId))
                        ? selectedPlanoId
                        : data[0].id;
                setSelectedPlanoId(novoSelecionado);
            } else {
                setSelectedPlanoId(null);
            }
        } catch (err: any) {
            console.error(err);
            showAlert('Não foi possível carregar os planos.', { type: 'error' });
        } finally {
            setPlanosLoading(false);
        }
    }

    async function carregarEstrutura() {
        if (!clinicaId) return;
        setEstruturaLoading(true);
        try {
            const [espResp, tratResp] = await Promise.all([
                supabase
                    .from('especialidades')
                    .select('*')
                    .eq('clinica_id', clinicaId)
                    .eq('ativo', true)
                    .order('ordem', { ascending: true, nullsFirst: true })
                    .order('nome'),
                supabase
                    .from('tratamentos_base')
                    .select('*')
                    .eq('clinica_id', clinicaId)
                    .eq('ativo', true)
                    .order('nome'),
            ]);
            if (espResp.error) throw espResp.error;
            if (tratResp.error) throw tratResp.error;
            setEspecialidades(espResp.data || []);
            setTratamentosBase(tratResp.data || []);
            if ((espResp.data || []).length > 0) {
                setEspecialidadeAtiva((prev) => (prev === null ? 'all' : prev));
            }
        } catch (err: any) {
            console.error(err);
            showAlert('Erro ao carregar especialidades e tratamentos.', { type: 'error' });
        } finally {
            setEstruturaLoading(false);
        }
    }

    function buildDefaultForm(tratamento: TratamentoBase): PlanoTratamentoForm {
        return {
            valor: tratamento.valor_sugerido ? String(tratamento.valor_sugerido) : '',
            custo: '',
            codigo_tuss: tratamento.codigo_tuss_padrao || '',
            aceita_faces: !!tratamento.aceita_faces,
            ativo: false,
        };
    }

    async function carregarPlanoTratamentos(planoId: string) {
        if (!clinicaId) return;
        setPlanoTratamentosLoading(true);
        try {
            const { data, error } = await supabase
                .from('planos_tratamentos')
                .select('tratamento_id, valor, custo, codigo_tuss, aceita_faces, ativo')
                .eq('plano_id', planoId);
            if (error) throw error;
            const mapa: Record<number, PlanoTratamentoForm> = {};
            const dirtyMap: Record<number, boolean> = {};
            const registros = data || [];
            tratamentosBase.forEach((trat) => {
                const encontrado = registros.find((row) => row.tratamento_id === trat.id);
                mapa[trat.id] = {
                    valor: encontrado?.valor !== null && encontrado?.valor !== undefined ? String(encontrado.valor) : (trat.valor_sugerido ? String(trat.valor_sugerido) : ''),
                    custo: encontrado?.custo !== null && encontrado?.custo !== undefined ? String(encontrado.custo) : '',
                    codigo_tuss: encontrado?.codigo_tuss || trat.codigo_tuss_padrao || '',
                    aceita_faces: encontrado?.aceita_faces ?? !!trat.aceita_faces,
                    ativo: encontrado?.ativo ?? false,
                };
                dirtyMap[trat.id] = false;
            });
            setTratamentoForms(mapa);
            setDirtyTratamentos(dirtyMap);
        } catch (err: any) {
            console.error(err);
            showAlert('Erro ao carregar valores do plano.', { type: 'error' });
        } finally {
            setPlanoTratamentosLoading(false);
        }
    }

    const tratamentosFiltrados = useMemo(() => {
        if (especialidadeAtiva === 'all' || especialidadeAtiva === null) return tratamentosBase;
        return tratamentosBase.filter((t) => t.especialidade_id === especialidadeAtiva);
    }, [tratamentosBase, especialidadeAtiva]);

    const especialidadesComTotal = useMemo(() => {
        return especialidades.map((esp) => ({
            ...esp,
            total: tratamentosBase.filter((t) => t.especialidade_id === esp.id).length,
        }));
    }, [especialidades, tratamentosBase]);

    function updateTratamentoForm(tratamentoId: number, campo: keyof PlanoTratamentoForm, valor: string | boolean) {
        setTratamentoForms((prev) => {
            const atual = prev[tratamentoId] || { valor: '', custo: '', codigo_tuss: '', aceita_faces: false, ativo: false };
            const atualizado = { ...atual, [campo]: valor } as PlanoTratamentoForm;
            return { ...prev, [tratamentoId]: atualizado };
        });
        setDirtyTratamentos((prev) => ({ ...prev, [tratamentoId]: true }));
    }

    async function salvarPlanoTratamento(tratamentoId: number) {
        if (!selectedPlanoId) {
            showAlert('Selecione um plano para editar.', { type: 'warning' });
            return;
        }
        if (!clinicaId) {
            showAlert('Selecione uma clínica específica.', { type: 'warning' });
            return;
        }
        const form = tratamentoForms[tratamentoId];
        if (!form) return;
        setSalvandoTratamentoId(tratamentoId);
        try {
            const payload = {
                plano_id: selectedPlanoId,
                tratamento_id: tratamentoId,
                clinica_id: clinicaId,
                valor: form.valor !== '' ? Number(form.valor) : null,
                custo: form.custo !== '' ? Number(form.custo) : null,
                codigo_tuss: form.codigo_tuss || null,
                aceita_faces: form.aceita_faces,
                ativo: form.ativo,
            };
            const { error } = await supabase
                .from('planos_tratamentos')
                .upsert(payload, { onConflict: 'plano_id,tratamento_id' });
            if (error) throw error;
            setDirtyTratamentos((prev) => ({ ...prev, [tratamentoId]: false }));
            showAlert('Tratamento atualizado!', { type: 'success' });
        } catch (err: any) {
            console.error(err);
            showAlert('Erro ao salvar o tratamento.', { type: 'error' });
        } finally {
            setSalvandoTratamentoId(null);
        }
    }

    async function copiarTratamentosPlanoPadrao(novoPlanoId: string) {
        if (!clinicaId) return;
        const planoPadrao = planos.find((p) => p.tipo === 'particular');
        if (!planoPadrao) return;
        const { data, error } = await supabase
            .from('planos_tratamentos')
            .select('tratamento_id, valor, custo, codigo_tuss, aceita_faces, ativo')
            .eq('plano_id', planoPadrao.id);
        if (error) throw error;
        if (!data || data.length === 0) return;
        const payload = data.map((registro) => ({
            plano_id: novoPlanoId,
            clinica_id: clinicaId,
            tratamento_id: registro.tratamento_id,
            valor: registro.valor,
            custo: registro.custo,
            codigo_tuss: registro.codigo_tuss,
            aceita_faces: registro.aceita_faces,
            ativo: registro.ativo,
        }));
        if (payload.length > 0) {
            const { error: insertError } = await supabase.from('planos_tratamentos').insert(payload);
            if (insertError) throw insertError;
        }
    }

    async function handleCriarPlano(e: FormEvent) {
        e.preventDefault();
        if (!clinicaId) {
            showAlert('Selecione uma clínica específica para criar planos.', { type: 'warning' });
            return;
        }
        const nome = novoPlanoNome.trim();
        if (!nome) {
            showAlert('Informe o nome do plano.', { type: 'warning' });
            return;
        }
        setCriandoPlano(true);
        try {
            const { data, error } = await supabase
                .from('planos')
                .insert({ nome, clinica_id: clinicaId, tipo: 'convenio', ativo: true })
                .select()
                .single();
            if (error) throw error;
            if (opcaoCopia === 'copiar') {
                try {
                    await copiarTratamentosPlanoPadrao(data.id);
                } catch (copyErr: any) {
                    console.error(copyErr);
                    showAlert('Plano criado, porém não foi possível copiar os valores do plano padrão.', { type: 'warning' });
                }
            }
            setModalPlanoAberto(false);
            setNovoPlanoNome('');
            setOpcaoCopia('copiar');
            await carregarPlanos(data.id);
            showAlert('Plano criado com sucesso!', { type: 'success' });
        } catch (err: any) {
            console.error(err);
            showAlert('Erro ao criar o plano.', { type: 'error' });
        } finally {
            setCriandoPlano(false);
        }
    }

    if (!clinicaId) {
        return (
            <div className="p-10 max-w-3xl mx-auto">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
                    <AlertTriangle className="text-amber-500 mx-auto mb-3" size={36} />
                    <h2 className="text-xl font-bold text-amber-900">Selecione uma clínica</h2>
                    <p className="text-sm text-amber-700 mt-1">Escolha uma clínica específica para gerenciar planos e tabela TUSS.</p>
                </div>
            </div>
        );
    }

    const carregando = planosLoading || estruturaLoading || (selectedPlanoId !== null && planoTratamentosLoading);

    return (
        <div className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto space-y-6">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-blue-500">
                        <Layers3 size={14} /> Fase 4 · Planos e TUSS
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800">Gestão de Planos</h1>
                    <p className="text-sm text-slate-500">Configure os valores de cada tratamento por plano ou convênio.</p>
                </div>
                <button
                    onClick={() => setModalPlanoAberto(true)}
                    className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 text-sm"
                >
                    <Plus size={16} /> Novo Plano
                </button>
            </header>

            {planosLoading && planos.length === 0 ? (
                <div className="flex items-center gap-2 text-blue-600 text-sm">
                    <Loader2 className="animate-spin" size={18} /> Carregando planos...
                </div>
            ) : planos.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 text-center">
                    <p className="text-sm text-slate-500">Nenhum plano cadastrado para esta clínica ainda.</p>
                    <button
                        onClick={() => setModalPlanoAberto(true)}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold"
                    >
                        <Plus size={14} /> Criar primeiro plano
                    </button>
                </div>
            ) : (
                <div className="flex flex-wrap gap-3">
                    {planos.map((plano) => {
                        const ativo = plano.id === selectedPlanoId;
                        return (
                            <button
                                key={plano.id}
                                onClick={() => setSelectedPlanoId(plano.id)}
                                className={`px-4 py-3 rounded-2xl border text-left transition-all ${ativo ? 'border-blue-500 bg-blue-50 shadow-sm text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'}`}
                            >
                                <p className="text-sm font-bold">{plano.nome}</p>
                                <p className={`text-[10px] uppercase font-black tracking-wider ${ativo ? 'text-blue-500' : 'text-slate-400'}`}>
                                    {plano.tipo === 'particular' ? 'Plano padrão' : 'Convênio'}
                                </p>
                            </button>
                        );
                    })}
                </div>
            )}

            {carregando && planos.length > 0 && (
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Loader2 size={18} className="animate-spin" />
                    Sincronizando dados do plano...
                </div>
            )}

            {!carregando && planos.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-[240px,1fr] gap-6">
                    <aside className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm">
                        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-3">Especialidades</p>
                        <button
                            onClick={() => setEspecialidadeAtiva('all')}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl text-sm font-bold mb-1 border ${especialidadeAtiva === 'all' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300'}`}
                        >
                            <span>Todas</span>
                            <span className="text-[11px] font-black text-slate-400">{tratamentosBase.length}</span>
                        </button>
                        {especialidadesComTotal.map((esp) => (
                            <button
                                key={esp.id}
                                onClick={() => setEspecialidadeAtiva(esp.id)}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl text-sm font-bold mb-1 border ${especialidadeAtiva === esp.id ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300'}`}
                            >
                                <span className="truncate">{esp.nome}</span>
                                <span className="text-[11px] font-black text-slate-400">{esp.total}</span>
                            </button>
                        ))}
                    </aside>
                    <section className="space-y-4">
                        {tratamentosFiltrados.length === 0 ? (
                            <div className="bg-white border border-dashed border-slate-200 rounded-3xl p-12 text-center text-sm text-slate-500">
                                Nenhum tratamento cadastrado para esta especialidade.
                            </div>
                        ) : (
                            tratamentosFiltrados.map((tratamento) => {
                                const form = tratamentoForms[tratamento.id] || buildDefaultForm(tratamento);
                                const dirty = dirtyTratamentos[tratamento.id];
                                const salvando = salvandoTratamentoId === tratamento.id;
                                return (
                                    <div key={tratamento.id} className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div>
                                                <p className="text-base font-bold text-slate-800">{tratamento.nome}</p>
                                                <p className="text-xs text-slate-500">
                                                    {tratamento.descricao || 'Procedimento do catálogo da clínica.'}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateTratamentoForm(tratamento.id, 'ativo', !form.ativo)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide border ${form.ativo ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-400'}`}
                                            >
                                                {form.ativo ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                                {form.ativo ? 'Usando' : 'Não usar'}
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Valor</label>
                                                <div className="relative mt-1">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                                                        <DollarSign size={14} />
                                                    </span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={form.valor}
                                                        onChange={(e) => updateTratamentoForm(tratamento.id, 'valor', e.target.value)}
                                                        className="w-full pl-8 pr-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                                                        placeholder={tratamento.valor_sugerido ? `Sug.: R$ ${tratamento.valor_sugerido.toFixed(2)}` : '0,00'}
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Custo</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={form.custo}
                                                    onChange={(e) => updateTratamentoForm(tratamento.id, 'custo', e.target.value)}
                                                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                                                    placeholder="0,00"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Código TUSS</label>
                                                <input
                                                    value={form.codigo_tuss}
                                                    onChange={(e) => updateTratamentoForm(tratamento.id, 'codigo_tuss', e.target.value)}
                                                    className="w-full px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                                                    placeholder={tratamento.codigo_tuss_padrao || 'Ex.: 30101012'}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-3 justify-between">
                                            <button
                                                type="button"
                                                onClick={() => updateTratamentoForm(tratamento.id, 'aceita_faces', !form.aceita_faces)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide border ${form.aceita_faces ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-500'}`}
                                            >
                                                {form.aceita_faces ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                                Aceita faces
                                            </button>
                                            <button
                                                type="button"
                                                disabled={!dirty || salvando}
                                                onClick={() => salvarPlanoTratamento(tratamento.id)}
                                                className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold text-white bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400"
                                            >
                                                {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                                Salvar
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </section>
                </div>
            )}

            {modalPlanoAberto && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-lg rounded-3xl border border-slate-100 shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100">
                            <h2 className="text-lg font-bold text-slate-800">Novo plano</h2>
                            <p className="text-xs text-slate-500">Cadastre convênios ou planos particulares alternativos.</p>
                        </div>
                        <form onSubmit={handleCriarPlano} className="p-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nome do plano</label>
                                <input
                                    value={novoPlanoNome}
                                    onChange={(e) => setNovoPlanoNome(e.target.value)}
                                    className="w-full mt-1 px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Ex.: Amil Dental, SulAmérica, Uniodonto..."
                                />
                            </div>
                            <div className="space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tratamentos iniciais</p>
                                <label className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer ${opcaoCopia === 'copiar' ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                                    <input
                                        type="radio"
                                        name="opcaoCopiar"
                                        checked={opcaoCopia === 'copiar'}
                                        onChange={() => setOpcaoCopia('copiar')}
                                        className="mt-1"
                                        disabled={!possuiPlanoPadrao}
                                    />
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">Copiar tratamentos do plano padrão</p>
                                        <p className="text-xs text-slate-500">Replica valores atuais do plano Particular.</p>
                                        {!possuiPlanoPadrao && (
                                            <p className="text-[10px] text-amber-600">Nenhum plano padrão encontrado.</p>
                                        )}
                                    </div>
                                </label>
                                <label className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer ${opcaoCopia === 'vazio' ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                                    <input
                                        type="radio"
                                        name="opcaoCopiar"
                                        checked={opcaoCopia === 'vazio'}
                                        onChange={() => setOpcaoCopia('vazio')}
                                        className="mt-1"
                                    />
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">Não copiar (plano vazio)</p>
                                        <p className="text-xs text-slate-500">Você preencherá os valores manualmente.</p>
                                    </div>
                                </label>
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setModalPlanoAberto(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
                                <button
                                    type="submit"
                                    disabled={criandoPlano || !novoPlanoNome.trim()}
                                    className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {criandoPlano ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                    Criar plano
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
