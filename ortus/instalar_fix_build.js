const fs = require('fs');
const path = require('path');

console.log('🚑 Instalando V31: Correção de Tipagem para Build na Vercel...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Atualizado: ${caminhoRelativo}`);
}

const agendaPage = `
'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import ptBrLocale from '@fullcalendar/core/locales/pt-br';
import { Plus, X, Loader2, CheckCircle, XCircle, MapPin, User, Building2, ChevronLeft, ChevronRight, Calendar as CalIcon } from 'lucide-react';

export default function Agenda() {
  const calendarRef = useRef(null);
  
  // CORREÇÃO: Adicionado <any[]> para o TypeScript entender que são listas de dados
  const [events, setEvents] = useState<any[]>([]);
  const [usuarioAtual, setUsuarioAtual] = useState<any>(null);
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  const [profissionaisFiltrados, setProfissionaisFiltrados] = useState<any[]>([]);
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [servicos, setServicos] = useState<any[]>([]);
  
  const [clinicaFiltro, setClinicaFiltro] = useState('todas');
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({ 
    id: null, title: '', date: '', time: '08:00', theme: 'blue', 
    paciente_id: '', valor: '0', desconto: '0', observacoes: '', status: 'agendado',
    clinica_id: '', profissional_id: ''
  });

  useEffect(() => { inicializar(); }, []);
  useEffect(() => { if(usuarioAtual) carregarEventos(); }, [clinicaFiltro, usuarioAtual]);

  useEffect(() => {
      if (!formData.clinica_id) {
          setProfissionaisFiltrados([]);
      } else {
          // O erro acontecia aqui. Agora com <any[]> o TS aceita.
          const filtrados = profissionais.filter((p) => p.profissionais_clinicas?.some((vinculo: any) => vinculo.clinica_id == formData.clinica_id));
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
      const saved = typeof window !== 'undefined' ? localStorage.getItem('ortus_clinica_atual') : 'todas';
      if (saved) setClinicaFiltro(saved);
      fetchDados();
  }

  async function fetchDados() {
    const { data: cl } = await supabase.from('clinicas').select('*');
    if (cl) setClinicas(cl);
    const { data: pr } = await supabase.from('profissionais').select('*, profissionais_clinicas(clinica_id)');
    if (pr) setProfissionais(pr);
    const { data: pac } = await supabase.from('pacientes').select('id, nome, clinica_id').order('nome');
    if (pac) setPacientes(pac);
    const { data: serv } = await supabase.from('servicos').select('*').order('nome');
    if (serv) setServicos(serv);
  }

  async function carregarEventos() {
    if (!usuarioAtual) return;
    let query = supabase.from('agendamentos').select('*, pacientes(nome), clinicas(nome, cor_tema)');
    if (clinicaFiltro !== 'todas') query = query.eq('clinica_id', clinicaFiltro);
    if (usuarioAtual.nivel !== 'admin' && usuarioAtual.profissional_id) query = query.eq('profissional_id', usuarioAtual.profissional_id);

    const { data: ag } = await query;
    if (ag) {
        const fmt = ag.map((e) => ({
            id: e.id,
            title: \`\${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome} - \${e.procedimento}\`,
            start: e.data_hora,
            end: new Date(new Date(e.data_hora).getTime() + 60*60*1000).toISOString(),
            extendedProps: e,
            backgroundColor: 'transparent',
            borderColor: 'transparent'
        }));
        setEvents(fmt);
    } else setEvents([]);
  }

  const handleDateClick = (arg: any) => {
      const d = arg.date;
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      const preClinica = clinicaFiltro !== 'todas' ? clinicaFiltro : '';
      const preProfissional = (usuarioAtual?.nivel !== 'admin' && usuarioAtual?.profissional_id) ? usuarioAtual.profissional_id : '';

      setFormData(prev => ({ 
        ...prev, id: null, title: '', 
        date: d.toISOString().split('T')[0], time: \`\${h}:\${min}\`, 
        status: 'agendado', desconto: '0', valor: '0', 
        clinica_id: preClinica, profissional_id: preProfissional 
      }));
      setOpenModal(true);
  };

  const handleEventClick = (info: any) => {
      const r = info.event.extendedProps;
      const localDate = new Date(r.data_hora);
      setFormData({
        id: r.id, title: r.procedimento, 
        date: localDate.toISOString().split('T')[0], time: localDate.toTimeString().slice(0,5),
        theme: r.cor || 'blue', paciente_id: r.paciente_id, valor: r.valor || '0', desconto: r.desconto || '0', 
        observacoes: r.observacoes || '', status: r.status || 'agendado',
        clinica_id: r.clinica_id, profissional_id: r.profissional_id
      });
      setOpenModal(true);
  };

  async function saveOrUpdate(overrideStatus?: string) {
      if (!formData.title || !formData.paciente_id || !formData.clinica_id) return alert('Preencha campos obrigatórios.');
      setLoading(true);
      const finalStatus = overrideStatus || formData.status;
      const dataLocal = new Date(\`\${formData.date}T\${formData.time}:00\`);
      const dataHoraISO = dataLocal.toISOString();

      const payload = {
          paciente_id: formData.paciente_id, clinica_id: formData.clinica_id, 
          profissional_id: formData.profissional_id || null,
          data_hora: dataHoraISO, procedimento: formData.title, cor: formData.theme,
          valor: parseFloat(formData.valor) || 0, desconto: parseFloat(formData.desconto) || 0, 
          valor_final: (parseFloat(formData.valor) || 0) - (parseFloat(formData.desconto) || 0), 
          observacoes: formData.observacoes, status: finalStatus
      };
  
      if (formData.id) await supabase.from('agendamentos').update(payload).eq('id', formData.id);
      else await supabase.from('agendamentos').insert([payload]);
      
      setOpenModal(false); carregarEventos(); setLoading(false);
  }

  // --- RENDERIZADOR CLEAN (SUPORTE TOTAL A CORES) ---
  const renderEventContent = (eventInfo: any) => {
      const props = eventInfo.event.extendedProps;
      const status = props.status;
      const viewType = eventInfo.view.type;
      
      const mapBg: any = {
          slate: 'bg-slate-500', gray: 'bg-gray-500', zinc: 'bg-zinc-500',
          red: 'bg-red-500', orange: 'bg-orange-500', amber: 'bg-amber-500',
          yellow: 'bg-yellow-500', lime: 'bg-lime-500', green: 'bg-green-500',
          emerald: 'bg-emerald-500', teal: 'bg-teal-500', cyan: 'bg-cyan-500',
          sky: 'bg-sky-500', blue: 'bg-blue-500', indigo: 'bg-indigo-500',
          violet: 'bg-violet-500', purple: 'bg-purple-500', fuchsia: 'bg-fuchsia-500',
          pink: 'bg-pink-500', rose: 'bg-rose-500'
      };

      const bgClass = mapBg[props.cor] || 'bg-blue-500';
      const textClass = 'text-white'; 

      if (viewType === 'listWeek' || viewType === 'dayGridMonth') {
         return (
             <div className="flex items-center gap-1 overflow-hidden w-full">
                <div className={\`w-2 h-2 rounded-full \${status === 'cancelado' ? 'bg-red-500' : bgClass}\`}></div>
                <span className={\`text-xs font-medium truncate \${status === 'cancelado' ? 'line-through text-slate-400' : 'text-slate-700'}\`}>
                    {eventInfo.timeText && <span className="mr-1 opacity-70">{eventInfo.timeText}</span>}
                    {eventInfo.event.title}
                </span>
             </div>
         );
      }

      let classes = \`w-full h-full p-1 px-2 rounded-md shadow-sm transition-all hover:opacity-90 \${bgClass} \${textClass} border-l-[3px] border-white/30\`;
      
      if (status === 'cancelado') {
          return (
            <div className="w-full h-full p-1 rounded-md bg-red-100 border-l-4 border-red-500 text-red-700 flex flex-col justify-center relative opacity-80">
                <span className="font-bold text-[10px] line-through truncate">{eventInfo.event.title}</span>
                <span className="text-[9px] uppercase font-bold text-red-600">Cancelado</span>
            </div>
          );
      }
      if (status === 'concluido') {
          return (
            <div className="w-full h-full p-1 rounded-md bg-slate-200 border-l-4 border-slate-500 text-slate-600 flex flex-col justify-center opacity-75">
                <span className="font-bold text-[10px] truncate">{eventInfo.event.title}</span>
                <span className="text-[9px] uppercase font-bold">Concluído</span>
            </div>
          );
      }

      return (
          <div className={classes}>
              <div className="text-[10px] font-medium opacity-90">{eventInfo.timeText}</div>
              <div className="text-xs font-bold truncate leading-tight">{eventInfo.event.title}</div>
          </div>
      );
  };

  return (
    <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-2rem)] flex flex-col space-y-4">
      {/* CSS DO FULLCALENDAR */}
      <style jsx global>{\`
        .fc { font-family: inherit; }
        .fc-header-toolbar { margin-bottom: 1.5rem !important; }
        .fc-toolbar-title { font-size: 1.25rem !important; font-weight: 800 !important; color: #1e293b; text-transform: capitalize; }
        .fc-button { background-color: white !important; color: #475569 !important; border: 1px solid #e2e8f0 !important; font-weight: 600 !important; font-size: 0.875rem !important; padding: 0.5rem 1rem !important; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); text-transform: capitalize; transition: all 0.2s; }
        .fc-button:hover { background-color: #f8fafc !important; color: #0f172a !important; border-color: #cbd5e1 !important; }
        .fc-button-active { background-color: #f1f5f9 !important; color: #2563eb !important; border-color: #cbd5e1 !important; box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.06) !important; }
        .fc-button-primary:focus { box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5) !important; }
        .fc-theme-standard td, .fc-theme-standard th { border-color: #e2e8f0; }
        .fc-scrollgrid { border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
        .fc-timegrid-slot-label { color: #64748b; font-size: 11px; font-weight: 500; }
        .fc-day-today { background-color: #f8fafc !important; }
        .fc-event { border: none; background: transparent; box-shadow: none; }
        .fc-daygrid-event { white-space: normal !important; align-items: center; }
        .fc-col-header-cell { background-color: #f8fafc; padding: 12px 0; }
        .fc-col-header-cell-cushion { color: #475569; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
        .fc-list { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        .fc-list-day-cushion { background-color: #f8fafc !important; }
        .fc-list-event:hover td { background-color: #f1f5f9 !important; cursor: pointer; }
      \`}</style>

      {/* HEADER SUPERIOR */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2">
            <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><CalIcon size={20}/></div>
            <div>
                <h1 className="text-lg font-bold text-slate-800 leading-tight">Agenda</h1>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Building2 size={10}/>
                    <select value={clinicaFiltro} onChange={e => setClinicaFiltro(e.target.value)} className="bg-transparent outline-none font-bold hover:text-blue-600 cursor-pointer">
                        <option value="todas">Todas as Clínicas</option>
                        {clinicas.map((c:any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                </div>
            </div>
        </div>
        <button onClick={() => { setOpenModal(true); setFormData(prev => ({...prev, id: null})); }} className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 text-sm shadow-sm transition-colors"><Plus size={18}/> Novo Agendamento</button>
      </div>
      
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-4 overflow-hidden">
        <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView="timeGridWeek"
            headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' }}
            buttonText={{ today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', list: 'Lista' }}
            locale={ptBrLocale}
            slotMinTime="07:00:00"
            slotMaxTime="20:00:00"
            allDaySlot={false}
            events={events}
            eventContent={renderEventContent}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            height="100%"
            slotDuration="00:30:00"
            dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
            nowIndicator={true}
            navLinks={true}
        />
      </div>

      {openModal && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh] animate-zoom-in border border-slate-100">
                <div className="p-5 border-b bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">{formData.id ? 'Editar Agendamento' : 'Novo Agendamento'}</h3>
                    <button onClick={() => setOpenModal(false)} className="text-slate-400 hover:text-red-500 p-1"><X size={20}/></button>
                </div>
                
                <div className="p-6 space-y-5 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Clínica</label><select value={formData.clinica_id} onChange={e => setFormData({...formData, clinica_id: e.target.value})} className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"><option value="">Selecione...</option>{clinicas.map((c:any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Profissional</label><select value={formData.profissional_id} onChange={e => setFormData({...formData, profissional_id: e.target.value})} className={\`w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none \${usuarioAtual?.nivel !== 'admin' ? 'opacity-60' : ''}\`} disabled={usuarioAtual?.nivel !== 'admin'}><option value="">Qualquer um...</option>{profissionaisFiltrados.map((p:any) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
                    </div>

                    <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Paciente</label><select value={formData.paciente_id} onChange={e => setFormData({...formData, paciente_id: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none"><option value="">Selecione...</option>{pacientes.filter((p:any) => !formData.clinica_id || p.clinica_id == formData.clinica_id).map((p:any) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Data</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Hora</label><input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" /></div>
                    </div>

                    <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Procedimento</label><select onChange={(e) => { const s = servicos.find((x:any) => x.id == e.target.value); if(s) setFormData(p => ({...p, title: s.nome, valor: s.valor, theme: s.cor || 'blue'})) }} className="w-full p-2.5 mb-2 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"><option value="">✨ Selecionar Catálogo...</option>{servicos.map((s:any) => <option key={s.id} value={s.id}>{s.nome} - R$ {s.valor}</option>)}</select><input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Ou digite o procedimento..."/></div>
                    
                    <div className="flex gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex-1"><label className="text-[10px] font-bold text-slate-400 uppercase">Valor</label><div className="flex items-center text-slate-700 font-bold">R$ <input type="number" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className="w-full bg-transparent outline-none ml-1"/></div></div>
                        <div className="w-px bg-slate-200"></div>
                        <div className="flex-1 text-right"><label className="text-[10px] font-bold text-slate-400 uppercase">Total</label><div className="text-lg font-black text-slate-900">R$ {(parseFloat(formData.valor || '0') - parseFloat(formData.desconto || '0')).toFixed(2)}</div></div>
                    </div>

                    {formData.id && ( <div className="flex gap-3 pt-2"><button onClick={() => saveOrUpdate('concluido')} className="flex-1 bg-green-50 text-green-700 py-2.5 rounded-lg font-bold text-xs uppercase hover:bg-green-100 border border-green-200">Concluir</button><button onClick={() => saveOrUpdate('cancelado')} className="flex-1 bg-red-50 text-red-600 py-2.5 rounded-lg font-bold text-xs uppercase hover:bg-red-100 border border-red-200">Cancelar</button></div> )}
                </div>

                <div className="p-5 border-t bg-slate-50 flex justify-end gap-3">
                    <button onClick={() => setOpenModal(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg text-sm transition-colors">Fechar</button>
                    <button onClick={() => saveOrUpdate()} disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm">{loading && <Loader2 className="animate-spin" size={16}/>} Salvar</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
`;

salvarArquivo('app/agenda/page.tsx', agendaPage);