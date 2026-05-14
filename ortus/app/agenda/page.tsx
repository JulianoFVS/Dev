'use client';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { usePatientSlideOver } from '@/components/PatientSlideOver';

import { 
  Plus, X, Loader2, CheckCircle, MapPin, User, Building2, 
  Calendar as CalIcon, ChevronLeft, ChevronRight, 
  UserPlus, FilePlus, DollarSign, Phone, Mail, FileText, Calendar, Trash2,
  Clock, Ban
} from 'lucide-react';

// Paleta de cores por tema (gradiente + acento + texto)
const TEMA_CORES: Record<string, { grad: string; accent: string; text: string; soft: string; ring: string; label: string }> = {
  blue:   { grad: 'from-blue-500 to-blue-600',     accent: 'bg-blue-700',     text: 'text-white', soft: 'bg-blue-50 text-blue-700 border-blue-200',       ring: 'ring-blue-400',   label: 'Azul' },
  green:  { grad: 'from-emerald-500 to-emerald-600', accent: 'bg-emerald-700', text: 'text-white', soft: 'bg-emerald-50 text-emerald-700 border-emerald-200', ring: 'ring-emerald-400', label: 'Verde' },
  red:    { grad: 'from-rose-500 to-rose-600',     accent: 'bg-rose-700',     text: 'text-white', soft: 'bg-rose-50 text-rose-700 border-rose-200',       ring: 'ring-rose-400',   label: 'Vermelho' },
  yellow: { grad: 'from-amber-400 to-amber-500',   accent: 'bg-amber-600',    text: 'text-amber-950', soft: 'bg-amber-50 text-amber-700 border-amber-200', ring: 'ring-amber-400',  label: 'Amarelo' },
  purple: { grad: 'from-violet-500 to-violet-600', accent: 'bg-violet-700',   text: 'text-white', soft: 'bg-violet-50 text-violet-700 border-violet-200', ring: 'ring-violet-400', label: 'Roxo' },
  slate:  { grad: 'from-slate-500 to-slate-600',   accent: 'bg-slate-700',    text: 'text-white', soft: 'bg-slate-50 text-slate-700 border-slate-200',     ring: 'ring-slate-400',  label: 'Cinza' },
};

export default function Agenda() {
  const calendarRef = useRef(null);
  const searchParams = useSearchParams();
  const pacientePreSelecionado = searchParams?.get('paciente');
  const { openPatient } = usePatientSlideOver();
  const [events, setEvents] = useState<any[]>([]);
  const [usuarioAtual, setUsuarioAtual] = useState<any>(null);
  
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  const [profissionaisFiltrados, setProfissionaisFiltrados] = useState<any[]>([]);
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [servicos, setServicos] = useState<any[]>([]);
  
  const [clinicaFiltro, setClinicaFiltro] = useState('todas');
  const [clinicaGlobal, setClinicaGlobal] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const [modalNovoPaciente, setModalNovoPaciente] = useState(false);
  const [modalNovoServico, setModalNovoServico] = useState(false);

  const [formData, setFormData] = useState({ 
      id: null, title: '', date: '', time: '08:00', theme: 'blue', 
      paciente_id: '', valor: '0', desconto: '0', observacoes: '', 
      status: 'agendado', clinica_id: '', profissional_id: '' 
  });

  const [formPaciente, setFormPaciente] = useState({ nome: '', cpf: '', telefone: '', email: '', data_nascimento: '', endereco: '' });
  const [formServico, setFormServico] = useState({ nome: '', valor: '0' });

  useEffect(() => { 
      // Sincroniza
      const globalCid = localStorage.getItem('ortus_clinica_id');
      if (globalCid) {
          setClinicaFiltro(globalCid);
          setClinicaGlobal(globalCid);
      }
      inicializar(); 
  }, []);

  useEffect(() => { if(usuarioAtual) carregarEventos(); }, [clinicaFiltro, usuarioAtual]);

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
      } else { 
          const filtrados = profissionais.filter((p:any) => p.profissionais_clinicas?.some((vinculo:any) => vinculo.clinica_id == formData.clinica_id)); 
          setProfissionaisFiltrados(filtrados); 
      } 
  }, [formData.clinica_id, profissionais]);

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
      const { data: cl } = await supabase.from('clinicas').select('*'); if (cl) setClinicas(cl); 
      const { data: pr } = await supabase.from('profissionais').select('*, profissionais_clinicas(clinica_id)'); if (pr) setProfissionais(pr); 
      const { data: pac } = await supabase.from('pacientes').select('id, nome, clinica_id').order('nome'); if (pac) setPacientes(pac); 
      const { data: serv } = await supabase.from('servicos').select('*').order('nome'); if (serv) setServicos(serv); 
  }

  async function carregarEventos() { 
      if (!usuarioAtual) return; 
      let query = supabase.from('agendamentos').select('*, pacientes(nome), clinicas(nome, cor_tema)'); 
      if (clinicaFiltro !== 'todas') query = query.eq('clinica_id', clinicaFiltro); 
      if (usuarioAtual.nivel !== 'admin' && usuarioAtual.profissional_id) query = query.eq('profissional_id', usuarioAtual.profissional_id); 
      
      const { data: ag } = await query; 
      if (ag) { 
          const fmt = ag.map((e:any) => ({ 
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
      if (!formData.title || !formData.paciente_id || !formData.clinica_id) return alert('Preencha campos obrigatórios.'); 
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
      setLoading(false); 
  }

  async function excluirAgendamento() {
      if(!formData.id) return;
      if(!confirm('Tem certeza que deseja excluir este agendamento?')) return;
      await supabase.from('agendamentos').delete().eq('id', formData.id);
      setOpenModal(false);
      carregarEventos();
  }

  async function salvarNovoPaciente(e: any) {
      e.preventDefault();
      if (!formPaciente.nome) return alert('Nome é obrigatório');
      
      const payload = { 
          ...formPaciente, 
          data_nascimento: formPaciente.data_nascimento || null, 
          clinica_id: formData.clinica_id || null 
      };

      const { data, error } = await supabase.from('pacientes').insert([payload]).select().single();
      
      if (error) alert('Erro: ' + error.message);
      else {
          setPacientes([...pacientes, data]);
          setFormData({ ...formData, paciente_id: data.id });
          setModalNovoPaciente(false);
          setFormPaciente({ nome: '', cpf: '', telefone: '', email: '', data_nascimento: '', endereco: '' });
      }
  }

  async function salvarNovoServico(e: any) {
      e.preventDefault();
      if (!formServico.nome) return alert('Nome é obrigatório');
      
      const { data, error } = await supabase.from('servicos').insert([{ nome: formServico.nome, valor: parseFloat(formServico.valor) }]).select().single();
      
      if (error) alert('Erro: ' + error.message);
      else {
          setServicos([...servicos, data]);
          setFormData({ ...formData, title: data.nome, valor: data.valor });
          setModalNovoServico(false);
          setFormServico({ nome: '', valor: '0' });
      }
  }

  const renderEventContent = (eventInfo:any) => {
      const props = eventInfo.event.extendedProps;
      const status = props.status;
      const viewType = eventInfo.view.type;
      const tema = TEMA_CORES[props.cor] || TEMA_CORES.blue;
      const isList = viewType === 'listWeek';
      const isMonth = viewType === 'dayGridMonth';
      const patientName = Array.isArray(props.pacientes) ? props.pacientes[0]?.nome : props.pacientes?.nome;
      const procedure = props.procedimento || eventInfo.event.title;
      const PatientTrigger = ({ className }: { className?: string }) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openPatient(props.paciente_id);
          }}
          className={`font-extrabold hover:underline hover:decoration-2 underline-offset-2 ${className || ''}`}
          title="Abrir visão 360º do paciente"
        >
          {patientName || 'Paciente'}
        </button>
      );

      // Mês e Lista: pílula compacta colorida
      if (isList || isMonth) {
        if (status === 'cancelado') {
          return (
            <div className="flex items-center gap-1.5 overflow-hidden w-full px-1.5 py-0.5 rounded-md bg-rose-50 border border-rose-200">
              <Ban size={10} className="text-rose-500 shrink-0"/>
              <span className="text-[11px] font-semibold truncate line-through text-rose-500">
                {eventInfo.timeText && <span className="mr-1 opacity-70">{eventInfo.timeText}</span>}<PatientTrigger /> <span className="opacity-80">- {procedure}</span>
              </span>
            </div>
          );
        }
        if (status === 'concluido') {
          return (
            <div className="flex items-center gap-1.5 overflow-hidden w-full px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200">
              <CheckCircle size={10} className="text-emerald-600 shrink-0"/>
              <span className="text-[11px] font-semibold truncate text-emerald-700">
                {eventInfo.timeText && <span className="mr-1 opacity-70">{eventInfo.timeText}</span>}<PatientTrigger /> <span className="opacity-80">- {procedure}</span>
              </span>
            </div>
          );
        }
        return (
          <div className={`flex items-center gap-1.5 overflow-hidden w-full px-1.5 py-0.5 rounded-md border ${tema.soft}`}>
            <div className={`w-2 h-2 rounded-full bg-gradient-to-br ${tema.grad} shrink-0 shadow-sm`}></div>
            <span className="text-[11px] font-semibold truncate">
              {eventInfo.timeText && <span className="mr-1 opacity-70">{eventInfo.timeText}</span>}<PatientTrigger /> <span className="opacity-80">- {procedure}</span>
            </span>
          </div>
        );
      }

      // Visões timeGrid (Dia/Semana)
      if (status === 'fiado') {
        return (
          <div className="w-full h-full p-1.5 rounded-md bg-amber-50 border-l-[4px] border-amber-500 text-amber-800 flex flex-col justify-center overflow-hidden">
            <div className="flex items-center gap-1">
              <DollarSign size={10} className="shrink-0"/>
              <span className="text-[9px] uppercase font-extrabold tracking-wide">Fiado</span>
            </div>
            <span className="font-bold text-[11px] truncate"><PatientTrigger /> <span className="opacity-80">- {procedure}</span></span>
          </div>
        );
      }
      if (status === 'cancelado') {
        return (
          <div className="w-full h-full p-1.5 rounded-md bg-rose-50 border-l-[4px] border-rose-500 text-rose-700 flex flex-col justify-center relative overflow-hidden">
            <div className="flex items-center gap-1">
              <Ban size={10} className="shrink-0"/>
              <span className="text-[9px] uppercase font-extrabold tracking-wide">Cancelado</span>
            </div>
            <span className="font-bold text-[11px] line-through truncate opacity-80"><PatientTrigger /> <span>- {procedure}</span></span>
          </div>
        );
      }
      if (status === 'concluido') {
        return (
          <div className="w-full h-full p-1.5 rounded-md bg-emerald-50 border-l-[4px] border-emerald-500 text-emerald-800 flex flex-col justify-center overflow-hidden">
            <div className="flex items-center gap-1">
              <CheckCircle size={10} className="shrink-0"/>
              <span className="text-[9px] uppercase font-extrabold tracking-wide">Concluído</span>
            </div>
            <span className="font-bold text-[11px] truncate"><PatientTrigger /> <span className="opacity-80">- {procedure}</span></span>
          </div>
        );
      }
      return (
        <div className={`w-full h-full px-2 py-1 rounded-md shadow-sm bg-gradient-to-br ${tema.grad} ${tema.text} border-l-[4px] ${tema.accent.replace('bg-', 'border-')} overflow-hidden hover:shadow-md hover:brightness-110 transition-all`}>
          <div className="flex items-center gap-1 text-[10px] font-bold opacity-95">
            <Clock size={9} className="shrink-0"/>
            <span>{eventInfo.timeText}</span>
          </div>
          <div className="text-[12px] font-extrabold truncate leading-tight drop-shadow-sm"><PatientTrigger /> <span className="opacity-90">- {procedure}</span></div>
        </div>
      );
  };

  return (
    <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-2rem)] flex flex-col space-y-4">
      <style jsx global>{`
        .fc { font-family: inherit; }
        .fc-header-toolbar { margin-bottom: 1.25rem !important; }
        .fc-toolbar-title { font-size: 1.25rem !important; font-weight: 800 !important; color: #1e293b; text-transform: capitalize; }
        .fc-button { background-color: white !important; color: #475569 !important; border: 1px solid #e2e8f0 !important; font-weight: 600 !important; font-size: 0.875rem !important; padding: 0.5rem 1rem !important; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); text-transform: capitalize; transition: all 0.2s; }
        .fc-button:hover { background-color: #eff6ff !important; color: #1d4ed8 !important; border-color: #bfdbfe !important; }
        .fc-button-active { background: linear-gradient(135deg, #3b82f6, #2563eb) !important; color: white !important; border-color: #2563eb !important; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.35) !important; }
        .fc-today-button { background: linear-gradient(135deg, #f0fdf4, #dcfce7) !important; color: #15803d !important; border-color: #bbf7d0 !important; }
        .fc-today-button:hover:not(:disabled) { background: linear-gradient(135deg, #dcfce7, #bbf7d0) !important; }
        .fc-button-primary:focus { box-shadow: 0 0 0 3px rgba(59,130,246,0.35) !important; }

        .fc-theme-standard td, .fc-theme-standard th { border-color: #e2e8f0; }
        .fc-scrollgrid { border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }

        /* Cabeçalho dos dias com gradiente sutil */
        .fc-col-header-cell { background: linear-gradient(180deg, #f8fafc, #f1f5f9); padding: 10px 0; }
        .fc-col-header-cell-cushion { color: #475569; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; }
        .fc-col-header-cell.fc-day-today { background: linear-gradient(180deg, #dbeafe, #bfdbfe) !important; }
        .fc-col-header-cell.fc-day-today .fc-col-header-cell-cushion { color: #1d4ed8; }
        .fc-col-header-cell.fc-day-sat .fc-col-header-cell-cushion,
        .fc-col-header-cell.fc-day-sun .fc-col-header-cell-cushion { color: #9333ea; }

        /* Coluna do dia atual destacada */
        .fc-day-today { background-color: #eff6ff !important; }
        .fc-timegrid-col.fc-day-today { background: linear-gradient(180deg, rgba(59,130,246,0.06), rgba(59,130,246,0.02)) !important; }
        .fc-daygrid-day.fc-day-today .fc-daygrid-day-number { background: #2563eb; color: white; border-radius: 9999px; padding: 2px 8px; font-weight: 800; }

        /* Fim de semana com tom suave */
        .fc-day-sat, .fc-day-sun { background-color: #faf5ff20; }
        .fc-timegrid-col.fc-day-sat, .fc-timegrid-col.fc-day-sun { background-color: rgba(168,85,247,0.04); }

        /* Slots de tempo */
        .fc-timegrid-slot-label { color: #64748b; font-size: 11px; font-weight: 600; }
        .fc-timegrid-slot { height: 2.4em; }
        .fc-timegrid-slot-minor { border-top-style: dotted !important; }

        /* Indicador "agora" mais visível */
        .fc-timegrid-now-indicator-line { border-color: #ef4444 !important; border-width: 2px !important; box-shadow: 0 0 8px rgba(239,68,68,0.4); }
        .fc-timegrid-now-indicator-arrow { border-color: #ef4444 !important; border-width: 6px !important; }

        /* Eventos - usamos custom render */
        .fc-event { border: none; background: transparent; box-shadow: none; cursor: pointer; }
        .fc-event:hover { z-index: 5; }
        .fc-daygrid-event { white-space: normal !important; align-items: center; padding: 1px 0; }
        .fc-timegrid-event { box-shadow: 0 2px 4px rgba(15,23,42,0.08) !important; border-radius: 6px; }
        .fc-timegrid-event .fc-event-main { padding: 0; }

        /* Lista */
        .fc-list { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        .fc-list-day-cushion { background: linear-gradient(90deg, #eff6ff, #f8fafc) !important; color: #1e40af !important; font-weight: 800 !important; }
        .fc-list-event:hover td { background-color: #eff6ff !important; cursor: pointer; }
        .fc-list-event-time { color: #2563eb !important; font-weight: 700 !important; }

        /* Números do mês */
        .fc-daygrid-day-number { color: #475569; font-weight: 700; padding: 6px 8px !important; }
        .fc-day-other .fc-daygrid-day-number { color: #cbd5e1; }
      `}</style>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2.5 rounded-xl text-white shadow-md shrink-0"><CalIcon size={22}/></div>
                <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-black text-slate-800 leading-tight">Agenda</h1>
                    {(() => {
                        const isTodas = clinicaFiltro === 'todas';
                        const cAtual = clinicas.find((c:any) => String(c.id) === String(clinicaFiltro));
                        const cGlobal = clinicas.find((c:any) => String(c.id) === String(clinicaGlobal));
                        const divergente = !isTodas && clinicaGlobal && String(clinicaFiltro) !== String(clinicaGlobal);
                        const wrap = divergente
                            ? 'bg-rose-50 border-rose-300 text-rose-700 ring-2 ring-rose-200 animate-pulse'
                            : isTodas
                                ? 'bg-amber-50 border-amber-300 text-amber-800'
                                : 'bg-blue-50 border-blue-200 text-blue-700';
                        return (
                            <div className={`mt-1 inline-flex items-center gap-2 pl-2.5 pr-1 py-1 rounded-lg border text-xs font-bold ${wrap}`}>
                                <Building2 size={12}/>
                                <span className="hidden sm:inline">Filtro:</span>
                                <select value={clinicaFiltro} onChange={e => setClinicaFiltro(e.target.value)} className="bg-transparent outline-none font-black cursor-pointer pr-2">
                                    <option value="todas">🌐 Todas as Clínicas</option>
                                    {clinicas.map((c:any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                </select>
                                {divergente && <span className="text-[10px] font-black uppercase bg-rose-600 text-white px-1.5 py-0.5 rounded">≠ {cGlobal?.nome || 'global'}</span>}
                                {isTodas && <span className="text-[10px] font-black uppercase bg-amber-600 text-white px-1.5 py-0.5 rounded">visão geral</span>}
                            </div>
                        );
                    })()}
                </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
                <div className="hidden lg:flex items-center gap-3 text-[11px] font-bold uppercase tracking-wide pr-3 border-r border-slate-200">
                    <span className="flex items-center gap-1.5 text-slate-600"><span className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm"></span> Agendado</span>
                    <span className="flex items-center gap-1.5 text-emerald-700"><CheckCircle size={12}/> Concluído</span>
                    <span className="flex items-center gap-1.5 text-amber-700"><DollarSign size={12}/> Fiado</span>
                    <span className="flex items-center gap-1.5 text-rose-600"><Ban size={12}/> Cancelado</span>
                </div>
                <button onClick={() => { setOpenModal(true); setFormData(prev => ({...prev, id: null, clinica_id: clinicaFiltro !== 'todas' ? clinicaFiltro : ''})); }} className="bg-gradient-to-br from-blue-600 to-blue-700 text-white px-5 py-2.5 rounded-lg font-bold hover:from-blue-700 hover:to-blue-800 flex items-center gap-2 text-sm shadow-md hover:shadow-lg transition-all"><Plus size={18}/> Novo Agendamento</button>
            </div>
        </div>

        {/* Aviso de divergência */}
        {clinicaFiltro !== 'todas' && clinicaGlobal && String(clinicaFiltro) !== String(clinicaGlobal) && (() => {
            const cAtual = clinicas.find((c:any) => String(c.id) === String(clinicaFiltro));
            const cGlobal = clinicas.find((c:any) => String(c.id) === String(clinicaGlobal));
            return (
                <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-3 flex items-center gap-3 shadow-sm">
                    <div className="w-9 h-9 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0 animate-pulse"><Ban size={16}/></div>
                    <div className="flex-1 text-sm">
                        <div className="font-black text-rose-800">Atenção! Você está visualizando outra clínica.</div>
                        <div className="text-rose-600 text-xs">Clínica atual selecionada: <strong>{cGlobal?.nome}</strong>. Visualizando: <strong>{cAtual?.nome}</strong>.</div>
                    </div>
                    <button onClick={() => setClinicaFiltro(clinicaGlobal!)} className="px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 shrink-0">Voltar para minha clínica</button>
                </div>
            );
        })()}
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-4 overflow-hidden"><FullCalendar ref={calendarRef} plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]} initialView="timeGridWeek" headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' }} buttonText={{ today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', list: 'Lista' }} locale={ptBrLocale} slotMinTime="07:00:00" slotMaxTime="20:00:00" allDaySlot={false} events={events} eventContent={renderEventContent} dateClick={handleDateClick} eventClick={handleEventClick} height="100%" slotDuration="00:30:00" dayHeaderFormat={{ weekday: 'short', day: 'numeric' }} nowIndicator={true} navLinks={true} /></div>
      
      {/* MODAL PRINCIPAL OMITIDO PARA BREVIDADE (Mantido Igual) */}
      {openModal && ( 
          <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh] animate-zoom-in border border-slate-100">
                  <div className="p-5 border-b bg-slate-50 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">{formData.id ? 'Editar Agendamento' : 'Novo Agendamento'}</h3>
                      <button onClick={() => setOpenModal(false)} className="text-slate-400 hover:text-red-500 p-1"><X size={20}/></button>
                  </div>
                  <div className="p-6 space-y-5 overflow-y-auto">
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                  Clínica
                                  {clinicaFiltro !== 'todas' && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded normal-case">🔒 Travada no filtro</span>}
                              </label>
                              <select
                                  value={formData.clinica_id}
                                  onChange={e => setFormData({...formData, clinica_id: e.target.value})}
                                  disabled={clinicaFiltro !== 'todas'}
                                  className={`w-full p-2.5 border rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none ${clinicaFiltro !== 'todas' ? 'bg-slate-100 border-slate-200 text-slate-600 cursor-not-allowed' : 'bg-white border-slate-200'}`}
                              >
                                  <option value="">Selecione...</option>
                                  {clinicas.map((c:any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                              </select>
                              {clinicaFiltro !== 'todas' && <p className="text-[10px] text-slate-400 mt-1">Para escolher outra clínica, troque o filtro para "Todas as Clínicas".</p>}
                          </div>
                          <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Profissional</label><select value={formData.profissional_id} onChange={e => setFormData({...formData,profissional_id: e.target.value})} className={`w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none ${usuarioAtual?.nivel !== 'admin' ? 'opacity-60' : ''}`} disabled={usuarioAtual?.nivel !== 'admin'}><option value="">Qualquer um...</option>{profissionaisFiltrados.map((p:any) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
                      </div>
                      <div>
                          <div className="flex justify-between items-center mb-1">
                              <label className="text-xs font-bold text-slate-500 uppercase">Paciente</label>
                              <button type="button" onClick={() => setModalNovoPaciente(true)} className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1 uppercase"><UserPlus size={12}/> Cadastrar Novo</button>
                          </div>
                          <select value={formData.paciente_id} onChange={e => setFormData({...formData, paciente_id: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"><option value="">Selecione...</option>{pacientes.filter((p:any) => !formData.clinica_id || p.clinica_id == formData.clinica_id).map((p:any) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Data</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                          <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Hora</label><input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                      </div>
                      <div>
                          <div className="flex justify-between items-center mb-1">
                              <label className="text-xs font-bold text-slate-500 uppercase">Procedimento</label>
                              <button type="button" onClick={() => setModalNovoServico(true)} className="text-[10px] font-bold text-purple-600 hover:underline flex items-center gap-1 uppercase"><FilePlus size={12}/> Novo Serviço</button>
                          </div>
                          <select onChange={(e) => { const s = servicos.find((x:any) => x.id == e.target.value); if(s) setFormData(p => ({...p, title: s.nome, valor: s.valor, theme: s.cor || 'blue'})) }} className="w-full p-2.5 mb-2 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"><option value="">✨ Selecionar Catálogo...</option>{servicos.map((s:any) => <option key={s.id} value={s.id}>{s.nome} - R$ {s.valor}</option>)}</select>
                      </div>
                      <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                          <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Valor (R$)</label>
                              <input type="number" step="0.01" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-300" placeholder="0.00" />
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Desconto (R$)</label>
                              <input type="number" step="0.01" value={formData.desconto} onChange={e => setFormData({...formData, desconto: e.target.value})} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-red-500 outline-none focus:ring-2 focus:ring-red-200 placeholder-red-200" placeholder="0.00" />
                          </div>
                          <div className="text-right flex flex-col justify-center">
                              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Total Final</label>
                              <span className="text-xl font-black text-slate-900">R$ {(parseFloat(formData.valor || '0') - parseFloat(formData.desconto || '0')).toFixed(2)}</span>
                          </div>
                      </div>
                      
                      <div className="flex gap-3 pt-2">
                          {formData.id && <button onClick={excluirAgendamento} className="p-3 text-red-400 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={20}/></button>}
                          <button onClick={() => saveOrUpdate('concluido')} className="flex-1 bg-green-50 text-green-700 py-2.5 rounded-lg font-bold text-xs uppercase hover:bg-green-100 border border-green-200">Concluir</button>
                          <button onClick={() => saveOrUpdate('fiado')} className="flex-1 bg-amber-50 text-amber-700 py-2.5 rounded-lg font-bold text-xs uppercase hover:bg-amber-100 border border-amber-200" title="Concluir mas marcar como devendo">Fiado</button>
                          <button onClick={() => saveOrUpdate('cancelado')} className="flex-1 bg-red-50 text-red-600 py-2.5 rounded-lg font-bold text-xs uppercase hover:bg-red-100 border border-red-200">Cancelar</button>
                      </div>
                  </div>
                  <div className="p-5 border-t bg-slate-50 flex justify-end gap-3">
                      <button onClick={() => setOpenModal(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg text-sm transition-colors">Fechar</button>
                      <button onClick={() => saveOrUpdate()} disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm">{loading && <Loader2 className="animate-spin" size={16}/>} Salvar</button>
                  </div>
              </div>
          </div> 
      )}
      {/* MODAIS SECUNDÁRIOS OMITIDOS (Mantidos iguais) */}
      {modalNovoPaciente && (
          <div className="fixed inset-0 z-[60] bg-slate-900/30 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-xl rounded-2xl shadow-xl p-6 animate-in zoom-in-95 overflow-y-auto max-h-[90vh]">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-slate-800"><UserPlus size={20} className="text-green-600"/> Cadastrar Paciente</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase">Nome Completo</label><div className="relative"><User className="absolute left-3 top-2.5 text-slate-300" size={16}/><input autoFocus className="w-full pl-9 p-2 border rounded-lg" value={formPaciente.nome} onChange={e => setFormPaciente({...formPaciente, nome: e.target.value})} /></div></div>
                      <div><label className="text-xs font-bold text-slate-400 uppercase">Telefone</label><div className="relative"><Phone className="absolute left-3 top-2.5 text-slate-300" size={16}/><input className="w-full pl-9 p-2 border rounded-lg" value={formPaciente.telefone} onChange={e => setFormPaciente({...formPaciente, telefone: e.target.value})} /></div></div>
                      <div><label className="text-xs font-bold text-slate-400 uppercase">Email</label><div className="relative"><Mail className="absolute left-3 top-2.5 text-slate-300" size={16}/><input className="w-full pl-9 p-2 border rounded-lg" value={formPaciente.email} onChange={e => setFormPaciente({...formPaciente, email: e.target.value})} /></div></div>
                      <div><label className="text-xs font-bold text-slate-400 uppercase">CPF</label><div className="relative"><FileText className="absolute left-3 top-2.5 text-slate-300" size={16}/><input className="w-full pl-9 p-2 border rounded-lg" value={formPaciente.cpf} onChange={e => setFormPaciente({...formPaciente, cpf: e.target.value})} /></div></div>
                      <div><label className="text-xs font-bold text-slate-400 uppercase">Nascimento</label><div className="relative"><Calendar className="absolute left-3 top-2.5 text-slate-300" size={16}/><input type="date" className="w-full pl-9 p-2 border rounded-lg" value={formPaciente.data_nascimento} onChange={e => setFormPaciente({...formPaciente, data_nascimento: e.target.value})} /></div></div>
                      <div className="md:col-span-2"><label className="text-xs font-bold text-slate-400 uppercase">Endereço</label><div className="relative"><MapPin className="absolute left-3 top-2.5 text-slate-300" size={16}/><input className="w-full pl-9 p-2 border rounded-lg" value={formPaciente.endereco} onChange={e => setFormPaciente({...formPaciente, endereco: e.target.value})} /></div></div>
                  </div>
                  <div className="flex gap-2 justify-end">
                      <button onClick={() => setModalNovoPaciente(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg">Cancelar</button>
                      <button onClick={salvarNovoPaciente} className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700">Salvar</button>
                  </div>
              </div>
          </div>
      )}

      {modalNovoServico && (
          <div className="fixed inset-0 z-[60] bg-slate-900/30 flex items-center justify-center p-4">
              <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-6 animate-in zoom-in-95">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><FilePlus size={20} className="text-purple-600"/> Novo Serviço</h3>
                  <div className="space-y-3">
                      <div><label className="text-xs font-bold text-slate-400 uppercase">Nome</label><input autoFocus className="w-full p-2 border rounded-lg" value={formServico.nome} onChange={e => setFormServico({...formServico, nome: e.target.value})} /></div>
                      <div><label className="text-xs font-bold text-slate-400 uppercase">Valor Padrão (R$)</label><input type="number" className="w-full p-2 border rounded-lg" value={formServico.valor} onChange={e => setFormServico({...formServico, valor: e.target.value})} /></div>
                  </div>
                  <div className="flex gap-2 justify-end mt-4">
                      <button onClick={() => setModalNovoServico(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg">Cancelar</button>
                      <button onClick={salvarNovoServico} className="px-4 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700">Salvar</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}