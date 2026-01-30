'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
// @ts-ignore
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import ptBR from 'date-fns/locale/pt-BR';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Plus, X, Loader2, Check, Trash2, ChevronLeft, ChevronRight, CheckCircle, XCircle, DollarSign, FileText } from 'lucide-react';

const locales = { 'pt-BR': ptBR };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

const messages = { allDay: 'Dia inteiro', previous: 'Anterior', next: 'Próximo', today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', agenda: 'Agenda', date: 'Data', time: 'Hora', event: 'Evento', noEventsInRange: 'Sem agendamentos.' };

export default function Agenda() {
  const [events, setEvents] = useState<any[]>([]);
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [servicos, setServicos] = useState<any[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState(Views.WEEK);
  const [date, setDate] = useState(new Date());

  const [formData, setFormData] = useState({ id: null, title: '', date: '', time: '08:00', theme: 'blue', paciente_id: '', valor: '0', observacoes: '', status: 'agendado' });

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    const { data: ag } = await supabase.from('agendamentos').select('*, pacientes(nome)');
    if (ag) {
        const fmt = ag.map((e: any) => ({
            id: e.id,
            title: `${e.pacientes?.nome} - ${e.procedimento}`,
            start: new Date(e.data_hora),
            end: new Date(new Date(e.data_hora).getTime() + 60*60*1000),
            resource: e
        }));
        setEvents(fmt);
    }
    const { data: pac } = await supabase.from('pacientes').select('id, nome').order('nome');
    if (pac) setPacientes(pac);
    const { data: serv } = await supabase.from('servicos').select('*').order('nome');
    if (serv) setServicos(serv);
  }

  const handleSelectSlot = useCallback(({ start }: { start: Date }) => {
    // Ajuste fuso
    const d = new Date(start);
    const dateStr = d.toISOString().split('T')[0];
    const timeStr = d.toTimeString().slice(0, 5);
    setFormData({ id: null, title: '', date: dateStr, time: timeStr, theme: 'blue', paciente_id: '', valor: '0', observacoes: '', status: 'agendado' });
    setOpenModal(true);
  }, []);

  const handleSelectEvent = useCallback((event: any) => {
    const r = event.resource;
    const d = new Date(r.data_hora);
    setFormData({
        id: r.id, title: r.procedimento, date: d.toISOString().split('T')[0], time: d.toTimeString().slice(0, 5),
        theme: r.cor || 'blue', paciente_id: r.paciente_id, valor: r.valor || '0', observacoes: r.observacoes || '', status: r.status || 'agendado'
    });
    setOpenModal(true);
  }, []);

  async function saveOrUpdate(overrideStatus?: string) {
    if (!formData.title || !formData.paciente_id) return alert('Preencha os campos obrigatórios');
    setLoading(true);
    const finalStatus = overrideStatus || formData.status;
    let finalTheme = formData.theme;
    if (finalStatus === 'concluido') finalTheme = 'gray';
    if (finalStatus === 'cancelado') finalTheme = 'red';

    const payload = {
        paciente_id: formData.paciente_id,
        data_hora: `${formData.date}T${formData.time}:00`,
        procedimento: formData.title,
        cor: finalTheme,
        valor: parseFloat(formData.valor),
        observacoes: formData.observacoes,
        status: finalStatus
    };

    if (formData.id) await supabase.from('agendamentos').update(payload).eq('id', formData.id);
    else await supabase.from('agendamentos').insert([payload]);
    
    setOpenModal(false); 
    fetchAll(); 
    setLoading(false);
  }

  const handleServiceSelect = (e: any) => {
    const s = servicos.find((x: any) => x.id == e.target.value);
    if (s) setFormData(p => ({ ...p, title: s.nome, valor: s.valor, theme: s.cor || 'blue' }));
  }

  const eventStyleGetter = (event: any) => {
    const status = event.resource.status;
    let bg = '#3b82f6'; 
    if (status === 'concluido') bg = '#64748b';
    else if (status === 'cancelado') bg = '#ef4444';
    else {
        const map: any = { blue: '#3b82f6', teal: '#14b8a6', purple: '#a855f7', rose: '#f43f5e', orange: '#f97316', indigo: '#6366f1', green: '#22c55e' };
        bg = map[event.resource.cor] || '#3b82f6';
    }
    return { style: { backgroundColor: bg, borderRadius: '6px', opacity: 0.9, border: '0px', display: 'block' } };
  };

  return (
    <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-2rem)] p-4 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-slate-800">Agenda</h2>
        <button onClick={() => { setFormData({ id: null, title: '', date: new Date().toISOString().split('T')[0], time: '09:00', theme: 'blue', paciente_id: '', valor: '0', observacoes: '', status: 'agendado' }); setOpenModal(true); }} className="bg-teal-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-teal-700 flex items-center gap-2 text-sm"><Plus size={18}/> Novo</button>
      </div>
      
      <div className="flex-1">
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
          onView={(v: any) => setView(v)}
          date={date}
          onNavigate={(d: any) => setDate(d)}
          views={['month', 'week', 'day', 'agenda']}
        />
      </div>

      {openModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50"><h3 className="font-bold text-slate-700">{formData.id ? 'Editar' : 'Novo'}</h3><button onClick={() => setOpenModal(false)}><X size={20} className="text-slate-400"/></button></div>
                <div className="p-5 space-y-4 overflow-y-auto">
                    {formData.id && ( <div className="flex gap-2 justify-center"><button onClick={() => saveOrUpdate('concluido')} className="flex-1 bg-green-100 text-green-700 py-2 rounded font-bold text-sm flex items-center justify-center gap-2"><CheckCircle size={16}/> Concluir</button><button onClick={() => saveOrUpdate('cancelado')} className="flex-1 bg-red-100 text-red-700 py-2 rounded font-bold text-sm flex items-center justify-center gap-2"><XCircle size={16}/> Cancelar</button></div> )}
                    <div><label className="text-xs font-bold text-slate-500">PACIENTE</label><select value={formData.paciente_id} onChange={e => setFormData({...formData, paciente_id: e.target.value})} className="w-full p-2 border rounded mt-1"><option value="">Selecione...</option>{pacientes.map((p: any) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
                    <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-bold text-slate-500">DATA</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-2 border rounded mt-1"/></div><div><label className="text-xs font-bold text-slate-500">HORA</label><input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full p-2 border rounded mt-1"/></div></div>
                    <div><label className="text-xs font-bold text-slate-500">PROCEDIMENTO</label><select onChange={handleServiceSelect} className="w-full p-2 bg-slate-100 rounded mb-2 text-sm"><option value="">✨ Catálogo...</option>{servicos.map((s: any) => <option key={s.id} value={s.id}>{s.nome} - R$ {s.valor}</option>)}</select><input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-2 border rounded" placeholder="Nome do procedimento"/></div>
                    <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-bold text-slate-500">VALOR (R$)</label><input type="number" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className="w-full p-2 border rounded mt-1 text-green-700 font-bold"/></div><div><label className="text-xs font-bold text-slate-500">COR</label><div className="flex gap-1 mt-2">{['blue', 'teal', 'purple', 'rose', 'orange'].map(c => <button key={c} onClick={() => setFormData({...formData, theme: c})} className={`w-6 h-6 rounded-full bg-${c}-500 ${formData.theme === c ? 'ring-2 ring-slate-400' : ''}`} />)}</div></div></div>
                    <div><label className="text-xs font-bold text-slate-500">OBSERVAÇÕES</label><textarea value={formData.observacoes} onChange={e => setFormData({...formData, observacoes: e.target.value})} className="w-full p-2 border rounded mt-1" rows={2}></textarea></div>
                </div>
                <div className="p-4 border-t bg-slate-50 flex justify-end gap-2"><button onClick={() => setOpenModal(false)} className="px-4 py-2 text-slate-500 font-bold">Cancelar</button><button onClick={() => saveOrUpdate()} disabled={loading} className="px-6 py-2 bg-teal-600 text-white rounded font-bold flex items-center gap-2">{loading && <Loader2 className="animate-spin"/>} Salvar</button></div>
            </div>
        </div>
      )}
    </div>
  );
}