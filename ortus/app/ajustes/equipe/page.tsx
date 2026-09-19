'use client';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { clinicScope, readRouteCache, writeRouteCache } from '@/lib/routeListCache';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { fetchUserEquipe } from '@/lib/clinicScoped';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import Modal from '@/components/ui/Modal';
import CustomSelect from '@/components/ui/CustomSelect';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import {
    Users, UserPlus, Loader2, X, Mail, Building2, ShieldCheck, Copy, Check,
    KeyRound, AlertTriangle, User, Briefcase, ToggleLeft, ToggleRight, Clock,
    DollarSign, Trash2, Plus, Settings, Edit,
} from 'lucide-react';
import type { ComissaoRegra, ModuleName } from '@/lib/types/permissions';
import { MODULES, buildModuleAccessMap } from '@/lib/modules';
import { PERMISSION_PRESETS, buildPresetAccessMap, type PermissionPresetId } from '@/lib/permissionPresets';
import { carregarConfig, salvarConfig } from '@/lib/configClinica';
import { carregarHorarioProfissional, salvarHorarioProfissional, type HorarioAtendimento, type HorarioDia } from '@/lib/horarioProfissional';
const cardShell = 'rounded-[1.35rem] bg-white sm:rounded-[1.5rem]';

type Profissional = {
    id: number | string;
    nome: string;
    cargo?: string | null;
    nivel_acesso?: string | null;
    user_id?: string | null;
    precisa_trocar_senha?: boolean | null;
    clinicas?: Array<{ id: string | number; nome: string }>;
};

const CARGOS = [
    'Dentista', 'Auxiliar', 'Recepcionista', 'Protético', 'Gestor', 'Outro',
];

type HorarioAtendimentoLocal = HorarioAtendimento;

const HORARIO_PADRAO: HorarioAtendimentoLocal = {
    inicio: '08:00',
    fim: '18:00',
    intervalo: 30,
    limiteSimultaneo: 1,
    dias: { seg: true, ter: true, qua: true, qui: true, sex: true, sab: false, dom: false },
    observacoes: '',
};

const GATILHOS_COMISSAO = [
    { value: 'debito_recebido', label: 'Débito Recebido' },
    { value: 'tratamento_finalizado', label: 'Tratamento Finalizado' },
    { value: 'orcamento_aprovado', label: 'Orçamento Aprovado' },
];

const TIPOS_COMISSAO = [
    { value: 'percentual', label: 'Percentual (%)' },
    { value: 'valor_fixo', label: 'Valor Fixo (R$)' },
];

const DIAS_SEMANA: { id: HorarioDia; label: string }[] = [
    { id: 'seg', label: 'Seg' },
    { id: 'ter', label: 'Ter' },
    { id: 'qua', label: 'Qua' },
    { id: 'qui', label: 'Qui' },
    { id: 'sex', label: 'Sex' },
    { id: 'sab', label: 'Sáb' },
    { id: 'dom', label: 'Dom' },
];

const cloneHorarioPadrao = (): HorarioAtendimentoLocal => ({
    ...HORARIO_PADRAO,
    dias: { ...HORARIO_PADRAO.dias },
});

const novaPermissaoMap = () => buildModuleAccessMap(false);

const getGatilhoLabel = (valor: string) => GATILHOS_COMISSAO.find((g) => g.value === valor)?.label || valor;

const formatValorComissao = (tipo: string, valor: number) => (
    tipo === 'percentual'
        ? `${Number(valor).toFixed(2).replace('.', ',')}%`
        : `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
);

const EQUIPE_CACHE_KEY = 'ortus:equipe:v1';

function readEquipeBoot(): Profissional[] | null {
    if (typeof localStorage === 'undefined') return null;
    const cid = localStorage.getItem('ortus_clinica_id');
    const clinicId = !cid || cid === 'all' || cid === 'todas' ? 'all' : cid;
    return readRouteCache<Profissional[]>(EQUIPE_CACHE_KEY, clinicScope(clinicId));
}

export default function EquipePage() {
    const searchParams = useSearchParams();
    const { clinics, loading: clinicLoading, activeClinicId, activeClinic } = useClinica();
    const { showAlert, showConfirm } = useCustomAlert();

    const bootEquipe = readEquipeBoot();
    const jaCarregou = useRef(!!bootEquipe?.length);
    const fetchGen = useRef(0);
    const [profissionais, setProfissionais] = useState<Profissional[]>(() => bootEquipe ?? []);
    const [loading, setLoading] = useState(() => !(bootEquipe?.length));
    const [perfilCaller, setPerfilCaller] = useState<any>(null);

    // Modal de criação
    const [modalOpen, setModalOpen] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [form, setForm] = useState({
        nome: '', email: '', cargo: 'Dentista', clinicas: [] as string[],
    });

    // Modal final com credenciais
    const [credenciais, setCredenciais] = useState<{ email: string; senha: string; nome: string } | null>(null);
    const [copiado, setCopiado] = useState<'email' | 'senha' | 'tudo' | null>(null);

    // Modal edição avançada
    const [editorAberto, setEditorAberto] = useState(false);
    const [profissionalSelecionado, setProfissionalSelecionado] = useState<Profissional | null>(null);
    const [abaEditor, setAbaEditor] = useState<'permissoes' | 'horarios' | 'comissao'>('permissoes');

    const [permissoesMapa, setPermissoesMapa] = useState<Record<ModuleName, boolean>>(novaPermissaoMap);
    const [permissoesLoading, setPermissoesLoading] = useState(false);
    const [permissoesLoaded, setPermissoesLoaded] = useState(false);
    const [permissoesDirty, setPermissoesDirty] = useState(false);
    const [permissoesSaving, setPermissoesSaving] = useState(false);

    const [horarioState, setHorarioState] = useState<HorarioAtendimento>(cloneHorarioPadrao);
    const [horarioLoaded, setHorarioLoaded] = useState(false);
    const [horarioLoading, setHorarioLoading] = useState(false);
    const [horarioDirty, setHorarioDirty] = useState(false);
    const [horarioSaving, setHorarioSaving] = useState(false);

    const [comissaoForm, setComissaoForm] = useState({ gatilho: GATILHOS_COMISSAO[0].value, tipo: TIPOS_COMISSAO[0].value, valor: '', ativo: true });
    const [comissaoEditandoId, setComissaoEditandoId] = useState<string | null>(null);
    const [comissoes, setComissoes] = useState<ComissaoRegra[]>([]);
    const [comissoesLoaded, setComissoesLoaded] = useState(false);
    const [comissoesLoading, setComissoesLoading] = useState(false);
    const [comissaoSaving, setComissaoSaving] = useState(false);
    const [comissaoExcluindo, setComissaoExcluindo] = useState<string | null>(null);
    const [comissoesConsolidadas, setComissoesConsolidadas] = useState<(ComissaoRegra & { profissionais?: { nome: string } | null })[]>([]);
    const [comissoesConsolidadasLoading, setComissoesConsolidadasLoading] = useState(false);
    const [comissaoLancamentos, setComissaoLancamentos] = useState<any[]>([]);
    const [nivelAcessoEdit, setNivelAcessoEdit] = useState<'comum' | 'admin'>('comum');
    const [nivelSaving, setNivelSaving] = useState(false);

    const clinicaIdNumerica = useMemo(() => (activeClinicId && activeClinicId !== 'all' ? Number(activeClinicId) : null), [activeClinicId]);
    const clinicaNomeAtiva = useMemo(() => {
        if (!activeClinicId || activeClinicId === 'all') return 'Todas as Clínicas';
        const registro = clinics.find((c) => String(c.id) === String(activeClinicId));
        return registro?.nome || 'Clínica selecionada';
    }, [activeClinicId, clinics]);

    useEffect(() => {
        if (clinicLoading) return;
        const cached = readRouteCache<Profissional[]>(EQUIPE_CACHE_KEY, clinicScope(activeClinicId));
        if (cached?.length) {
            setProfissionais(cached);
            setLoading(false);
        }
        carregar({ silent: !!cached?.length });
    }, [clinicLoading, activeClinicId]);

    async function carregar(opts?: { silent?: boolean }) {
        const gen = ++fetchGen.current;
        if (!opts?.silent) setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { if (gen === fetchGen.current) setLoading(false); return; }

            const { data: meu } = await supabase
                .from('profissionais')
                .select('id, nome, nivel_acesso, is_super_admin')
                .eq('user_id', user.id)
                .single();
            if (gen === fetchGen.current) setPerfilCaller(meu);

            const lista = (await fetchUserEquipe()) as Profissional[];
            if (gen !== fetchGen.current) return;

            setProfissionais(lista);
            writeRouteCache(EQUIPE_CACHE_KEY, clinicScope(activeClinicId), lista);
        } catch (e) {
            console.error(e);
        }
        if (gen === fetchGen.current) {
            jaCarregou.current = true;
            setLoading(false);
        }
    }

    function abrirModal() {
        setErro(null);
        setForm({ nome: '', email: '', cargo: 'Dentista', clinicas: [] });
        setModalOpen(true);
    }

    function toggleClinica(id: string) {
        setForm((f) => ({
            ...f,
            clinicas: f.clinicas.includes(id) ? f.clinicas.filter((x) => x !== id) : [...f.clinicas, id],
        }));
    }

    async function salvar(e: React.FormEvent) {
        e.preventDefault();
        setErro(null);

        if (!form.nome.trim() || !form.email.trim()) {
            setErro('Nome e e-mail são obrigatórios.');
            return;
        }
        if (form.clinicas.length === 0) {
            setErro('Selecione pelo menos uma unidade.');
            return;
        }

        setSalvando(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (!token) {
                setErro('Sessão expirada. Faça login novamente.');
                setSalvando(false);
                return;
            }

            const resp = await fetch('/api/admin/criar-usuario', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    nome: form.nome.trim(),
                    email: form.email.trim().toLowerCase(),
                    cargo: form.cargo,
                    clinicas: form.clinicas,
                }),
            });
            const json = await resp.json();
            if (!resp.ok || !json.success) {
                setErro(json.error || 'Falha ao criar usuário.');
                setSalvando(false);
                return;
            }

            setModalOpen(false);
            setCredenciais({ nome: form.nome.trim(), email: json.email, senha: json.senha_temporaria });
            await carregar({ silent: true });
        } catch (e: any) {
            setErro(e?.message || 'Erro inesperado.');
        }
        setSalvando(false);
    }

    function copiar(tipo: 'email' | 'senha' | 'tudo') {
        if (!credenciais) return;
        const texto =
            tipo === 'email' ? credenciais.email :
            tipo === 'senha' ? credenciais.senha :
            `E-mail: ${credenciais.email}\nSenha temporária: ${credenciais.senha}`;
        try {
            navigator.clipboard.writeText(texto);
            setCopiado(tipo);
            setTimeout(() => setCopiado(null), 1800);
        } catch {}
    }

    function abrirEditorAvancado(prof: Profissional, abaInicial?: 'permissoes' | 'horarios' | 'comissao') {
        setProfissionalSelecionado(prof);
        setEditorAberto(true);
        setAbaEditor(abaInicial || 'permissoes');
        setNivelAcessoEdit(prof.nivel_acesso === 'admin' ? 'admin' : 'comum');
        setPermissoesMapa(novaPermissaoMap());
        setPermissoesLoaded(false);
        setPermissoesDirty(false);
        setHorarioState(cloneHorarioPadrao());
        setHorarioLoaded(false);
        setHorarioDirty(false);
        setComissoes([]);
        setComissoesLoaded(false);
        setComissaoForm({ gatilho: GATILHOS_COMISSAO[0].value, tipo: TIPOS_COMISSAO[0].value, valor: '', ativo: true });
    }

    function fecharEditorAvancado() {
        setEditorAberto(false);
        setProfissionalSelecionado(null);
    }

    useEffect(() => {
        if (!editorAberto || !profissionalSelecionado) return;
        if (abaEditor === 'permissoes' && !permissoesLoaded) carregarPermissoesProfissional();
        if (abaEditor === 'horarios' && !horarioLoaded) carregarHorarioEditor();
        if (abaEditor === 'comissao' && !comissoesLoaded) carregarComissoesProfissional();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editorAberto, profissionalSelecionado, abaEditor, permissoesLoaded, horarioLoaded, comissoesLoaded]);

    useEffect(() => {
        if (!editorAberto) return;
        setPermissoesLoaded(false);
        setHorarioLoaded(false);
        setComissoesLoaded(false);
    }, [editorAberto, activeClinicId]);

    useEffect(() => {
        const aba = searchParams.get('aba');
        if (aba === 'comissao' || aba === 'horarios' || aba === 'permissoes') {
            setAbaEditor(aba);
        }
    }, [searchParams]);

    useEffect(() => {
        if (!clinicaIdNumerica) {
            setComissoesConsolidadas([]);
            return;
        }
        setComissoesConsolidadasLoading(true);
        supabase
            .from('comissoes_regras')
            .select('*, profissionais(nome)')
            .eq('clinica_id', clinicaIdNumerica)
            .eq('ativo', true)
            .order('profissional_id')
            .then(({ data, error }) => {
                if (!error) setComissoesConsolidadas((data || []) as typeof comissoesConsolidadas);
                setComissoesConsolidadasLoading(false);
            });
        supabase
            .from('comissoes_lancamentos')
            .select('*, profissionais(nome)')
            .eq('clinica_id', clinicaIdNumerica)
            .order('created_at', { ascending: false })
            .limit(20)
            .then(({ data }) => setComissaoLancamentos(data || []));
    }, [clinicaIdNumerica, comissoesLoaded, editorAberto]);

    function aplicarPresetPermissoes(presetId: PermissionPresetId) {
        setPermissoesMapa(buildPresetAccessMap(presetId));
        setPermissoesDirty(true);
    }

    async function salvarNivelAcesso() {
        if (!profissionalSelecionado) return;
        setNivelSaving(true);
        try {
            const { error } = await supabase
                .from('profissionais')
                .update({ nivel_acesso: nivelAcessoEdit })
                .eq('id', profissionalSelecionado.id);
            if (error) throw error;
            setProfissionalSelecionado((prev) => prev ? { ...prev, nivel_acesso: nivelAcessoEdit } : prev);
            setProfissionais((prev) => prev.map((p) => p.id === profissionalSelecionado.id ? { ...p, nivel_acesso: nivelAcessoEdit } : p));
            await showAlert('Nível de acesso atualizado!', { type: 'success' });
        } catch {
            await showAlert('Erro ao atualizar nível de acesso.', { type: 'error' });
        } finally {
            setNivelSaving(false);
        }
    }

    async function carregarPermissoesProfissional() {
        if (!profissionalSelecionado) return;
        if (!clinicaIdNumerica) {
            setPermissoesMapa(novaPermissaoMap());
            setPermissoesLoaded(true);
            return;
        }
        setPermissoesLoading(true);
        try {
            const { data, error } = await supabase
                .from('permissoes_modulos')
                .select('modulo, pode_acessar')
                .eq('profissional_id', profissionalSelecionado.id)
                .eq('clinica_id', clinicaIdNumerica);
            if (error) throw error;
            const mapa = novaPermissaoMap();
            (data || []).forEach((row: any) => {
                const modulo = row.modulo as ModuleName;
                if (mapa[modulo] !== undefined) mapa[modulo] = !!row.pode_acessar;
            });
            setPermissoesMapa(mapa);
            setPermissoesDirty(false);
            setPermissoesLoaded(true);
        } catch (err: any) {
            console.error(err);
            showAlert('Erro ao carregar permissões.', { type: 'error' });
        } finally {
            setPermissoesLoading(false);
        }
    }

    function toggleModulo(modulo: ModuleName) {
        setPermissoesMapa((prev) => {
            const next = { ...prev, [modulo]: !prev[modulo] };
            setPermissoesDirty(true);
            return next;
        });
    }

    async function salvarPermissoesAtual() {
        if (!profissionalSelecionado) return;
        if (!clinicaIdNumerica) {
            showAlert('Selecione uma clínica específica no topo para editar permissões.', { type: 'warning' });
            return;
        }
        setPermissoesSaving(true);
        try {
            const payload = MODULES.map((modulo) => ({
                profissional_id: Number(profissionalSelecionado.id),
                clinica_id: clinicaIdNumerica,
                modulo: modulo.id,
                pode_acessar: permissoesMapa[modulo.id],
            }));
            const { error } = await supabase
                .from('permissoes_modulos')
                .upsert(payload, { onConflict: 'profissional_id,clinica_id,modulo' });
            if (error) throw error;
            await showAlert('Permissões atualizadas!', { type: 'success' });
            setPermissoesDirty(false);
        } catch (err: any) {
            console.error(err);
            await showAlert('Erro ao salvar permissões.', { type: 'error' });
        } finally {
            setPermissoesSaving(false);
        }
    }

    async function carregarHorarioEditor() {
        if (!profissionalSelecionado) return;
        if (!clinicaIdNumerica) {
            setHorarioState(cloneHorarioPadrao());
            setHorarioLoaded(true);
            return;
        }
        setHorarioLoading(true);
        try {
            const valor = await carregarHorarioProfissional(clinicaIdNumerica, profissionalSelecionado.id);
            if (valor) {
                setHorarioState({
                    ...valor,
                    dias: { ...HORARIO_PADRAO.dias, ...valor.dias },
                });
            } else {
                setHorarioState(cloneHorarioPadrao());
            }
            setHorarioDirty(false);
            setHorarioLoaded(true);
        } catch (err: any) {
            console.error(err);
            await showAlert('Erro ao carregar horário.', { type: 'error' });
        } finally {
            setHorarioLoading(false);
        }
    }

    function atualizarHorario<K extends keyof HorarioAtendimento>(campo: K, valor: HorarioAtendimento[K]) {
        setHorarioState((prev) => ({ ...prev, [campo]: valor }));
        setHorarioDirty(true);
    }

    function toggleDiaHorario(dia: HorarioDia) {
        setHorarioState((prev) => ({
            ...prev,
            dias: { ...prev.dias, [dia]: !prev.dias[dia] },
        }));
        setHorarioDirty(true);
    }

    async function salvarHorario() {
        if (!profissionalSelecionado) return;
        if (!clinicaIdNumerica) {
            showAlert('Selecione uma clínica específica no topo para salvar o horário.', { type: 'warning' });
            return;
        }
        setHorarioSaving(true);
        try {
            await salvarHorarioProfissional(clinicaIdNumerica, profissionalSelecionado.id, horarioState);
            setHorarioDirty(false);
            await showAlert('Horário salvo com sucesso!', { type: 'success' });
        } catch (err: any) {
            console.error(err);
            await showAlert('Erro ao salvar horário.', { type: 'error' });
        } finally {
            setHorarioSaving(false);
        }
    }

    async function carregarComissoesProfissional() {
        if (!profissionalSelecionado) return;
        if (!clinicaIdNumerica) {
            setComissoes([]);
            setComissoesLoaded(true);
            return;
        }
        setComissoesLoading(true);
        try {
            const { data, error } = await supabase
                .from('comissoes_regras')
                .select('*')
                .eq('profissional_id', profissionalSelecionado.id)
                .eq('clinica_id', clinicaIdNumerica)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setComissoes((data || []) as ComissaoRegra[]);
            setComissoesLoaded(true);
        } catch (err: any) {
            console.error(err);
            await showAlert('Erro ao carregar regras de comissão.', { type: 'error' });
        } finally {
            setComissoesLoading(false);
        }
    }

    async function salvarComissaoRapida(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!profissionalSelecionado) return;
        if (!clinicaIdNumerica) {
            showAlert('Selecione uma clínica específica para adicionar regras.', { type: 'warning' });
            return;
        }
        const valorNumber = Number(comissaoForm.valor);
        if (Number.isNaN(valorNumber) || valorNumber < 0) {
            showAlert('Informe um valor válido para a comissão.', { type: 'warning' });
            return;
        }
        setComissaoSaving(true);
        try {
            if (comissaoEditandoId) {
                const { data, error } = await supabase
                    .from('comissoes_regras')
                    .update({
                        gatilho: comissaoForm.gatilho,
                        tipo: comissaoForm.tipo,
                        valor: valorNumber,
                        ativo: comissaoForm.ativo,
                    })
                    .eq('id', comissaoEditandoId)
                    .select()
                    .single();
                if (error) throw error;
                setComissoes((prev) => prev.map((r) => (r.id === comissaoEditandoId ? (data as ComissaoRegra) : r)));
                setComissaoEditandoId(null);
                setComissaoForm({ gatilho: GATILHOS_COMISSAO[0].value, tipo: TIPOS_COMISSAO[0].value, valor: '', ativo: true });
                await showAlert('Regra atualizada!', { type: 'success' });
            } else {
                const { data, error } = await supabase
                    .from('comissoes_regras')
                    .insert({
                        profissional_id: Number(profissionalSelecionado.id),
                        clinica_id: clinicaIdNumerica,
                        gatilho: comissaoForm.gatilho,
                        tipo: comissaoForm.tipo,
                        valor: valorNumber,
                        ativo: comissaoForm.ativo,
                    })
                    .select()
                    .single();
                if (error) throw error;
                setComissoes((prev) => [data as ComissaoRegra, ...prev]);
                setComissaoForm((prev) => ({ ...prev, valor: '' }));
                await showAlert('Regra adicionada!', { type: 'success' });
            }
        } catch (err: any) {
            console.error(err);
            await showAlert('Erro ao salvar regra de comissão.', { type: 'error' });
        } finally {
            setComissaoSaving(false);
        }
    }

    function editarComissaoRegra(regra: ComissaoRegra) {
        setComissaoEditandoId(regra.id);
        setComissaoForm({
            gatilho: regra.gatilho,
            tipo: regra.tipo,
            valor: String(regra.valor),
            ativo: regra.ativo !== false,
        });
    }

    function cancelarEdicaoComissao() {
        setComissaoEditandoId(null);
        setComissaoForm({ gatilho: GATILHOS_COMISSAO[0].value, tipo: TIPOS_COMISSAO[0].value, valor: '', ativo: true });
    }

    async function toggleComissaoAtiva(regra: ComissaoRegra) {
        try {
            const { data, error } = await supabase
                .from('comissoes_regras')
                .update({ ativo: !regra.ativo })
                .eq('id', regra.id)
                .select()
                .single();
            if (error) throw error;
            setComissoes((prev) => prev.map((r) => (r.id === regra.id ? (data as ComissaoRegra) : r)));
        } catch (err: any) {
            console.error(err);
            await showAlert('Erro ao alterar status da regra.', { type: 'error' });
        }
    }

    async function excluirComissaoRegra(id: string) {
        if (!(await showConfirm('Deseja remover esta regra de comissão?', { type: 'warning', confirmLabel: 'Excluir' }))) return;
        setComissaoExcluindo(id);
        try {
            const { error } = await supabase.from('comissoes_regras').delete().eq('id', id);
            if (error) throw error;
            setComissoes((prev) => prev.filter((regra) => regra.id !== id));
            await showAlert('Regra removida.', { type: 'success' });
        } catch (err: any) {
            console.error(err);
            await showAlert('Erro ao excluir regra de comissão.', { type: 'error' });
        } finally {
            setComissaoExcluindo(null);
        }
    }

    const renderClinicaObrigatoria = () => (
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800">
            Selecione uma clínica específica no topo da tela para gerenciar este recurso.
        </div>
    );

    const renderPermissoesTab = () => {
        if (!profissionalSelecionado) return null;
        if (!clinicaIdNumerica) return renderClinicaObrigatoria();
        return (
            <div className="space-y-4">
                <div className="p-4 bg-neutral-50 border border-neutral-100 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-bold text-neutral-600">Nível de acesso</p>
                        <p className="text-[11px] text-neutral-400">Admin tem acesso total; comum usa os módulos abaixo.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-white p-1 rounded-xl border border-neutral-200">
                            <button type="button" onClick={() => setNivelAcessoEdit('comum')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${nivelAcessoEdit === 'comum' ? 'bg-neutral-800 text-white' : 'text-neutral-500'}`}>Comum</button>
                            <button type="button" onClick={() => setNivelAcessoEdit('admin')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${nivelAcessoEdit === 'admin' ? 'bg-purple-600 text-white' : 'text-neutral-500'}`}>Admin</button>
                        </div>
                        <button type="button" onClick={salvarNivelAcesso} disabled={nivelSaving || nivelAcessoEdit === (profissionalSelecionado.nivel_acesso === 'admin' ? 'admin' : 'comum')} className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-bold disabled:opacity-50">
                            {nivelSaving ? 'Salvando...' : 'Salvar nível'}
                        </button>
                    </div>
                </div>
                {profissionalSelecionado.nivel_acesso === 'admin' ? (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-sm text-emerald-700">
                        Administradores possuem acesso completo a todos os módulos. Para restringir, altere o nível para <strong>Comum</strong> acima.
                    </div>
                ) : (
                <>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-2">Perfis rápidos</p>
                    <div className="flex flex-wrap gap-2">
                        {PERMISSION_PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                onClick={() => aplicarPresetPermissoes(preset.id)}
                                className="px-3 py-2 rounded-xl border border-neutral-200 bg-white text-xs font-bold text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 transition-colors"
                                title={preset.description}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                </div>
                <p className="text-xs text-neutral-500 font-medium">
                    Ajuste o acesso por módulo para <span className="font-bold text-neutral-700">{profissionalSelecionado.nome}</span>.
                </p>
                <div className="space-y-3">
                    {MODULES.map((modulo) => (
                        <div key={modulo.id} className="flex items-center gap-4 p-4 rounded-2xl border border-neutral-100 bg-neutral-50">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-neutral-800">{modulo.label}</p>
                                <p className="text-xs text-neutral-500">{modulo.description}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => toggleModulo(modulo.id)}
                                disabled={permissoesLoading}
                                className={`p-1 rounded-full transition-colors ${permissoesMapa[modulo.id] ? 'text-neutral-900' : 'text-neutral-400'}`}
                            >
                                {permissoesMapa[modulo.id] ? <ToggleRight size={32}/> : <ToggleLeft size={32}/>}
                            </button>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={salvarPermissoesAtual}
                        disabled={!permissoesDirty || permissoesSaving}
                        className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 flex items-center gap-2"
                    >
                        {permissoesSaving ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>}Salvar permissões
                    </button>
                </div>
                </>
                )}
            </div>
        );
    };

    const renderHorariosTab = () => {
        if (!profissionalSelecionado) return null;
        if (!clinicaIdNumerica) return renderClinicaObrigatoria();
        return (
            <div className="space-y-5">
                <p className="text-xs text-neutral-500">
                    Horário de atendimento de <span className="font-bold text-neutral-700">{profissionalSelecionado.nome}</span> na clínica <span className="font-bold">{clinicaNomeAtiva}</span>.
                </p>
                {horarioLoading && (
                    <div className="flex items-center gap-2 text-neutral-500 text-sm"><Loader2 size={16} className="animate-spin"/>Carregando horário...</div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Início</label>
                        <input type="time" value={horarioState.inicio} onChange={(e) => atualizarHorario('inicio', e.target.value)} className="mt-1 w-full px-4 py-3 rounded-2xl border border-neutral-200 bg-neutral-50 text-sm font-bold text-neutral-700 focus:border-neutral-400 focus:bg-white outline-none" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Término</label>
                        <input type="time" value={horarioState.fim} onChange={(e) => atualizarHorario('fim', e.target.value)} className="mt-1 w-full px-4 py-3 rounded-2xl border border-neutral-200 bg-neutral-50 text-sm font-bold text-neutral-700 focus:border-neutral-400 focus:bg-white outline-none" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Intervalo (min)</label>
                        <input type="number" min={5} value={horarioState.intervalo} onChange={(e) => atualizarHorario('intervalo', Number(e.target.value))} className="mt-1 w-full px-4 py-3 rounded-2xl border border-neutral-200 bg-neutral-50 text-sm font-bold text-neutral-700 focus:border-neutral-400 focus:bg-white outline-none" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Limite Simultâneo</label>
                        <input type="number" min={1} value={horarioState.limiteSimultaneo} onChange={(e) => atualizarHorario('limiteSimultaneo', Number(e.target.value) || 1)} className="mt-1 w-full px-4 py-3 rounded-2xl border border-neutral-200 bg-neutral-50 text-sm font-bold text-neutral-700 focus:border-neutral-400 focus:bg-white outline-none" />
                    </div>
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-2">Dias de atendimento</p>
                    <div className="flex flex-wrap gap-2">
                        {DIAS_SEMANA.map((dia) => {
                            const ativo = horarioState.dias[dia.id];
                            return (
                                <button
                                    key={dia.id}
                                    type="button"
                                    onClick={() => toggleDiaHorario(dia.id)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-all ${ativo ? 'bg-neutral-900 text-white border-neutral-900 shadow' : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400'}`}
                                >
                                    {dia.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Observações / Regras</label>
                    <textarea
                        rows={3}
                        value={horarioState.observacoes}
                        onChange={(e) => atualizarHorario('observacoes', e.target.value)}
                        className="mt-1 w-full px-4 py-3 rounded-2xl border border-neutral-200 bg-neutral-50 text-sm text-neutral-700 focus:border-neutral-400 focus:bg-white outline-none"
                        placeholder="Ex.: Pausa para almoço das 12h às 13h"
                    />
                </div>
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={salvarHorario}
                        disabled={!horarioDirty || horarioSaving}
                        className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 flex items-center gap-2"
                    >
                        {horarioSaving ? <Loader2 size={14} className="animate-spin"/> : <Check size={14}/>}Salvar horário
                    </button>
                </div>
            </div>
        );
    };

    const renderComissoesTab = () => {
        if (!profissionalSelecionado) return null;
        if (!clinicaIdNumerica) return renderClinicaObrigatoria();
        return (
            <div className="space-y-6">
                <form onSubmit={salvarComissaoRapida} className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-neutral-50 border border-neutral-100 p-4 rounded-2xl">
                    <div className="md:col-span-2">
                        <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Gatilho</label>
                        <CustomSelect value={comissaoForm.gatilho} onChange={v => setComissaoForm(prev => ({ ...prev, gatilho: v }))} options={GATILHOS_COMISSAO.map(g => ({ value: g.value, label: g.label }))} size="lg" className="mt-1" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Tipo</label>
                        <CustomSelect value={comissaoForm.tipo} onChange={v => setComissaoForm(prev => ({ ...prev, tipo: v }))} options={TIPOS_COMISSAO.map(t => ({ value: t.value, label: t.label }))} size="lg" className="mt-1" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Valor</label>
                        <input type="number" step="0.01" min={0} value={comissaoForm.valor} onChange={(e) => setComissaoForm((prev) => ({ ...prev, valor: e.target.value }))} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-neutral-200 bg-white text-sm font-bold text-neutral-700" placeholder={comissaoForm.tipo === 'percentual' ? '0 a 100%' : 'Valor em R$'} />
                    </div>
                    <div className="md:col-span-4 flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-sm font-bold text-neutral-600">
                            <input type="checkbox" checked={comissaoForm.ativo} onChange={(e) => setComissaoForm((prev) => ({ ...prev, ativo: e.target.checked }))} className="w-4 h-4 rounded border-neutral-300 text-green-600" />
                            Regra ativa
                        </label>
                        <div className="flex gap-2">
                            {comissaoEditandoId && (
                                <button type="button" onClick={cancelarEdicaoComissao} className="px-4 py-2 rounded-xl border border-neutral-200 text-neutral-600 text-sm font-bold hover:bg-white">
                                    Cancelar
                                </button>
                            )}
                            <button type="submit" disabled={comissaoSaving} className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                                {comissaoSaving ? <Loader2 size={14} className="animate-spin"/> : (comissaoEditandoId ? <Check size={14}/> : <Plus size={14}/>)}
                                {comissaoEditandoId ? 'Salvar alterações' : 'Adicionar regra'}
                            </button>
                        </div>
                    </div>
                </form>
                <div className="space-y-3">
                    {comissoesLoading ? (
                        <div className="flex items-center gap-2 text-neutral-500 text-sm"><Loader2 size={16} className="animate-spin"/>Carregando regras...</div>
                    ) : comissoes.length === 0 ? (
                        <div className="p-6 text-center text-sm text-neutral-500 border border-dashed border-neutral-200 rounded-2xl">
                            Nenhuma regra cadastrada para esta clínica.
                        </div>
                    ) : (
                        comissoes.map((regra) => (
                            <div key={regra.id} className={`p-4 border rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${regra.ativo !== false ? 'border-neutral-100 bg-white' : 'border-neutral-100 bg-neutral-50 opacity-70'}`}>
                                <div>
                                    <p className="text-sm font-bold text-neutral-700">{getGatilhoLabel(regra.gatilho)}</p>
                                    <p className="text-xs text-neutral-500">{regra.tipo === 'percentual' ? 'Percentual' : 'Valor fixo'} • <span className="font-bold text-neutral-700">{formatValorComissao(regra.tipo, regra.valor)}</span>{regra.ativo === false && <span className="ml-2 text-amber-600 font-bold">• Inativa</span>}</p>
                                </div>
                                <div className="flex gap-2 self-start sm:self-auto">
                                    <button type="button" onClick={() => toggleComissaoAtiva(regra)} className={`px-3 py-2 rounded-lg border text-xs font-bold flex items-center gap-1 ${regra.ativo !== false ? 'border-neutral-200 text-neutral-600 hover:bg-neutral-50' : 'border-green-200 text-green-700 hover:bg-green-50'}`}>
                                        {regra.ativo !== false ? <ToggleRight size={14}/> : <ToggleLeft size={14}/>}
                                        {regra.ativo !== false ? 'Desativar' : 'Ativar'}
                                    </button>
                                    <button type="button" onClick={() => editarComissaoRegra(regra)} className="px-3 py-2 rounded-lg border border-black/10 text-neutral-900 text-xs font-bold hover:bg-neutral-50 flex items-center gap-1">
                                        <Edit size={14}/> Editar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => excluirComissaoRegra(regra.id)}
                                        disabled={comissaoExcluindo === regra.id}
                                        className="px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {comissaoExcluindo === regra.id ? <Loader2 size={14} className="animate-spin"/> : <Trash2 size={14}/>}
                                        Remover
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    const isAdmin = perfilCaller?.nivel_acesso === 'admin' || perfilCaller?.is_super_admin;

    const totalAtivos = useMemo(() => profissionais.length, [profissionais]);
    const totalAdmins = useMemo(() => profissionais.filter((p) => p.nivel_acesso === 'admin').length, [profissionais]);
    const pendentesSenha = useMemo(() => profissionais.filter((p) => p.precisa_trocar_senha).length, [profissionais]);
    const totalClinicasCobertas = useMemo(() => {
        const set = new Set<string>();
        profissionais.forEach((p) => (p.clinicas || []).forEach((c) => set.add(String(c.id))));
        return set.size;
    }, [profissionais]);

    const kpiLoading = loading && !jaCarregou.current;

    if (!isAdmin && !loading && !clinicLoading) {
        return (
            <div className="w-full px-4 py-10 font-poppins sm:px-6">
                <div className={`${cardShell} mx-auto max-w-lg border border-amber-200/80 p-8 text-center`}>
                    <ShieldCheck size={40} className="mx-auto mb-3 text-amber-600" />
                    <h2 className="text-lg font-semibold text-amber-900">Acesso restrito</h2>
                    <p className="mt-1 text-sm text-amber-800/90">Apenas administradores podem gerenciar a equipe.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full space-y-3 px-2.5 py-2.5 pb-12 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Ajustes</p>
                    <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Equipe</h1>
                    <p className="mt-1 text-sm text-neutral-500 sm:text-base">
                        {activeClinic ? getClinicLabel(activeClinic) : 'Todas as clínicas'} · {totalAtivos}{' '}
                        {totalAtivos === 1 ? 'profissional' : 'profissionais'} com acesso
                    </p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                    <button
                        type="button"
                        onClick={abrirModal}
                        className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 sm:flex-none"
                    >
                        <UserPlus size={16} /> Adicionar
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
                <section className={`${cardShell} p-4 sm:p-5`}>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-neutral-100 p-2 text-neutral-700"><Users size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Equipe</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500">Colaboradores</p>
                    {kpiLoading ? (
                        <div className="mt-2 h-8 w-16 animate-pulse rounded-xl bg-neutral-100" />
                    ) : (
                        <p className="mt-1 text-xl font-semibold text-neutral-900 sm:text-2xl">{totalAtivos}</p>
                    )}
                </section>
                <section className={`${cardShell} p-4 sm:p-5`}>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-emerald-100 p-2 text-emerald-700"><ShieldCheck size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Admin</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500">Gestores</p>
                    {kpiLoading ? (
                        <div className="mt-2 h-8 w-16 animate-pulse rounded-xl bg-neutral-100" />
                    ) : (
                        <p className="mt-1 text-xl font-semibold text-neutral-900 sm:text-2xl">{totalAdmins}</p>
                    )}
                </section>
                <section className={`${cardShell} border border-amber-200/80 p-4 sm:p-5`}>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-amber-100 p-2 text-amber-700"><KeyRound size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Acesso</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500">Senha provisória</p>
                    {kpiLoading ? (
                        <div className="mt-2 h-8 w-16 animate-pulse rounded-xl bg-neutral-100" />
                    ) : (
                        <p className="mt-1 text-xl font-semibold text-amber-900 sm:text-2xl">{pendentesSenha}</p>
                    )}
                </section>
                <section className="rounded-[1.35rem] border border-neutral-800 bg-neutral-950 p-4 text-white sm:rounded-[1.5rem] sm:p-5">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="rounded-full bg-white/10 p-2 text-[#c8f053]"><Building2 size={18} /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/70">Rede</span>
                    </div>
                    <p className="text-xs font-medium text-white/60">Unidades cobertas</p>
                    {kpiLoading ? (
                        <div className="mt-2 h-8 w-16 animate-pulse rounded-xl bg-white/10" />
                    ) : (
                        <p className="mt-1 text-xl font-semibold sm:text-2xl">{totalClinicasCobertas}</p>
                    )}
                </section>
            </div>

            <div className={`${cardShell} overflow-hidden`}>
                <div className="flex flex-col gap-2 border-b border-black/5 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
                    <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[#f3f4f1] p-2 text-neutral-700"><Users size={18} /></span>
                        <h3 className="text-base font-semibold text-neutral-900 sm:text-lg">Colaboradores</h3>
                    </div>
                    <p className="text-xs text-neutral-500">Permissões, horários e comissão em Editar</p>
                </div>

                {kpiLoading ? (
                    <div className="space-y-2 p-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex h-14 animate-pulse items-center gap-3 rounded-2xl bg-neutral-50 px-3" />
                        ))}
                    </div>
                ) : (
                <>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[540px] text-sm">
                    <thead>
                        <tr className="border-b border-black/5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                            <th className="px-4 py-3 text-left sm:px-5">Nome</th>
                            <th className="px-4 py-3 text-left sm:px-5">Cargo</th>
                            <th className="hidden px-4 py-3 text-left sm:table-cell sm:px-5">Unidades</th>
                            <th className="px-4 py-3 text-left sm:px-5">Status</th>
                            <th className="px-4 py-3 text-right sm:px-5">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                        {profissionais.map((p) => (
                            <tr key={p.id} className="hover:bg-neutral-50/60">
                                <td className="px-4 py-3.5 sm:px-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-neutral-500 to-neutral-900 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                                            {p.nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-bold text-neutral-700 text-sm">{p.nome}</p>
                                            {p.nivel_acesso === 'admin' && (
                                                <p className="text-[10px] font-bold text-neutral-500 uppercase">Administrador</p>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3.5 text-sm font-medium text-neutral-700 sm:px-5">{p.cargo || '—'}</td>
                                <td className="hidden px-4 py-3.5 sm:table-cell sm:px-5">
                                    <div className="flex flex-wrap gap-1">
                                        {(p.clinicas || []).slice(0, 3).map((c, index) => (
                                            <span key={`${c.id}-${index}`} className="text-[10px] font-bold bg-neutral-100 text-neutral-600 px-2 py-1 rounded-md uppercase tracking-wide">
                                                {c.nome}
                                            </span>
                                        ))}
                                        {(p.clinicas || []).length > 3 && (
                                            <span className="text-[10px] font-bold text-neutral-400">+{(p.clinicas || []).length - 3}</span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3.5 sm:px-5">
                                    {p.precisa_trocar_senha ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-md uppercase">
                                            <KeyRound size={10} /> Senha provisória
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded-md uppercase">
                                            <Check size={10} /> Ativo
                                        </span>
                                    )}
                                </td>
                                <td className="px-4 py-3.5 text-right sm:px-5">
                                    <button
                                        type="button"
                                        onClick={() => abrirEditorAvancado(p)}
                                        className="touch-target inline-flex items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                                    >
                                        <Settings size={12}/> Editar
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {profissionais.length === 0 && (
                            <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-neutral-400">Nenhum profissional cadastrado.</td></tr>
                        )}
                    </tbody>
                </table>
                </div>

                {clinicaIdNumerica && (
                    <div className="border-t border-black/5 p-4 md:p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="rounded-full bg-emerald-100 p-2 text-emerald-700"><DollarSign size={16} /></span>
                                <div>
                                    <h4 className="text-sm font-semibold text-neutral-900">Comissões consolidadas</h4>
                                    <p className="text-[11px] text-neutral-500">Regras ativas em {clinicaNomeAtiva}</p>
                                </div>
                            </div>
                            {comissoesConsolidadasLoading && <Loader2 size={18} className="animate-spin text-neutral-400" />}
                        </div>
                        {comissoesConsolidadas.length === 0 ? (
                            <p className="py-6 text-center text-sm text-neutral-400">Nenhuma regra de comissão ativa nesta clínica.</p>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-black/5">
                                <table className="w-full min-w-[480px] text-sm">
                                    <thead>
                                        <tr className="border-b border-black/5 bg-[#fafaf8] text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                                            <th className="px-4 py-2.5 text-left">Profissional</th>
                                            <th className="px-4 py-2.5 text-left">Gatilho</th>
                                            <th className="px-4 py-2.5 text-left">Tipo</th>
                                            <th className="px-4 py-2.5 text-right">Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/5">
                                        {comissoesConsolidadas.map((r) => (
                                            <tr key={r.id} className="hover:bg-neutral-50/50">
                                                <td className="px-4 py-2.5 font-medium text-neutral-800">{r.profissionais?.nome || `#${r.profissional_id}`}</td>
                                                <td className="px-4 py-2.5 text-neutral-600">{getGatilhoLabel(r.gatilho)}</td>
                                                <td className="px-4 py-2.5 capitalize text-neutral-500">{r.tipo?.replace('_', ' ')}</td>
                                                <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">{formatValorComissao(r.tipo, Number(r.valor))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {clinicaIdNumerica && comissaoLancamentos.length > 0 && (
                    <div className="border-t border-black/5 p-4 md:p-5">
                        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-900">
                            <DollarSign size={16} className="text-neutral-600" /> Lançamentos recentes
                        </h4>
                        <div className="overflow-x-auto rounded-xl border border-black/5">
                            <table className="w-full min-w-[520px] text-sm">
                                <thead>
                                    <tr className="border-b border-black/5 bg-[#fafaf8] text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                                        <th className="px-4 py-2.5 text-left">Profissional</th>
                                        <th className="px-4 py-2.5 text-left">Descrição</th>
                                        <th className="px-4 py-2.5 text-right">Base</th>
                                        <th className="px-4 py-2.5 text-right">Comissão</th>
                                        <th className="px-4 py-2.5 text-left">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5">
                                    {comissaoLancamentos.map((l) => (
                                        <tr key={l.id} className="hover:bg-neutral-50/50">
                                            <td className="px-4 py-2.5 font-medium text-neutral-800">{l.profissionais?.nome || `#${l.profissional_id}`}</td>
                                            <td className="max-w-[200px] truncate px-4 py-2.5 text-xs text-neutral-600">{l.descricao}</td>
                                            <td className="px-4 py-2.5 text-right text-neutral-600">R$ {Number(l.valor_base).toFixed(2)}</td>
                                            <td className="px-4 py-2.5 text-right font-semibold text-neutral-900">R$ {Number(l.valor_comissao).toFixed(2)}</td>
                                            <td className="px-4 py-2.5"><span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-neutral-600">{l.status}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                </>
                )}
            </div>

            {/* Editor avançado */}
            <Modal open={!!(editorAberto && profissionalSelecionado)} onClose={fecharEditorAvancado} maxWidth="2xl" hideCloseButton panelClassName="bg-white rounded-[1.35rem] shadow-2xl border border-black/10 max-h-[92vh] flex flex-col overflow-hidden">
                        {profissionalSelecionado && (<>
                        <div className="px-6 py-4 border-b border-neutral-100 flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">Edição avançada</p>
                                <h3 className="text-xl font-bold text-neutral-800">{profissionalSelecionado.nome}</h3>
                                <p className="text-xs font-semibold text-neutral-500">{clinicaNomeAtiva}</p>
                            </div>
                            <button onClick={fecharEditorAvancado} className="p-2 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50">
                                <X size={18}/>
                            </button>
                        </div>
                        {(!activeClinicId || activeClinicId === 'all') && (
                            <div className="px-6 py-3 bg-amber-50 text-amber-800 text-sm font-bold border-b border-amber-100 flex items-center gap-2">
                                <AlertTriangle size={16}/>Selecione uma clínica específica para aplicar as alterações.
                            </div>
                        )}
                        <Tabs value={abaEditor} onValueChange={(value) => setAbaEditor(value as 'permissoes' | 'horarios' | 'comissao')} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                            <div className="px-6 pt-4 flex-none">
                                <TabsList className="bg-neutral-100 rounded-2xl p-1 w-full grid grid-cols-3">
                                    <TabsTrigger value="permissoes" className="touch-target text-xs font-bold">Permissões</TabsTrigger>
                                    <TabsTrigger value="horarios" className="touch-target text-xs font-bold">Horários</TabsTrigger>
                                    <TabsTrigger value="comissao" className="touch-target text-xs font-bold">Comissão</TabsTrigger>
                                </TabsList>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-4">
                                <TabsContent value="permissoes" className="m-0">{permissoesLoading && clinicaIdNumerica ? <div className="text-sm text-neutral-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin"/>Carregando permissões...</div> : renderPermissoesTab()}</TabsContent>
                                <TabsContent value="horarios" className="m-0">{horarioLoading && clinicaIdNumerica ? <div className="text-sm text-neutral-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin"/>Carregando horários...</div> : renderHorariosTab()}</TabsContent>
                                <TabsContent value="comissao" className="m-0">{renderComissoesTab()}</TabsContent>
                            </div>
                        </Tabs>
                        </>)}
            </Modal>

            <Modal open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="lg" hideCloseButton panelClassName="bg-white rounded-2xl shadow-2xl border border-neutral-100 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
                            <h2 className="font-bold text-neutral-800 flex items-center gap-2"><UserPlus size={18} className="text-neutral-900" /> Novo funcionário</h2>
                            <button onClick={() => setModalOpen(false)} className="touch-target text-neutral-400 hover:text-neutral-700 p-1 rounded-lg hover:bg-neutral-50"><X size={18} /></button>
                        </div>
                        <form onSubmit={salvar} className="p-6 space-y-4">
                            {erro && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-2">
                                    <AlertTriangle size={14} /> {erro}
                                </div>
                            )}

                            <div>
                                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider ml-1 flex items-center gap-1 mb-1"><User size={12}/> Nome completo</label>
                                <input
                                    value={form.nome}
                                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 focus:bg-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 outline-none"
                                    placeholder="Ex.: Dra. Ana Souza"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider ml-1 flex items-center gap-1 mb-1"><Mail size={12}/> E-mail de acesso</label>
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    className="w-full px-3 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 focus:bg-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 outline-none"
                                    placeholder="funcionario@email.com"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider ml-1 flex items-center gap-1 mb-1"><Briefcase size={12}/> Cargo</label>
                                <CustomSelect value={form.cargo} onChange={v => setForm({ ...form, cargo: v })} options={CARGOS.map(c => ({ value: c, label: c }))} size="lg" className="mt-1" />
                            </div>

                            <div>
                                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider ml-1 flex items-center gap-1 mb-2"><Building2 size={12}/> Unidades de acesso</label>
                                <div className="space-y-1.5 max-h-52 overflow-y-auto border border-neutral-100 rounded-xl p-2 bg-neutral-50/50">
                                    {clinics.length === 0 && (
                                        <p className="text-xs text-neutral-400 italic px-2 py-3">Nenhuma unidade disponível na sua rede.</p>
                                    )}
                                    {clinics.map((c) => {
                                        const id = String(c.id);
                                        const checked = form.clinicas.includes(id);
                                        return (
                                            <label
                                                key={id}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${checked ? 'bg-neutral-50 border-black/10' : 'bg-white border-neutral-100 hover:border-neutral-300'}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={() => toggleClinica(id)}
                                                    className="rounded text-neutral-900 focus:ring-neutral-500"
                                                />
                                                <span className="text-sm font-bold text-neutral-700">{getClinicLabel(c)}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-50">
                                <button type="button" onClick={() => setModalOpen(false)} className="touch-target px-4 py-2 text-sm font-bold text-neutral-500 hover:bg-neutral-50 rounded-lg">Cancelar</button>
                                <button type="submit" disabled={salvando} className="touch-target px-5 py-2 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white text-sm font-bold rounded-lg flex items-center gap-2 shadow-md shadow-black/10">
                                    {salvando ? <Loader2 size={14} className="animate-spin"/> : <UserPlus size={14}/>}
                                    Criar funcionário
                                </button>
                            </div>
                        </form>
            </Modal>

            <Modal open={!!credenciais} onClose={() => setCredenciais(null)} maxWidth="md" hideCloseButton panelClassName="bg-white rounded-2xl shadow-2xl border border-neutral-100 overflow-hidden">
                        {credenciais && (<>
                        <div className="bg-neutral-900 px-6 py-5 text-white">
                            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center mb-2">
                                <Check size={24} />
                            </div>
                            <h2 className="font-bold text-lg">Usuário criado com sucesso!</h2>
                            <p className="text-emerald-50 text-xs mt-0.5">Envie estes dados para <strong>{credenciais.nome}</strong> com segurança.</p>
                        </div>
                        <div className="p-6 space-y-3">
                            <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400 mb-0.5">E-mail</p>
                                        <p className="text-sm font-bold text-neutral-700 font-mono break-all">{credenciais.email}</p>
                                    </div>
                                    <button onClick={() => copiar('email')} className="ml-2 p-2 rounded-lg hover:bg-white text-neutral-400 hover:text-neutral-900 transition-all">
                                        {copiado === 'email' ? <Check size={16} className="text-emerald-600"/> : <Copy size={16}/>}
                                    </button>
                                </div>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-wider text-amber-700 mb-0.5">Senha temporária</p>
                                        <p className="text-xl font-bold text-amber-900 font-mono tracking-widest">{credenciais.senha}</p>
                                    </div>
                                    <button onClick={() => copiar('senha')} className="ml-2 p-2 rounded-lg hover:bg-white text-amber-600 hover:text-amber-700 transition-all">
                                        {copiado === 'senha' ? <Check size={16} className="text-emerald-600"/> : <Copy size={16}/>}
                                    </button>
                                </div>
                                <p className="text-[10px] text-amber-700 mt-2 font-medium">
                                    O funcionário será obrigado a trocar a senha no primeiro acesso.
                                </p>
                            </div>
                            <button
                                onClick={() => copiar('tudo')}
                                className="touch-target w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-bold rounded-lg"
                            >
                                {copiado === 'tudo' ? <><Check size={14} className="text-emerald-600"/> Copiado!</> : <><Copy size={14}/> Copiar tudo</>}
                            </button>
                            <button
                                onClick={() => setCredenciais(null)}
                                className="touch-target w-full px-4 py-3 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-bold rounded-lg shadow-md shadow-black/10"
                            >
                                Concluir
                            </button>
                        </div>
                        </>)}
            </Modal>
        </div>
    );
}
