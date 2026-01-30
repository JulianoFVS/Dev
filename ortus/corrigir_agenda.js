const fs = require('fs');
const path = require('path');

console.log('🛠️ Corrigindo a Agenda...');

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
// AQUI ESTAVA O ERRO: Adicionei ChevronLeft e ChevronRight
import { Plus, X, Loader2, Check, Trash2, Edit2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

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

fs.writeFileSync(path.join('app', 'agenda', 'page.tsx'), agendaPageCode.trim());
console.log('✅ Agenda Corrigida! Agora reinicie o servidor.');