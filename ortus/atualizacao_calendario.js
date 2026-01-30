const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Iniciando a grande atualização do sistema...');

// 1. INSTALAR DEPENDÊNCIAS
console.log('📦 Instalando bibliotecas de calendário (pode demorar um pouquinho)...');
try {
  execSync('npm install react-big-calendar date-fns@2', { stdio: 'inherit' });
  console.log('✅ Dependências instaladas!');
} catch (error) {
  console.error('❌ Erro ao instalar dependências. Verifique sua conexão e tente novamente.');
  process.exit(1);
}

// 2. CÓDIGO DA PÁGINA DE PACIENTES (Com Edição)
const pacientesPageCode = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, ChevronRight, X, Loader2, Trash2, Search, Edit } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [modalEditarAberto, setModalEditarAberto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pacienteEmEdicao, setPacienteEmEdicao] = useState<any>(null);

  // Form
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [busca, setBusca] = useState('');

  async function fetchPacientes() {
    const { data, error } = await supabase.from('pacientes').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Erro ao carregar pacientes:', error);
    } else {
      setPacientes(data || []);
    }
  }

  async function criarPaciente(e: any) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('pacientes').insert([{ nome, telefone }]);
    if (error) {
      alert('Erro ao cadastrar paciente: ' + error.message);
    } else {
      setModalAberto(false);
      setNome('');
      setTelefone('');
      fetchPacientes();
    }
    setLoading(false);
  }

  async function atualizarPaciente(e: any) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase
      .from('pacientes')
      .update({ nome, telefone })
      .eq('id', pacienteEmEdicao.id);
      
    if (error) {
      alert('Erro ao atualizar paciente: ' + error.message);
    } else {
      setModalEditarAberto(false);
      setPacienteEmEdicao(null);
      setNome('');
      setTelefone('');
      fetchPacientes();
    }
    setLoading(false);
  }

  async function excluirPaciente(e: any, id: number) {
    e.preventDefault(); // Evita abrir o link
    if (!confirm('Tem certeza? Isso apagará também os agendamentos deste paciente.')) return;

    // Primeiro apaga os agendamentos (constraints)
    const { error: errorAgendamentos } = await supabase.from('agendamentos').delete().eq('paciente_id', id);
    if (errorAgendamentos) {
      alert('Erro ao excluir agendamentos do paciente: ' + errorAgendamentos.message);
      return;
    }

    // Depois o paciente
    const { error } = await supabase.from('pacientes').delete().eq('id', id);

    if (error) {
      alert('Erro ao excluir paciente: ' + error.message);
    } else {
      fetchPacientes();
    }
  }

  function abrirModalEdicao(e: any, paciente: any) {
    e.preventDefault();
    setPacienteEmEdicao(paciente);
    setNome(paciente.nome);
    setTelefone(paciente.telefone);
    setModalEditarAberto(true);
  }

  useEffect(() => { fetchPacientes(); }, []);

  const filtrados = pacientes.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in relative p-4 md:p-0">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Pacientes</h2>
            <p className="text-sm text-slate-400">{pacientes.length} cadastrados</p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome..." className="pl-10 p-2 border border-slate-200 rounded-lg w-full outline-none focus:ring-2 focus:ring-teal-500"/>
            </div>
            <button onClick={() => { setNome(''); setTelefone(''); setModalAberto(true); }} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 font-medium text-sm flex items-center gap-2 transition-transform active:scale-95 whitespace-nowrap">
                <Plus size={18}/> Novo
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrados.map((p) => (
          <div key={p.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-teal-200 transition-all group relative overflow-hidden flex justify-between items-center">
              <Link href={\`/pacientes/\${p.id}\`} className="flex gap-4 items-center overflow-hidden flex-1">
                  <div className="w-12 h-12 shrink-0 bg-slate-50 group-hover:bg-teal-50 rounded-full flex items-center justify-center text-slate-400 group-hover:text-teal-600 transition-colors font-bold text-lg">
                      {p.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                      <h3 className="font-bold text-slate-800 truncate">{p.nome}</h3>
                      <p className="text-sm text-slate-500 truncate">{p.telefone}</p>
                  </div>
              </Link>
              <div className="flex gap-1">
                <button onClick={(e) => abrirModalEdicao(e, p)} className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-colors z-10 relative">
                    <Edit size={18} />
                </button>
                <button onClick={(e) => excluirPaciente(e, p.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors z-10 relative">
                    <Trash2 size={18} />
                </button>
              </div>
          </div>
        ))}
      </div>

      {/* Modal de Cadastro */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-700">Novo Paciente</h3>
                    <button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
                </div>
                <form onSubmit={criarPaciente} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                        <input autoFocus required type="text" value={nome} onChange={e => setNome(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" placeholder="Ex: Maria Silva" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Telefone / WhatsApp</label>
                        <input required type="text" value={telefone} onChange={e => setTelefone(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" placeholder="(00) 00000-0000" />
                    </div>
                    <button disabled={loading} type="submit" className="w-full bg-teal-600 text-white py-3 rounded-lg font-bold hover:bg-teal-700 flex justify-center items-center gap-2">
                        {loading ? <Loader2 className="animate-spin" /> : 'Cadastrar Paciente'}
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* Modal de Edição */}
      {modalEditarAberto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-700">Editar Paciente</h3>
                    <button onClick={() => { setModalEditarAberto(false); setPacienteEmEdicao(null); }} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
                </div>
                <form onSubmit={atualizarPaciente} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                        <input autoFocus required type="text" value={nome} onChange={e => setNome(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" placeholder="Ex: Maria Silva" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Telefone / WhatsApp</label>
                        <input required type="text" value={telefone} onChange={e => setTelefone(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" placeholder="(00) 00000-0000" />
                    </div>
                    <button disabled={loading} type="submit" className="w-full bg-teal-600 text-white py-3 rounded-lg font-bold hover:bg-teal-700 flex justify-center items-center gap-2">
                        {loading ? <Loader2 className="animate-spin" /> : 'Salvar Alterações'}
                    </button>
                </form>
            </div>
        </div>
      )}
    </div>
  )
}
`;

// 3. CÓDIGO DA NOVA PÁGINA DE AGENDA (Visual Profissional e Responsivo)
const agendaPageCode = `
'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import ptBR from 'date-fns/locale/pt-BR';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Plus, X, Loader2, Check, Trash2, Edit2, AlertCircle } from 'lucide-react';

const locales = {
  'pt-BR': ptBR,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const messages = {
  allDay: 'Dia inteiro',
  previous: 'Anterior',
  next: 'Próximo',
  today: 'Hoje',
  month: 'Mês',
  week: 'Semana',
  day: 'Dia',
  agenda: 'Agenda',
  date: 'Data',
  time: 'Hora',
  event: 'Evento',
  noEventsInRange: 'Não há agendamentos neste período.',
  showMore: (total: number) => \`+\${total} mais\`,
};

export default function Agenda() {
  const [events, setEvents] = useState<any[]>([]);
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [modalEditarAberto, setModalEditarAberto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState(Views.WEEK);
  const [date, setDate] = useState(new Date());

  // Form
  const [form, setForm] = useState({ id: null, paciente_id: '', start: new Date(), end: new Date(), title: '', cor: 'blue', status: 'agendado' });

  const fetchAgendamentos = useCallback(async () => {
    const { data, error } = await supabase
      .from('agendamentos')
      .select('*, pacientes(nome, telefone)');

    if (error) {
      console.error('Erro ao carregar agendamentos:', error);
      return;
    }

    const formattedEvents = data.map((event: any) => ({
      id: event.id,
      title: event.pacientes ? \`\${event.pacientes.nome} - \${event.procedimento}\` : event.procedimento,
      start: new Date(event.data_hora),
      end: new Date(new Date(event.data_hora).getTime() + 60 * 60 * 1000), // Assumindo 1 hora de duração
      resource: event,
    }));
    setEvents(formattedEvents);
  }, []);

  const fetchPacientes = useCallback(async () => {
    const { data, error } = await supabase.from('pacientes').select('id, nome').order('nome');
    if (error) {
      console.error('Erro ao carregar pacientes:', error);
    } else {
      setPacientes(data || []);
    }
  }, []);

  useEffect(() => {
    fetchAgendamentos();
    fetchPacientes();
  }, [fetchAgendamentos, fetchPacientes]);

  const handleSelectSlot = useCallback(
    ({ start, end }: { start: Date; end: Date }) => {
      setForm({ id: null, paciente_id: '', start, end, title: '', cor: 'blue', status: 'agendado' });
      setModalAberto(true);
    },
    []
  );

  const handleSelectEvent = useCallback(
    (event: any) => {
      setForm({
        id: event.resource.id,
        paciente_id: event.resource.paciente_id,
        start: event.start,
        end: event.end,
        title: event.resource.procedimento,
        cor: event.resource.cor || 'blue',
        status: event.resource.status || 'agendado',
      });
      setModalEditarAberto(true);
    },
    []
  );

  const salvarAgendamento = async (e: any) => {
    e.preventDefault();
    setLoading(true);

    const agendamentoData = {
      paciente_id: form.paciente_id,
      data_hora: form.start.toISOString(),
      procedimento: form.title,
      cor: form.cor,
      status: form.status,
    };

    let error;
    if (form.id) {
      const { error: updateError } = await supabase
        .from('agendamentos')
        .update(agendamentoData)
        .eq('id', form.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('agendamentos')
        .insert([agendamentoData]);
      error = insertError;
    }

    if (error) {
      alert('Erro ao salvar agendamento: ' + error.message);
    } else {
      setModalAberto(false);
      setModalEditarAberto(false);
      fetchAgendamentos();
    }
    setLoading(false);
  };

  const excluirAgendamento = async () => {
    if (!confirm('Tem certeza que deseja excluir este agendamento?')) return;
    setLoading(true);
    const { error } = await supabase.from('agendamentos').delete().eq('id', form.id);
    if (error) {
      alert('Erro ao excluir agendamento: ' + error.message);
    } else {
      setModalEditarAberto(false);
      fetchAgendamentos();
    }
    setLoading(false);
  };

  const eventStyleGetter = (event: any) => {
    const backgroundColor = event.resource.cor === 'blue' ? '#3b82f6' :
                            event.resource.cor === 'green' ? '#22c55e' :
                            event.resource.cor === 'purple' ? '#a855f7' :
                            event.resource.cor === 'rose' ? '#f43f5e' : '#3b82f6';
    const style = {
      backgroundColor,
      borderRadius: '6px',
      opacity: 0.9,
      color: 'white',
      border: '0px',
      display: 'block',
      fontWeight: '500',
      fontSize: '0.85rem',
      boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    };
    return {
      style,
    };
  };

  const onView = useCallback((newView: any) => setView(newView), [setView]);
  const onNavigate = useCallback((newDate: any) => setDate(newDate), [setDate]);

  return (
    <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-2rem)] p-4 md:p-6 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
        <h2 className="text-2xl font-bold text-slate-800">Agenda</h2>
        <button onClick={() => {
            setForm({ id: null, paciente_id: '', start: new Date(), end: new Date(new Date().getTime() + 60*60*1000), title: '', cor: 'blue', status: 'agendado' });
            setModalAberto(true);
          }} className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 font-medium text-sm flex items-center gap-2 transition-transform active:scale-95 w-full md:w-auto justify-center">
            <Plus size={18}/> Novo Agendamento
        </button>
      </div>
      
      <div className="flex-1 calendar-container">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventStyleGetter}
          messages={messages}
          culture="pt-BR"
          view={view}
          onView={onView}
          date={date}
          onNavigate={onNavigate}
          views={['month', 'week', 'day', 'agenda']}
          components={{
            toolbar: (props) => {
                return (
                    <div className="rbc-toolbar">
                        <span className="rbc-toolbar-label">{props.label}</span>
                        <span className="rbc-btn-group">
                            <button type="button" onClick={() => props.onNavigate('TODAY')}>Hoje</button>
                            <button type="button" onClick={() => props.onNavigate('PREV')}><ChevronLeft size={20}/></button>
                            <button type="button" onClick={() => props.onNavigate('NEXT')}><ChevronRight size={20}/></button>
                        </span>
                        <span className="rbc-btn-group">
                            <button type="button" className={view === 'month' ? 'rbc-active' : ''} onClick={() => props.onView('month')}>Mês</button>
                            <button type="button" className={view === 'week' ? 'rbc-active' : ''} onClick={() => props.onView('week')}>Semana</button>
                            <button type="button" className={view === 'day' ? 'rbc-active' : ''} onClick={() => props.onView('day')}>Dia</button>
                        </span>
                    </div>
                )
            }
          }}
        />
      </div>

      {/* Modal de Agendamento (Novo/Edição) */}
      {(modalAberto || modalEditarAberto) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-700">{modalEditarAberto ? 'Editar Agendamento' : 'Novo Agendamento'}</h3>
              <button onClick={() => { setModalAberto(false); setModalEditarAberto(false); }} className="text-slate-400 hover:text-red-500"><X size={20}/></button>
            </div>
            <form onSubmit={salvarAgendamento} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Paciente</label>
                <select required value={form.paciente_id} onChange={e => setForm({ ...form, paciente_id: e.target.value })} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white">
                  <option value="">Selecione um paciente</option>
                  {pacientes.map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Início</label>
                    <input required type="datetime-local" value={format(form.start, "yyyy-MM-dd'T'HH:mm")} onChange={e => setForm({ ...form, start: new Date(e.target.value) })} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Fim</label>
                    <input required type="datetime-local" value={format(form.end, "yyyy-MM-dd'T'HH:mm")} onChange={e => setForm({ ...form, end: new Date(e.target.value) })} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Procedimento</label>
                <input required type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" placeholder="Ex: Limpeza, Consulta..." />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cor</label>
                <div className="flex gap-2">
                    {['blue', 'green', 'purple', 'rose'].map(color => (
                        <button
                            key={color}
                            type="button"
                            onClick={() => setForm({ ...form, cor: color })}
                            className={\`w-8 h-8 rounded-full bg-\${color}-500 \${form.cor === color ? 'ring-2 ring-offset-2 ring-slate-400' : ''}\`}
                        />
                    ))}
                </div>
              </div>
              
              <div className="flex gap-2 pt-2">
                <button disabled={loading} type="submit" className="flex-1 bg-teal-600 text-white py-3 rounded-lg font-bold hover:bg-teal-700 flex justify-center items-center gap-2">
                    {loading ? <Loader2 className="animate-spin" /> : (modalEditarAberto ? 'Salvar Alterações' : 'Agendar')}
                </button>
                {modalEditarAberto && (
                    <button type="button" onClick={excluirAgendamento} disabled={loading} className="bg-red-100 text-red-600 p-3 rounded-lg hover:bg-red-200 transition-colors">
                        <Trash2 size={20} />
                    </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
`;

// 4. CSS GLOBAL ATUALIZADO (Estilo do Calendário)
const globalsCssCode = `
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 248, 250, 252; /* slate-50 */
  --background-end-rgb: 255, 255, 255;
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(to bottom, transparent, rgb(var(--background-end-rgb))) rgb(var(--background-start-rgb));
  min-height: 100vh;
}

@layer utilities {
  .text-balance { text-wrap: balance; }
}

/* Animações Globais */
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }

/* ESTILIZAÇÃO DO CALENDÁRIO (React Big Calendar) */
.rbc-calendar { font-family: inherit; }

.rbc-toolbar {
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-direction: column;
    align-items: center;
}

@media (min-width: 768px) {
    .rbc-toolbar {
        flex-direction: row;
        justify-content: space-between;
    }
}

.rbc-toolbar-label {
    font-weight: 800;
    font-size: 1.5rem;
    color: #1e293b; /* slate-800 */
    text-transform: capitalize;
    order: -1;
    margin-bottom: 0.5rem;
}

@media (min-width: 768px) {
    .rbc-toolbar-label {
        order: 0;
        margin-bottom: 0;
    }
}

.rbc-btn-group {
    display: flex;
    gap: 0.5rem;
    background-color: #f1f5f9; /* slate-100 */
    padding: 0.25rem;
    border-radius: 0.75rem;
}

.rbc-btn-group button {
    background-color: transparent;
    border: none;
    color: #64748b; /* slate-500 */
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    transition: all 0.2s;
    cursor: pointer;
    font-size: 0.875rem;
}

.rbc-btn-group button:hover {
    background-color: #e2e8f0; /* slate-200 */
    color: #1e293b; /* slate-800 */
}

.rbc-btn-group button.rbc-active {
    background-color: white;
    color: #0d9488; /* teal-600 */
    box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.06);
}

.rbc-header {
    padding: 1rem 0.5rem;
    font-weight: 700;
    color: #64748b; /* slate-500 */
    border-bottom: 1px solid #e2e8f0;
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
}

.rbc-time-view .rbc-header { border-bottom: none; }
.rbc-day-bg + .rbc-day-bg { border-left: 1px solid #f1f5f9; }
.rbc-timeslot-group { border-bottom: 1px solid #f8fafc; min-height: 70px; }
.rbc-time-content { border-top: 1px solid #e2e8f0; }
.rbc-time-content > * + * > * { border-left: 1px solid #f1f5f9; }
.rbc-time-header-content { border-left: 1px solid #f1f5f9; }
.rbc-today { background-color: #f0fdfa !important; /* teal-50 */ }
.rbc-off-range-bg { background-color: #f8fafc; }

.rbc-event {
    border: none !important;
    padding: 4px 8px !important;
    transition: all 0.2s;
}

.rbc-event:hover { transform: scale(1.02); }
.rbc-event-label { display: none; }
.rbc-allday-cell { display: none; }

/* Responsividade do Calendário */
@media (max-width: 767px) {
    .rbc-calendar { min-height: 600px; }
    .rbc-toolbar-label { font-size: 1.25rem; }
    .rbc-btn-group button { padding: 0.5rem 0.75rem; font-size: 0.8rem; }
    .rbc-header { padding: 0.75rem 0.25rem; font-size: 0.7rem; }
    .rbc-time-slot { font-size: 0.75rem; }
    .calendar-container { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .rbc-time-view { min-width: 700px; } /* Garante scroll horizontal no mobile */
}
`;

// APLICAR AS MUDANÇAS
console.log('📝 Atualizando página de Pacientes...');
fs.writeFileSync(path.join('app', 'pacientes', 'page.tsx'), pacientesPageCode.trim());

console.log('📝 Criando nova página de Agenda...');
fs.writeFileSync(path.join('app', 'agenda', 'page.tsx'), agendaPageCode.trim());

console.log('🎨 Atualizando estilos globais (CSS)...');
fs.writeFileSync(path.join('app', 'globals.css'), globalsCssCode.trim());

console.log('🎉 ATUALIZAÇÃO CONCLUÍDA COM SUCESSO! 🎉');
console.log('👉 Agora reinicie o servidor para ver as mudanças.');