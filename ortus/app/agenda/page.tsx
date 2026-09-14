'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { usePatientSlideOver } from '@/components/PatientSlideOver';
import { usePatientActionModal } from '@/components/PatientActionModal';
import { getClinicLabel, useClinica } from '@/app/context/ClinicaContext';
import { fetchUserClinicas, fetchUserEquipe } from '@/lib/clinicScoped';

import { Plus, X, Loader2, UserPlus, Trash2, Clock, Bell, ChevronDown } from 'lucide-react';
import CustomSelect from '@/components/ui/CustomSelect';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { validarAgendamentoCompleto } from '@/lib/horarioProfissional';
import PatientContactButtons from '@/components/PatientContactButtons';
import Modal from '@/components/ui/Modal';
import ProcedureCombobox from '@/components/forms/ProcedureCombobox';
import {
  buscarAgendamentosLembrete24h,
  filtrarPendentesLembrete,
  ctxLembreteAgendamento,
  marcarLembreteEnviado,
  type LembreteAgendamento,
} from '@/lib/lembretesAgenda';

export default function Agenda() {
  const calendarRef = useRef(null);
  const searchParams = useSearchParams();
  const pacientePreSelecionado = searchParams?.get('paciente');
  const { openPatient } = usePatientSlideOver();
  const { openQuickCapture } = usePatientActionModal();
  const { activeClinicId, activeClinic, loading: clinicLoading } = useClinica();
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
  const [especialidades, setEspecialidades] = useState<{ id: string; nome: string }[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [lembretesAbertos, setLembretesAbertos] = useState(true);
  const [loading, setLoading] = useState(false);
  const [lembretesPendentes, setLembretesPendentes] = useState<LembreteAgendamento[]>([]);
  const [lembretesLoading, setLembretesLoading] = useState(false);

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

  useEffect(() => {
      if (!pacientePreSelecionado || pacientes.length === 0) return;
      const paciente = pacientes.find((p: any) => String(p.id) === String(pacientePreSelecionado));
      if (!paciente) return;
      const hoje = new Date().toISOString().split('T')[0];
      const preClinica = clinicaFiltro !== 'todas' ? clinicaFiltro : paciente.clinica_id || '';
      const preProfissional = (usuarioAtual?.nivel !== 'admin' && usuarioAtual?.profissional_id) ? usuarioAtual.profissional_id : '';
      setFormData({ id: null, title: '', date: hoje, time: '08:00', theme: 'blue', paciente_id: paciente.id, valor: '0', desconto: '0', observacoes: '', status: 'agendado', clinica_id: preClinica, profissional_id: preProfissional });
      setOpenModal(true);
  }, [pacientePreSelecionado, pacientes]);

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
              .select('id, nome, clinica_id, telefone')
              .in('clinica_id', idsPermitidos as any)
              .order('nome');
          if (pac) setPacientes(pac);
      } else {
          setPacientes([]);
      }
  }, []);

  async function carregarTratamentosBase(clinicaId: string) {
      const { data } = await supabase
          .from('tratamentos_base')
          .select('id, nome, valor_sugerido, especialidade_id')
          .eq('clinica_id', clinicaId)
          .eq('ativo', true)
          .order('nome');
      setTratamentosBase(data || []);
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
              .select('id, nome, clinica_id, telefone')
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

  const handleDateClick = (arg:any) => { 
      const d = arg.date; 
      const h = String(d.getHours()).padStart(2, '0'); 
      const min = String(d.getMinutes()).padStart(2, '0'); 
      const preClinica = clinicaFiltro !== 'todas' ? clinicaFiltro : ''; 
      const preProfissional = (usuarioAtual?.nivel !== 'admin' && usuarioAtual?.profissional_id) ? usuarioAtual.profissional_id : ''; 
      setFormData(prev => ({ ...prev, id: null, title: '', date: d.toISOString().split('T')[0], time: `${h}:${min}`, status: 'agendado', desconto: '0', valor: '0', clinica_id: preClinica, profissional_id: preProfissional }));
      setOpenModal(true); 
  };

  const handleEventClick = (info:any) => { 
      const r = info.event.extendedProps; 
      const localDate = new Date(r.data_hora); 
      setFormData({
          id: r.id, 
          title: r.procedimento, 
          date: localDate.toISOString().split('T')[0], 
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

  function irParaView(view: string) {
      const api = (calendarRef.current as { getApi?: () => { changeView: (v: string) => void } } | null)?.getApi?.();
      api?.changeView(view);
  }

  function abrirNovoAgendamento() {
      const hoje = new Date().toISOString().split('T')[0];
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

  const cardShell = 'rounded-[1.35rem] bg-white sm:rounded-[1.5rem]';
  const pill = (ativo: boolean) =>
      `shrink-0 rounded-full px-3 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
          ativo ? 'bg-neutral-900 text-white' : 'border border-black/10 bg-white text-neutral-600 hover:bg-neutral-50'
      }`;

  const renderEventContent = (eventInfo: any) => {
      const props = eventInfo.event.extendedProps;
      const status = props.status as string;
      const compact = eventInfo.view.type === 'listWeek' || eventInfo.view.type === 'dayGridMonth';
      const patientName = Array.isArray(props.pacientes) ? props.pacientes[0]?.nome : props.pacientes?.nome;
      const procedure = props.procedimento || eventInfo.event.title;

      const shell =
          status === 'cancelado'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : status === 'concluido'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : status === 'fiado'
                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                  : 'bg-neutral-900 text-white border-neutral-800';

      return (
        <div
          className={`flex w-full overflow-hidden border ${shell} ${
              compact ? 'items-center gap-1.5 rounded-lg px-2 py-1' : 'h-full flex-col justify-center rounded-xl px-2 py-1.5'
          }`}
        >
          {!compact && eventInfo.timeText && (
            <span className="flex items-center gap-1 text-[10px] font-medium opacity-80">
              <Clock size={10} />
              {eventInfo.timeText}
            </span>
          )}
          <span className={`truncate text-[11px] font-semibold sm:text-xs ${status === 'cancelado' ? 'line-through opacity-80' : ''}`}>
            {compact && eventInfo.timeText && <span className="mr-1 opacity-70">{eventInfo.timeText}</span>}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openPatient(props.paciente_id);
              }}
              className="font-semibold hover:underline underline-offset-2"
              title="Abrir paciente"
            >
              {patientName || 'Paciente'}
            </button>
            <span className="opacity-80"> · {procedure}</span>
          </span>
        </div>
      );
  };

  const subtituloUnidade =
    clinicaFiltro === 'todas'
      ? 'Todas as clínicas'
      : activeClinic
        ? getClinicLabel(activeClinic)
        : clinicas.find((c: any) => String(c.id) === clinicaFiltro)?.nome || 'Unidade';

  const fcProps = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin],
    locale: ptBrLocale,
    slotMinTime: '07:00:00',
    slotMaxTime: '20:00:00',
    allDaySlot: false as const,
    events,
    eventContent: renderEventContent,
    dateClick: handleDateClick,
    eventClick: handleEventClick,
    height: '100%' as const,
    slotDuration: '00:30:00',
    dayHeaderFormat: { weekday: 'short' as const, day: 'numeric' as const },
    nowIndicator: true,
    navLinks: true,
    buttonText: { today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', list: 'Lista' },
  };

  const inputClass =
    'w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm font-medium text-neutral-800 outline-none focus:border-neutral-400';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden px-2.5 py-2.5 font-poppins sm:px-3 sm:py-3 md:px-4 md:py-3.5">
      <header className="mb-3 shrink-0 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 md:text-[2rem]">Agenda</h1>
            <p className="mt-1 truncate text-sm text-neutral-500 sm:text-base">{subtituloUnidade} · arraste ou clique no horário</p>
          </div>
          <button
            type="button"
            onClick={abrirNovoAgendamento}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 sm:w-auto"
          >
            <Plus size={18} />
            Novo agendamento
          </button>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button type="button" className={pill(false)} onClick={() => irParaView('timeGridWeek')}>
              Semana
            </button>
            <button type="button" className={pill(false)} onClick={() => irParaView('timeGridDay')}>
              Dia
            </button>
            <button type="button" className={pill(false)} onClick={() => irParaView('dayGridMonth')}>
              Mês
            </button>
            <button type="button" className={pill(false)} onClick={() => irParaView('listWeek')}>
              Lista
            </button>
          </div>
          <div className="hidden flex-wrap items-center gap-3 text-[11px] font-medium text-neutral-500 lg:flex">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-neutral-900" /> Agendado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Concluído
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Fiado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose-500" /> Cancelado
            </span>
          </div>
        </div>

        {(lembretesLoading || lembretesPendentes.length > 0) && (
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
                    {lembretesLoading ? 'Carregando…' : `${lembretesPendentes.length} consulta(s) amanhã`}
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

      <div className={`${cardShell} bento-calendar min-h-0 flex-1 overflow-hidden p-2 sm:p-4`}>
        <div className="hidden h-full min-h-[320px] sm:block">
          <FullCalendar
            ref={calendarRef}
            {...fcProps}
            initialView="timeGridWeek"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' }}
          />
        </div>
        <div className="h-full min-h-[360px] sm:hidden">
          <FullCalendar
            ref={calendarRef}
            {...fcProps}
            initialView="listWeek"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridDay,listWeek' }}
            titleFormat={{ year: 'numeric', month: 'long' }}
          />
        </div>
      </div>

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        maxWidth="lg"
        hideCloseButton
        panelClassName="flex max-h-[95vh] flex-col overflow-hidden rounded-[1.35rem] border border-black/8 bg-white shadow-xl sm:rounded-[1.5rem]"
      >
                  <div className="flex shrink-0 items-center justify-between border-b border-black/6 px-5 py-4">
                      <h3 className="text-lg font-semibold text-neutral-900">{formData.id ? 'Editar agendamento' : 'Novo agendamento'}</h3>
                      <button type="button" onClick={() => setOpenModal(false)} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"><X size={20}/></button>
                  </div>
                  <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                  Clínica
                                  {clinicaFiltro !== 'todas' && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded normal-case">Travada no filtro</span>}
                              </label>
                              <CustomSelect
                                  value={formData.clinica_id}
                                  onChange={v => setFormData({...formData, clinica_id: v})}
                                  disabled={clinicaFiltro !== 'todas'}
                                  options={clinicas.map((c:any) => ({ value: String(c.id), label: c.nome }))}
                                  placeholder="Selecione..."
                              />
                              {clinicaFiltro !== 'todas' && <p className="mt-1 text-[11px] text-neutral-400">Unidade definida no menu lateral. Selecione &quot;Todas&quot; lá para agendar em outra clínica.</p>}
                          </div>
                          <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Profissional</label><CustomSelect value={formData.profissional_id} onChange={v => setFormData({...formData,profissional_id: v})} disabled={usuarioAtual?.nivel !== 'admin'} options={profissionaisFiltrados.map((p:any) => ({ value: String(p.id), label: p.nome }))} placeholder="Qualquer um..."/></div>
                      </div>
                      <div>
                          <div className="mb-1 flex items-center justify-between">
                              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Paciente</label>
                              <button type="button" onClick={abrirCadastroPaciente} className="flex items-center gap-1 text-[11px] font-semibold text-neutral-700 hover:underline"><UserPlus size={12}/> Novo paciente</button>
                          </div>
                          <CustomSelect value={formData.paciente_id} onChange={v => setFormData({...formData, paciente_id: v})} options={pacientes.filter((p:any) => !formData.clinica_id || p.clinica_id == formData.clinica_id).map((p:any) => ({ value: String(p.id), label: p.nome }))} placeholder="Selecione..." searchable/>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Data</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className={inputClass} /></div>
                          <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Hora</label><input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className={inputClass} /></div>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Procedimento</label>
                          <ProcedureCombobox
                              clinicaId={formData.clinica_id}
                              especialidades={especialidades}
                              tratamentos={tratamentosBase}
                              value={formData.title}
                              onChange={(nome, t) => {
                                  setFormData((p) => ({
                                      ...p,
                                      title: nome,
                                      valor: t ? String(t.valor_sugerido ?? p.valor) : p.valor,
                                  }));
                              }}
                              disabled={!formData.clinica_id}
                          />
                      </div>
                      <div className="grid grid-cols-1 gap-4 rounded-xl border border-black/6 bg-[#f3f4f1] p-4 sm:grid-cols-3">
                          <div>
                              <label className="mb-1 block text-[10px] font-semibold uppercase text-neutral-500">Valor (R$)</label>
                              <input type="number" step="0.01" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className={inputClass} placeholder="0,00" />
                          </div>
                          <div>
                              <label className="mb-1 block text-[10px] font-semibold uppercase text-neutral-500">Desconto (R$)</label>
                              <input type="number" step="0.01" value={formData.desconto} onChange={e => setFormData({...formData, desconto: e.target.value})} className={inputClass} placeholder="0,00" />
                          </div>
                          <div className="flex flex-col justify-center sm:text-right">
                              <label className="mb-1 block text-[10px] font-semibold uppercase text-neutral-500">Total</label>
                              <span className="text-xl font-semibold text-neutral-900">R$ {(parseFloat(formData.valor || '0') - parseFloat(formData.desconto || '0')).toFixed(2)}</span>
                          </div>
                      </div>
                      {formData.id && (
                        <div className="flex flex-wrap gap-2">
                          {(['agendado', 'concluido', 'cancelado'] as const).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setFormData((p) => ({ ...p, status: st }))}
                              className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
                                formData.status === st ? 'bg-neutral-900 text-white' : 'border border-black/10 bg-white text-neutral-600'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {(() => {
                          const pac = pacientes.find((p: any) => p.id == formData.paciente_id);
                          if (!pac || !formData.date || !formData.time || !formData.clinica_id) return null;
                          const clinica = clinicas.find((c: any) => String(c.id) === String(formData.clinica_id));
                          const dataFmt = new Date(formData.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                          return (
                              <div className="space-y-2 pt-1">
                                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Confirmar consulta</p>
                                  <PatientContactButtons
                                      variant="row"
                                      telefone={pac.telefone}
                                      email={pac.email}
                                      clinicaId={formData.clinica_id}
                                      evento="confirmacao"
                                      contexto={{
                                          paciente_nome: (pac.nome || '').split(' ')[0],
                                          data_consulta: dataFmt,
                                          hora_consulta: formData.time,
                                          clinica_nome: clinica?.nome,
                                          clinica_telefone: clinica?.telefone,
                                      }}
                                      className="w-full"
                                  />
                              </div>
                          );
                      })()}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-black/6 px-5 py-4">
                      {formData.id ? (
                        <button type="button" onClick={excluirAgendamento} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50" title="Excluir">
                          <Trash2 size={18} /> Excluir
                        </button>
                      ) : (
                        <span />
                      )}
                      <div className="flex flex-wrap gap-2 sm:ml-auto">
                        <button type="button" onClick={() => setOpenModal(false)} className="rounded-full px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100">Cancelar</button>
                        <button type="button" onClick={() => saveOrUpdate()} disabled={loading} className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60">
                          {loading && <Loader2 className="animate-spin" size={16} />} Salvar
                        </button>
                      </div>
                  </div>
      </Modal>
    </div>
  );
}