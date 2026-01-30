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
import { Plus, X, Loader2, CheckCircle, XCircle, MapPin, User, Building2, AlertTriangle } from 'lucide-react';

const locales = { 'pt-BR': ptBR };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });
const messages = { allDay: 'Dia inteiro', previous: '<', next: '>', today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', agenda: 'Lista', date: 'Data', time: 'Hora', event: 'Evento', noEventsInRange: 'Sem agendamentos.' };

export default function Agenda() {
  const [events, setEvents] = useState<any[]>([]);
  const [view, setView] = useState(Views.WEEK);
  const [date, setDate] = useState(new Date());
  
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [servicos, setServicos] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]); 
  const [profissionaisFiltrados, setProfissionaisFiltrados] = useState<any[]>([]);

  const [clinicaFiltro, setClinicaFiltro] = useState<string>('todas');
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({ 
    id: null, title: '', date: '', time: '08:00', theme: 'blue', 
    paciente_id: '', valor: '0', desconto: '0', observacoes: '', status: 'agendado',
    clinica_id: '', profissional_id: ''
  });

  useEffect(() => {
    const clinicaSalva = typeof window !== 'undefined' ? localStorage.getItem('ortus_clinica_atual') : 'todas';
    if (clinicaSalva) setClinicaFiltro(clinicaSalva);
    if (window.innerWidth < 768) setView(Views.DAY);
    fetchDados();
  }, []);

  useEffect(() => { carregarEventos(); }, [clinicaFiltro]);

  useEffect(() => {
      if (!formData.clinica_id) {
          setProfissionaisFiltrados([]);
      } else {
          const filtrados = profissionais.filter((p: any) => 
              p.profissionais_clinicas?.some((vinculo: any) => vinculo.clinica_id == formData.clinica_id)
          );
          setProfissionaisFiltrados(filtrados);
      }
  }, [formData.clinica_id, profissionais]);

  async function fetchDados() {
    const { data: cl } = await supabase.from('clinicas').select('*');
    if (cl) setClinicas(cl);
    const { data: pr } = await supabase.from('profissionais').select('*, profissionais_clinicas(clinica_id)');
    if (pr) setProfissionais(pr);
    // Busca pacientes (serão filtrados visualmente depois se necessário, mas aqui trazemos para o select)
    const { data: pac } = await supabase.from('pacientes').select('id, nome, clinica_id').order('nome');
    if (pac) setPacientes(pac);
    const { data: serv } = await supabase.from('servicos').select('*').order('nome');
    if (serv) setServicos(serv);
  }

  async function carregarEventos() {
    let query = supabase.from('agendamentos').select('*, pacientes(nome), clinicas(nome, cor_tema)');
    if (clinicaFiltro !== 'todas') query = query.eq('clinica_id', clinicaFiltro);
    const { data: ag } = await query;
    if (ag) {
        const fmt = ag.map((e: any) => ({
            id: e.id,
            title: `${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome} - ${e.procedimento}`,
            start: new Date(e.data_hora),
            end: new Date(new Date(e.data_hora).getTime() + 60*60*1000),
            resource: e
        }));
        setEvents(fmt);
    } else { setEvents([]); }
  }

  const handleSelectSlot = useCallback(({ start }: { start: Date }) => {
    const d = new Date(start);
    const preClinica = clinicaFiltro !== 'todas' ? clinicaFiltro : '';
    setFormData(prev => ({ ...prev, id: null, title: '', date: d.toISOString().split('T')[0], time: d.toTimeString().slice(0, 5), status: 'agendado', desconto: '0', valor: '0', clinica_id: preClinica }));
    setOpenModal(true);
  }, [clinicaFiltro]);

  const handleSelectEvent = useCallback((event: any) => {
    const r = event.resource;
    const d = new Date(r.data_hora);
    setFormData({
        id: r.id, title: r.procedimento, date: d.toISOString().split('T')[0], time: d.toTimeString().slice(0, 5),
        theme: r.cor || 'blue', paciente_id: r.paciente_id, valor: r.valor || '0', desconto: r.desconto || '0', 
        observacoes: r.observacoes || '', status: r.status || 'agendado',
        clinica_id: r.clinica_id, profissional_id: r.profissional_id
    });
    setOpenModal(true);
  }, []);

  async function saveOrUpdate(overrideStatus?: string) {
      if (!formData.title || !formData.paciente_id || !formData.clinica_id) return alert('Preencha Clínica, Paciente e Procedimento.');
      
      // --- ALERTA INTELIGENTE DE HORÁRIO ---
      const clinicaAlvo = clinicas.find(c => c.id == formData.clinica_id);
      if (clinicaAlvo && clinicaAlvo.horario_abertura && clinicaAlvo.horario_fechamento) {
          if (formData.time < clinicaAlvo.horario_abertura || formData.time > clinicaAlvo.horario_fechamento) {
              // Pop-up de confirmação
              if(!confirm(`⚠️ ALERTA DE HORÁRIO ⚠️

A clínica ${clinicaAlvo.nome} funciona das ${clinicaAlvo.horario_abertura} às ${clinicaAlvo.horario_fechamento}.

Você está agendando para ${formData.time}.
Deseja confirmar mesmo assim?`)) {
                  return; // Cancela salvamento
              }
          }
      }
      // -------------------------------------

      setLoading(true);
      const finalStatus = overrideStatus || formData.status;
      const valorNum = parseFloat(formData.valor) || 0;
      const descontoNum = parseFloat(formData.desconto) || 0;
      const payload = {
          paciente_id: formData.paciente_id, clinica_id: formData.clinica_id, profissional_id: formData.profissional_id || null,
          data_hora: `${formData.date}T${formData.time}:00`, procedimento: formData.title, cor: 'blue',
          valor: valorNum, desconto: descontoNum, valor_final: valorNum - descontoNum, observacoes: formData.observacoes, status: finalStatus
      };
      if (formData.id) await supabase.from('agendamentos').update(payload).eq('id', formData.id);
      else await supabase.from('agendamentos').insert([payload]);
      setOpenModal(false); carregarEventos(); setLoading(false);
  }

  const eventStyleGetter = (event: any) => {
    const status = event.resource.status;
    let bg = '#3b82f6'; let color = 'white'; let border = 'none';
    if (status === 'cancelado') { bg = '#fee2e2'; color = '#ef4444'; border = '1px solid #fca5a5'; }
    else if (status === 'concluido') { bg = '#f1f5f9'; color = '#64748b'; border = '1px solid #cbd5e1'; }
    else { bg = '#eff6ff'; color = '#2563eb'; border = '1px solid #bfdbfe'; }
    return { style: { backgroundColor: bg, color: color, border: border, borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', padding: '2px 4px' } };
  };

  return (
    <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-2rem)] p-4 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
        <div className="flex items-center gap-4">
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Agenda</h2>
            <div className="relative">
                <Building2 size={14} className="absolute left-3 top-3 text-blue-600"/>
                <select value={clinicaFiltro} onChange={e => setClinicaFiltro(e.target.value)} className="pl-8 pr-4 py-2 text-sm font-bold text-blue-700 bg-blue-50 border-none rounded-lg outline-none cursor-pointer hover:bg-blue-100 transition-colors uppercase tracking-wide">
                    <option value="todas">Todas as Clínicas</option>
                    {clinicas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
            </div>
        </div>
        <button onClick={() => { setOpenModal(true); setFormData(prev => ({...prev, id: null})); }} className="bg-blue-600 text-white px-5 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 text-sm shadow-md shadow-blue-200 transition-transform active:scale-95"><Plus size={18}/> Novo</button>
      </div>
      <div className="flex-1 text-xs md:text-sm font-medium">
        <Calendar localizer={localizer} events={events} startAccessor="start" endAccessor="end" style={{ height: '100%' }} selectable onSelectSlot={handleSelectSlot} onSelectEvent={handleSelectEvent} eventPropGetter={eventStyleGetter} messages={messages} culture="pt-BR" view={view} onView={(v: any) => setView(v)} date={date} onNavigate={(d: any) => setDate(d)} views={['month', 'week', 'day', 'agenda']} />
      </div>
      {openModal && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in duration-200">
                <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg">{formData.id ? 'Editar' : 'Agendar'}</h3>
                    <button onClick={() => setOpenModal(false)}><X size={20} className="text-slate-400 hover:text-red-500"/></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    {formData.id && ( <div className="flex gap-3 justify-center pb-4 border-b border-slate-100"><button onClick={() => saveOrUpdate('concluido')} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-slate-200 hover:text-slate-800 transition-colors"><CheckCircle size={16}/> Concluir</button><button onClick={() => saveOrUpdate('cancelado')} className="flex-1 bg-red-50 text-red-600 py-3 rounded-xl font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-red-100 transition-colors"><XCircle size={16}/> Cancelar</button></div> )}
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1"><MapPin size={12}/> Clínica</label><select value={formData.clinica_id} onChange={e => setFormData({...formData, clinica_id: e.target.value})} className="w-full p-3 bg-blue-50/50 border border-slate-200 rounded-xl font-medium text-sm outline-none focus:ring-2 focus:ring-blue-500"><option value="">Selecione...</option>{clinicas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1"><User size={12}/> Profissional</label><select value={formData.profissional_id} onChange={e => setFormData({...formData, profissional_id: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-sm outline-none focus:ring-2 focus:ring-blue-500"><option value="">Qualquer um...</option>{profissionaisFiltrados.map((p: any) => <option key={p.id} value={p.id}>{p.nome} - {p.cargo}</option>)}</select></div>
                    </div>
                    <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Paciente</label><select value={formData.paciente_id} onChange={e => setFormData({...formData, paciente_id: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500"><option value="">Selecione o paciente...</option>
                        {/* Filtra pacientes para mostrar apenas os da clinica selecionada (ou todos se nao tiver clinica selecionada ainda) */}
                        {pacientes.filter(p => !formData.clinica_id || p.clinica_id == formData.clinica_id).map((p: any) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select></div>
                    <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Data</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500" /></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Hora</label><input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
                    <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Procedimento</label><select onChange={(e) => { const s = servicos.find(x => x.id == e.target.value); if(s) setFormData(p => ({...p, title: s.nome, valor: s.valor})) }} className="w-full p-2 bg-blue-50 border-none rounded-lg text-sm mb-2 font-semibold text-blue-700 outline-none"><option value="">✨ Selecionar do Catálogo...</option>{servicos.map((s: any) => <option key={s.id} value={s.id}>{s.nome} - R$ {s.valor}</option>)}</select><input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl font-medium outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ou digite o nome..."/></div>
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100"><div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1">Valor (R$)</label><input type="number" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg font-bold text-slate-700 outline-none"/></div><div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1">Desconto (R$)</label><input type="number" value={formData.desconto} onChange={e => setFormData({...formData, desconto: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg font-bold text-red-500 outline-none"/></div><div className="col-span-2 text-right border-t border-slate-200 pt-2"><span className="text-xs font-bold text-slate-500 mr-2">TOTAL FINAL:</span><span className="text-lg font-black text-blue-600">R$ {(parseFloat(formData.valor || '0') - parseFloat(formData.desconto || '0')).toFixed(2)}</span></div></div>
                    <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Observações</label><textarea value={formData.observacoes} onChange={e => setFormData({...formData, observacoes: e.target.value})} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500" rows={2}></textarea></div>
                </div>
                <div className="p-5 border-t bg-slate-50 flex justify-end gap-3"><button onClick={() => setOpenModal(false)} className="px-5 py-3 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-colors">Cancelar</button><button onClick={() => saveOrUpdate()} disabled={loading} className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">{loading && <Loader2 className="animate-spin" size={16}/>} Salvar</button></div>
            </div>
        </div>
      )}
    </div>
  );
}