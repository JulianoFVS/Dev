'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { usePatientActionModal } from '@/components/PatientActionModal';
import { useClinica } from '@/app/context/ClinicaContext';
import { fetchUserClinicas, fetchUserEquipe, type ClinicaSlim } from '@/lib/clinicScoped';

import {
  Plus, X, Loader2, UserPlus, Trash2, Bell, ChevronDown, ChevronLeft, ChevronRight,
  Search, Calendar, LayoutGrid, Clock, List, Users,
} from 'lucide-react';
import CustomSelect from '@/components/ui/CustomSelect';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { validarAgendamentoCompleto } from '@/lib/horarioProfissional';
import PatientContactButtons from '@/components/PatientContactButtons';
import Modal from '@/components/ui/Modal';
import SegmentedControl from '@/components/ui/SegmentedControl';
import ProcedureCombobox from '@/components/forms/ProcedureCombobox';
import MenuFiltro from '@/components/agenda/MenuFiltro';
import ChipEvento from '@/components/agenda/ChipEvento';
import ChipsProfissionais, { type ChipProfissional } from '@/components/agenda/ChipsProfissionais';
import PartesEditor from '@/components/agenda/PartesEditor';
import GradeProfissional, { type ColunaProfissional } from '@/components/agenda/GradeProfissional';
import { corStatus } from '@/components/agenda/estilos';
import {
  buscarAgendamentosLembrete24h,
  filtrarPendentesLembrete,
  ctxLembreteAgendamento,
  marcarLembreteEnviado,
  type LembreteAgendamento,
} from '@/lib/lembretesAgenda';
import { lerPrefillAgenda, limparPrefillAgenda } from '@/lib/agendaPrefill';
import { tratamentosVisiveis, valorNaAgenda, type LinhaPreco, type PlanoTipo } from '@/lib/precoTratamento';
import {
  COR_PROFISSIONAL_PADRAO,
  capitalizar,
  chaveLocal,
  chaveParte,
  corProfissional,
  duracaoDoRegistro,
  horaLocal,
  inicioDoDia,
  inicioSemana,
  mesmoDia,
  nomePaciente,
  partesParaRpc,
  somarDias,
  type EventoAgenda,
  type ParteForm,
  type ProfissionalAgenda,
  type RegistroAgendamento,
} from '@/lib/agendaPartes';

type Visao = 'mes' | 'semana' | 'dia' | 'profissionais' | 'lista';

type PacienteAgenda = {
  id: string;
  nome: string;
  clinica_id?: string | number | null;
  telefone?: string | null;
  plano_id?: string | null;
};

type TratamentoBase = {
  id: string | number;
  nome: string;
  valor_sugerido?: number | string | null;
  especialidade_id?: string | null;
};

type UsuarioAgenda = {
  id: string;
  nivel: string;
  profissional_id: string | number | null;
};

type FormAgendamento = {
  id: string | number | null;
  grupo_id: string | null;
  title: string;
  theme: string;
  paciente_id: string;
  valor: string;
  desconto: string;
  observacoes: string;
  status: string;
  clinica_id: string;
  profissional_id: string;
  partes: ParteForm[];
};

type RetornoRpcPartes = {
  grupo_id?: string;
  ids?: Array<string | number>;
  partes?: number;
};

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const STATUS_OPCOES = [
  { value: 'todos', label: 'Todas' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'fiado', label: 'Fiado' },
  { value: 'cancelado', label: 'Cancelado' },
];
const STATUS_EDITOR = [
  { value: 'agendado', label: 'Agendado' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'fiado', label: 'Fiado' },
  { value: 'cancelado', label: 'Cancelado' },
] as const;

function formularioVazio(dados?: {
  clinica_id?: string;
  profissional_id?: string;
  paciente_id?: string;
  title?: string;
  observacoes?: string;
  data?: string;
  hora?: string;
  duracao?: number;
}): FormAgendamento {
  return {
    id: null,
    grupo_id: null,
    title: dados?.title ?? '',
    theme: 'blue',
    paciente_id: dados?.paciente_id ?? '',
    valor: '0',
    desconto: '0',
    observacoes: dados?.observacoes ?? '',
    status: 'agendado',
    clinica_id: dados?.clinica_id ?? '',
    profissional_id: dados?.profissional_id ?? '',
    partes: [{
      key: chaveParte(),
      data: dados?.data || chaveLocal(new Date()),
      hora: dados?.hora || '08:00',
      duracao: dados?.duracao ?? 60,
      titulo: '',
    }],
  };
}

function parteDeRegistro(registro: {
  id?: string | number | null;
  data_hora: string;
  duracao_minutos?: number | null;
  parte_titulo?: string | null;
}): ParteForm {
  const data = new Date(registro.data_hora);
  const valida = !Number.isNaN(data.getTime());
  return {
    key: chaveParte(),
    dbId: registro.id ?? null,
    data: valida ? chaveLocal(data) : chaveLocal(new Date()),
    hora: valida ? horaLocal(data) : '08:00',
    duracao: duracaoDoRegistro(registro),
    titulo: registro.parte_titulo ?? '',
  };
}

function formularioDeRegistro(registro: RegistroAgendamento): FormAgendamento {
  return {
    id: registro.id,
    grupo_id: registro.grupo_id ?? null,
    title: registro.procedimento ?? '',
    theme: registro.cor || 'blue',
    paciente_id: registro.paciente_id ?? '',
    valor: registro.valor != null ? String(registro.valor) : '0',
    desconto: registro.desconto != null ? String(registro.desconto) : '0',
    observacoes: registro.observacoes ?? '',
    status: registro.status || 'agendado',
    clinica_id: registro.clinica_id != null ? String(registro.clinica_id) : '',
    profissional_id: registro.profissional_id != null ? String(registro.profissional_id) : '',
    partes: [parteDeRegistro({
      id: registro.id,
      data_hora: registro.data_hora,
      duracao_minutos: registro.duracao_minutos,
      parte_titulo: registro.parte_titulo,
    })],
  };
}

function useEhMobile(maxWidth = 639): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const sincronizar = () => setMobile(media.matches);
    sincronizar();
    media.addEventListener('change', sincronizar);
    return () => media.removeEventListener('change', sincronizar);
  }, [maxWidth]);
  return mobile;
}

export default function Agenda() {
  const searchParams = useSearchParams();
  const pacientePreSelecionado = searchParams?.get('paciente');
  const { openQuickCapture } = usePatientActionModal();
  const { activeClinicId, loading: clinicLoading, clinicaNome } = useClinica();
  const clinicaFiltro =
    !activeClinicId || activeClinicId === 'all' ? 'todas' : String(activeClinicId);
  const { showAlert, showConfirm } = useCustomAlert();
  const [events, setEvents] = useState<EventoAgenda[]>([]);
  const [usuarioAtual, setUsuarioAtual] = useState<UsuarioAgenda | null>(null);

  const [clinicas, setClinicas] = useState<ClinicaSlim[]>([]);
  const [profissionais, setProfissionais] = useState<ProfissionalAgenda[]>([]);
  const [profissionaisFiltrados, setProfissionaisFiltrados] = useState<ProfissionalAgenda[]>([]);
  const [pacientes, setPacientes] = useState<PacienteAgenda[]>([]);
  const [tratamentosBase, setTratamentosBase] = useState<TratamentoBase[]>([]);
  const [planosPreco, setPlanosPreco] = useState<PlanoTipo[]>([]);
  const [linhasPreco, setLinhasPreco] = useState<LinhaPreco[]>([]);
  const [especialidades, setEspecialidades] = useState<{ id: string; nome: string }[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [carregandoPartes, setCarregandoPartes] = useState(false);
  const [lembretesAbertos, setLembretesAbertos] = useState(true);
  const [loading, setLoading] = useState(false);
  const [lembretesPendentes, setLembretesPendentes] = useState<LembreteAgendamento[]>([]);
  const [lembretesLoading, setLembretesLoading] = useState(false);
  const [visao, setVisao] = useState<Visao>('semana');
  const [cursor, setCursor] = useState(() => new Date());
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroProfissionais, setFiltroProfissionais] = useState<string[]>([]);
  const [agora, setAgora] = useState(() => new Date());
  const gradeHorasRef = useRef<HTMLDivElement>(null);
  const cargaPartesRef = useRef(0);
  const cargaEventosRef = useRef(0);
  const operacaoRef = useRef(false);
  const ehMobile = useEhMobile();

  const [formData, setFormData] = useState<FormAgendamento>(() => formularioVazio());

  useEffect(() => {
    if (!clinicLoading) inicializar();
  }, [clinicLoading]);

  useEffect(() => { if (usuarioAtual) carregarEventos(); }, [clinicaFiltro, usuarioAtual]);

  useEffect(() => {
    if (!clinicLoading && clinicas.length) carregarLembretes();
  }, [clinicLoading, clinicas, clinicaFiltro]);

  useEffect(() => {
    setFiltroProfissionais((atuais) => (atuais.length ? [] : atuais));
  }, [clinicaFiltro]);

  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (visao !== 'semana' && visao !== 'dia' && visao !== 'profissionais') return;
    const grade = gradeHorasRef.current;
    const linha = grade?.querySelector('[data-agora]') as HTMLElement | null;
    if (!grade || !linha) return;
    const gradeRect = grade.getBoundingClientRect();
    const linhaRect = linha.getBoundingClientRect();
    grade.scrollTop += linhaRect.top - gradeRect.top - grade.clientHeight / 2;
  }, [visao, cursor]);

  async function carregarLembretes() {
    setLembretesLoading(true);
    try {
      const ids = clinicaFiltro !== 'todas'
        ? [clinicaFiltro]
        : clinicas.map((c) => String(c.id));
      const todos = await buscarAgendamentosLembrete24h(ids);
      if (clinicaFiltro !== 'todas') {
        const pendentes = await filtrarPendentesLembrete(clinicaFiltro, todos);
        setLembretesPendentes(pendentes);
      } else {
        const agregado: LembreteAgendamento[] = [];
        for (const cid of ids) {
          const p = await filtrarPendentesLembrete(cid, todos);
          agregado.push(...p);
        }
        setLembretesPendentes(agregado);
      }
    } catch {
      setLembretesPendentes([]);
    } finally {
      setLembretesLoading(false);
    }
  }

  const prefillAplicado = useRef(false);

  useEffect(() => {
    if (prefillAplicado.current || !pacientePreSelecionado || pacientes.length === 0) return;
    const paciente = pacientes.find((p) => String(p.id) === String(pacientePreSelecionado));
    if (!paciente) return;
    const hoje = chaveLocal(new Date());
    const prefill = lerPrefillAgenda();
    const mesmoPaciente = prefill && String(prefill.pacienteId) === String(paciente.id) ? prefill : null;
    const dataSugerida = mesmoPaciente?.data && mesmoPaciente.data >= hoje ? mesmoPaciente.data : hoje;
    const preClinica = clinicaFiltro !== 'todas' ? clinicaFiltro : String(paciente.clinica_id ?? '');
    const preProfissional = (usuarioAtual?.nivel !== 'admin' && usuarioAtual?.profissional_id)
      ? String(usuarioAtual.profissional_id)
      : '';
    cargaPartesRef.current += 1;
    setCarregandoPartes(false);
    setFormData(formularioVazio({
      title: mesmoPaciente?.procedimento || '',
      data: dataSugerida,
      hora: '08:00',
      paciente_id: paciente.id,
      observacoes: mesmoPaciente?.observacoes || '',
      clinica_id: preClinica,
      profissional_id: preProfissional,
    }));
    prefillAplicado.current = true;
    limparPrefillAgenda();
    setOpenModal(true);
  }, [pacientePreSelecionado, pacientes, clinicaFiltro, usuarioAtual]);

  // Revalida quando o Action Hub criar/quitar agendamentos in-place
  useEffect(() => {
    function handle() { if (usuarioAtual) carregarEventos(); }
    window.addEventListener('ortus:agenda-changed', handle);
    return () => window.removeEventListener('ortus:agenda-changed', handle);
  }, [usuarioAtual, clinicaFiltro]);

  useEffect(() => {
    if (!formData.clinica_id) {
      setProfissionaisFiltrados([]);
      setTratamentosBase([]);
      setEspecialidades([]);
      return;
    }
    const filtrados = profissionais.filter((p) =>
      p.profissionais_clinicas?.some((vinculo) => String(vinculo.clinica_id) === String(formData.clinica_id)),
    );
    setProfissionaisFiltrados(filtrados);
    carregarTratamentosBase(formData.clinica_id);
    carregarEspecialidades(formData.clinica_id);
  }, [formData.clinica_id, profissionais]);

  const recarregarPacientes = useCallback(async () => {
    try {
      const cl = await fetchUserClinicas();
      const idsPermitidos = cl.map((c) => c.id);
      if (idsPermitidos.length > 0) {
        const { data: pac } = await supabase
          .from('pacientes')
          .select('id, nome, clinica_id, telefone, plano_id')
          .in('clinica_id', idsPermitidos as any)
          .order('nome');
        if (pac) setPacientes(pac as PacienteAgenda[]);
      } else {
        setPacientes([]);
      }
    } catch {
      setPacientes([]);
    }
  }, []);

  async function carregarTratamentosBase(clinicaId: string) {
    try {
      const [tr, planos, linhas] = await Promise.all([
        supabase.from('tratamentos_base').select('id, nome, valor_sugerido, especialidade_id').eq('clinica_id', clinicaId).eq('ativo', true).order('nome'),
        supabase.from('planos').select('id, tipo').eq('clinica_id', Number(clinicaId)),
        supabase.from('planos_tratamentos').select('plano_id, tratamento_id, valor, ativo').eq('clinica_id', Number(clinicaId)),
      ]);
      setTratamentosBase((tr.data || []) as TratamentoBase[]);
      setPlanosPreco((planos.data || []) as PlanoTipo[]);
      setLinhasPreco((linhas.data || []) as LinhaPreco[]);
    } catch {
      setTratamentosBase([]);
      setPlanosPreco([]);
      setLinhasPreco([]);
    }
  }

  async function carregarEspecialidades(clinicaId: string) {
    try {
      const { data } = await supabase
        .from('especialidades')
        .select('id, nome')
        .eq('clinica_id', Number(clinicaId))
        .eq('ativo', true)
        .order('nome');
      setEspecialidades((data || []) as { id: string; nome: string }[]);
    } catch {
      setEspecialidades([]);
    }
  }

  useEffect(() => {
    function handlePacienteChanged() { recarregarPacientes(); }
    window.addEventListener('ortus:paciente-changed', handlePacienteChanged);
    return () => window.removeEventListener('ortus:paciente-changed', handlePacienteChanged);
  }, [recarregarPacientes]);

  async function inicializar() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase.from('profissionais').select('*').eq('user_id', user.id).single();
        if (prof) {
          setUsuarioAtual({
            id: user.id,
            nivel: prof.nivel_acesso || 'admin',
            profissional_id: prof.id,
          });
          if (prof.nivel_acesso !== 'admin') {
            setFormData((prev) => ({ ...prev, profissional_id: String(prof.id) }));
          }
        } else {
          setUsuarioAtual({ id: user.id, nivel: 'admin', profissional_id: null });
        }
      }
    } catch {
      /* sem sessão válida: a tela segue vazia e o AuthGuard redireciona */
    }
    fetchDados();
  }

  async function fetchDados() {
    try {
      // Clínicas restritas ao usuário (multi-tenant)
      const cl = await fetchUserClinicas();
      setClinicas(cl);
      const idsPermitidos = cl.map((c) => c.id);

      // Equipe visível ao usuário (filtrada por rede; super admin vê tudo).
      const equipe = await fetchUserEquipe();
      const equipeNormalizada: ProfissionalAgenda[] = equipe.map((p) => ({
        id: p.id,
        nome: p.nome,
        cor_agenda: (p as ProfissionalAgenda).cor_agenda ?? null,
        profissionais_clinicas: (p.clinicas || []).map((c) => ({ clinica_id: c.id })),
      }));

      // A coluna `cor_agenda` pode não vir no helper da equipe; busca dedicada.
      const idsEquipe = equipeNormalizada.map((p) => p.id).filter((id) => id !== null && id !== undefined);
      if (idsEquipe.length) {
        try {
          const { data: cores, error } = await supabase
            .from('profissionais')
            .select('id, cor_agenda')
            .in('id', idsEquipe as any);
          if (!error && cores) {
            const mapa = new Map<string, string | null>();
            (cores as Array<{ id: string | number; cor_agenda?: string | null }>).forEach((linha) => {
              mapa.set(String(linha.id), linha.cor_agenda ?? null);
            });
            equipeNormalizada.forEach((p) => {
              p.cor_agenda = mapa.get(String(p.id)) ?? p.cor_agenda ?? null;
            });
          }
        } catch {
          /* fallback: paleta determinística em corProfissional */
        }
      }
      setProfissionais(equipeNormalizada);

      // Pacientes apenas das clínicas permitidas
      if (idsPermitidos.length > 0) {
        const { data: pac } = await supabase
          .from('pacientes')
          .select('id, nome, clinica_id, telefone, plano_id')
          .in('clinica_id', idsPermitidos as any)
          .order('nome');
        if (pac) setPacientes(pac as PacienteAgenda[]);
      } else {
        setPacientes([]);
      }
    } catch {
      setClinicas([]);
      setProfissionais([]);
      setPacientes([]);
    }
  }

  async function carregarEventos() {
    if (!usuarioAtual) return;
    const token = ++cargaEventosRef.current;
    try {
      let query = supabase.from('agendamentos').select('*, pacientes(nome), clinicas(nome, cor_tema)');
      if (clinicaFiltro !== 'todas') query = query.eq('clinica_id', clinicaFiltro);
      if (usuarioAtual.nivel !== 'admin' && usuarioAtual.profissional_id) {
        query = query.eq('profissional_id', usuarioAtual.profissional_id);
      }

      const { data: ag, error } = await query;
      if (token !== cargaEventosRef.current) return;
      if (error || !ag) {
        setEvents([]);
        return;
      }
      const fmt: EventoAgenda[] = (ag as RegistroAgendamento[])
        .filter((e) => e.tipo_registro !== 'debito_manual' && e.observacoes !== 'Débito manual')
        .map((e) => {
          const inicio = new Date(e.data_hora);
          const duracao = duracaoDoRegistro(e);
          const fim = new Date(inicio.getTime() + duracao * 60 * 1000);
          return {
            id: e.id,
            title: `${nomePaciente(e) ?? 'Paciente'} - ${e.procedimento ?? ''}`,
            start: e.data_hora,
            end: Number.isNaN(fim.getTime()) ? e.data_hora : fim.toISOString(),
            extendedProps: e,
            backgroundColor: 'transparent',
            borderColor: 'transparent',
          };
        });
      setEvents(fmt);
    } catch {
      if (token === cargaEventosRef.current) setEvents([]);
    }
  }

  const fecharModal = useCallback(() => {
    cargaPartesRef.current += 1;
    setOpenModal(false);
    setCarregandoPartes(false);
  }, []);

  const clinicaDoProfissional = useCallback((profissionalId?: string): string => {
    if (!profissionalId) return '';
    const profissional = profissionais.find((p) => String(p.id) === String(profissionalId));
    const vinculos = profissional?.profissionais_clinicas ?? [];
    if (!vinculos.length) return '';
    if (clinicaFiltro !== 'todas' && vinculos.some((vinculo) => String(vinculo.clinica_id) === clinicaFiltro)) {
      return clinicaFiltro;
    }
    return String(vinculos[0].clinica_id);
  }, [profissionais, clinicaFiltro]);

  const abrirNoDia = useCallback((dia: Date, hora = '08:00', profissionalId?: string) => {
    const preProfissional = (usuarioAtual?.nivel !== 'admin' && usuarioAtual?.profissional_id)
      ? String(usuarioAtual.profissional_id)
      : (profissionalId ?? '');
    const preClinica = clinicaFiltro !== 'todas'
      ? clinicaFiltro
      : clinicaDoProfissional(preProfissional);
    cargaPartesRef.current += 1;
    setCarregandoPartes(false);
    setFormData(formularioVazio({
      data: chaveLocal(dia),
      hora,
      clinica_id: preClinica,
      profissional_id: preProfissional,
    }));
    setOpenModal(true);
  }, [clinicaFiltro, clinicaDoProfissional, usuarioAtual]);

  const abrirNovoAgendamento = useCallback(() => {
    abrirNoDia(new Date());
  }, [abrirNoDia]);

  const abrirEvento = useCallback(async (registro: RegistroAgendamento) => {
    const token = ++cargaPartesRef.current;
    setFormData(formularioDeRegistro(registro));
    setOpenModal(true);

    if (!registro.grupo_id) {
      setCarregandoPartes(false);
      return;
    }

    setCarregandoPartes(true);
    try {
      const { data, error } = await supabase
        .from('agendamentos')
        .select('id, grupo_id, parte_indice, parte_total, parte_titulo, data_hora, duracao_minutos')
        .eq('grupo_id', registro.grupo_id)
        .order('parte_indice', { ascending: true });

      if (token !== cargaPartesRef.current) return;

      if (error || !data || data.length === 0) {
        await showAlert('Não foi possível carregar as partes deste atendimento. Tente novamente.', { type: 'error' });
        fecharModal();
        return;
      }

      setFormData((prev) => ({
        ...prev,
        id: (data[0] as { id?: string | number }).id ?? prev.id,
        grupo_id: registro.grupo_id ?? prev.grupo_id,
        partes: (data as Array<{
          id?: string | number;
          data_hora: string;
          duracao_minutos?: number | null;
          parte_titulo?: string | null;
        }>).map(parteDeRegistro),
      }));
    } catch {
      if (token === cargaPartesRef.current) {
        await showAlert('Não foi possível carregar as partes deste atendimento. Tente novamente.', { type: 'error' });
        fecharModal();
      }
    } finally {
      if (token === cargaPartesRef.current) setCarregandoPartes(false);
    }
  }, [fecharModal, showAlert]);

  function abrirCadastroPaciente() {
    const clinicaId = formData.clinica_id || (clinicaFiltro !== 'todas' ? clinicaFiltro : null);
    openQuickCapture(clinicaId);
  }

  async function saveOrUpdate(overrideStatus?: string) {
    if (operacaoRef.current) return;
    if (carregandoPartes) {
      await showAlert('Aguarde o carregamento das partes deste atendimento.', { type: 'warning' });
      return;
    }

    const dados = formData;
    const partes = dados.partes.map((parte) => ({
      ...parte,
      data: parte.data.trim(),
      hora: parte.hora.trim(),
    }));

    if (!dados.title || !dados.paciente_id || !dados.clinica_id) {
      await showAlert('Preencha clínica, paciente e procedimento.', { type: 'warning' });
      return;
    }
    if (partes.length === 0 || partes.some((parte) => !parte.data || !parte.hora)) {
      await showAlert('Preencha data e hora de todas as partes do atendimento.', { type: 'warning' });
      return;
    }

    operacaoRef.current = true;
    setLoading(true);
    try {
      if (dados.profissional_id) {
        for (let indice = 0; indice < partes.length; indice += 1) {
          const erroHorario = await validarAgendamentoCompleto({
            clinicaId: dados.clinica_id,
            profissionalId: dados.profissional_id,
            date: partes[indice].data,
            time: partes[indice].hora,
            excludeAgendamentoId: partes[indice].dbId ?? null,
          });
          if (erroHorario) {
            const rotulo = partes.length > 1 ? `Parte ${indice + 1}: ` : '';
            await showAlert(`${rotulo}${erroHorario}`, { type: 'warning' });
            return;
          }
        }
      }

      const finalStatus = overrideStatus || dados.status || 'agendado';
      const { data, error } = await supabase.rpc('agendamento_salvar_partes', {
        p_grupo_id: dados.grupo_id || null,
        p_clinica_id: Number(dados.clinica_id),
        p_paciente_id: dados.paciente_id,
        p_profissional_id: dados.profissional_id ? Number(dados.profissional_id) : null,
        p_procedimento: dados.title,
        p_cor: dados.theme || 'blue',
        p_status: finalStatus,
        p_valor: Number(dados.valor) || 0,
        p_desconto: Number(dados.desconto) || 0,
        p_observacoes: dados.observacoes,
        p_partes: partesParaRpc(partes, dados.theme || 'blue', finalStatus),
        // Avulso em edição: a própria linha é reaproveitada como parte 0,
        // preservando pagamento, taxas e vínculo com o tratamento.
        p_id_existente: dados.grupo_id ? null : (dados.id ?? null),
      });

      if (error) {
        await showAlert('Erro ao salvar atendimento: ' + error.message, { type: 'error' });
        return;
      }

      const retorno = (data ?? null) as RetornoRpcPartes | null;

      setFormData((prev) => ({
        ...prev,
        grupo_id: retorno?.grupo_id ?? prev.grupo_id,
        partes: prev.partes.map((parte, indice) => ({
          ...parte,
          dbId: retorno?.ids?.[indice] ?? parte.dbId ?? null,
        })),
      }));

      fecharModal();
      await carregarEventos();
      window.dispatchEvent(new CustomEvent('ortus:agenda-changed'));
    } catch {
      await showAlert('Não foi possível salvar o atendimento. Tente novamente.', { type: 'error' });
    } finally {
      operacaoRef.current = false;
      setLoading(false);
    }
  }

  async function excluirAgendamento() {
    if (operacaoRef.current) return;
    if (!formData.id && !formData.grupo_id) return;
    const totalPartes = formData.partes.length;
    const mensagem = formData.grupo_id
      ? totalPartes > 1
        ? `Excluir este atendimento e suas ${totalPartes} partes?`
        : 'Excluir este atendimento?'
      : 'Tem certeza que deseja excluir este agendamento?';
    if (!(await showConfirm(mensagem, { title: 'Excluir atendimento', type: 'error', confirmLabel: 'Excluir' }))) return;

    operacaoRef.current = true;
    setLoading(true);
    try {
      const { error } = formData.grupo_id
        ? await supabase.from('agendamentos').delete().eq('grupo_id', formData.grupo_id)
        : await supabase.from('agendamentos').delete().eq('id', formData.id);
      if (error) {
        await showAlert('Erro ao excluir atendimento: ' + error.message, { type: 'error' });
        return;
      }
      fecharModal();
      await carregarEventos();
      window.dispatchEvent(new CustomEvent('ortus:agenda-changed'));
    } catch {
      await showAlert('Não foi possível excluir o atendimento. Tente novamente.', { type: 'error' });
    } finally {
      operacaoRef.current = false;
      setLoading(false);
    }
  }

  const cardShell = 'rounded-xl bg-white';

  const profissionaisVisiveis = useMemo(() => {
    const base = clinicaFiltro === 'todas'
      ? profissionais
      : profissionais.filter((p) =>
        p.profissionais_clinicas?.some((vinculo) => String(vinculo.clinica_id) === clinicaFiltro),
      );
    if (usuarioAtual?.nivel !== 'admin' && usuarioAtual?.profissional_id != null) {
      return base.filter((p) => String(p.id) === String(usuarioAtual.profissional_id));
    }
    return base;
  }, [profissionais, clinicaFiltro, usuarioAtual]);

  useEffect(() => {
    setFiltroProfissionais((atuais) => {
      if (!atuais.length) return atuais;
      const validos = atuais.filter((id) => profissionaisVisiveis.some((p) => String(p.id) === id));
      return validos.length === atuais.length ? atuais : validos;
    });
  }, [profissionaisVisiveis]);

  const coresPorProfissional = useMemo(() => {
    const mapa = new Map<string, string>();
    profissionais.forEach((p) => mapa.set(String(p.id), corProfissional(p)));
    return mapa;
  }, [profissionais]);

  const corDoEvento = useCallback((registro: RegistroAgendamento): string => {
    const profissionalId = registro?.profissional_id;
    if (profissionalId == null || profissionalId === '') return COR_PROFISSIONAL_PADRAO;
    return coresPorProfissional.get(String(profissionalId)) ?? corProfissional({ id: profissionalId });
  }, [coresPorProfissional]);

  const chipsProfissionais = useMemo<ChipProfissional[]>(
    () => profissionaisVisiveis.map((p) => ({
      id: String(p.id),
      nome: p.nome,
      cor: corProfissional(p),
    })),
    [profissionaisVisiveis],
  );

  const alternarProfissional = useCallback((id: string) => {
    setFiltroProfissionais((atuais) => (
      atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]
    ));
  }, []);

  const limparProfissionais = useCallback(() => setFiltroProfissionais([]), []);

  const limparFiltros = useCallback(() => {
    setFiltroStatus('todos');
    setFiltroProfissionais([]);
  }, []);

  const filtrosAtivos = filtroStatus !== 'todos' || filtroProfissionais.length > 0;

  const eventosVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const selecionados = filtroProfissionais.length ? new Set(filtroProfissionais) : null;
    return events.filter((evento) => {
      const props = evento.extendedProps || ({} as RegistroAgendamento);
      const nome = String(nomePaciente(props) || '');
      const procedimento = String(props.procedimento || '');
      const rotuloParte = String(props.parte_titulo || '');
      if (
        termo
        && !nome.toLowerCase().includes(termo)
        && !procedimento.toLowerCase().includes(termo)
        && !rotuloParte.toLowerCase().includes(termo)
      ) return false;
      if (filtroStatus !== 'todos' && (props.status || 'agendado') !== filtroStatus) return false;
      if (selecionados && !selecionados.has(String(props.profissional_id ?? ''))) return false;
      return true;
    });
  }, [events, busca, filtroStatus, filtroProfissionais]);

  const eventosPorDia = useMemo(() => {
    const mapa = new Map<string, EventoAgenda[]>();
    eventosVisiveis.forEach((evento) => {
      const chave = chaveLocal(new Date(evento.start));
      const lista = mapa.get(chave) || [];
      lista.push(evento);
      mapa.set(chave, lista);
    });
    mapa.forEach((lista) => lista.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
    return mapa;
  }, [eventosVisiveis]);

  const horasGrade = useMemo(() => {
    let min = 7;
    let max = 20;
    eventosVisiveis.forEach((evento) => {
      const inicio = new Date(evento.start);
      if (Number.isNaN(inicio.getTime())) return;
      const horaInicio = inicio.getHours();
      if (horaInicio < min) min = horaInicio;
      if (horaInicio > max) max = horaInicio;
      const fim = new Date(evento.end);
      if (!Number.isNaN(fim.getTime()) && mesmoDia(inicio, fim) && fim.getHours() > max) {
        max = fim.getHours();
      }
    });
    return Array.from({ length: max - min + 1 }, (_, indice) => min + indice);
  }, [eventosVisiveis]);

  const planoDoPaciente = useMemo(() => {
    const pac = pacientes.find((p) => String(p.id) === String(formData.paciente_id));
    if (!pac?.plano_id) return null;
    return planosPreco.find((p) => p.id === pac.plano_id) ?? null;
  }, [pacientes, formData.paciente_id, planosPreco]);

  const tratamentosAgenda = useMemo(
    () => tratamentosVisiveis(tratamentosBase, planoDoPaciente, linhasPreco),
    [tratamentosBase, planoDoPaciente, linhasPreco],
  );

  const hoje = inicioDoDia(new Date());
  const diaSelecionado = useMemo(() => inicioDoDia(cursor), [cursor]);
  const titulo = visao === 'dia' || visao === 'profissionais'
    ? capitalizar(cursor.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }))
    : visao === 'semana'
      ? `${inicioSemana(cursor).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${somarDias(inicioSemana(cursor), 6).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : `${capitalizar(cursor.toLocaleDateString('pt-BR', { month: 'long' }))} ${cursor.getFullYear()}`;

  function mover(direcao: -1 | 1) {
    const proxima = new Date(cursor);
    if (visao === 'dia' || visao === 'profissionais') proxima.setDate(proxima.getDate() + direcao);
    else if (visao === 'semana') proxima.setDate(proxima.getDate() + direcao * 7);
    else proxima.setMonth(proxima.getMonth() + direcao);
    setCursor(proxima);
  }

  const diasMes = Array.from({ length: 42 }, (_, indice) => somarDias(inicioSemana(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), indice));
  const diasSemana = Array.from({ length: 7 }, (_, indice) => somarDias(inicioSemana(cursor), indice));
  const visoes: { id: Visao; label: string; Icone: typeof Calendar }[] = [
    { id: 'dia', label: 'Dia', Icone: Clock },
    { id: 'semana', label: 'Semana', Icone: LayoutGrid },
    { id: 'mes', label: 'Mês', Icone: Calendar },
    { id: 'profissionais', label: 'Profissionais', Icone: Users },
    { id: 'lista', label: 'Lista', Icone: List },
  ];

  function dentroDoPeriodo(data: Date) {
    if (visao === 'dia' || visao === 'profissionais') return mesmoDia(data, cursor);
    if (visao === 'semana') {
      const inicio = inicioSemana(cursor);
      return data >= inicio && data < somarDias(inicio, 7);
    }
    return data.getMonth() === cursor.getMonth() && data.getFullYear() === cursor.getFullYear();
  }

  const eventosLista = eventosVisiveis
    .filter((evento) => dentroDoPeriodo(new Date(evento.start)))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const colunasProfissionais = useMemo<ColunaProfissional[]>(() => {
    let base = profissionaisVisiveis;
    if (filtroProfissionais.length) {
      const selecionados = new Set(filtroProfissionais);
      base = base.filter((p) => selecionados.has(String(p.id)));
    }
    const colunas: ColunaProfissional[] = base.map((p) => ({
      id: String(p.id),
      nome: p.nome,
      cor: corProfissional(p),
    }));

    const eventosDoDia = eventosPorDia.get(chaveLocal(cursor)) ?? [];

    // Profissionais que aparecem em atendimentos mas não estão na equipe
    // visível (ex.: desligados) continuam com coluna própria para não
    // esconder nenhum atendimento.
    const idsConhecidos = new Set(colunas.map((coluna) => coluna.id));
    const idsComEventos = new Set<string>();
    eventosDoDia.forEach((evento) => {
      const profissionalId = evento.extendedProps?.profissional_id;
      if (profissionalId == null || profissionalId === '') return;
      idsComEventos.add(String(profissionalId));
    });
    idsComEventos.forEach((id) => {
      if (idsConhecidos.has(id)) return;
      if (filtroProfissionais.length && !filtroProfissionais.includes(id)) return;
      colunas.push({
        id,
        nome: `Profissional #${id}`,
        cor: corProfissional({ id }),
        desconhecido: true,
      });
    });

    if (!filtroProfissionais.length) {
      const temSemProfissional = eventosDoDia.some((evento) => evento.extendedProps?.profissional_id == null);
      if (temSemProfissional) {
        colunas.push({
          id: '__sem_profissional__',
          nome: 'Sem profissional',
          cor: COR_PROFISSIONAL_PADRAO,
          semProfissional: true,
        });
      }
    }
    return colunas;
  }, [profissionaisVisiveis, filtroProfissionais, eventosPorDia, cursor]);

  const inputClass =
    'box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5 max-sm:overflow-y-auto">
      <header className="mb-3 shrink-0 space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">
          {titulo}
          <span className="text-neutral-400">
            <span className="max-sm:hidden"> · </span>
            <span className="max-sm:mt-0.5 max-sm:block max-sm:text-base max-sm:font-medium">{clinicaNome}</span>
          </span>
        </h1>

        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar paciente ou procedimento..."
            className="h-10 w-full rounded-md border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
          />
        </div>

        <div className="grid gap-2 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="inline-flex shrink-0 items-center gap-1">
              <button type="button" aria-label="Anterior" onClick={() => mover(-1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50">
                <ChevronLeft size={16} />
              </button>
              <button type="button" onClick={() => setCursor(new Date())} className="h-8 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-700 hover:bg-neutral-50">
                Hoje
              </button>
              <button type="button" aria-label="Próximo" onClick={() => mover(1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50">
                <ChevronRight size={16} />
              </button>
            </div>
            <SegmentedControl
              size="sm"
              className="min-w-0 flex-1 bg-white"
              value={visao}
              onChange={setVisao}
              options={visoes.map(({ id, label, Icone }) => ({
                value: id,
                ariaLabel: label,
                label: (
                  <>
                    <Icone size={14} className="shrink-0" />
                    <span className="hidden truncate sm:inline">{label}</span>
                  </>
                ),
              }))}
            />
          </div>
          <div className="flex items-center gap-2">
            {filtrosAtivos && (
              <button
                type="button"
                aria-label="Limpar filtros"
                onClick={limparFiltros}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-white text-red-500"
              >
                <X size={16} />
              </button>
            )}
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <MenuFiltro cheio rotulo="Status" valor={filtroStatus} onChange={setFiltroStatus} opcoes={STATUS_OPCOES} />
              <button
                type="button"
                onClick={abrirNovoAgendamento}
                className="inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                <Plus size={14} className="shrink-0" />
                <span className="truncate">Novo</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 max-lg:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1">
              <button type="button" aria-label="Anterior" onClick={() => mover(-1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50">
                <ChevronLeft size={16} />
              </button>
              <button type="button" onClick={() => setCursor(new Date())} className="h-8 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-700 hover:bg-neutral-50">
                Hoje
              </button>
              <button type="button" aria-label="Próximo" onClick={() => mover(1)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filtrosAtivos && (
              <button
                type="button"
                aria-label="Limpar filtros"
                onClick={limparFiltros}
                className="inline-flex h-8 w-8 items-center justify-center text-red-500"
              >
                <X size={16} />
              </button>
            )}
            <MenuFiltro rotulo="Status" valor={filtroStatus} onChange={setFiltroStatus} opcoes={STATUS_OPCOES} />
            <SegmentedControl
              fit
              className="shrink-0 bg-white"
              value={visao}
              onChange={setVisao}
              options={visoes.map(({ id, label, Icone }) => ({
                value: id,
                ariaLabel: label,
                label: (
                  <>
                    <Icone size={14} />
                    <span className="hidden sm:inline">{label}</span>
                  </>
                ),
              }))}
            />
            <button
              type="button"
              onClick={abrirNovoAgendamento}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800"
            >
              <Plus size={14} />
              Novo agendamento
            </button>
          </div>
        </div>

        <ChipsProfissionais
          profissionais={chipsProfissionais}
          selecionados={filtroProfissionais}
          onToggle={alternarProfissional}
          onLimpar={limparProfissionais}
        />

        {lembretesPendentes.length > 0 && (
          <section className={`${cardShell} border border-amber-200/80 bg-amber-50/80 p-3 sm:p-4`}>
            <button
              type="button"
              onClick={() => setLembretesAbertos((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700">
                  <Bell size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-950">Lembretes 24h</p>
                  <p className="truncate text-xs text-amber-800/90">
                    {`${lembretesPendentes.length} consulta(s) amanhã`}
                  </p>
                </div>
              </div>
              <ChevronDown size={18} className={`shrink-0 text-amber-800 transition-transform ${lembretesAbertos ? 'rotate-180' : ''}`} />
            </button>
            {lembretesAbertos && !lembretesLoading && lembretesPendentes.length > 0 && (
              <div className="mt-3 max-h-36 space-y-2 overflow-y-auto">
                {lembretesPendentes.map((ag) => (
                  <div
                    key={ag.id}
                    className="flex flex-col gap-2 rounded-xl border border-amber-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 text-sm">
                      <span className="font-semibold text-neutral-900">{ag.paciente_nome}</span>
                      <span className="ml-2 text-neutral-500">
                        {new Date(ag.data_hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {ag.procedimento}
                      </span>
                    </div>
                    <PatientContactButtons
                      variant="row"
                      telefone={ag.paciente_telefone}
                      email={ag.paciente_email}
                      clinicaId={ag.clinica_id}
                      evento="lembrete"
                      contexto={ctxLembreteAgendamento(ag)}
                      onEnviado={(canal) => {
                        marcarLembreteEnviado(
                          ag.clinica_id,
                          ag.id,
                          canal === 'whatsapp' ? 'whatsapp' : canal === 'email' ? 'email' : canal === 'sms' ? 'sms' : 'manual',
                        );
                        setLembretesPendentes((prev) => prev.filter((x) => x.id !== ag.id));
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </header>

      {visao === 'mes' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:min-h-[22rem]">
          <div className="grid shrink-0 grid-cols-7 border-b border-neutral-200">
            {DIAS_CURTOS.map((dia) => (
              <div key={dia} className="py-2 text-center text-xs font-medium text-neutral-500">{dia}</div>
            ))}
          </div>
          <div className="grid min-h-[280px] flex-1 grid-cols-7 grid-rows-6">
            {diasMes.map((dia, indice) => {
              const lista = eventosPorDia.get(chaveLocal(dia)) || [];
              const fora = dia.getMonth() !== cursor.getMonth();
              return (
                <div
                  key={`${chaveLocal(dia)}-${indice}`}
                  onClick={() => {
                    if (window.matchMedia('(max-width: 639px)').matches) {
                      setCursor(dia);
                      setVisao('dia');
                      return;
                    }
                    abrirNoDia(dia);
                  }}
                  className={`flex min-h-0 cursor-pointer flex-col p-1 text-left hover:bg-neutral-50 max-sm:items-center sm:p-1.5 ${indice % 7 !== 6 ? 'border-r border-neutral-200' : ''} ${indice < 35 ? 'border-b border-neutral-200' : ''}`}
                >
                  <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs sm:text-sm ${mesmoDia(dia, hoje) ? 'bg-amber-500 font-semibold text-white' : fora ? 'text-neutral-300' : 'text-neutral-700'}`}>{dia.getDate()}</span>
                  <div className="mt-0.5 min-h-0 space-y-0.5 overflow-hidden max-sm:hidden">
                    {lista.slice(0, 2).map((evento) => (
                      <ChipEvento
                        key={evento.id}
                        evento={evento}
                        corProfissional={corDoEvento(evento.extendedProps)}
                        onOpen={abrirEvento}
                      />
                    ))}
                    {lista.length > 2 && <span className="px-1 text-[11px] text-neutral-400">+{lista.length - 2}</span>}
                  </div>
                  {lista.length > 0 && (
                    <div className="mt-1 flex flex-wrap justify-center gap-0.5 sm:hidden">
                      {lista.slice(0, 3).map((evento) => (
                        <span key={evento.id} className={`h-1.5 w-1.5 rounded-full ${corStatus(evento.extendedProps?.status)}`} />
                      ))}
                      {lista.length > 3 && <span className="text-[9px] leading-none text-neutral-400">+{lista.length - 3}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(visao === 'semana' || visao === 'dia') && (
        <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:min-h-[26rem] ${visao === 'semana' ? 'max-md:overflow-x-auto' : ''}`}>
          <div className={`grid shrink-0 border-b border-neutral-200 ${visao === 'dia' ? 'grid-cols-[3.25rem_minmax(0,1fr)]' : 'grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] max-md:min-w-[42rem]'}`}>
            <div className="max-md:sticky max-md:left-0 max-md:z-[5] max-md:bg-white" />
            {(visao === 'dia' ? [diaSelecionado] : diasSemana).map((dia) => (
              <div key={chaveLocal(dia)} className="py-2 text-center">
                <div className="text-[11px] text-neutral-400">{DIAS_CURTOS[dia.getDay()]}</div>
                <div className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-sm ${mesmoDia(dia, hoje) ? 'bg-amber-500 font-semibold text-white' : 'text-neutral-800'}`}>{dia.getDate()}</div>
              </div>
            ))}
          </div>
          <div ref={gradeHorasRef} className={`relative min-h-0 flex-1 overflow-y-auto ${visao === 'semana' ? 'max-md:min-w-[42rem]' : ''}`}>
            {horasGrade.map((hora) => {
              const dias = visao === 'dia' ? [diaSelecionado] : diasSemana;
              const rotulo = `${String(hora).padStart(2, '0')}:00`;
              return (
                <div key={hora} className={`grid min-h-12 border-b border-neutral-100 last:border-b-0 ${visao === 'dia' ? 'grid-cols-[3.25rem_minmax(0,1fr)]' : 'grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]'}`}>
                  <div className="px-1 pt-1 text-right text-[11px] text-neutral-400 max-md:sticky max-md:left-0 max-md:z-[5] max-md:bg-white">{rotulo}</div>
                  {dias.map((dia) => {
                    const lista = (eventosPorDia.get(chaveLocal(dia)) || []).filter((evento) => new Date(evento.start).getHours() === hora);
                    const mostraAgora = mesmoDia(dia, agora) && agora.getHours() === hora;
                    return (
                      <div
                        key={`${chaveLocal(dia)}-${hora}`}
                        onClick={() => abrirNoDia(dia, rotulo)}
                        className="relative min-h-12 cursor-pointer border-l border-neutral-100 p-0.5 hover:bg-neutral-50"
                      >
                        {mostraAgora && (
                          <div
                            data-agora=""
                            className="pointer-events-none absolute inset-x-0 z-10"
                            style={{ top: `${(agora.getMinutes() / 60) * 100}%` }}
                          >
                            <span className="absolute left-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
                            <span className="absolute left-0 right-0 h-0.5 -translate-y-1/2 bg-red-500" />
                          </div>
                        )}
                        {lista.map((evento) => (
                          <ChipEvento
                            key={evento.id}
                            evento={evento}
                            corProfissional={corDoEvento(evento.extendedProps)}
                            onOpen={abrirEvento}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {visao === 'profissionais' && (
        <GradeProfissional
          dia={diaSelecionado}
          horas={horasGrade}
          colunas={colunasProfissionais}
          eventosPorDia={eventosPorDia}
          agora={agora}
          mobile={ehMobile}
          gradeRef={gradeHorasRef}
          onAbrirNoDia={abrirNoDia}
          onAbrirEvento={abrirEvento}
          corDoEvento={corDoEvento}
        />
      )}

      {visao === 'lista' && (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-neutral-200 bg-white max-sm:min-h-[22rem]">
          {eventosLista.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-400">Nenhum agendamento neste período.</p>
          ) : eventosLista.map((evento) => {
            const props = evento.extendedProps || ({} as RegistroAgendamento);
            const data = new Date(evento.start);
            const total = Number(props.parte_total) || 1;
            const indice = Number(props.parte_indice) || 0;
            return (
              <button
                key={evento.id}
                type="button"
                onClick={() => abrirEvento(props)}
                className="flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-left last:border-b-0 hover:bg-neutral-50"
              >
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: corDoEvento(props) }} />
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${corStatus(props.status)}`} />
                <span className="w-28 shrink-0 text-sm text-neutral-500">{data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className={`min-w-0 truncate text-sm text-neutral-900 ${props.status === 'cancelado' ? 'line-through text-neutral-400' : ''}`}>{nomePaciente(props) || 'Paciente'}</span>
                {props.parte_titulo && <span className="hidden shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 sm:inline">{props.parte_titulo}</span>}
                {total > 1 && <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">{indice + 1}/{total}</span>}
                <span className="hidden min-w-0 truncate text-sm text-neutral-500 sm:block">{props.procedimento}</span>
              </button>
            );
          })}
        </div>
      )}

      <Modal
        open={openModal}
        onClose={fecharModal}
        maxWidth="2xl"
        hideCloseButton
        panelClassName="flex !max-h-[92dvh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white sm:!max-h-[85vh]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-neutral-900">
              {formData.id ? 'Editar atendimento' : 'Novo atendimento'}
            </h2>
            <p className="mt-0.5 text-xs font-medium text-neutral-400">
              {carregandoPartes
                ? 'Carregando as partes deste atendimento...'
                : formData.partes.length > 1
                  ? `${formData.partes.length} partes neste atendimento`
                  : 'Paciente, partes e procedimento.'}
            </p>
          </div>
          <button type="button" onClick={fecharModal} className="touch-target shrink-0 rounded-full p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={18}/></button>
        </div>
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 sm:gap-x-3">
            <label>
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Clínica</span>
              <CustomSelect
                value={formData.clinica_id}
                onChange={(v) => setFormData((prev) => {
                  const forcado = usuarioAtual?.nivel !== 'admin' && usuarioAtual?.profissional_id
                    ? String(usuarioAtual.profissional_id)
                    : '';
                  const mantemProfissional = !!prev.profissional_id && profissionais.some((p) =>
                    String(p.id) === prev.profissional_id
                    && p.profissionais_clinicas?.some((vinculo) => String(vinculo.clinica_id) === v),
                  );
                  const mantemPaciente = !prev.paciente_id || pacientes.some((p) =>
                    String(p.id) === prev.paciente_id && String(p.clinica_id) === v,
                  );
                  return {
                    ...prev,
                    clinica_id: v,
                    profissional_id: forcado || (mantemProfissional ? prev.profissional_id : ''),
                    paciente_id: mantemPaciente ? prev.paciente_id : '',
                  };
                })}
                disabled={clinicaFiltro !== 'todas' || Boolean(formData.grupo_id)}
                options={clinicas.map((c) => ({ value: String(c.id), label: c.nome }))}
                placeholder="Selecione..."
                size="md"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Profissional</span>
              <CustomSelect
                value={formData.profissional_id}
                onChange={(v) => setFormData((prev) => ({ ...prev, profissional_id: v }))}
                disabled={usuarioAtual?.nivel !== 'admin'}
                options={profissionaisFiltrados.map((p) => ({ value: String(p.id), label: p.nome }))}
                placeholder="Qualquer um..."
                size="md"
              />
            </label>
            <label className="col-span-2">
              <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-neutral-500">
                Paciente
                <button type="button" onClick={abrirCadastroPaciente} className="inline-flex items-center gap-1 font-medium text-neutral-700 hover:text-neutral-900"><UserPlus size={12}/> Novo</button>
              </span>
              <CustomSelect
                value={formData.paciente_id}
                onChange={(v) => {
                  const pac = pacientes.find((p) => String(p.id) === String(v));
                  const plano = pac?.plano_id ? planosPreco.find((p) => p.id === pac.plano_id) ?? null : null;
                  const tratamento = tratamentosBase.find((item) => item.nome === formData.title);
                  const preco = valorNaAgenda(tratamento, plano, linhasPreco);
                  setFormData((prev) => ({ ...prev, paciente_id: v, valor: preco ?? prev.valor }));
                }}
                options={pacientes
                  .filter((p) => !formData.clinica_id || String(p.clinica_id) === String(formData.clinica_id))
                  .map((p) => ({ value: String(p.id), label: p.nome }))}
                placeholder="Selecione..."
                searchable
                size="md"
              />
            </label>

            <div className="col-span-2">
              <PartesEditor
                partes={formData.partes}
                onChange={(partes) => setFormData((prev) => ({ ...prev, partes }))}
                carregando={carregandoPartes}
              />
            </div>

            <label className="col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Procedimento</span>
              <ProcedureCombobox
                clinicaId={formData.clinica_id}
                especialidades={especialidades}
                tratamentos={tratamentosAgenda}
                value={formData.title}
                onChange={(nome, t) => {
                  const preco = valorNaAgenda(t, planoDoPaciente, linhasPreco);
                  setFormData((prev) => ({
                    ...prev,
                    title: nome,
                    valor: preco ?? prev.valor,
                  }));
                }}
                disabled={!formData.clinica_id}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Valor (R$)</span>
              <input type="number" step="1" value={formData.valor} onChange={(event) => setFormData((prev) => ({ ...prev, valor: event.target.value }))} className={inputClass} placeholder="0,00" />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Desconto (R$)</span>
              <input type="number" step="1" value={formData.desconto} onChange={(event) => setFormData((prev) => ({ ...prev, desconto: event.target.value }))} className={inputClass} placeholder="0,00" />
            </label>
            <label className="col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Total</span>
              <p className="flex h-10 items-center text-sm font-medium text-neutral-900">R$ {(parseFloat(formData.valor || '0') - parseFloat(formData.desconto || '0')).toFixed(2)}</p>
            </label>
            <label className="col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Observações</span>
              <textarea
                value={formData.observacoes}
                onChange={(event) => setFormData((prev) => ({ ...prev, observacoes: event.target.value }))}
                rows={2}
                className="box-border w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900"
                placeholder="Alguma observação sobre o atendimento..."
              />
            </label>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-neutral-500">Status</span>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_EDITOR.map((st) => (
                <button
                  key={st.value}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, status: st.value }))}
                  className={`h-9 rounded-md border px-3 text-sm font-medium ${
                    formData.status === st.value
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-black/5 px-4 py-3 sm:px-6 sm:py-4">
          {formData.id ? (
            <button type="button" onClick={excluirAgendamento} disabled={loading || carregandoPartes} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50" title="Excluir">
              <Trash2 size={14} /> Excluir
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <button type="button" onClick={fecharModal} className="h-10 px-3 text-sm font-medium text-neutral-500 hover:text-neutral-900">Cancelar</button>
            <button
              type="button"
              onClick={() => saveOrUpdate()}
              disabled={loading || carregandoPartes}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              {loading && <Loader2 className="animate-spin" size={16} />} Salvar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
