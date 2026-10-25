'use client';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { clinicScope, readRouteCache, writeRouteCache } from '@/lib/routeListCache';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useClinica, getClinicLabel } from '@/app/context/ClinicaContext';
import { fetchUserEquipe } from '@/lib/clinicScoped';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import Modal from '@/components/ui/Modal';
import Aviso from '@/components/ui/Aviso';
import CustomSelect from '@/components/ui/CustomSelect';
import CampoHora from '@/components/ui/CampoHora';
import Switch from '@/components/ui/Switch';
import {
    UserPlus, Loader2, X, ShieldCheck, Copy, Check,
    AlertTriangle,
    Trash2, Plus, ArrowUpDown, Edit,
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
const COMISSOES_CACHE_KEY = 'ortus:equipe:comissoes:v1';

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
    const [perfilResolvido, setPerfilResolvido] = useState(false);
    const [ordenacao, setOrdenacao] = useState<{ campo: 'nome' | 'cargo' | 'unidades' | 'status'; dir: 'asc' | 'desc' }>({ campo: 'nome', dir: 'asc' });
    const [ordenacaoComissao, setOrdenacaoComissao] = useState<{ campo: 'profissional' | 'gatilho' | 'tipo' | 'valor'; dir: 'asc' | 'desc' }>({ campo: 'profissional', dir: 'asc' });

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
    const comissaoScope = activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : null;
    const bootComissoes = comissaoScope
        ? readRouteCache<(ComissaoRegra & { profissionais?: { nome: string } | null })[]>(COMISSOES_CACHE_KEY, comissaoScope)
        : null;
    const [comissoesConsolidadas, setComissoesConsolidadas] = useState<(ComissaoRegra & { profissionais?: { nome: string } | null })[]>(() => bootComissoes ?? []);
    const [comissoesConsolidadasLoading, setComissoesConsolidadasLoading] = useState(() => !bootComissoes);
    const [comissaoLancamentos, setComissaoLancamentos] = useState<any[]>([]);
    const [nivelAcessoEdit, setNivelAcessoEdit] = useState<'comum' | 'admin'>('comum');
    const [aviso, setAviso] = useState<string | null>(null);
    const avisoTimer = useRef<number | null>(null);

    function avisar(mensagem: string) {
        setAviso(mensagem);
        if (avisoTimer.current) window.clearTimeout(avisoTimer.current);
        avisoTimer.current = window.setTimeout(() => setAviso(null), 2600);
    }

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
            if (!user) {
                if (gen === fetchGen.current) {
                    setPerfilCaller(null);
                    setPerfilResolvido(true);
                    setLoading(false);
                }
                return;
            }

            const { data: meu } = await supabase
                .from('profissionais')
                .select('id, nome, nivel_acesso, is_super_admin')
                .eq('user_id', user.id)
                .single();
            if (gen === fetchGen.current) {
                setPerfilCaller(meu);
                setPerfilResolvido(true);
            }

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
            setComissoesConsolidadasLoading(false);
            return;
        }
        const scope = String(clinicaIdNumerica);
        const cached = readRouteCache<(ComissaoRegra & { profissionais?: { nome: string } | null })[]>(COMISSOES_CACHE_KEY, scope);
        if (cached) {
            setComissoesConsolidadas(cached);
            setComissoesConsolidadasLoading(false);
        } else {
            setComissoesConsolidadasLoading(true);
        }
        let ativo = true;
        supabase
            .from('comissoes_regras')
            .select('*, profissionais(nome)')
            .eq('clinica_id', clinicaIdNumerica)
            .eq('ativo', true)
            .order('profissional_id')
            .then(({ data, error }) => {
                if (!ativo) return;
                if (!error) {
                    const rows = (data || []) as typeof comissoesConsolidadas;
                    writeRouteCache(COMISSOES_CACHE_KEY, scope, rows);
                    setComissoesConsolidadas(rows);
                }
                setComissoesConsolidadasLoading(false);
            });
        supabase
            .from('comissoes_lancamentos')
            .select('*, profissionais(nome)')
            .eq('clinica_id', clinicaIdNumerica)
            .order('created_at', { ascending: false })
            .limit(20)
            .then(({ data }) => {
                if (ativo) setComissaoLancamentos(data || []);
            });
        return () => { ativo = false; };
    }, [clinicaIdNumerica]);

    function aplicarPresetPermissoes(presetId: PermissionPresetId) {
        setPermissoesMapa(buildPresetAccessMap(presetId));
        setPermissoesDirty(true);
    }

    async function salvarEditor() {
        if (!profissionalSelecionado) return;
        if (abaEditor === 'horarios') {
            await salvarHorario();
            return;
        }
        if (abaEditor !== 'permissoes') return;
        if (!clinicaIdNumerica) {
            showAlert('Selecione uma clínica específica no topo para editar permissões.', { type: 'warning' });
            return;
        }
        const nivelAtual = profissionalSelecionado.nivel_acesso === 'admin' ? 'admin' : 'comum';
        const nivelMudou = nivelAcessoEdit !== nivelAtual;
        setPermissoesSaving(true);
        try {
            if (nivelMudou) {
                const { error } = await supabase
                    .from('profissionais')
                    .update({ nivel_acesso: nivelAcessoEdit })
                    .eq('id', profissionalSelecionado.id);
                if (error) throw error;
                setProfissionalSelecionado((prev) => prev ? { ...prev, nivel_acesso: nivelAcessoEdit } : prev);
                setProfissionais((prev) => prev.map((p) => p.id === profissionalSelecionado.id ? { ...p, nivel_acesso: nivelAcessoEdit } : p));
            }
            if (nivelAcessoEdit !== 'admin' && permissoesDirty) {
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
                setPermissoesDirty(false);
            }
            avisar('Alterações salvas.');
        } catch (err: any) {
            console.error(err);
            await showAlert('Erro ao salvar.', { type: 'error' });
        } finally {
            setPermissoesSaving(false);
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
            avisar('Horário salvo.');
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
                setComissoesConsolidadas((prev) => {
                    const row = { ...(data as ComissaoRegra), profissionais: { nome: profissionalSelecionado.nome } };
                    const next = row.ativo === false ? prev.filter((r) => r.id !== row.id) : [row, ...prev.filter((r) => r.id !== row.id)];
                    if (clinicaIdNumerica) writeRouteCache(COMISSOES_CACHE_KEY, String(clinicaIdNumerica), next);
                    return next;
                });
                setComissaoEditandoId(null);
                setComissaoForm({ gatilho: GATILHOS_COMISSAO[0].value, tipo: TIPOS_COMISSAO[0].value, valor: '', ativo: true });
                avisar('Regra atualizada.');
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
                if (comissaoForm.ativo) {
                    const row = { ...(data as ComissaoRegra), profissionais: { nome: profissionalSelecionado.nome } };
                    setComissoesConsolidadas((prev) => {
                        const next = [row, ...prev];
                        if (clinicaIdNumerica) writeRouteCache(COMISSOES_CACHE_KEY, String(clinicaIdNumerica), next);
                        return next;
                    });
                }
                setComissaoForm((prev) => ({ ...prev, valor: '' }));
                avisar('Regra adicionada.');
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
            const row = data as ComissaoRegra;
            setComissoesConsolidadas((prev) => {
                const next = row.ativo === false
                    ? prev.filter((r) => r.id !== row.id)
                    : [{ ...row, profissionais: { nome: profissionalSelecionado?.nome || prev.find((r) => r.id === row.id)?.profissionais?.nome || '' } }, ...prev.filter((r) => r.id !== row.id)];
                if (clinicaIdNumerica) writeRouteCache(COMISSOES_CACHE_KEY, String(clinicaIdNumerica), next);
                return next;
            });
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
            setComissoesConsolidadas((prev) => {
                const next = prev.filter((regra) => regra.id !== id);
                if (clinicaIdNumerica) writeRouteCache(COMISSOES_CACHE_KEY, String(clinicaIdNumerica), next);
                return next;
            });
            avisar('Regra removida.');
        } catch (err: any) {
            console.error(err);
            await showAlert('Erro ao excluir regra de comissão.', { type: 'error' });
        } finally {
            setComissaoExcluindo(null);
        }
    }

    const campoClasse = 'box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900';
    const rotuloClasse = 'mb-1.5 block text-xs font-medium text-neutral-500';
    const acaoClasse = 'inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40';

    const renderClinicaObrigatoria = () => (
        <p className="text-sm text-amber-800">Selecione uma clínica específica para gerenciar este recurso.</p>
    );

    const renderPermissoesTab = () => {
        if (!profissionalSelecionado) return null;
        if (!clinicaIdNumerica) return renderClinicaObrigatoria();
        return (
            <div className="space-y-2.5">
                <div>
                    <span className={rotuloClasse}>Nível de acesso</span>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => setNivelAcessoEdit('comum')} className={`h-10 rounded-md border px-3 text-sm font-medium ${nivelAcessoEdit === 'comum' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700'}`}>Comum</button>
                        <button type="button" onClick={() => setNivelAcessoEdit('admin')} className={`h-10 rounded-md border px-3 text-sm font-medium ${nivelAcessoEdit === 'admin' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700'}`}>Admin</button>
                    </div>
                </div>
                <div className={nivelAcessoEdit === 'admin' ? 'pointer-events-none opacity-40' : ''}>
                    <span className={rotuloClasse}>Perfis rápidos</span>
                    <div className="flex flex-wrap gap-1.5">
                        {PERMISSION_PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                disabled={nivelAcessoEdit === 'admin'}
                                onClick={() => aplicarPresetPermissoes(preset.id)}
                                className="h-9 rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                                title={preset.description}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const renderModulos = () => (
        <div className={`divide-y divide-black/5 ${nivelAcessoEdit === 'admin' ? 'pointer-events-none opacity-40' : ''}`}>
            {MODULES.map((modulo) => (
                <div key={modulo.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900">{modulo.label}</p>
                        <p className="text-xs text-neutral-500">{modulo.description}</p>
                    </div>
                    <Switch
                        checked={!!permissoesMapa[modulo.id]}
                        onChange={() => toggleModulo(modulo.id)}
                        disabled={permissoesLoading || nivelAcessoEdit === 'admin'}
                    />
                </div>
            ))}
        </div>
    );

    const renderHorariosTab = () => {
        if (!profissionalSelecionado) return null;
        if (!clinicaIdNumerica) return renderClinicaObrigatoria();
        return (
            <div className="space-y-2.5">
                {horarioLoading && (
                    <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin"/>Carregando horário...</div>
                )}
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                    <label>
                        <span className={rotuloClasse}>Início</span>
                        <CampoHora value={horarioState.inicio} onChange={(v) => atualizarHorario('inicio', v)} />
                    </label>
                    <label>
                        <span className={rotuloClasse}>Término</span>
                        <CampoHora value={horarioState.fim} onChange={(v) => atualizarHorario('fim', v)} />
                    </label>
                    <label>
                        <span className={rotuloClasse}>Intervalo (min)</span>
                        <input type="number" min={5} value={horarioState.intervalo} onChange={(e) => atualizarHorario('intervalo', Number(e.target.value))} className={campoClasse} />
                    </label>
                    <label>
                        <span className={rotuloClasse}>Limite simultâneo</span>
                        <input type="number" min={1} value={horarioState.limiteSimultaneo} onChange={(e) => atualizarHorario('limiteSimultaneo', Number(e.target.value) || 1)} className={campoClasse} />
                    </label>
                </div>
                <div>
                    <span className={rotuloClasse}>Dias de atendimento</span>
                    <div className="flex flex-wrap gap-1.5">
                        {DIAS_SEMANA.map((dia) => {
                            const ativo = horarioState.dias[dia.id];
                            return (
                                <button
                                    key={dia.id}
                                    type="button"
                                    onClick={() => toggleDiaHorario(dia.id)}
                                    className={`h-9 rounded-md border px-3 text-sm font-medium ${ativo ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
                                >
                                    {dia.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <label className="block">
                    <span className={rotuloClasse}>Observações</span>
                    <textarea
                        rows={2}
                        value={horarioState.observacoes}
                        onChange={(e) => atualizarHorario('observacoes', e.target.value)}
                        className="w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
                        placeholder="Ex.: Pausa para almoço das 12h às 13h"
                    />
                </label>
            </div>
        );
    };

    const renderComissoesTab = () => {
        if (!profissionalSelecionado) return null;
        if (!clinicaIdNumerica) return renderClinicaObrigatoria();
        return (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
                <form onSubmit={salvarComissaoRapida} className="grid shrink-0 grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
                    <label className="sm:col-span-2">
                        <span className={rotuloClasse}>Gatilho</span>
                        <CustomSelect value={comissaoForm.gatilho} onChange={v => setComissaoForm(prev => ({ ...prev, gatilho: v }))} options={GATILHOS_COMISSAO.map(g => ({ value: g.value, label: g.label }))} size="md" />
                    </label>
                    <label>
                        <span className={rotuloClasse}>Tipo</span>
                        <CustomSelect value={comissaoForm.tipo} onChange={v => setComissaoForm(prev => ({ ...prev, tipo: v }))} options={TIPOS_COMISSAO.map(t => ({ value: t.value, label: t.label }))} size="md" />
                    </label>
                    <label>
                        <span className={rotuloClasse}>Valor</span>
                        <input type="number" step="0.01" min={0} value={comissaoForm.valor} onChange={(e) => setComissaoForm((prev) => ({ ...prev, valor: e.target.value }))} className={campoClasse} placeholder={comissaoForm.tipo === 'percentual' ? '0 a 100' : '0,00'} />
                    </label>
                    <div className="flex h-10 items-center justify-between gap-3 sm:col-span-2">
                        <span className="text-sm text-neutral-700">Regra ativa</span>
                        <Switch checked={comissaoForm.ativo} onChange={(ativo) => setComissaoForm((prev) => ({ ...prev, ativo }))} />
                    </div>
                    <div className="flex items-end justify-end gap-2 sm:col-span-2">
                        <button type="button" onClick={cancelarEdicaoComissao} className="h-9 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900">
                            Cancelar
                        </button>
                        <button type="submit" disabled={comissaoSaving} className={acaoClasse}>
                            {comissaoSaving ? <Loader2 size={15} className="animate-spin"/> : (comissaoEditandoId ? <Check size={15}/> : <Plus size={15}/>)}
                            {comissaoEditandoId ? 'Salvar' : 'Adicionar'}
                        </button>
                    </div>
                </form>
                <div className="min-h-0 flex-1 divide-y divide-black/5 overflow-y-auto border-t border-black/5">
                    {comissoesLoading ? (
                        <div className="flex items-center gap-2 py-3 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin"/>Carregando regras...</div>
                    ) : comissoes.length === 0 ? (
                        <p className="py-4 text-sm text-neutral-400">Nenhuma regra cadastrada para esta clínica.</p>
                    ) : (
                        comissoes.map((regra) => (
                            <div key={regra.id} className={`flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between ${regra.ativo === false ? 'opacity-60' : ''}`}>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-neutral-900">{getGatilhoLabel(regra.gatilho)}</p>
                                    <p className="text-xs text-neutral-500">{regra.tipo === 'percentual' ? 'Percentual' : 'Valor fixo'} · {formatValorComissao(regra.tipo, regra.valor)}{regra.ativo === false ? ' · Inativa' : ''}</p>
                                </div>
                                <div className="flex gap-1">
                                    <button type="button" onClick={() => toggleComissaoAtiva(regra)} className="h-8 rounded-md px-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900">
                                        {regra.ativo !== false ? 'Desativar' : 'Ativar'}
                                    </button>
                                    <button type="button" onClick={() => editarComissaoRegra(regra)} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900">
                                        <Edit size={13}/> Editar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => excluirComissaoRegra(regra.id)}
                                        disabled={comissaoExcluindo === regra.id}
                                        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-neutral-400 hover:text-rose-600 disabled:opacity-50"
                                    >
                                        {comissaoExcluindo === regra.id ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>}
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

    const totalAtivos = profissionais.length;
    const totalAdmins = profissionais.filter((p) => p.nivel_acesso === 'admin').length;
    const pendentesSenha = profissionais.filter((p) => p.precisa_trocar_senha).length;

    function alternarOrdem(campo: 'nome' | 'cargo' | 'unidades' | 'status') {
        setOrdenacao((prev) => prev.campo === campo ? { campo, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: 'asc' });
    }

    function alternarOrdemComissao(campo: 'profissional' | 'gatilho' | 'tipo' | 'valor') {
        setOrdenacaoComissao((prev) => prev.campo === campo ? { campo, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: 'asc' });
    }

    const profissionaisOrdenados = [...profissionais].sort((a, b) => {
        const valor = (p: Profissional) => {
            if (ordenacao.campo === 'cargo') return p.cargo || '';
            if (ordenacao.campo === 'unidades') return (p.clinicas || []).map((c) => c.nome).sort((x, y) => x.localeCompare(y, 'pt-BR'))[0] || '';
            if (ordenacao.campo === 'status') return p.precisa_trocar_senha ? 'senha provisória' : 'ativo';
            return p.nome || '';
        };
        const cmp = valor(a).localeCompare(valor(b), 'pt-BR', { sensitivity: 'base' });
        return ordenacao.dir === 'asc' ? cmp : -cmp;
    });

    const kpiLoading = loading && !jaCarregou.current;

    if (perfilResolvido && !isAdmin && !clinicLoading) {
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
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
            <Aviso mensagem={aviso} />
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Equipe</h1>
                    <p className="mt-1 text-sm text-neutral-500 sm:text-base">
                        {activeClinic ? getClinicLabel(activeClinic) : 'Todas as clínicas'}
                        {' · '}
                        <span className="tabular-nums text-neutral-900">{totalAtivos}</span> {totalAtivos === 1 ? 'profissional' : 'profissionais'}
                        {' · '}
                        <span className="tabular-nums text-neutral-900">{totalAdmins}</span> {totalAdmins === 1 ? 'gestor' : 'gestores'}
                        {' · '}
                        <span className="tabular-nums text-neutral-900">{pendentesSenha}</span> com senha provisória
                    </p>
                </div>
                <button
                    type="button"
                    onClick={abrirModal}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
                >
                    <UserPlus size={16} /> Adicionar
                </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3">
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="shrink-0 px-3 pt-3">
                    <h2 className="text-base font-semibold text-neutral-900">Colaboradores</h2>
                </div>

                {kpiLoading ? (
                    <div className="space-y-2 p-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 animate-pulse rounded-md bg-neutral-50" />
                        ))}
                    </div>
                ) : (
                <div className="min-h-0 flex-1 overflow-auto">
                    <table className="w-full min-w-[540px] text-sm">
                    <thead className="sticky top-0 z-10 bg-white">
                        <tr className="border-b border-black/5">
                            {([
                                ['nome', 'Nome'],
                                ['cargo', 'Cargo'],
                                ['unidades', 'Unidades'],
                                ['status', 'Status'],
                            ] as const).map(([campo, label]) => (
                                <th key={campo} className={`px-4 py-2 text-left sm:px-5 ${campo === 'unidades' ? 'hidden sm:table-cell' : ''}`}>
                                    <button type="button" onClick={() => alternarOrdem(campo)} className="inline-flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-neutral-900">
                                        {label}
                                        <ArrowUpDown size={12} className={ordenacao.campo === campo ? 'text-neutral-900' : 'text-neutral-300'} />
                                    </button>
                                </th>
                            ))}
                            <th className="px-4 py-2 text-right text-xs font-medium text-neutral-400 sm:px-5">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                        {profissionaisOrdenados.map((p) => {
                            const partes = p.nome.trim().split(/\s+/);
                            const iniciais = ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?';
                            return (
                            <tr key={p.id} className="hover:bg-neutral-50/60">
                                <td className="px-4 py-2.5 sm:px-5">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f4f1] text-[11px] font-medium text-neutral-500">
                                            {iniciais}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-neutral-900">{p.nome}</p>
                                            {p.nivel_acesso === 'admin' && (
                                                <p className="text-xs text-neutral-500">Administrador</p>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-2.5 text-sm text-neutral-700 sm:px-5">{p.cargo || '—'}</td>
                                <td className="hidden px-4 py-2.5 sm:table-cell sm:px-5">
                                    <p className="text-sm text-neutral-600">
                                        {(p.clinicas || []).slice(0, 3).map((c) => c.nome).join(', ') || '—'}
                                        {(p.clinicas || []).length > 3 ? ` +${(p.clinicas || []).length - 3}` : ''}
                                    </p>
                                </td>
                                <td className="px-4 py-2.5 sm:px-5">
                                    <span className="inline-flex items-center gap-1.5 text-sm text-neutral-700">
                                        <span className={`h-1.5 w-1.5 rounded-full ${p.precisa_trocar_senha ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                        {p.precisa_trocar_senha ? 'Senha provisória' : 'Ativo'}
                                    </span>
                                </td>
                                <td className="px-4 py-2.5 text-right sm:px-5">
                                    <button
                                        type="button"
                                        onClick={() => abrirEditorAvancado(p)}
                                        className="inline-flex h-8 items-center text-sm font-medium text-neutral-600 hover:text-neutral-900"
                                    >
                                        Editar
                                    </button>
                                </td>
                            </tr>
                            );
                        })}
                        {profissionais.length === 0 && (
                            <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-neutral-400">Nenhum profissional cadastrado.</td></tr>
                        )}
                    </tbody>
                </table>
                </div>
                )}
            </section>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                <div className="flex shrink-0 items-center justify-between gap-3 px-3 pt-3">
                    <h2 className="text-base font-semibold text-neutral-900">Comissões</h2>
                    {comissoesConsolidadasLoading && <Loader2 size={16} className="animate-spin text-neutral-400" />}
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                {!clinicaIdNumerica ? (
                    <p className="px-3 py-6 text-center text-sm text-neutral-400">Selecione uma clínica para ver as comissões.</p>
                ) : comissoesConsolidadasLoading && comissoesConsolidadas.length === 0 ? (
                    <div className="space-y-2 p-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-10 animate-pulse rounded-md bg-neutral-50" />
                        ))}
                    </div>
                ) : comissoesConsolidadas.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-neutral-400">Nenhuma regra de comissão ativa nesta clínica.</p>
                ) : (
                                <table className="w-full min-w-[540px] text-sm">
                                    <thead className="sticky top-0 z-10 bg-white">
                                        <tr className="border-b border-black/5">
                                            {([
                                                ['profissional', 'Profissional', 'text-left'],
                                                ['gatilho', 'Gatilho', 'text-left'],
                                                ['tipo', 'Tipo', 'text-left'],
                                                ['valor', 'Valor', 'text-right'],
                                            ] as const).map(([campo, label, align]) => (
                                                <th key={campo} className={`px-4 py-2 ${align}`}>
                                                    <button type="button" onClick={() => alternarOrdemComissao(campo)} className={`inline-flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-neutral-900 ${align === 'text-right' ? 'ml-auto' : ''}`}>
                                                        {label}
                                                        <ArrowUpDown size={12} className={ordenacaoComissao.campo === campo ? 'text-neutral-900' : 'text-neutral-300'} />
                                                    </button>
                                                </th>
                                            ))}
                                            <th className="px-4 py-2 text-right text-xs font-medium text-neutral-400 sm:px-5">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black/5">
                                        {[...comissoesConsolidadas].sort((a, b) => {
                                            const valor = (r: typeof a) => {
                                                if (ordenacaoComissao.campo === 'profissional') return r.profissionais?.nome || '';
                                                if (ordenacaoComissao.campo === 'gatilho') return getGatilhoLabel(r.gatilho);
                                                if (ordenacaoComissao.campo === 'tipo') return r.tipo || '';
                                                return String(r.valor ?? '');
                                            };
                                            const cmp = ordenacaoComissao.campo === 'valor'
                                                ? Number(a.valor) - Number(b.valor)
                                                : valor(a).localeCompare(valor(b), 'pt-BR', { sensitivity: 'base' });
                                            return ordenacaoComissao.dir === 'asc' ? cmp : -cmp;
                                        }).map((r) => (
                                            <tr key={r.id} className="hover:bg-neutral-50/50">
                                                <td className="px-4 py-2.5 font-medium text-neutral-800">{r.profissionais?.nome || `#${r.profissional_id}`}</td>
                                                <td className="px-4 py-2.5 text-neutral-600">{getGatilhoLabel(r.gatilho)}</td>
                                                <td className="px-4 py-2.5 capitalize text-neutral-500">{r.tipo?.replace('_', ' ')}</td>
                                                <td className="px-4 py-2.5 text-right text-sm font-medium text-neutral-900">{formatValorComissao(r.tipo, Number(r.valor))}</td>
                                                <td className="px-4 py-2.5 text-right sm:px-5">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const prof = profissionais.find((p) => String(p.id) === String(r.profissional_id));
                                                            if (!prof) {
                                                                avisar('Profissional não encontrado nesta equipe.');
                                                                return;
                                                            }
                                                            abrirEditorAvancado(prof, 'comissao');
                                                        }}
                                                        className="inline-flex h-8 items-center text-sm font-medium text-neutral-600 hover:text-neutral-900"
                                                    >
                                                        Editar
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                )}
                {clinicaIdNumerica && comissaoLancamentos.length > 0 && (
                    <div className="border-t border-black/5 px-3 py-3">
                        <h3 className="mb-2 text-base font-semibold text-neutral-900">Lançamentos recentes</h3>
                        <table className="w-full min-w-[520px] text-sm">
                            <thead>
                                <tr className="border-b border-black/5 text-xs font-medium text-neutral-400">
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
                                        <td className="px-4 py-2.5 text-sm capitalize text-neutral-600">{l.status}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                </div>
            </section>
            </div>

            {/* Editor avançado */}
            <Modal open={!!(editorAberto && profissionalSelecionado)} onClose={fecharEditorAvancado} maxWidth="lg" hideCloseButton panelClassName="flex h-[min(85vh,640px)] max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                        {profissionalSelecionado && (<>
                        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
                            <div>
                                <h2 className="text-lg font-semibold text-neutral-900">{profissionalSelecionado.nome}</h2>
                                <p className="mt-0.5 text-xs font-medium text-neutral-400">{clinicaNomeAtiva}</p>
                            </div>
                            <button type="button" onClick={fecharEditorAvancado} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Fechar">
                                <X size={18}/>
                            </button>
                        </div>
                        <div className="flex shrink-0 gap-4 border-b border-black/5 px-5 sm:px-6">
                            {([
                                ['permissoes', 'Permissões'],
                                ['horarios', 'Horários'],
                                ['comissao', 'Comissão'],
                            ] as const).map(([id, label]) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setAbaEditor(id)}
                                    className={`border-b-2 py-2.5 text-sm font-medium ${abaEditor === id ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                            {abaEditor === 'permissoes' && (
                                permissoesLoading && clinicaIdNumerica ? (
                                    <div className="flex items-center gap-2 px-5 py-4 text-sm text-neutral-500 sm:px-6"><Loader2 size={16} className="animate-spin"/>Carregando permissões...</div>
                                ) : (
                                    <>
                                        <div className="shrink-0 px-5 pt-4 sm:px-6">{renderPermissoesTab()}</div>
                                        {clinicaIdNumerica && (
                                            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 sm:px-6">{renderModulos()}</div>
                                        )}
                                    </>
                                )
                            )}
                            {abaEditor === 'horarios' && (
                                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                                    {horarioLoading && clinicaIdNumerica ? <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={16} className="animate-spin"/>Carregando horários...</div> : renderHorariosTab()}
                                </div>
                            )}
                            {abaEditor === 'comissao' && (
                                <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4 sm:px-6">{renderComissoesTab()}</div>
                            )}
                        </div>
                        {abaEditor !== 'comissao' && profissionalSelecionado && clinicaIdNumerica && (
                            <div className="flex shrink-0 justify-end gap-2 border-t border-black/5 px-5 py-4 sm:px-6">
                                <button type="button" onClick={fecharEditorAvancado} className="h-9 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900">Cancelar</button>
                                <button
                                    type="button"
                                    onClick={salvarEditor}
                                    disabled={
                                        permissoesSaving || horarioSaving ||
                                        (abaEditor === 'horarios' ? !horarioDirty : (
                                            nivelAcessoEdit === (profissionalSelecionado.nivel_acesso === 'admin' ? 'admin' : 'comum') && !permissoesDirty
                                        ))
                                    }
                                    className={acaoClasse}
                                >
                                    {(permissoesSaving || horarioSaving) ? <Loader2 size={15} className="animate-spin"/> : <Check size={15}/>} Salvar
                                </button>
                            </div>
                        )}
                        </>)}
            </Modal>

            <Modal open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="lg" hideCloseButton panelClassName="overflow-visible rounded-xl border border-neutral-200 bg-white">
                <form onSubmit={salvar} className="px-5 py-4 sm:px-6 sm:py-5">
                    <div className="mb-5 flex items-start justify-between gap-3 border-b border-black/5 pb-4">
                        <div>
                            <h2 className="text-lg font-semibold text-neutral-900">Novo funcionário</h2>
                            <p className="mt-0.5 text-xs font-medium text-neutral-400">Nome, acesso e unidades da rede.</p>
                        </div>
                        <button type="button" onClick={() => setModalOpen(false)} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={18}/></button>
                    </div>
                    {erro && (
                        <p className="mb-3 flex items-center gap-2 text-xs font-medium text-rose-600">
                            <AlertTriangle size={14} /> {erro}
                        </p>
                    )}
                    <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
                        <label className="sm:col-span-2">
                            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Nome</span>
                            <input
                                value={form.nome}
                                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                                className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
                                placeholder="Ex.: Dra. Ana Souza"
                                required
                            />
                        </label>
                        <label>
                            <span className="mb-1.5 block text-xs font-medium text-neutral-500">E-mail</span>
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                className="box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
                                placeholder="funcionario@email.com"
                                required
                            />
                        </label>
                        <label>
                            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Cargo</span>
                            <CustomSelect value={form.cargo} onChange={v => setForm({ ...form, cargo: v })} options={CARGOS.map(c => ({ value: c, label: c }))} size="md" />
                        </label>
                        <div className="sm:col-span-2">
                            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Unidades de acesso</span>
                            <div className="grid max-h-36 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                                {clinics.length === 0 && (
                                    <p className="text-sm text-neutral-400">Nenhuma unidade disponível na sua rede.</p>
                                )}
                                {clinics.map((c) => {
                                    const id = String(c.id);
                                    const checked = form.clinicas.includes(id);
                                    return (
                                        <label
                                            key={id}
                                            className={`flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${checked ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleClinica(id)}
                                                className="sr-only"
                                            />
                                            <span className="truncate">{getClinicLabel(c)}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="mt-5 flex justify-end border-t border-black/5 pt-4">
                        <button type="submit" disabled={salvando} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40">
                            {salvando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                            Cadastrar
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
