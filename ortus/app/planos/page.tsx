'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useClinica } from '@/app/context/ClinicaContext';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import Modal from '@/components/ui/Modal';
import CustomSelect from '@/components/ui/CustomSelect';
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
    X,
} from 'lucide-react';
import BentoPageShell from '@/components/bento/BentoPageShell';
import { bentoCard, bentoChip, bentoChipOutline, bentoPrimaryBtn, bentoGhostBtn, bentoInput, bentoModalPanel } from '@/lib/bentoUi';

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
    custo_padrao?: number | null;
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

export function PlanosContent({ embedded = false }: { embedded?: boolean }) {
    const { activeClinicId } = useClinica();
    const { showAlert, showConfirm } = useCustomAlert();

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
    const [modalEspAberto, setModalEspAberto] = useState(false);
    const [espEditando, setEspEditando] = useState<Especialidade | null>(null);
    const [espNome, setEspNome] = useState('');
    const [salvandoEsp, setSalvandoEsp] = useState(false);
    const [modalTratAberto, setModalTratAberto] = useState(false);
    const [tratEditando, setTratEditando] = useState<TratamentoBase | null>(null);
    const [tratForm, setTratForm] = useState({ nome: '', especialidade_id: '', valor: '', custo: '', tuss: '', aceita_faces: false });
    const [salvandoTrat, setSalvandoTrat] = useState(false);

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

    function abrirNovaEspecialidade() {
        setEspEditando(null);
        setEspNome('');
        setModalEspAberto(true);
    }

    function abrirEditarEspecialidade(esp: Especialidade) {
        setEspEditando(esp);
        setEspNome(esp.nome);
        setModalEspAberto(true);
    }

    async function salvarEspecialidade(e: FormEvent) {
        e.preventDefault();
        if (!clinicaId) return;
        const nome = espNome.trim();
        if (!nome) { showAlert('Informe o nome da especialidade.', { type: 'warning' }); return; }
        setSalvandoEsp(true);
        try {
            if (espEditando) {
                const { error } = await supabase.from('especialidades').update({ nome }).eq('id', espEditando.id).eq('clinica_id', clinicaId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('especialidades').insert({ nome, clinica_id: clinicaId, ativo: true });
                if (error) throw error;
            }
            setModalEspAberto(false);
            await carregarEstrutura();
        } catch (err: any) {
            showAlert('Erro ao salvar a especialidade: ' + (err.message || err), { type: 'error' });
        } finally {
            setSalvandoEsp(false);
        }
    }

    async function excluirEspecialidade(esp: Especialidade) {
        if (!clinicaId) return;
        if (!(await showConfirm(`Excluir a especialidade "${esp.nome}"?`, { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
        const { error } = await supabase.from('especialidades').delete().eq('id', esp.id).eq('clinica_id', clinicaId);
        if (error) { showAlert('Não foi possível excluir: ' + error.message, { type: 'error' }); return; }
        if (especialidadeAtiva === esp.id) setEspecialidadeAtiva('all');
        await carregarEstrutura();
    }

    function abrirNovoTratamento() {
        const espId = especialidadeAtiva && especialidadeAtiva !== 'all' ? especialidadeAtiva : (especialidades[0]?.id || '');
        setTratEditando(null);
        setTratForm({ nome: '', especialidade_id: espId, valor: '', custo: '', tuss: '', aceita_faces: false });
        setModalTratAberto(true);
    }

    function abrirEditarTratamento(trat: TratamentoBase) {
        setTratEditando(trat);
        setTratForm({
            nome: trat.nome,
            especialidade_id: trat.especialidade_id || '',
            valor: trat.valor_sugerido != null ? String(trat.valor_sugerido) : '',
            custo: trat.custo_padrao != null ? String(trat.custo_padrao) : '',
            tuss: trat.codigo_tuss_padrao || '',
            aceita_faces: !!trat.aceita_faces,
        });
        setModalTratAberto(true);
    }

    async function salvarTratamento(e: FormEvent) {
        e.preventDefault();
        if (!clinicaId) return;
        const nome = tratForm.nome.trim();
        if (!nome || !tratForm.especialidade_id) { showAlert('Informe o nome e a especialidade.', { type: 'warning' }); return; }
        const valor = tratForm.valor.trim() ? Number(tratForm.valor.replace(',', '.')) : null;
        const custo = tratForm.custo.trim() ? Number(tratForm.custo.replace(',', '.')) : null;
        setSalvandoTrat(true);
        try {
            const payload = {
                nome,
                especialidade_id: tratForm.especialidade_id,
                valor_sugerido: Number.isFinite(valor as number) ? valor : null,
                custo_padrao: Number.isFinite(custo as number) ? custo : null,
                codigo_tuss_padrao: tratForm.tuss.trim() || null,
                aceita_faces: tratForm.aceita_faces,
            };
            if (tratEditando) {
                const { error } = await supabase.from('tratamentos_base').update(payload).eq('id', tratEditando.id).eq('clinica_id', clinicaId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('tratamentos_base').insert({ ...payload, clinica_id: clinicaId, ativo: true });
                if (error) throw error;
            }
            setModalTratAberto(false);
            await carregarEstrutura();
        } catch (err: any) {
            showAlert('Erro ao salvar o tratamento: ' + (err.message || err), { type: 'error' });
        } finally {
            setSalvandoTrat(false);
        }
    }

    async function excluirTratamento(trat: TratamentoBase) {
        if (!clinicaId) return;
        if (!(await showConfirm(`Excluir o tratamento "${trat.nome}"?`, { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
        const { error } = await supabase.from('tratamentos_base').delete().eq('id', trat.id).eq('clinica_id', clinicaId);
        if (error) { showAlert('Não foi possível excluir: ' + error.message, { type: 'error' }); return; }
        await carregarEstrutura();
    }

    async function excluirPlano(plano: Plano) {
        if (plano.tipo === 'particular') {
            showAlert('O plano Particular não pode ser excluído.', { type: 'warning' });
            return;
        }
        if (!(await showConfirm(`Excluir o plano "${plano.nome}"?`, { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
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

    const headerActions = (
        <div className="flex flex-wrap items-center gap-2">
            {selectedPlanoId ? (
                <button type="button" onClick={() => exportarPlanoCsv()} className={bentoGhostBtn}>
                    <Download size={14} /> Exportar
                </button>
            ) : null}
            <button type="button" onClick={abrirModalNovoPlano} className={bentoPrimaryBtn}>
                <Plus size={16} /> Novo Plano
            </button>
        </div>
    );

    if (!clinicaId) {
        const empty = (
            <div className={`${bentoCard} border border-amber-200/80 bg-amber-50 p-6 text-center sm:p-8`}>
                <AlertTriangle className="mx-auto mb-3 text-amber-500" size={36} />
                <h2 className="text-lg font-semibold text-amber-900 sm:text-xl">Selecione uma clínica</h2>
                <p className="mt-1 text-sm text-amber-800">Escolha uma clínica específica para gerenciar planos e tabela TUSS.</p>
            </div>
        );
        if (embedded) return empty;
        return (
            <BentoPageShell title="Gestão de Planos" subtitle="Valores de tratamento por plano e TUSS">
                {empty}
            </BentoPageShell>
        );
    }

    const carregando = planosLoading || estruturaLoading || (selectedPlanoId !== null && planoTratamentosLoading);

    const content = (
        <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden">

            {planosLoading && planos.length === 0 ? (
                <div className="space-y-3">
                    <div className="h-11 w-full max-w-md animate-pulse rounded-full bg-neutral-200" />
                    <div className="h-52 animate-pulse rounded-[1.35rem] bg-neutral-100" />
                </div>
            ) : planos.length === 0 ? (
                <div className={`${bentoCard} border border-dashed border-black/15 p-8 text-center`}>
                    <p className="text-sm text-neutral-500">Nenhum plano cadastrado para esta clínica ainda.</p>
                    <button
                        onClick={abrirModalNovoPlano}
                        className={`${bentoPrimaryBtn} mt-4 text-sm`}
                    >
                        <Plus size={14} /> Criar primeiro plano
                    </button>
                </div>
            ) : (
                <div className="flex shrink-0 items-center gap-2">
                    <div className="w-64 shrink-0">
                        <CustomSelect value={selectedPlanoId || ''} onChange={setSelectedPlanoId} options={planos.map((plano) => ({ value: plano.id, label: plano.nome }))} size="md" />
                    </div>
                    {(() => {
                        const planoSel = planos.find((plano) => plano.id === selectedPlanoId);
                        if (!planoSel || planoSel.tipo === 'particular') return null;
                        return (
                            <>
                                <button type="button" onClick={() => abrirModalEditarPlano(planoSel)} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50" title="Editar plano"><Pencil size={15}/></button>
                                <button type="button" onClick={() => excluirPlano(planoSel)} className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:text-rose-600" title="Excluir plano"><Trash2 size={15}/></button>
                            </>
                        );
                    })()}
                    <button type="button" onClick={abrirModalNovoPlano} className="ml-auto inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"><Plus size={14}/> Novo</button>
                </div>
            )}

            {carregando && planos.length > 0 && (
                <div className="flex items-center gap-2 text-neutral-500 text-sm">
                    <Loader2 size={18} className="animate-spin" />
                    Sincronizando dados do plano...
                </div>
            )}

            {!carregando && planos.length > 0 && (
                <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
                    <aside className="flex min-h-[12rem] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white md:min-h-0">
                        <div className="flex items-center justify-between border-b border-black/5 px-3 py-2.5">
                            <h3 className="text-sm font-semibold text-neutral-900">Especialidades</h3>
                            <button type="button" onClick={abrirNovaEspecialidade} className="inline-flex h-8 items-center gap-1 rounded-md bg-neutral-900 px-2.5 text-xs font-medium text-white hover:bg-neutral-800"><Plus size={13}/> Novo</button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                        <button
                            onClick={() => setEspecialidadeAtiva('all')}
                            className={`mb-1 flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm font-medium ${especialidadeAtiva === 'all' ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-50'}`}
                        >
                            <span>Todas</span>
                            <span className={especialidadeAtiva === 'all' ? 'text-white/70' : 'text-neutral-400'}>{tratamentosBase.length}</span>
                        </button>
                        {especialidadesComTotal.map((esp) => (
                            <div key={esp.id} className={`mb-1 flex items-center gap-1 rounded-md px-2 py-1.5 ${especialidadeAtiva === esp.id ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-50'}`}>
                                <button type="button" onClick={() => setEspecialidadeAtiva(esp.id)} className="flex min-w-0 flex-1 items-center justify-between text-left text-sm font-medium">
                                    <span className="truncate">{esp.nome}</span>
                                    <span className={`ml-2 ${especialidadeAtiva === esp.id ? 'text-white/70' : 'text-neutral-400'}`}>{esp.total}</span>
                                </button>
                                <button type="button" onClick={() => abrirEditarEspecialidade(esp)} className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${especialidadeAtiva === esp.id ? 'text-white/80 hover:bg-white/10' : 'text-neutral-400 hover:bg-white'}`} title="Editar"><Pencil size={13}/></button>
                                <button type="button" onClick={() => excluirEspecialidade(esp)} className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${especialidadeAtiva === esp.id ? 'text-white/80 hover:bg-white/10' : 'text-neutral-400 hover:bg-white hover:text-rose-600'}`} title="Excluir"><Trash2 size={13}/></button>
                            </div>
                        ))}
                        </div>
                    </aside>
                    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                        <div className="flex items-center justify-between border-b border-black/5 px-3 py-2.5">
                            <h3 className="text-sm font-semibold text-neutral-900">Tratamentos</h3>
                            <button type="button" onClick={abrirNovoTratamento} className="inline-flex h-8 items-center gap-1 rounded-md bg-neutral-900 px-2.5 text-xs font-medium text-white hover:bg-neutral-800"><Plus size={13}/> Novo</button>
                        </div>
                        {tratamentosFiltrados.length === 0 ? (
                            <div className="p-8 text-center text-sm text-neutral-500">
                                Nenhum tratamento cadastrado para esta especialidade.
                            </div>
                        ) : (
                            <>
                                <div className="hidden shrink-0 sm:grid sm:grid-cols-[minmax(0,1.4fr)_88px_72px_72px_52px_52px_28px_28px_28px] gap-1 border-b border-neutral-100 bg-neutral-50 px-2 py-1.5 text-[11px] font-medium text-neutral-500">
                                    <span>Tratamento</span>
                                    <span>Valor</span>
                                    <span>Custo</span>
                                    <span>TUSS</span>
                                    <span className="text-center">Faces</span>
                                    <span className="text-center">Ativo</span>
                                    <span />
                                    <span />
                                    <span />
                                </div>
                                <div className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto">
                                {tratamentosFiltrados.map((tratamento) => {
                                const form = tratamentoForms[tratamento.id] || buildDefaultForm(tratamento);
                                const dirty = dirtyTratamentos[tratamento.id];
                                const salvando = salvandoTratamentoId === tratamento.id;
                                return (
                                    <div key={tratamento.id} className={`grid grid-cols-1 items-center gap-1 px-2 py-1.5 sm:grid-cols-[minmax(0,1.4fr)_88px_72px_72px_52px_52px_28px_28px_28px] ${dirty ? 'bg-amber-50/70' : 'hover:bg-neutral-50'}`}>
                                        <div className="min-w-0 pr-1">
                                            <p className="truncate text-sm font-medium text-neutral-900">{tratamento.nome}</p>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={form.valor}
                                                onChange={(e) => updateTratamentoForm(tratamento.id, 'valor', e.target.value)}
                                                className="h-8 w-full rounded-md border border-neutral-200 bg-white px-1.5 text-xs font-medium text-neutral-900 outline-none focus:border-neutral-900"
                                                placeholder="0"
                                            />
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={form.custo}
                                            onChange={(e) => updateTratamentoForm(tratamento.id, 'custo', e.target.value)}
                                            className="h-8 w-full rounded-md border border-neutral-200 bg-white px-1.5 text-xs font-medium text-neutral-900 outline-none focus:border-neutral-900"
                                            placeholder="0"
                                        />
                                        <input
                                            value={form.codigo_tuss}
                                            onChange={(e) => updateTratamentoForm(tratamento.id, 'codigo_tuss', e.target.value)}
                                            className="h-8 w-full rounded-md border border-neutral-200 bg-white px-1.5 text-xs font-medium text-neutral-900 outline-none focus:border-neutral-900"
                                            placeholder="—"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => updateTratamentoForm(tratamento.id, 'aceita_faces', !form.aceita_faces)}
                                            className={`h-8 rounded-md border text-[11px] font-medium ${form.aceita_faces ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-500'}`}
                                        >
                                            {form.aceita_faces ? 'Sim' : 'Não'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateTratamentoForm(tratamento.id, 'ativo', !form.ativo)}
                                            className={`h-8 rounded-md border text-[11px] font-medium ${form.ativo ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white text-neutral-500'}`}
                                        >
                                            {form.ativo ? 'Sim' : 'Não'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!dirty || salvando}
                                            onClick={() => salvarPlanoTratamento(tratamento.id)}
                                            className="flex h-8 w-7 items-center justify-center rounded-md bg-neutral-900 text-white disabled:bg-neutral-200 disabled:text-neutral-400"
                                            title="Salvar valor"
                                        >
                                            {salvando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                        </button>
                                        <button type="button" onClick={() => abrirEditarTratamento(tratamento)} className="inline-flex h-8 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50" title="Editar"><Pencil size={13}/></button>
                                        <button type="button" onClick={() => excluirTratamento(tratamento)} className="inline-flex h-8 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-400 hover:text-rose-600" title="Excluir"><Trash2 size={13}/></button>
                                    </div>
                                );
                            })}
                                </div>
                            </>
                        )}
                    </section>
                </div>
            )}

            <Modal open={modalPlanoAberto} onClose={() => setModalPlanoAberto(false)} maxWidth="lg" hideCloseButton panelClassName="overflow-visible rounded-xl border border-neutral-200 bg-white">
                <form onSubmit={handleCriarPlano} className="px-5 py-4 sm:px-6 sm:py-5">
                    <div className="mb-5 flex items-start justify-between gap-3 border-b border-black/5 pb-4">
                        <div>
                            <h2 className="text-lg font-semibold text-neutral-900">{editandoPlano ? 'Editar plano' : 'Novo plano'}</h2>
                            <p className="mt-0.5 text-xs font-medium text-neutral-400">{editandoPlano ? 'Nome e observações do plano.' : 'Os tratamentos entram ativos, salvo se o plano nascer vazio.'}</p>
                        </div>
                        <button type="button" onClick={() => { setModalPlanoAberto(false); setEditandoPlano(null); }} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={18}/></button>
                    </div>
                    <div className="grid grid-cols-1 gap-x-3 gap-y-2.5">
                        <label>
                            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Nome</span>
                            <input value={novoPlanoNome} onChange={(e) => setNovoPlanoNome(e.target.value)} className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900" placeholder="Amil Dental, SulAmérica, Uniodonto"/>
                        </label>
                        <label>
                            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Observações</span>
                            <textarea value={novoPlanoObservacoes} onChange={(e) => setNovoPlanoObservacoes(e.target.value)} rows={2} className="w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900" placeholder="Cobertura, TUSS, glosas"/>
                        </label>
                        {!editandoPlano && (
                            <button type="button" onClick={() => setCriarPlanoVazio((v) => !v)} className={`flex h-10 items-center justify-between rounded-md border px-3 text-sm font-medium ${criarPlanoVazio ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700'}`}>
                                Criar plano vazio
                                <span className={`h-5 w-9 rounded-full p-0.5 ${criarPlanoVazio ? 'bg-white/30' : 'bg-neutral-200'}`}><span className={`block h-4 w-4 rounded-full bg-white ${criarPlanoVazio ? 'ml-auto' : ''}`} /></span>
                            </button>
                        )}
                    </div>
                    <div className="mt-5 flex justify-end border-t border-black/5 pt-4">
                        <button type="submit" disabled={criandoPlano || !novoPlanoNome.trim()} className="inline-flex h-10 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
                            {criandoPlano ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                            {editandoPlano ? 'Salvar' : 'Cadastrar'}
                        </button>
                    </div>
                </form>
            </Modal>
            <Modal open={modalEspAberto} onClose={() => setModalEspAberto(false)} maxWidth="md" hideCloseButton panelClassName="overflow-visible rounded-xl border border-neutral-200 bg-white">
                <form onSubmit={salvarEspecialidade} className="px-5 py-4 sm:px-6 sm:py-5">
                    <div className="mb-5 flex items-start justify-between gap-3 border-b border-black/5 pb-4">
                        <h2 className="text-lg font-semibold text-neutral-900">{espEditando ? 'Editar especialidade' : 'Nova especialidade'}</h2>
                        <button type="button" onClick={() => setModalEspAberto(false)} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={18}/></button>
                    </div>
                    <label>
                        <span className="mb-1.5 block text-xs font-medium text-neutral-500">Nome</span>
                        <input value={espNome} onChange={(e) => setEspNome(e.target.value)} className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900" placeholder="Ortodontia, Endodontia"/>
                    </label>
                    <div className="mt-5 flex justify-end border-t border-black/5 pt-4">
                        <button type="submit" disabled={salvandoEsp || !espNome.trim()} className="inline-flex h-10 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
                            {salvandoEsp ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Salvar
                        </button>
                    </div>
                </form>
            </Modal>
            <Modal open={modalTratAberto} onClose={() => setModalTratAberto(false)} maxWidth="lg" hideCloseButton panelClassName="overflow-visible rounded-xl border border-neutral-200 bg-white">
                <form onSubmit={salvarTratamento} className="px-5 py-4 sm:px-6 sm:py-5">
                    <div className="mb-5 flex items-start justify-between gap-3 border-b border-black/5 pb-4">
                        <h2 className="text-lg font-semibold text-neutral-900">{tratEditando ? 'Editar tratamento' : 'Novo tratamento'}</h2>
                        <button type="button" onClick={() => setModalTratAberto(false)} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={18}/></button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                        <label className="col-span-2">
                            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Nome</span>
                            <input value={tratForm.nome} onChange={(e) => setTratForm({ ...tratForm, nome: e.target.value })} className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900" placeholder="Nome do tratamento"/>
                        </label>
                        <label className="col-span-2">
                            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Especialidade</span>
                            <CustomSelect value={tratForm.especialidade_id} onChange={(v) => setTratForm({ ...tratForm, especialidade_id: v })} options={especialidades.map((esp) => ({ value: esp.id, label: esp.nome }))} size="md" placeholder="Selecione"/>
                        </label>
                        <label>
                            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Valor</span>
                            <input value={tratForm.valor} onChange={(e) => setTratForm({ ...tratForm, valor: e.target.value })} className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900" placeholder="0"/>
                        </label>
                        <label>
                            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Custo</span>
                            <input value={tratForm.custo} onChange={(e) => setTratForm({ ...tratForm, custo: e.target.value })} className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900" placeholder="0"/>
                        </label>
                        <label>
                            <span className="mb-1.5 block text-xs font-medium text-neutral-500">TUSS</span>
                            <input value={tratForm.tuss} onChange={(e) => setTratForm({ ...tratForm, tuss: e.target.value })} className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900"/>
                        </label>
                        <button type="button" onClick={() => setTratForm({ ...tratForm, aceita_faces: !tratForm.aceita_faces })} className={`mt-5 h-10 rounded-md border text-sm font-medium ${tratForm.aceita_faces ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-600'}`}>
                            {tratForm.aceita_faces ? 'Aceita faces' : 'Sem faces'}
                        </button>
                    </div>
                    <div className="mt-5 flex justify-end border-t border-black/5 pt-4">
                        <button type="submit" disabled={salvandoTrat || !tratForm.nome.trim()} className="inline-flex h-10 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
                            {salvandoTrat ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Salvar
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );

    if (embedded) return content;
    return (
        <BentoPageShell title="Gestão de Planos" subtitle="Configure valores de tratamento por plano e TUSS." actions={headerActions}>
            {content}
        </BentoPageShell>
    );
}

export default function PlanosPage() {
    return <PlanosContent />;
}
