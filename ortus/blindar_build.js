const fs = require('fs');
const path = require('path');

console.log('🛡️ Blindando o código para produção (Removendo Sonner e Corrigindo Tipos)...');

// 1. PACIENTES (Sem Sonner, Tipagem Any)
const pacientesBlindado = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, ChevronRight, X, Loader2, Trash2, Search, Edit } from 'lucide-react';
import Link from 'next/link';

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
    e.preventDefault(); 
    if (!confirm('Tem certeza? Isso apagará também os agendamentos deste paciente.')) return;

    const { error: errorAgendamentos } = await supabase.from('agendamentos').delete().eq('paciente_id', id);
    if (errorAgendamentos) {
      alert('Erro ao excluir agendamentos: ' + errorAgendamentos.message);
      return;
    }

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

  const filtrados = pacientes.filter((p: any) => p.nome.toLowerCase().includes(busca.toLowerCase()));

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
        {filtrados.map((p: any) => (
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

// 2. AGENDA (Ignorar tipos de react-big-calendar)
const agendaBlindada = `
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
            title: \`\${e.pacientes?.nome} - \${e.procedimento}\`,
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
        data_hora: \`\${formData.date}T\${formData.time}:00\`,
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
                    <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-bold text-slate-500">VALOR (R$)</label><input type="number" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className="w-full p-2 border rounded mt-1 text-green-700 font-bold"/></div><div><label className="text-xs font-bold text-slate-500">COR</label><div className="flex gap-1 mt-2">{['blue', 'teal', 'purple', 'rose', 'orange'].map(c => <button key={c} onClick={() => setFormData({...formData, theme: c})} className={\`w-6 h-6 rounded-full bg-\${c}-500 \${formData.theme === c ? 'ring-2 ring-slate-400' : ''}\`} />)}</div></div></div>
                    <div><label className="text-xs font-bold text-slate-500">OBSERVAÇÕES</label><textarea value={formData.observacoes} onChange={e => setFormData({...formData, observacoes: e.target.value})} className="w-full p-2 border rounded mt-1" rows={2}></textarea></div>
                </div>
                <div className="p-4 border-t bg-slate-50 flex justify-end gap-2"><button onClick={() => setOpenModal(false)} className="px-4 py-2 text-slate-500 font-bold">Cancelar</button><button onClick={() => saveOrUpdate()} disabled={loading} className="px-6 py-2 bg-teal-600 text-white rounded font-bold flex items-center gap-2">{loading && <Loader2 className="animate-spin"/>} Salvar</button></div>
            </div>
        </div>
      )}
    </div>
  );
}
`;

function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) fs.mkdirSync(dirname, { recursive: true });
}

function salvarArquivo(caminho, conteudo) {
    const fullPath = path.join(__dirname, caminho);
    ensureDirectoryExistence(fullPath);
    fs.writeFileSync(fullPath, conteudo.trim());
    console.log(`✅ ${caminho} corrigido.`);
}

salvarArquivo('app/pacientes/page.tsx', pacientesBlindado);
salvarArquivo('app/agenda/page.tsx', agendaBlindada);

console.log('🚀 Código Blindado! Pode rodar o build.');