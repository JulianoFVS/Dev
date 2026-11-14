'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { usePatientActionModal } from '@/components/PatientActionModal';
import { useClinica } from '@/app/context/ClinicaContext';
import { fetchUserClinicas, fetchUserEquipe } from '@/lib/clinicScoped';

import { Plus, X, Loader2, UserPlus, Trash2, Bell, ChevronDown, ChevronLeft, ChevronRight, Search, Calendar, LayoutGrid, Clock, List } from 'lucide-react';
import CustomSelect from '@/components/ui/CustomSelect';
import CampoData from '@/components/ui/CampoData';
import CampoHora from '@/components/ui/CampoHora';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { validarAgendamentoCompleto } from '@/lib/horarioProfissional';
import PatientContactButtons from '@/components/PatientContactButtons';
import Modal from '@/components/ui/Modal';
import SegmentedControl from '@/components/ui/SegmentedControl';
import ProcedureCombobox from '@/components/forms/ProcedureCombobox';
import {
  buscarAgendamentosLembrete24h,
  filtrarPendentesLembrete,
  ctxLembreteAgendamento,
  marcarLembreteEnviado,
  type LembreteAgendamento,
} from '@/lib/lembretesAgenda';
import { lerPrefillAgenda, limparPrefillAgenda } from '@/lib/agendaPrefill';
import { tratamentosVisiveis, valorNaAgenda, type LinhaPreco, type PlanoTipo } from '@/lib/precoTratamento';

type Visao = 'mes' | 'semana' | 'dia' | 'lista';

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const STATUS_OPCOES = [
  { value: 'todos', label: 'Todas' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'fiado', label: 'Fiado' },
  { value: 'cancelado', label: 'Cancelado' },
];

function inicioDoDia(data: Date) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function inicioSemana(data: Date) {
  const dia = inicioDoDia(data);
  dia.setDate(dia.getDate() - dia.getDay());
  return dia;
}

function somarDias(data: Date, dias: number) {
  const proxima = new Date(data);
  proxima.setDate(proxima.getDate() + dias);
  return proxima;
}

function mesmoDia(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function chaveLocal(data: Date) {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

function capitalizar(texto: string) {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

function nomePaciente(props: any) {
  return Array.isArray(props?.pacientes) ? props.pacientes[0]?.nome : props?.pacientes?.nome;
}

function corStatus(status?: string) {
  if (status === 'concluido') return 'bg-emerald-500';
  if (status === 'fiado') return 'bg-amber-500';
  if (status === 'cancelado') return 'bg-rose-500';
  return 'bg-neutral-900';
}

function MenuFiltro({
  rotulo,
  valor,
  opcoes,
  onChange,
  cheio = false,
}: {
  rotulo: string;
  valor: string;
  opcoes: { value: string; label: string }[];
  onChange: (valor: string) => void;
  cheio?: boolean;
}) {
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 180, maxHeight: 240 });
  const ativo = valor !== 'todos';
  const titulo = ativo ? (opcoes.find((opcao) => opcao.value === valor)?.label || rotulo) : rotulo;

  function abrir() {
    const rect = botao.current?.getBoundingClientRect();
    if (!rect) return;
    const abaixo = window.innerHeight - rect.bottom;
    const acima = rect.top;
    const abreAbaixo = abaixo >= 160 || abaixo >= acima;
    const maxHeight = Math.max(120, Math.min(240, (abreAbaixo ? abaixo : acima) - 12));
    setPos({
      top: abreAbaixo ? rect.bottom + 4 : Math.max(8, rect.top - maxHeight - 4),
      left: rect.left,
      width: Math.max(rect.width, 180),
      maxHeight,
    });
    setAberto((atual) => !atual);
  }

  useEffect(() => {
    if (!aberto) return;
    const fechar = (event: Event) => {
      const alvo = event.target as Node | null;
      if (alvo && menu.current?.contains(alvo)) return;
      setAberto(false);
    };
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    return () => {
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
    };
  }, [aberto]);

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={abrir}
        title={ativo ? titulo : undefined}
        className={`relative inline-flex h-8 items-center rounded-md border bg-white text-sm text-neutral-700 hover:bg-neutral-50 ${cheio ? 'w-full min-w-0' : ''} ${ativo ? 'border-red-500' : 'border-neutral-200'}`}
      >
        <span className={`invisible inline-flex items-center gap-1.5 px-2.5 ${cheio ? 'min-w-0 overflow-hidden' : ''}`}>
          <ChevronDown size={13} />
          {rotulo}
        </span>
        <span className="absolute inset-0 flex items-center gap-1.5 px-2.5">
          <ChevronDown size={13} className={`shrink-0 text-neutral-500 transition-transform ${aberto ? 'rotate-180' : ''}`} />
          <span className="truncate">{titulo}</span>
        </span>
      </button>
      {aberto && typeof document !== 'undefined' && createPortal(
        <>
          <button type="button" aria-label="Fechar filtro" className="fixed inset-0 z-[80] cursor-default" onClick={() => setAberto(false)} />
          <div
            ref={menu}
            className="fixed z-[81] overflow-y-auto overscroll-contain rounded-md border border-neutral-200 bg-white py-1"
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            onWheel={(event) => event.stopPropagation()}
          >
            {opcoes.map((opcao) => (
              <button
                key={opcao.value}
                type="button"
                onClick={() => { onChange(opcao.value); setAberto(false); }}
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50 ${valor === opcao.value ? 'font-medium text-neutral-900' : 'text-neutral-600'}`}
              >
                {opcao.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

export default function Agenda() {
  const searchParams = useSearchParams();
  const pacientePreSelecionado = searchParams?.get('paciente');
  const { openQuickCapture } = usePatientActionModal();
  const { activeClinicId, loading: clinicLoading, clinicaNome } = useClinica();
  const clinicaFiltro =
    !activeClinicId || activeClinicId === 'all' ? 'todas' : String(activeClinicId);
  const { showAlert, showConfirm } = useCustomAlert();
  const [events, setEvents] = useState<any[]>([]);
  const [usuarioAtual, setUsuarioAtual] = useState<any>(null);
  
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  const [profissionaisFiltrados, setProfissionaisFiltrados] = useState<any[]>([]);
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [tratamentosBase, setTratamentosBase] = useState<any[]>([]);
  const [planosPreco, setPlanosPreco] = useState<PlanoTipo[]>([]);
  const [linhasPreco, setLinhasPreco] = useState<LinhaPreco[]>([]);
  const [especialidades, setEspecialidades] = useState<{ id: string; nome: string }[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [lembretesAbertos, setLembretesAbertos] = useState(true);
  const [loading, setLoading] = useState(false);
  const [lembretesPendentes, setLembretesPendentes] = useState<LembreteAgendamento[]>([]);
  const [lembretesLoading, setLembretesLoading] = useState(false);
  const [visao, setVisao] = useState<Visao>('semana');
  const [cursor, setCursor] = useState(() => new Date());
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroProfissional, setFiltroProfissional] = useState('todos');
  const [agora, setAgora] = useState(() => new Date());
  const gradeHorasRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({ 
      id: null, title: '', date: '', time: '08:00', theme: 'blue', 
      paciente_id: '', valor: '0', desconto: '0', observacoes: '', 
      status: 'agendado', clinica_id: '', profissional_id: '' 
  });

  useEffect(() => { 
      if (!clinicLoading) inicializar(); 
  }, [clinicLoading]);

  useEffect(() => { if(usuarioAtual) carregarEventos(); }, [clinicaFiltro, usuarioAtual]);

  useEffect(() => {
      if (!clinicLoading && clinicas.length) carregarLembretes();
  }, [clinicLoading, clinicas, clinicaFiltro]);

  async function carregarLembretes() {
      setLembretesLoading(true);
      try {
          const ids = clinicaFiltro !== 'todas'
              ? [clinicaFiltro]
              : clinicas.map((c: any) => c.id);
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
      } finally {
          setLembretesLoading(false);
      }
  }

  const prefillAplicado = useRef(false);

  useEffect(() => {
      if (prefillAplicado.current || !pacientePreSelecionado || pacientes.length === 0) return;
      const paciente = pacientes.find((p: any) => String(p.id) === String(pacientePreSelecionado));
      if (!paciente) return;
      const hoje = new Date().toISOString().split('T')[0];
      const prefill = lerPrefillAgenda();
      const mesmoPaciente = prefill && String(prefill.pacienteId) === String(paciente.id) ? prefill : null;
      const dataSugerida = mesmoPaciente?.data && mesmoPaciente.data >= hoje ? mesmoPaciente.data : hoje;
      const preClinica = clinicaFiltro !== 'todas' ? clinicaFiltro : paciente.clinica_id || '';
      const preProfissional = (usuarioAtual?.nivel !== 'admin' && usuarioAtual?.profissional_id) ? usuarioAtual.profissional_id : '';
      setFormData({
          id: null,
          title: mesmoPaciente?.procedimento || '',
          date: dataSugerida,
          time: '08:00',
          theme: 'blue',
          paciente_id: paciente.id,
          valor: '0',
          desconto: '0',
          observacoes: mesmoPaciente?.observacoes || '',
          status: 'agendado',
          clinica_id: preClinica,
          profissional_id: preProfissional,
      });
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
      } else { 
          const filtrados = profissionais.filter((p:any) => p.profissionais_clinicas?.some((vinculo:any) => vinculo.clinica_id == formData.clinica_id)); 
          setProfissionaisFiltrados(filtrados);
          carregarTratamentosBase(formData.clinica_id);
          carregarEspecialidades(formData.clinica_id);
      } 
  }, [formData.clinica_id, profissionais]);

  const recarregarPacientes = useCallback(async () => {
      const cl = await fetchUserClinicas();
      const idsPermitidos = cl.map((c) => c.id);
      if (idsPermitidos.length > 0) {
          const { data: pac } = await supabase
              .from('pacientes')
              .select('id, nome, clinica_id, telefone, plano_id')
              .in('clinica_id', idsPermitidos as any)
              .order('nome');
          if (pac) setPacientes(pac);
      } else {
          setPacientes([]);
      }
  }, []);

  async function carregarTratamentosBase(clinicaId: string) {
      const [tr, planos, linhas] = await Promise.all([
          supabase.from('tratamentos_base').select('id, nome, valor_sugerido, especialidade_id').eq('clinica_id', clinicaId).eq('ativo', true).order('nome'),
          supabase.from('planos').select('id, tipo').eq('clinica_id', Number(clinicaId)),
          supabase.from('planos_tratamentos').select('plano_id, tratamento_id, valor, ativo').eq('clinica_id', Number(clinicaId)),
      ]);
      setTratamentosBase(tr.data || []);
      setPlanosPreco((planos.data || []) as PlanoTipo[]);
      setLinhasPreco((linhas.data || []) as LinhaPreco[]);
  }

  async function carregarEspecialidades(clinicaId: string) {
      const { data } = await supabase
          .from('especialidades')
          .select('id, nome')
          .eq('clinica_id', Number(clinicaId))
          .eq('ativo', true)
          .order('nome');
      setEspecialidades(data || []);
  }

  useEffect(() => {
      function handlePacienteChanged() { recarregarPacientes(); }
      window.addEventListener('ortus:paciente-changed', handlePacienteChanged);
      return () => window.removeEventListener('ortus:paciente-changed', handlePacienteChanged);
  }, [recarregarPacientes]);

  async function inicializar() { 
      const { data: { user } } = await supabase.auth.getUser(); 
      if (user) { 
          const { data: prof } = await supabase.from('profissionais').select('*').eq('user_id', user.id).single(); 
          if (prof) { 
              setUsuarioAtual({ id: user.id, nivel: prof.nivel_acesso, profissional_id: prof.id }); 
              if (prof.nivel_acesso !== 'admin') setFormData(prev => ({ ...prev, profissional_id: prof.id })); 
          } else { 
              setUsuarioAtual({ id: user.id, nivel: 'admin', profissional_id: null }); 
          } 
      } 
      fetchDados(); 
  }

  async function fetchDados() {
      // Clínicas restritas ao usuário (multi-tenant)
      const cl = await fetchUserClinicas();
      setClinicas(cl);
      const idsPermitidos = cl.map((c) => c.id);

      // Equipe visível ao usuário (filtrada por rede; super admin vê tudo).
      // Mantém a forma `{ profissionais_clinicas: [{ clinica_id }] }` esperada
      // pela UI a partir das `clinicas` retornadas pelo helper.
      const equipe = await fetchUserEquipe();
      const equipeNormalizada = equipe.map((p: any) => ({
          ...p,
          profissionais_clinicas: (p.clinicas || []).map((c: any) => ({ clinica_id: c.id })),
      }));
      setProfissionais(equipeNormalizada as any);

      // Pacientes apenas das clínicas permitidas
      if (idsPermitidos.length > 0) {
          const { data: pac } = await supabase
              .from('pacientes')
              .select('id, nome, clinica_id, telefone, plano_id')
              .in('clinica_id', idsPermitidos as any)
              .order('nome');
          if (pac) setPacientes(pac);
      } else {
          setPacientes([]);
      }
  }

  async function carregarEventos() { 
      if (!usuarioAtual) return; 
      let query = supabase.from('agendamentos').select('*, pacientes(nome), clinicas(nome, cor_tema)'); 
      if (clinicaFiltro !== 'todas') query = query.eq('clinica_id', clinicaFiltro); 
      if (usuarioAtual.nivel !== 'admin' && usuarioAtual.profissional_id) query = query.eq('profissional_id', usuarioAtual.profissional_id); 
      
      const { data: ag } = await query; 
      if (ag) { 
          const fmt = ag
            .filter((e: any) => e.tipo_registro !== 'debito_manual' && e.observacoes !== 'Débito manual')
            .map((e:any) => ({ 
              id: e.id, 
              title: `${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome} - ${e.procedimento}`, 
              start: e.data_hora, 
              end: new Date(new Date(e.data_hora).getTime() + 60*60*1000).toISOString(), 
              extendedProps: e, 
              backgroundColor: 'transparent', 
              borderColor: 'transparent' 
          })); 
          setEvents(fmt); 
      } else setEvents([]); 
  }

  function abrirNoDia(dia: Date, hora = '08:00') {
      const preClinica = clinicaFiltro !== 'todas' ? clinicaFiltro : '';
      const preProfissional = (usuarioAtual?.nivel !== 'admin' && usuarioAtual?.profissional_id) ? usuarioAtual.profissional_id : '';
      setFormData({
          id: null,
          title: '',
          date: chaveLocal(dia),
          time: hora,
          theme: 'blue',
          paciente_id: '',
          valor: '0',
          desconto: '0',
          observacoes: '',
          status: 'agendado',
          clinica_id: preClinica,
          profissional_id: preProfissional,
      });
      setOpenModal(true);
  }

  function abrirEvento(registro: any) { 
      const r = registro; 
      const localDate = new Date(r.data_hora); 
      setFormData({
          id: r.id, 
          title: r.procedimento, 
          date: chaveLocal(localDate), 
          time: localDate.toTimeString().slice(0,5), 
          theme: r.cor || 'blue', 
          paciente_id: r.paciente_id, 
          valor: r.valor || '0', 
          desconto: r.desconto || '0', 
          observacoes: r.observacoes || '', 
          status: r.status || 'agendado', 
          clinica_id: r.clinica_id, 
          profissional_id: r.profissional_id 
      }); 
      setOpenModal(true); 
  };

  async function saveOrUpdate(overrideStatus?: string) { 
      if (!formData.title || !formData.paciente_id || !formData.clinica_id) { await showAlert('Preencha campos obrigatórios.', { type: 'warning' }); return; } 

      if (formData.profissional_id) {
          const erroHorario = await validarAgendamentoCompleto({
              clinicaId: formData.clinica_id,
              profissionalId: formData.profissional_id,
              date: formData.date,
              time: formData.time,
              excludeAgendamentoId: formData.id,
          });
          if (erroHorario) { await showAlert(erroHorario, { type: 'warning' }); return; }
      }

      setLoading(true); 
      
      const finalStatus = overrideStatus || formData.status;
      const dataLocal = new Date(`${formData.date}T${formData.time}:00`); 
      const dataHoraISO = dataLocal.toISOString(); 
      
      const payload = { 
          paciente_id: formData.paciente_id, 
          clinica_id: formData.clinica_id, 
          profissional_id: formData.profissional_id || null, 
          data_hora: dataHoraISO, 
          procedimento: formData.title, 
          cor: formData.theme, 
          valor: parseFloat(formData.valor) || 0, 
          desconto: parseFloat(formData.desconto) || 0, 
          valor_final: (parseFloat(formData.valor) || 0) - (parseFloat(formData.desconto) || 0), 
          observacoes: formData.observacoes, 
          status: finalStatus 
      }; 
      
      if (formData.id) await supabase.from('agendamentos').update(payload).eq('id', formData.id); 
      else await supabase.from('agendamentos').insert([payload]); 
      
      setOpenModal(false); 
      carregarEventos(); 
      window.dispatchEvent(new CustomEvent('ortus:agenda-changed'));
      setLoading(false); 
  }

  async function excluirAgendamento() {
      if(!formData.id) return;
      if(!(await showConfirm('Tem certeza que deseja excluir este agendamento?', { title: 'Excluir', type: 'error', confirmLabel: 'Excluir' }))) return;
      await supabase.from('agendamentos').delete().eq('id', formData.id);
      setOpenModal(false);
      carregarEventos();
  }

  function abrirCadastroPaciente() {
      const clinicaId = formData.clinica_id || (clinicaFiltro !== 'todas' ? clinicaFiltro : null);
      openQuickCapture(clinicaId);
  }

  function abrirNovoAgendamento() {
      const hoje = chaveLocal(new Date());
      const preClinica = clinicaFiltro !== 'todas' ? clinicaFiltro : '';
      const preProfissional =
          usuarioAtual?.nivel !== 'admin' && usuarioAtual?.profissional_id ? usuarioAtual.profissional_id : '';
      setFormData({
          id: null,
          title: '',
          date: hoje,
          time: '08:00',
          theme: 'blue',
          paciente_id: '',
          valor: '0',
          desconto: '0',
          observacoes: '',
          status: 'agendado',
          clinica_id: preClinica,
          profissional_id: preProfissional,
      });
      setOpenModal(true);
  }

  const cardShell = 'rounded-xl bg-white';

  const eventosVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return events.filter((evento) => {
      const props = evento.extendedProps || {};
      const nome = String(nomePaciente(props) || '');
      const procedimento = String(props.procedimento || '');
      if (termo && !nome.toLowerCase().includes(termo) && !procedimento.toLowerCase().includes(termo)) return false;
      if (filtroStatus !== 'todos' && (props.status || 'agendado') !== filtroStatus) return false;
      if (filtroProfissional !== 'todos' && String(props.profissional_id || '') !== filtroProfissional) return false;
      return true;
    });
  }, [events, busca, filtroStatus, filtroProfissional]);

  const eventosPorDia = useMemo(() => {
    const mapa = new Map<string, any[]>();
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
      const hora = new Date(evento.start).getHours();
      if (Number.isNaN(hora)) return;
      if (hora < min) min = hora;
      if (hora > max) max = hora;
    });
    return Array.from({ length: max - min + 1 }, (_, indice) => min + indice);
  }, [eventosVisiveis]);

  const planoDoPaciente = useMemo(() => {
    const pac = pacientes.find((p: any) => String(p.id) === String(formData.paciente_id));
    if (!pac?.plano_id) return null;
    return planosPreco.find((p) => p.id === pac.plano_id) ?? null;
  }, [pacientes, formData.paciente_id, planosPreco]);

  const tratamentosAgenda = useMemo(
    () => tratamentosVisiveis(tratamentosBase, planoDoPaciente, linhasPreco),
    [tratamentosBase, planoDoPaciente, linhasPreco],
  );

  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (visao !== 'semana' && visao !== 'dia') return;
    const grade = gradeHorasRef.current;
    const linha = grade?.querySelector('[data-agora]') as HTMLElement | null;
    if (!grade || !linha) return;
    const gradeRect = grade.getBoundingClientRect();
    const linhaRect = linha.getBoundingClientRect();
    grade.scrollTop += linhaRect.top - gradeRect.top - grade.clientHeight / 2;
  }, [visao, cursor]);

  const hoje = inicioDoDia(new Date());
  const titulo = visao === 'dia'
    ? capitalizar(cursor.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }))
    : visao === 'semana'
      ? `${inicioSemana(cursor).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} – ${somarDias(inicioSemana(cursor), 6).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : `${capitalizar(cursor.toLocaleDateString('pt-BR', { month: 'long' }))} ${cursor.getFullYear()}`;

  function mover(direcao: -1 | 1) {
    const proxima = new Date(cursor);
    if (visao === 'dia') proxima.setDate(proxima.getDate() + direcao);
    else if (visao === 'semana') proxima.setDate(proxima.getDate() + direcao * 7);
    else proxima.setMonth(proxima.getMonth() + direcao);
    setCursor(proxima);
  }

  function ChipEvento({ evento }: { evento: any }) {
    const props = evento.extendedProps || {};
    const hora = new Date(evento.start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return (
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); abrirEvento(props); }}
        className="flex w-full min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-neutral-700 hover:bg-neutral-100"
      >
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${corStatus(props.status)}`} />
        <span className={`truncate ${props.status === 'cancelado' ? 'line-through text-neutral-400' : ''}`}>
          <span className="text-neutral-400">{hora}</span> {nomePaciente(props) || 'Paciente'}
        </span>
      </button>
    );
  }

  const inputClass =
    'box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900';

  const diasMes = Array.from({ length: 42 }, (_, indice) => somarDias(inicioSemana(new Date(cursor.getFullYear(), cursor.getMonth(), 1)), indice));
  const diasSemana = Array.from({ length: 7 }, (_, indice) => somarDias(inicioSemana(cursor), indice));
  const visoes: { id: Visao; label: string; Icone: typeof Calendar }[] = [
    { id: 'dia', label: 'Dia', Icone: Clock },
    { id: 'semana', label: 'Semana', Icone: LayoutGrid },
    { id: 'mes', label: 'Mês', Icone: Calendar },
    { id: 'lista', label: 'Lista', Icone: List },
  ];

  function dentroDoPeriodo(data: Date) {
    if (visao === 'dia') return mesmoDia(data, cursor);
    if (visao === 'semana') {
      const inicio = inicioSemana(cursor);
      return data >= inicio && data < somarDias(inicio, 7);
    }
    return data.getMonth() === cursor.getMonth() && data.getFullYear() === cursor.getFullYear();
  }

  const eventosLista = eventosVisiveis
    .filter((evento) => dentroDoPeriodo(new Date(evento.start)))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

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
            {(filtroStatus !== 'todos' || filtroProfissional !== 'todos') && (
              <button
                type="button"
                aria-label="Limpar filtros"
                onClick={() => { setFiltroStatus('todos'); setFiltroProfissional('todos'); }}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-white text-red-500"
              >
                <X size={16} />
              </button>
            )}
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] gap-2">
              <MenuFiltro cheio rotulo="Status" valor={filtroStatus} onChange={setFiltroStatus} opcoes={STATUS_OPCOES} />
              <MenuFiltro
                cheio
                rotulo="Profissional"
                valor={filtroProfissional}
                onChange={setFiltroProfissional}
                opcoes={[{ value: 'todos', label: 'Todos' }, ...profissionais.map((profissional: any) => ({ value: String(profissional.id), label: profissional.nome }))]}
              />
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
            {(filtroStatus !== 'todos' || filtroProfissional !== 'todos') && (
              <button
                type="button"
                aria-label="Limpar filtros"
                onClick={() => { setFiltroStatus('todos'); setFiltroProfissional('todos'); }}
                className="inline-flex h-8 w-8 items-center justify-center text-red-500"
              >
                <X size={16} />
              </button>
            )}
            <MenuFiltro rotulo="Status" valor={filtroStatus} onChange={setFiltroStatus} opcoes={STATUS_OPCOES} />
            <MenuFiltro
              rotulo="Profissional"
              valor={filtroProfissional}
              onChange={setFiltroProfissional}
              opcoes={[{ value: 'todos', label: 'Todos' }, ...profissionais.map((profissional: any) => ({ value: String(profissional.id), label: profissional.nome }))]}
            />
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
                    {lista.slice(0, 2).map((evento) => <ChipEvento key={evento.id} evento={evento} />)}
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
            {(visao === 'dia' ? [inicioDoDia(cursor)] : diasSemana).map((dia) => (
              <div key={chaveLocal(dia)} className="py-2 text-center">
                <div className="text-[11px] text-neutral-400">{DIAS_CURTOS[dia.getDay()]}</div>
                <div className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-sm ${mesmoDia(dia, hoje) ? 'bg-amber-500 font-semibold text-white' : 'text-neutral-800'}`}>{dia.getDate()}</div>
              </div>
            ))}
          </div>
          <div ref={gradeHorasRef} className={`relative min-h-0 flex-1 overflow-y-auto ${visao === 'semana' ? 'max-md:min-w-[42rem]' : ''}`}>
            {horasGrade.map((hora) => {
              const dias = visao === 'dia' ? [inicioDoDia(cursor)] : diasSemana;
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
                        {lista.map((evento) => <ChipEvento key={evento.id} evento={evento} />)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {visao === 'lista' && (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-neutral-200 bg-white max-sm:min-h-[22rem]">
          {eventosLista.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-400">Nenhum agendamento neste período.</p>
          ) : eventosLista.map((evento) => {
            const props = evento.extendedProps || {};
            const data = new Date(evento.start);
            return (
              <button
                key={evento.id}
                type="button"
                onClick={() => abrirEvento(props)}
                className="flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-left last:border-b-0 hover:bg-neutral-50"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${corStatus(props.status)}`} />
                <span className="w-28 shrink-0 text-sm text-neutral-500">{data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className={`min-w-0 truncate text-sm text-neutral-900 ${props.status === 'cancelado' ? 'line-through text-neutral-400' : ''}`}>{nomePaciente(props) || 'Paciente'}</span>
                <span className="hidden min-w-0 truncate text-sm text-neutral-500 sm:block">{props.procedimento}</span>
              </button>
            );
          })}
        </div>
      )}

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        maxWidth="lg"
        hideCloseButton
        panelClassName="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white max-sm:max-h-[92dvh]"
      >
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-4 py-3 sm:px-6 sm:py-4">
                      <div>
                          <h2 className="text-lg font-semibold text-neutral-900">{formData.id ? 'Editar agendamento' : 'Novo agendamento'}</h2>
                          <p className="mt-0.5 text-xs font-medium text-neutral-400">Paciente, horário e procedimento.</p>
                      </div>
                      <button type="button" onClick={() => setOpenModal(false)} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={18}/></button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
                      <div className="grid grid-cols-2 gap-x-2 gap-y-2.5 sm:gap-x-3">
                          <label>
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Clínica</span>
                              <CustomSelect
                                  value={formData.clinica_id}
                                  onChange={v => setFormData({...formData, clinica_id: v})}
                                  disabled={clinicaFiltro !== 'todas'}
                                  options={clinicas.map((c:any) => ({ value: String(c.id), label: c.nome }))}
                                  placeholder="Selecione..."
                                  size="md"
                              />
                          </label>
                          <label>
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Profissional</span>
                              <CustomSelect value={formData.profissional_id} onChange={v => setFormData({...formData,profissional_id: v})} disabled={usuarioAtual?.nivel !== 'admin'} options={profissionaisFiltrados.map((p:any) => ({ value: String(p.id), label: p.nome }))} placeholder="Qualquer um..." size="md"/>
                          </label>
                          <label className="col-span-2">
                              <span className="mb-1.5 flex items-center justify-between text-xs font-medium text-neutral-500">
                                  Paciente
                                  <button type="button" onClick={abrirCadastroPaciente} className="inline-flex items-center gap-1 font-medium text-neutral-700 hover:text-neutral-900"><UserPlus size={12}/> Novo</button>
                              </span>
                              <CustomSelect value={formData.paciente_id} onChange={v => {
                                  const pac = pacientes.find((p: any) => String(p.id) === String(v));
                                  const plano = pac?.plano_id ? planosPreco.find((p) => p.id === pac.plano_id) ?? null : null;
                                  const tratamento = tratamentosBase.find((item: any) => item.nome === formData.title);
                                  const preco = valorNaAgenda(tratamento, plano, linhasPreco);
                                  setFormData({ ...formData, paciente_id: v, valor: preco ?? formData.valor });
                              }} options={pacientes.filter((p:any) => !formData.clinica_id || p.clinica_id == formData.clinica_id).map((p:any) => ({ value: String(p.id), label: p.nome }))} placeholder="Selecione..." searchable size="md"/>
                          </label>
                          <label>
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Data</span>
                              <CampoData value={formData.date} onChange={(v) => setFormData({ ...formData, date: v })} />
                          </label>
                          <label>
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Hora</span>
                              <CampoHora value={formData.time} onChange={(v) => setFormData({ ...formData, time: v })} passo={30} />
                          </label>
                          <label className="col-span-2">
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Procedimento</span>
                              <ProcedureCombobox
                                  clinicaId={formData.clinica_id}
                                  especialidades={especialidades}
                                  tratamentos={tratamentosAgenda}
                                  value={formData.title}
                                  onChange={(nome, t) => {
                                      const preco = valorNaAgenda(t, planoDoPaciente, linhasPreco);
                                      setFormData((p) => ({
                                          ...p,
                                          title: nome,
                                          valor: preco ?? p.valor,
                                      }));
                                  }}
                                  disabled={!formData.clinica_id}
                              />
                          </label>
                          <label>
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Valor (R$)</span>
                              <input type="number" step="1" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className={inputClass} placeholder="0,00" />
                          </label>
                          <label>
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Desconto (R$)</span>
                              <input type="number" step="1" value={formData.desconto} onChange={e => setFormData({...formData, desconto: e.target.value})} className={inputClass} placeholder="0,00" />
                          </label>
                          <label className="col-span-2">
                              <span className="mb-1.5 block text-xs font-medium text-neutral-500">Total</span>
                              <p className="flex h-10 items-center text-sm font-medium text-neutral-900">R$ {(parseFloat(formData.valor || '0') - parseFloat(formData.desconto || '0')).toFixed(2)}</p>
                          </label>
                      </div>
                      {formData.id && (
                        <div className="flex flex-wrap gap-1.5">
                          {(['agendado', 'concluido', 'cancelado'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setFormData((p) => ({ ...p, status: st }))}
                              className={`h-9 rounded-md border px-3 text-sm font-medium capitalize ${
                                formData.status === st ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      )}
                      
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-3 border-t border-black/5 px-4 py-3 sm:px-6 sm:py-4">
                      {formData.id ? (
                        <button type="button" onClick={excluirAgendamento} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-rose-600 hover:bg-rose-50" title="Excluir">
                          <Trash2 size={14} /> Excluir
                        </button>
                      ) : (
                        <span />
                      )}
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => setOpenModal(false)} className="h-10 px-3 text-sm font-medium text-neutral-500 hover:text-neutral-900">Cancelar</button>
                        <button type="button" onClick={() => saveOrUpdate()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60">
                          {loading && <Loader2 className="animate-spin" size={16} />} Salvar
                        </button>
                      </div>
                  </div>
      </Modal>
    </div>
  );
}