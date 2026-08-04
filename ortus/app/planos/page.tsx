'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useClinica } from '@/app/context/ClinicaContext';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import Modal from '@/components/ui/Modal';
import {
    Loader2,
    Plus,
    Layers3,
    AlertTriangle,
    Check,
    Download,
    FileText,
    Pencil,
    Trash2,
} from 'lucide-react';

interface Plano {
    id: string;
    clinica_id: number;
    nome: string;
    tipo: string;
    ativo: boolean;
    observacoes?: string | null;
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
    const [novoPlanoObservacoes, setNovoPlanoObservacoes] = useState('');
    const [criarPlanoVazio, setCriarPlanoVazio] = useState(false);
    const [criandoPlano, setCriandoPlano] = useState(false);
    const [editandoPlano, setEditandoPlano] = useState<Plano | null>(null);

    function abrirModalNovoPlano() {
        setNovoPlanoNome('');
        setNovoPlanoObservacoes('');
        setCriarPlanoVazio(false);
        setEditandoPlano(null);
        setModalPlanoAberto(true);
    }

    function abrirModalEditarPlano(plano: Plano) {
        if (plano.tipo === 'particular') return;
        setEditandoPlano(plano);
        setNovoPlanoNome(plano.nome);
        setNovoPlanoObservacoes(plano.observacoes || '');
        setModalPlanoAberto(true);
    }

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
        if (!clinicaId || tratamentosBase.length === 0) return;
        garantirPlanoParticular();
    }, [clinicaId, tratamentosBase]);

    useEffect(() => {
        if (!selectedPlanoId || !clinicaId || tratamentosBase.length === 0) return;
        carregarPlanoTratamentos(selectedPlanoId);
    }, [selectedPlanoId, clinicaId, tratamentosBase]);

    async function garantirPlanoParticular() {
        if (!clinicaId || tratamentosBase.length === 0) return;
        try {
            const { data: existente, error: errBusca } = await supabase
                .from('planos')
                .select('id')
                .eq('clinica_id', clinicaId)
                .eq('tipo', 'particular')
                .limit(1)
                .maybeSingle();
            if (errBusca) throw errBusca;

            let planoId = existente?.id;
            if (!planoId) {
                const { data, error } = await supabase
                    .from('planos')
                    .insert({
                        nome: 'Particular',
                        clinica_id: clinicaId,
                        tipo: 'particular',
                        ativo: true,
                    })
                    .select('id')
                    .single();
                if (error) throw error;
                planoId = data.id;
                await carregarPlanos(data.id);
            }

            const { data: registros, error: errExist } = await supabase
                .from('planos_tratamentos')
                .select('tratamento_id, ativo')
                .eq('plano_id', planoId);
            if (errExist) throw errExist;

            const mapaAtivo = new Map((registros || []).map((r) => [r.tratamento_id, r.ativo]));
            const payloads = tratamentosBase
                .filter((t) => !mapaAtivo.has(t.id) || !mapaAtivo.get(t.id))
                .map((t) => ({
                    plano_id: planoId,
                    clinica_id: clinicaId,
                    tratamento_id: t.id,
                    valor: t.valor_sugerido,
                    custo: null,
                    codigo_tuss: t.codigo_tuss_padrao,
                    aceita_faces: t.aceita_faces,
                    ativo: true,
                }));

            if (payloads.length > 0) {
                const { error: upsertErr } = await supabase
                    .from('planos_tratamentos')
                    .upsert(payloads, { onConflict: 'plano_id,tratamento_id' });
                if (upsertErr) throw upsertErr;
                if (selectedPlanoId === planoId) {
                    await carregarPlanoTratamentos(planoId);
                }
            }
        } catch (err) {
            console.error(err);
        }
    }

    async function carregarPlanos(planoIdToSelect?: string) {
        if (!clinicaId) return;
        setPlanosLoading(true);
        try {
            const { data, error } = await supabase
                .from('planos')
                .select('id, clinica_id, nome, tipo, ativo, observacoes')
                .eq('clinica_id', clinicaId)
                .order('nome');
            if (error) throw error;
            const ordenados = (data || []).slice().sort((a, b) => {
                if (a.tipo === 'particular' && b.tipo !== 'particular') return -1;
                if (b.tipo === 'particular' && a.tipo !== 'particular') return 1;
                return a.nome.localeCompare(b.nome);
            });
            setPlanos(ordenados);
            if (ordenados.length > 0) {
                const novoSelecionado = planoIdToSelect
                    ? planoIdToSelect
                    : (selectedPlanoId && ordenados.some((p) => p.id === selectedPlanoId))
                        ? selectedPlanoId
                        : ordenados.find((p) => p.tipo === 'particular')?.id || ordenados[0].id;
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

    function exportarPlanoCsv() {
        if (!selectedPlanoId) return;
        const header = ['Especialidade','Tratamento','Valor','Custo','Código TUSS','Aceita faces','Ativo'];
        const espNomePorId: Record<string, string> = {};
        especialidades.forEach(e => { espNomePorId[e.id] = e.nome; });
        const rows = tratamentosBase.map((t) => {
            const f = tratamentoForms[t.id] || buildDefaultForm(t);
            const esp = t.especialidade_id ? (espNomePorId[t.especialidade_id] || '-') : '-';
            return [
                esp,
                t.nome,
                f.valor || '',
                f.custo || '',
                f.codigo_tuss || '',
                f.aceita_faces ? 'sim' : 'não',
                f.ativo ? 'sim' : 'não',
            ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });
        const bom = '\uFEFF';
        const csv = bom + header.join(',') + '\n' + rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tabela_plano_${selectedPlanoId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
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
                setEspecialidadeAtiva((prev) => (prev === 'all' || prev === null ? espResp.data![0].id : prev));
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
            if (editandoPlano) {
                const { error } = await supabase.from('planos').update({
                    nome,
                    observacoes: novoPlanoObservacoes.trim() || null,
                }).eq('id', editandoPlano.id);
                if (error) throw error;
                setModalPlanoAberto(false);
                setEditandoPlano(null);
                await carregarPlanos(editandoPlano.id);
                showAlert('Plano atualizado!', { type: 'success' });
                return;
            }

            const { data, error } = await supabase
                .from('planos')
                .insert({
                    nome,
                    clinica_id: clinicaId,
                    tipo: 'convenio',
                    ativo: true,
                    observacoes: novoPlanoObservacoes.trim() || null,
                })
                .select()
                .single();
            if (error) throw error;

            if (!criarPlanoVazio && tratamentosBase.length > 0) {
                const payloads = tratamentosBase.map((t) => ({
                    plano_id: data.id,
                    clinica_id: clinicaId,
                    tratamento_id: t.id,
                    valor: t.valor_sugerido,
                    custo: null,
                    codigo_tuss: t.codigo_tuss_padrao,
                    aceita_faces: t.aceita_faces,
                    ativo: true,
                }));
                const { error: upsertErr } = await supabase
                    .from('planos_tratamentos')
                    .upsert(payloads, { onConflict: 'plano_id,tratamento_id' });
                if (upsertErr) throw upsertErr;
            }

            setModalPlanoAberto(false);
            setNovoPlanoNome('');
            setNovoPlanoObservacoes('');
            setCriarPlanoVazio(false);
            await carregarPlanos(data.id);
            showAlert('Plano criado com sucesso!', { type: 'success' });
        } catch (err: any) {
            console.error(err);
            showAlert('Erro ao salvar plano: ' + (err.message || err), { type: 'error' });
        } finally {
            setCriandoPlano(false);
        }
    }

    async function excluirPlano(plano: Plano) {
        if (plano.tipo === 'particular') {
            showAlert('O plano Particular não pode ser excluído.', { type: 'warning' });
            return;
        }
        if (!window.confirm(`Excluir o plano "${plano.nome}"?`)) return;
        try {
            await supabase.from('planos_tratamentos').delete().eq('plano_id', plano.id);
            const { error } = await supabase.from('planos').delete().eq('id', plano.id);
            if (error) throw error;
            await carregarPlanos();
            showAlert('Plano excluído.', { type: 'success' });
        } catch (err: any) {
            showAlert('Erro ao excluir: ' + (err.message || err), { type: 'error' });
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
        <div className="p-4 sm:p-6 md:p-10 max-w-6xl mx-auto space-y-5">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-blue-500">
                        <Layers3 size={14} /> Planos e TUSS
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800">Gestão de Planos</h1>
                    <p className="text-sm text-slate-500">Configure os valores de cada tratamento por plano.</p>
                </div>
                <div className="flex items-center gap-2">
                    {selectedPlanoId && (
                        <button
                            onClick={() => exportarPlanoCsv()}
                            className="touch-target inline-flex items-center justify-center gap-2 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm"
                        >
                            <Download size={14} /> Exportar
                        </button>
                    )}
                    <button
                        onClick={abrirModalNovoPlano}
                        className="touch-target flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 text-sm"
                    >
                        <Plus size={16} /> Novo Plano
                    </button>
                </div>
            </header>

            {planosLoading && planos.length === 0 ? (
                <div className="flex items-center gap-2 text-blue-600 text-sm">
                    <Loader2 className="animate-spin" size={18} /> Carregando planos...
                </div>
            ) : planos.length === 0 ? (
                <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-8 text-center">
                    <p className="text-sm text-slate-500">Nenhum plano cadastrado para esta clínica ainda.</p>
                    <button
                        onClick={abrirModalNovoPlano}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold"
                    >
                        <Plus size={14} /> Criar primeiro plano
                    </button>
                </div>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {planos.map((plano) => {
                        const ativo = plano.id === selectedPlanoId;
                        return (
                            <div key={plano.id} className={`inline-flex items-center gap-1 rounded-xl border transition-all ${ativo ? 'chip-ortus-active shadow-sm' : 'border-slate-200 bg-white hover:border-ortus-accent'}`}>
                                <button
                                    onClick={() => setSelectedPlanoId(plano.id)}
                                    className={`touch-target inline-flex items-center gap-2 px-3 py-2 text-sm ${ativo ? '' : 'text-slate-600'}`}
                                >
                                    <span className="font-bold">{plano.nome}</span>
                                    <span className={`text-[9px] uppercase font-black tracking-wider px-1.5 py-0.5 rounded ${ativo ? 'bg-ortus-accent-muted text-ortus-accent-muted' : 'bg-slate-100 text-slate-400'}`}>
                                        {plano.tipo === 'particular' ? 'Padrão' : 'Plano'}
                                    </span>
                                </button>
                                {plano.tipo !== 'particular' && (
                                    <>
                                        <button type="button" onClick={() => abrirModalEditarPlano(plano)} className="p-1.5 text-slate-400 hover:text-blue-600" title="Editar"><Pencil size={14}/></button>
                                        <button type="button" onClick={() => excluirPlano(plano)} className="p-1.5 pr-2 text-slate-400 hover:text-rose-600" title="Excluir"><Trash2 size={14}/></button>
                                    </>
                                )}
                            </div>
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
                <div className="grid grid-cols-1 md:grid-cols-[220px,1fr] gap-4">
                    <aside className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 px-1">Especialidades</p>
                        <button
                            onClick={() => setEspecialidadeAtiva('all')}
                            className={`touch-target w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold mb-1 border ${especialidadeAtiva === 'all' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300'}`}
                        >
                            <span>Todas</span>
                            <span className="text-[10px] font-black text-slate-400">{tratamentosBase.length}</span>
                        </button>
                        {especialidadesComTotal.map((esp) => (
                            <button
                                key={esp.id}
                                onClick={() => setEspecialidadeAtiva(esp.id)}
                                className={`touch-target w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold mb-1 border ${especialidadeAtiva === esp.id ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300'}`}
                            >
                                <span className="truncate">{esp.nome}</span>
                                <span className="text-[10px] font-black text-slate-400">{esp.total}</span>
                            </button>
                        ))}
                    </aside>
                    <section className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                        {tratamentosFiltrados.length === 0 ? (
                            <div className="p-8 text-center text-sm text-slate-500">
                                Nenhum tratamento cadastrado para esta especialidade.
                            </div>
                        ) : (
                            <>
                                <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.4fr)_88px_72px_72px_52px_52px_36px] gap-1 px-2 py-1.5 bg-slate-50 border-b border-slate-100 text-[9px] font-black uppercase tracking-wider text-slate-400">
                                    <span>Tratamento</span>
                                    <span>Valor</span>
                                    <span>Custo</span>
                                    <span>TUSS</span>
                                    <span className="text-center">Faces</span>
                                    <span className="text-center">Ativo</span>
                                    <span />
                                </div>
                                <div className="divide-y divide-slate-100 max-h-[calc(100vh-320px)] overflow-y-auto">
                                {tratamentosFiltrados.map((tratamento) => {
                                const form = tratamentoForms[tratamento.id] || buildDefaultForm(tratamento);
                                const dirty = dirtyTratamentos[tratamento.id];
                                const salvando = salvandoTratamentoId === tratamento.id;
                                return (
                                    <div key={tratamento.id} className={`grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_88px_72px_72px_52px_52px_36px] gap-1 sm:gap-1 items-center px-2 py-1.5 ${dirty ? 'bg-amber-50/40' : 'hover:bg-slate-50/80'}`}>
                                        <div className="min-w-0 pr-1">
                                            <p className="text-xs font-bold text-slate-800 truncate">{tratamento.nome}</p>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={form.valor}
                                                onChange={(e) => updateTratamentoForm(tratamento.id, 'valor', e.target.value)}
                                                className="w-full px-1.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700 focus:bg-white focus:border-blue-300"
                                                placeholder="0"
                                            />
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={form.custo}
                                            onChange={(e) => updateTratamentoForm(tratamento.id, 'custo', e.target.value)}
                                            className="w-full px-1.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700 focus:bg-white focus:border-blue-300"
                                            placeholder="0"
                                        />
                                        <input
                                            value={form.codigo_tuss}
                                            onChange={(e) => updateTratamentoForm(tratamento.id, 'codigo_tuss', e.target.value)}
                                            className="w-full px-1.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700 focus:bg-white focus:border-blue-300"
                                            placeholder="—"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => updateTratamentoForm(tratamento.id, 'aceita_faces', !form.aceita_faces)}
                                            className={`py-1 rounded-lg text-[9px] font-black uppercase border ${form.aceita_faces ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-400'}`}
                                        >
                                            {form.aceita_faces ? 'Sim' : 'Não'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateTratamentoForm(tratamento.id, 'ativo', !form.ativo)}
                                            className={`py-1 rounded-lg text-[9px] font-black uppercase border ${form.ativo ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-400'}`}
                                        >
                                            {form.ativo ? 'Sim' : 'Não'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!dirty || salvando}
                                            onClick={() => salvarPlanoTratamento(tratamento.id)}
                                            className="flex items-center justify-center p-1 rounded-lg text-white bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400"
                                            title="Salvar"
                                        >
                                            {salvando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                        </button>
                                    </div>
                                );
                            })}
                                </div>
                            </>
                        )}
                    </section>
                </div>
            )}

            <Modal open={modalPlanoAberto} onClose={() => setModalPlanoAberto(false)} maxWidth="lg" hideCloseButton>
                <div className="bg-white w-full rounded-3xl border border-slate-100 shadow-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                        <h2 className="text-lg font-bold text-slate-800">{editandoPlano ? 'Editar plano' : 'Novo plano'}</h2>
                        <p className="text-xs text-slate-500">{editandoPlano ? 'Altere nome e observações do plano.' : 'Por padrão, todos os tratamentos entram ativos no plano.'}</p>
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
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1"><FileText size={12}/> Observações</label>
                            <textarea
                                value={novoPlanoObservacoes}
                                onChange={(e) => setNovoPlanoObservacoes(e.target.value)}
                                rows={2}
                                className="w-full mt-1 px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 resize-none"
                                placeholder="Notas sobre cobertura, TUSS, glosas..."
                            />
                        </div>
                        {!editandoPlano && (
                            <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                                <input type="checkbox" checked={criarPlanoVazio} onChange={(e) => setCriarPlanoVazio(e.target.checked)} className="rounded text-blue-600"/>
                                <span className="text-xs font-bold text-slate-600">Criar plano vazio (sem tratamentos ativos)</span>
                            </label>
                        )}
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button type="button" onClick={() => { setModalPlanoAberto(false); setEditandoPlano(null); }} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
                            <button
                                type="submit"
                                disabled={criandoPlano || !novoPlanoNome.trim()}
                                className="btn-ortus-primary px-5 py-2 text-sm disabled:opacity-50 flex items-center gap-2"
                            >
                                {criandoPlano ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                {editandoPlano ? 'Salvar alterações' : criarPlanoVazio ? 'Criar plano vazio' : 'Criar plano'}
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>
        </div>
    );
}
