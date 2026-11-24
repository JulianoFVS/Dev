'use client';
import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
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
    clinica_id?: string | number | null;
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
    /** Clínicas em que atende (de `profissionais_clinicas`). Ausente quando não se sabe. */
    clinicas?: string[];
}

interface Paciente {
    id: string;
    nome: string;
    telefone: string | null;
    clinica_id?: string | number | null;
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
    // TypeError é a falha de rede do navegador ("Failed to fetch"): texto técnico, em inglês.
    return err instanceof Error && !(err instanceof TypeError) && err.message ? err.message : padrao;
}

/**
 * Aviso de falha do Supabase que pode ir para a tela. Texto do banco ou do navegador
 * ("TypeError: Failed to fetch", "JWT expired", mensagens do Postgres) vira a frase fixa;
 * só a frase do modo de consulta (PT402, "Assinatura suspensa...") passa como veio.
 */
function avisoDeFalha(erro: { message?: string; code?: string } | null, padrao: string): string {
    const texto = (erro?.message || '').trim();
    if (erro?.code === 'PT402' || /^Assinatura suspensa/.test(texto)) return texto || padrao;
    if (erro?.code === '42501') return 'Você não tem permissão para alterar tarefas desta clínica.';
    return padrao;
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

type VinculoClinica = { profissional_id?: string | number | null; clinica_id?: string | number | null };

/** Põe em cada profissional as clínicas em que atende. Sem vínculo conhecido, fica sem a informação. */
function comClinicas(lista: Profissional[], vinculos: VinculoClinica[] | null): Profissional[] {
    if (!vinculos) return lista;
    const porProfissional = new Map<string, string[]>();
    for (const v of vinculos) {
        if (v.profissional_id == null || v.clinica_id == null) continue;
        const chave = String(v.profissional_id);
        porProfissional.set(chave, [...(porProfissional.get(chave) ?? []), String(v.clinica_id)]);
    }
    return lista.map((p) => ({ ...p, clinicas: porProfissional.get(String(p.id)) }));
}

/** Paciente de outra clínica. Sem a clínica dele (cache antigo), não dá para saber: não barra. */
function pacienteDeOutraClinica(p: Paciente | undefined, clinica: string): boolean {
    return !!clinica && p?.clinica_id != null && String(p.clinica_id) !== clinica;
}

/** Responsável que não atende na clínica. Sem os vínculos dele, não dá para saber: não barra. */
function responsavelDeOutraClinica(p: Profissional | undefined, clinica: string): boolean {
    return !!clinica && !!p?.clinicas && !p.clinicas.includes(clinica);
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
    const [tarefasBase, pacientes, vinculos] = await Promise.all([
        listar<Tarefa>('tarefas', {
            filtros: [{ col: 'clinica_id', op: 'in', valor: clinicasIds }],
            ordem: [{ col: 'data_limite', asc: true }],
        }),
        listar<Paciente>('pacientes', {
            filtros: [{ col: 'clinica_id', op: 'in', valor: clinicasIds }],
            ordem: [{ col: 'nome', asc: true }],
        }),
        // Em que clínica cada responsável atende (popup em "Todas as clínicas"). Sem a tabela, não filtra.
        listar<VinculoClinica>('profissionais_clinicas', {
            filtros: [{ col: 'clinica_id', op: 'in', valor: clinicasIds }],
        }).catch(() => null),
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

    return { tarefas, profissionais: comClinicas(cacheProfissionais.lista, vinculos), pacientes };
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
    // Clínica escolhida no topo. Em "Todas as clínicas" (ou sem escolha) a tarefa leva a do popup.
    const clinicaFixa = activeClinicId && activeClinicId !== 'all' ? String(activeClinicId) : null;

    // Filtros
    const [filtroStatus, setFiltroStatus] = useState<string>('todos');
    const [filtroPrioridade, setFiltroPrioridade] = useState<string>('todos');
    const [filtroBusca, setFiltroBusca] = useState('');
    // Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [coresQuadro, setCoresQuadro] = useState<Record<string, string>>({});
    // O estado inicial nasce no servidor, sem localStorage. Sem esta leitura, a cor
    // gravada some na hidratação e a coluna volta sem tinta depois de recarregar.
    useLayoutEffect(() => {
        setCoresQuadro(readCoresQuadro());
    }, []);
    const [pintando, setPintando] = useState<string | null>(null);
    // Celular: uma coluna por vez, escolhida por abas no topo.
    const [abaCelular, setAbaCelular] = useState<Tarefa['status']>('a_fazer');
    const [tarefaEditando, setTarefaEditando] = useState<Tarefa | null>(null);
    const [salvando, setSalvando] = useState(false);
    
    const [form, setForm] = useState({
        titulo: '',
        descricao: '',
        responsavel_id: '',
        prioridade: 'media' as 'baixa' | 'media' | 'alta',
        status: 'a_fazer' as 'a_fazer' | 'em_andamento' | 'concluido',
        data_limite: '',
        paciente_id: '',
        clinica_id: '',
    });

    // No desktop a tabela `profissionais` pode não existir: mantemos o id visível
    // em vez de o seletor cair para "Sem responsável".
    // Só entra quem atende na clínica da tarefa (em "Todas", aparecia gente de outra unidade).
    const opcoesResponsavel = useMemo(() => {
        const opcoes = profissionais
            .filter((p) => !responsavelDeOutraClinica(p, form.clinica_id))
            .map((p) => ({ value: String(p.id), label: p.nome }));
        if (form.responsavel_id && !opcoes.some((o) => o.value === form.responsavel_id)) {
            const atual = profissionais.find((p) => String(p.id) === form.responsavel_id);
            opcoes.unshift({ value: form.responsavel_id, label: atual?.nome ?? `Responsável ${form.responsavel_id}` });
        }
        return opcoes;
    }, [profissionais, form.responsavel_id, form.clinica_id]);

    // Paciente da clínica da tarefa. Sem clínica escolhida a lista junta todas (com o nome
    // da clínica, para desfazer homônimos) e escolher o paciente define a clínica.
    const opcoesPaciente = useMemo(() => {
        const nomeDaClinica = new Map(clinicas.map((c): [string, string] => [String(c.id), c.nome]));
        const opcoes = pacientes
            .filter((p) => !pacienteDeOutraClinica(p, form.clinica_id))
            .map((p) => {
                const clinica = !form.clinica_id && clinicas.length > 1 && p.clinica_id != null
                    ? nomeDaClinica.get(String(p.clinica_id))
                    : undefined;
                return { value: p.id, label: clinica ? `${p.nome} · ${clinica}` : p.nome };
            });
        // Tarefa antiga com paciente de outra clínica: aparece o nome, e o Salvar avisa.
        if (form.paciente_id && !opcoes.some((o) => o.value === form.paciente_id)) {
            const atual = pacientes.find((p) => p.id === form.paciente_id);
            opcoes.unshift({ value: form.paciente_id, label: atual?.nome || tarefaEditando?.paciente_nome || 'Paciente' });
        }
        return [{ value: '', label: 'Nenhum paciente' }, ...opcoes];
    }, [pacientes, clinicas, form.clinica_id, form.paciente_id, tarefaEditando]);

    useEffect(() => {
        if (clinicLoading) return;
        const scope = clinicScope(activeClinicId);
        const snap = readRouteCache<TarefasSnapshot>(TAREFAS_CACHE_KEY, scope);
        if (snap) {
            setTarefas(snap.tarefas);
            setProfissionais(snap.profissionais);
            setPacientes(snap.pacientes);
            setLoading(false);
        } else {
            // Sem cache desta clínica: a lista da clínica anterior sai da tela. Ela ficava
            // visível (e editável) até a carga chegar, e numa falha da carga ficaria de vez.
            setTarefas([]);
            setProfissionais([]);
            setPacientes([]);
            jaCarregou.current = false;
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
            tabelas.from('profissionais_clinicas').select('profissional_id, clinica_id').in('clinica_id', clinicasIds),
            tabelas.from('pacientes').select('id, nome, telefone, clinica_id').in('clinica_id', clinicasIds).order('nome'),
        ]);

        if (gen !== fetchGen.current) return;

        // Falha na confirmação (rede, 5xx, sessão): o postgrest devolve `error` em vez de lançar.
        // Fica a lista que já está na tela e no cache; zerar dava a entender que não há tarefas.
        const falhouNaCarga = () => {
            showAlert('Não foi possível atualizar as tarefas. Confira a conexão e tente de novo.', { type: 'error' });
            setLoading(false);
        };
        if (tarefasRes.error || vinculosRes.error || pacsRes.error) {
            falhouNaCarga();
            return;
        }

        const vinculos = (vinculosRes.data || []) as VinculoClinica[];
        const profissionalIds = [...new Set(vinculos.map((v) => v.profissional_id))];
        const profsRes = profissionalIds.length > 0
            ? await tabelas.from('profissionais').select('id, nome').in('id', profissionalIds)
            : { data: [] as Profissional[], error: null };

        if (gen !== fetchGen.current) return;
        if (profsRes.error) {
            falhouNaCarga();
            return;
        }

        const snapshot: TarefasSnapshot = {
            // A view calcula o atraso com o CURRENT_DATE do banco, que roda em UTC: das 21h à
            // meia-noite a tarefa do dia já saía atrasada. Vale a data do aparelho, como no desktop.
            tarefas: ((tarefasRes.data || []) as Tarefa[]).map((t) => ({ ...t, alerta_data: alertaDataLocal(t.data_limite, t.status) })),
            profissionais: comClinicas((profsRes.data || []) as Profissional[], vinculos),
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
            paciente_id: '',
            // Em "Todas as clínicas" a pessoa escolhe a clínica no popup (ou ela vem do paciente).
            clinica_id: clinicaFixa ?? (clinicas.length === 1 ? String(clinicas[0].id) : ''),
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
            paciente_id: t.paciente_id?.toString() || '',
            // Editar mantém a clínica da tarefa; só o campo Clínica (em "Todas") a troca.
            clinica_id: t.clinica_id != null ? String(t.clinica_id) : (clinicaFixa ?? ''),
        });
        setModalOpen(true);
    }

    /** Trocar a clínica tira o paciente e o responsável que não são dela. */
    function escolherClinica(clinica: string) {
        setForm((f) => ({
            ...f,
            clinica_id: clinica,
            paciente_id: pacienteDeOutraClinica(pacientes.find((p) => p.id === f.paciente_id), clinica) ? '' : f.paciente_id,
            responsavel_id: responsavelDeOutraClinica(profissionais.find((p) => String(p.id) === f.responsavel_id), clinica) ? '' : f.responsavel_id,
        }));
    }

    /** Sem clínica escolhida, o paciente define a clínica da tarefa. */
    function escolherPaciente(id: string) {
        const paciente = pacientes.find((p) => p.id === id);
        setForm((f) => {
            const clinica = f.clinica_id || (paciente?.clinica_id != null ? String(paciente.clinica_id) : '');
            return {
                ...f,
                paciente_id: id,
                clinica_id: clinica,
                responsavel_id: responsavelDeOutraClinica(profissionais.find((p) => String(p.id) === f.responsavel_id), clinica) ? '' : f.responsavel_id,
            };
        });
    }

    async function salvarTarefa() {
        if (!form.titulo.trim()) {
            showAlert('Título é obrigatório', { type: 'warning' });
            return;
        }

        // A clínica vem do contexto: a do topo, a da própria tarefa ou a escolhida no popup em
        // "Todas as clínicas". Antes ia para a primeira da lista, mesmo com paciente de outra.
        const clinicaId = form.clinica_id;
        if (!clinicaId || (clinicaId !== clinicaFixa && !clinicas.some((c) => String(c.id) === clinicaId))) {
            showAlert('Selecione a clínica da tarefa.', { type: 'warning' });
            return;
        }
        if (pacienteDeOutraClinica(pacientes.find((p) => p.id === form.paciente_id), clinicaId)) {
            showAlert('Este paciente é de outra clínica. Escolha um paciente da clínica da tarefa.', { type: 'warning' });
            return;
        }
        if (responsavelDeOutraClinica(profissionais.find((p) => String(p.id) === form.responsavel_id), clinicaId)) {
            showAlert('Este responsável não atende nesta clínica. Escolha outro responsável.', { type: 'warning' });
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
                    // O banco local devolve null quando a tarefa não existe mais: o popup fica aberto.
                    const salva: Tarefa | null = await atualizar<Tarefa>('tarefas', tarefaEditando.id, payload);
                    if (!salva) {
                        showAlert('Esta tarefa não existe mais.', { type: 'error' });
                        void carregarDados({ silent: true });
                        return;
                    }
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
            const { data, error } = await tabelas.from('tarefas')
                .update(payload)
                .eq('id', tarefaEditando.id)
                .select('id');
            if (error) {
                // Falhou: o popup fica aberto com o aviso, para a pessoa não perder o que digitou.
                showAlert(avisoDeFalha(error, 'Não foi possível salvar a tarefa. Confira a conexão e tente de novo.'), { type: 'error' });
                setSalvando(false);
                return;
            }
            // Nenhuma linha gravada: a tarefa foi excluída (aqui ou em outro aparelho). Sem o
            // retorno, o banco respondia 204 e a tela dizia "atualizada" sem ter gravado nada.
            if (!Array.isArray(data) || data.length === 0) {
                showAlert('Esta tarefa não existe mais.', { type: 'error' });
                setSalvando(false);
                void carregarDados({ silent: true });
                return;
            }
            showAlert('Tarefa atualizada!', { type: 'success' });
        } else {
            const { error } = await tabelas.from('tarefas').insert([payload]);
            if (error) {
                showAlert(avisoDeFalha(error, 'Não foi possível criar a tarefa. Confira a conexão e tente de novo.'), { type: 'error' });
                setSalvando(false);
                return;
            }
            showAlert('Tarefa criada!', { type: 'success' });
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
                // Fecha e esquece a tarefa apagada: com o popup aberto, o Salvar seguinte fingia gravar.
                setModalOpen(false);
                setTarefaEditando(null);
                void carregarDados({ silent: true });
            } catch (err) {
                showAlert('Erro ao excluir: ' + mensagemErro(err, 'banco local indisponível.'), { type: 'error' });
            }
            return;
        }

        const { error } = await tabelas.from('tarefas').delete().eq('id', id);
        if (error) showAlert(avisoDeFalha(error, 'Não foi possível excluir a tarefa. Confira a conexão e tente de novo.'), { type: 'error' });
        else {
            showAlert('Tarefa excluída!', { type: 'success' });
            setModalOpen(false);
            setTarefaEditando(null);
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
            showAlert(avisoDeFalha(error, 'Não foi possível mover a tarefa. Confira a conexão e tente de novo.'), { type: 'error' });
        } else {
            const next = prev.map((t) => (t.id === id ? { ...t, status: novoStatus } : t));
            writeRouteCache(TAREFAS_CACHE_KEY, clinicScope(activeClinicId), { tarefas: next, profissionais, pacientes });
        }
    }

    // Filtrar tarefas. O status só filtra o quadro: no celular o seletor fica escondido e
    // quem escolhe o status é a aba (escondido, ele seguia filtrando a lista sem aviso).
    const passaBuscaEPrioridade = (t: Tarefa) => {
        if (filtroPrioridade !== 'todos' && t.prioridade !== filtroPrioridade) return false;
        if (filtroBusca) {
            const busca = filtroBusca.toLowerCase();
            return t.titulo.toLowerCase().includes(busca) ||
                   (t.descricao?.toLowerCase().includes(busca)) ||
                   (t.paciente_nome?.toLowerCase().includes(busca));
        }
        return true;
    };
    const tarefasFiltradas = tarefas.filter(t => (filtroStatus === 'todos' || t.status === filtroStatus) && passaBuscaEPrioridade(t));
    const tarefasDoCelular = tarefas.filter(passaBuscaEPrioridade);

    const contagemTarefas = {
        a_fazer: tarefas.filter(t => t.status === 'a_fazer').length,
        em_andamento: tarefas.filter(t => t.status === 'em_andamento').length,
        concluido: tarefas.filter(t => t.status === 'concluido').length,
        atrasadas: tarefas.filter(t => t.alerta_data === 'atrasada' && t.status !== 'concluido').length,
        proximas: tarefas.filter(t => t.alerta_data === 'proxima' && t.status !== 'concluido').length
    };

    /** Data pura (AAAA-MM-DD) escrita como dd/mm/aaaa, sem passar por Date: lida como UTC ela aparecia um dia antes. */
    function dataSemFuso(iso: string) {
        const [ano, mes, dia] = iso.slice(0, 10).split('-');
        return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
    }

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
                                <Calendar size={11}/>{dataSemFuso(t.data_limite)}
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

    const ACAO_CELULAR: Record<Tarefa['status'], string> = { a_fazer: 'Iniciar', em_andamento: 'Concluir', concluido: 'Reabrir' };
    const ROTULO_ABA_CELULAR: Record<Tarefa['status'], string> = { a_fazer: 'A fazer', em_andamento: 'Fazendo', concluido: 'Feitas' };

    function renderTarefaCelular(t: Tarefa) {
        const atrasada = t.alerta_data === 'atrasada' && t.status !== 'concluido';
        return (
            <article key={t.id} className="rounded-xl border border-neutral-200 bg-white">
                <button type="button" onClick={() => abrirEditarTarefa(t)} className="block w-full px-3.5 pb-2 pt-3 text-left">
                    <h3 className={`text-[15px] font-medium leading-snug ${t.status === 'concluido' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{t.titulo}</h3>
                    {t.descricao && <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{t.descricao}</p>}
                    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                        <span className={`inline-flex items-center gap-1.5 ${prioridadeDe(t.prioridade).text}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${prioridadeDe(t.prioridade).dot}`} />
                            {prioridadeDe(t.prioridade).label}
                        </span>
                        {t.responsavel_nome && <span className="inline-flex items-center gap-1"><User size={12}/>{t.responsavel_nome}</span>}
                        {t.data_limite && (
                            <span className={`inline-flex items-center gap-1 ${atrasada ? 'font-medium text-red-600' : ''}`}>
                                <Calendar size={12}/>{dataSemFuso(t.data_limite)}{atrasada ? ' · atrasada' : ''}
                            </span>
                        )}
                    </span>
                </button>
                <div className="flex items-center justify-between gap-2 px-2 pb-2">
                    {t.status !== 'a_fazer' && (
                        <button type="button" onClick={() => moverStatus(t.id, proximoStatus(t, 'voltar'))} className="inline-flex h-11 items-center justify-center gap-1 rounded-lg px-3 text-sm font-medium text-neutral-500 active:bg-neutral-100">
                            <ChevronLeft size={16} /> {t.status === 'concluido' ? 'Em andamento' : 'A fazer'}
                        </button>
                    )}
                    {t.status !== 'concluido' && (
                        <button type="button" onClick={() => moverStatus(t.id, proximoStatus(t, 'avancar'))} className="ml-auto inline-flex h-11 min-w-[7.5rem] items-center justify-center gap-1 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white active:bg-neutral-700">
                            {ACAO_CELULAR[t.status]} <ChevronRight size={16} />
                        </button>
                    )}
                </div>
            </article>
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
                            <span className="hidden text-neutral-400 md:inline"> · {activeClinic ? getClinicLabel(activeClinic) : 'Todas as clínicas'}</span>
                        </h1>
                    </div>
                    <button
                        type="button"
                        onClick={abrirNovaTarefa}
                        className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 sm:h-10 sm:self-auto"
                    >
                        <Plus size={14} /> Nova tarefa
                    </button>
                </div>
                {!kpiLoading && contagemTarefas.atrasadas > 0 && (
                    <p className="mt-2 text-sm font-medium text-red-600 md:hidden">{contagemTarefas.atrasadas} {contagemTarefas.atrasadas === 1 ? 'tarefa atrasada' : 'tarefas atrasadas'}</p>
                )}
                <div className="mt-3 hidden flex-wrap gap-x-6 gap-y-1 md:flex">
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
                <div className="grid shrink-0 grid-cols-1 gap-2 md:grid-cols-2 lg:w-[28rem]">
                    <div className="hidden md:block">
                    <CustomSelect
                        value={filtroStatus}
                        onChange={setFiltroStatus}
                        options={[{ value: 'todos', label: 'Todos os status' }, ...TAREFA_STATUS_OPTIONS]}
                        size="md"
                    />
                    </div>
                    <CustomSelect
                        value={filtroPrioridade}
                        onChange={setFiltroPrioridade}
                        options={[{ value: 'todos', label: 'Todas as prioridades' }, ...TAREFA_PRIORIDADE_OPTIONS]}
                        size="md"
                    />
                </div>
                {/* Só com o status escolhido, o Limpar some no celular: lá o status não filtra. */}
                {(filtroStatus !== 'todos' || filtroPrioridade !== 'todos') && (
                    <button
                        type="button"
                        onClick={() => { setFiltroStatus('todos'); setFiltroPrioridade('todos'); }}
                        className={`h-10 shrink-0 text-sm font-medium text-neutral-500 hover:text-neutral-900 ${filtroPrioridade === 'todos' ? 'hidden md:block' : ''}`}
                    >
                        Limpar
                    </button>
                )}
            </div>

            {/* Celular: abas de status e uma lista só. Três colunas empilhadas viravam três rolagens pequenas. */}
            <div className="flex min-h-0 flex-1 flex-col md:hidden">
                <div role="tablist" aria-label="Status das tarefas" className="mb-2 grid shrink-0 grid-cols-3 gap-1 rounded-xl border border-neutral-200 bg-white p-1">
                    {colunasKanban.map((col) => {
                        const total = tarefas.filter((t) => t.status === col.id).length;
                        const ativa = abaCelular === col.id;
                        return (
                            <button
                                key={col.id}
                                type="button"
                                role="tab"
                                aria-selected={ativa}
                                onClick={() => setAbaCelular(col.id)}
                                className={`flex h-11 items-center justify-center gap-1.5 rounded-lg px-1 text-[13px] font-medium ${ativa ? 'bg-neutral-900 text-white' : 'text-neutral-600 active:bg-neutral-100'}`}
                            >
                                <span className="truncate">{ROTULO_ABA_CELULAR[col.id]}</span>
                                <span className={`tabular-nums ${ativa ? 'text-white/70' : 'text-neutral-400'}`}>{kpiLoading ? '—' : total}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
                    {kpiLoading ? (
                        Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-white" />)
                    ) : (() => {
                        const itens = tarefasDoCelular.filter((t) => t.status === abaCelular);
                        if (itens.length === 0) {
                            return (
                                <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">
                                    {filtroBusca || filtroPrioridade !== 'todos' ? 'Nenhuma tarefa com esse filtro.' : 'Nada por aqui.'}
                                </p>
                            );
                        }
                        return itens.map((t) => renderTarefaCelular(t));
                    })()}
                </div>
            </div>

            <div className="hidden min-h-0 flex-1 grid-cols-3 gap-2 overflow-hidden md:grid">
                {colunasKanban.map((col) => {
                    const items = tarefasFiltradas.filter((t) => t.status === col.id);
                    const tinta = tintaSuave(coresQuadro[col.id]);
                    return (
                        <section key={col.id} className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white" style={tinta ? { backgroundColor: tinta.fundo, borderColor: tinta.borda, boxShadow: `inset 0 2px 0 ${tinta.marca}` } : undefined}>
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
                            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
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
                            {/* No celular os botões do popup têm 40px de toque; do sm em diante, o tamanho de antes. */}
                            <button type="button" onClick={() => setModalOpen(false)} className="inline-flex h-10 w-10 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 sm:h-8 sm:w-8" aria-label="Fechar">
                                <X size={16}/>
                            </button>
                        </div>
                        
                        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 sm:px-6">
                            {!clinicaFixa && (
                                <label>
                                    <span className="mb-1.5 block text-xs font-medium text-neutral-500">Clínica <span className="text-red-500">*</span></span>
                                    <CustomSelect value={form.clinica_id} onChange={escolherClinica} options={clinicas.map((c) => ({ value: String(c.id), label: getClinicLabel(c) }))} placeholder="Selecione..." size="md" />
                                </label>
                            )}

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
                                <CustomSelect value={form.paciente_id} onChange={escolherPaciente} options={opcoesPaciente} size="md" searchable />
                            </label>
                        </div>
                        
                        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-black/5 px-5 py-4 sm:px-6">
                            {tarefaEditando ? (
                                <button type="button" onClick={() => excluirTarefa(tarefaEditando.id)} className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-rose-600 hover:bg-rose-50 sm:h-9">
                                    <Trash2 size={14}/> Excluir
                                </button>
                            ) : <span />}
                            <div className="flex items-center gap-2">
                                <button type="button" onClick={() => setModalOpen(false)} className="inline-flex h-10 items-center rounded-md px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50 sm:h-9">Cancelar</button>
                                <button type="button" onClick={salvarTarefa} disabled={salvando} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 sm:h-9">
                                    {salvando ? <Loader2 size={14} className="animate-spin"/> : null} Salvar
                                </button>
                            </div>
                        </div>
            </Modal>
        </div>
    );
}
