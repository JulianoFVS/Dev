const fs = require('fs');
const path = require('path');

console.log('💰 Instalando Módulo Financeiro e Controle de Status...');

// 1. AGENDA NOVA (Com Financeiro e Status)
const agendaCode = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, ChevronRight, X, Loader2, Trash2, Plus, CheckCircle, XCircle, AlertCircle, DollarSign, FileText } from 'lucide-react';

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function Agenda() {
  const [date, setDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pacientes, setPacientes] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    id: null,
    title: '',
    date: '', 
    time: '08:00',
    theme: 'blue',
    paciente_id: '',
    valor: '0',
    observacoes: '',
    status: 'agendado'
  });

  useEffect(() => { fetchEvents(); fetchPacientes(); }, [date]); 

  async function fetchEvents() {
    const start = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString();

    const { data } = await supabase
      .from('agendamentos')
      .select('*, pacientes(nome)')
      .gte('data_hora', start)
      .lte('data_hora', end)
      .neq('status', 'cancelado'); // Opcional: Se quiser esconder os cancelados

    if (data) setEvents(data);
  }

  async function fetchPacientes() {
    const { data } = await supabase.from('pacientes').select('id, nome').order('nome');
    if (data) setPacientes(data);
  }

  // Ações de Navegação
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const blankDays = Array.from({ length: firstDayOfMonth });
  const dayArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const handlePrevMonth = () => setDate(new Date(date.getFullYear(), date.getMonth() - 1, 1));
  const handleNextMonth = () => setDate(new Date(date.getFullYear(), date.getMonth() + 1, 1));

  // Abrir Modal (Novo)
  const openDateModal = (day: number) => {
    const formattedDate = \`\${date.getFullYear()}-\${String(date.getMonth() + 1).padStart(2, '0')}-\${String(day).padStart(2, '0')}\`;
    setFormData({ 
        id: null, title: '', date: formattedDate, time: '09:00', theme: 'blue', paciente_id: '', 
        valor: '0', observacoes: '', status: 'agendado' 
    });
    setOpenModal(true);
  };

  // Abrir Modal (Edição)
  const openEditModal = (e: any, event: any) => {
    e.stopPropagation(); 
    const d = new Date(event.data_hora);
    setFormData({
        id: event.id,
        title: event.procedimento,
        date: d.toISOString().split('T')[0],
        time: d.toTimeString().slice(0, 5),
        theme: event.cor || 'blue',
        paciente_id: event.paciente_id,
        valor: event.valor || '0',
        observacoes: event.observacoes || '',
        status: event.status || 'agendado'
    });
    setOpenModal(true);
  }

  // SALVAR (Criar ou Editar)
  async function saveEvent() {
    if (!formData.title || !formData.paciente_id) return alert('Preencha paciente e procedimento');
    setLoading(true);

    const payload = {
        paciente_id: formData.paciente_id,
        data_hora: \`\${formData.date}T\${formData.time}:00\`,
        procedimento: formData.title,
        cor: formData.theme,
        valor: parseFloat(formData.valor),
        observacoes: formData.observacoes,
        status: formData.status
    };

    if (formData.id) {
        await supabase.from('agendamentos').update(payload).eq('id', formData.id);
    } else {
        await supabase.from('agendamentos').insert([payload]);
    }
    setOpenModal(false);
    fetchEvents();
    setLoading(false);
  }

  // MUDAR STATUS RÁPIDO
  async function updateStatus(newStatus: string) {
    if(!formData.id) return;
    setLoading(true);
    
    // Se for concluir, garantimos que é verde
    const newColor = newStatus === 'concluido' ? 'green' : (newStatus === 'cancelado' ? 'red' : formData.theme);

    await supabase.from('agendamentos').update({ 
        status: newStatus,
        cor: newColor,
        valor: parseFloat(formData.valor), // Salva o valor ao concluir
        observacoes: formData.observacoes
    }).eq('id', formData.id);
    
    setOpenModal(false);
    fetchEvents();
    setLoading(false);
  }

  const themes = [
    { value: "blue", label: "Agendado", bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200" },
    { value: "green", label: "Concluído", bg: "bg-green-100", text: "text-green-800", border: "border-green-200" },
    { value: "red", label: "Cancelado", bg: "bg-red-100", text: "text-red-800", border: "border-red-200" },
    { value: "yellow", label: "Pendente", bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-200" },
    { value: "purple", label: "Cirurgia", bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-200" }
  ];

  return (
    <div className="antialiased sans-serif bg-slate-50 h-full flex flex-col animate-fade-in pb-20 md:pb-0">
      <div className="container mx-auto px-2 py-4 md:px-4 md:py-10">
        
        {/* Header */}
        <div className="bg-white rounded-t-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span className="text-lg md:text-xl font-bold text-slate-800">{MONTH_NAMES[date.getMonth()]}</span>
                <span className="text-lg md:text-xl text-slate-500 font-normal">{date.getFullYear()}</span>
            </div>
            <div className="flex gap-2">
                <button onClick={handlePrevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-200"><ChevronLeft size={20} /></button>
                <button onClick={() => setDate(new Date())} className="px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-200 text-sm font-bold">Hoje</button>
                <button onClick={handleNextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-200"><ChevronRight size={20} /></button>
            </div>
        </div>

        {/* Grid Calendário */}
        <div className="bg-white shadow-sm rounded-b-xl border-x border-b border-slate-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                {DAYS.map(d => <div key={d} className="py-3 text-center text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wide">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
                {blankDays.map((_, i) => <div key={\`blank-\${i}\`} className="h-24 md:h-40 border-b border-r border-slate-100 bg-slate-50/30"></div>)}

                {dayArray.map(day => {
                    const currentDayStr = \`\${date.getFullYear()}-\${String(date.getMonth()+1).padStart(2,'0')}-\${String(day).padStart(2,'0')}\`;
                    const dayEvents = events.filter(e => e.data_hora.startsWith(currentDayStr));
                    const isToday = new Date().toISOString().split('T')[0] === currentDayStr;

                    return (
                        <div key={day} onClick={() => openDateModal(day)} className={\`h-24 md:h-40 border-b border-r border-slate-100 p-1 md:p-2 relative cursor-pointer hover:bg-slate-50 transition-colors group \${isToday ? 'bg-teal-50/30' : ''}\`}>
                            <span className={\`w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full text-xs md:text-sm font-bold mb-1 \${isToday ? 'bg-teal-600 text-white shadow-sm shadow-teal-200' : 'text-slate-700'}\`}>{day}</span>
                            <div className="space-y-1 overflow-y-auto max-h-[calc(100%-1.5rem)] no-scrollbar">
                                {dayEvents.map(ev => {
                                    const theme = themes.find(t => t.value === ev.cor) || themes[0];
                                    const hora = new Date(ev.data_hora).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
                                    return (
                                        <div key={ev.id} onClick={(e) => openEditModal(e, ev)} className={\`px-1.5 py-0.5 md:px-2 md:py-1 rounded border text-[10px] md:text-xs truncate \${theme.bg} \${theme.text} \${theme.border} shadow-sm\`}>
                                            <span className="font-bold mr-1 hidden md:inline">{hora}</span>{ev.pacientes?.nome.split(' ')[0]}
                                        </div>
                                    )
                                })}
                            </div>
                            <div className="absolute top-1 right-1 md:opacity-0 md:group-hover:opacity-100 text-teal-600 md:bg-teal-50 rounded-full p-1 transition-opacity"><Plus size={14} className="md:w-4 md:h-4" /></div>
                        </div>
                    );
                })}
            </div>
        </div>
      </div>

      <button onClick={() => openDateModal(new Date().getDate())} className="md:hidden fixed bottom-6 right-6 bg-teal-600 text-white p-4 rounded-full shadow-xl z-30 hover:bg-teal-700 active:scale-90 transition-all"><Plus size={24} /></button>

      {/* MODAL PODEROSO */}
      {openModal && (
        <div className="fixed z-50 inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 text-lg">{formData.id ? 'Gerenciar Atendimento' : 'Novo Agendamento'}</h3>
                    <button onClick={() => setOpenModal(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24}/></button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto">
                    {/* Linha 1: Status (Se já existir) */}
                    {formData.id && (
                         <div className="flex gap-2 mb-2 p-2 bg-slate-50 rounded-lg border border-slate-100 justify-center">
                            <button type="button" onClick={() => updateStatus('concluido')} className={\`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all \${formData.status === 'concluido' ? 'bg-green-100 text-green-700 ring-2 ring-green-500' : 'bg-white text-slate-500 hover:bg-green-50 hover:text-green-600 border'}\`}>
                                <CheckCircle size={16}/> Concluir
                            </button>
                            <button type="button" onClick={() => updateStatus('cancelado')} className={\`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all \${formData.status === 'cancelado' ? 'bg-red-100 text-red-700 ring-2 ring-red-500' : 'bg-white text-slate-500 hover:bg-red-50 hover:text-red-600 border'}\`}>
                                <XCircle size={16}/> Cancelar
                            </button>
                         </div>
                    )}

                    {/* Dados Básicos */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Paciente</label>
                        <select value={formData.paciente_id} onChange={e => setFormData({...formData, title: e.target.options[e.target.selectedIndex].text.split(' - ')[0], paciente_id: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500">
                            <option value="">Selecione...</option>
                            {pacientes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data</label>
                            <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hora</label>
                            <input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Procedimento</label>
                        <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ex: Limpeza" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500" />
                    </div>

                    {/* Financeiro e Notas */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-1">
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><DollarSign size={14}/> Valor (R$)</label>
                             <input type="number" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className="w-full bg-green-50 border border-green-200 text-green-800 font-bold rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-green-500" placeholder="0.00" />
                        </div>
                        <div className="col-span-1">
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cor</label>
                             <div className="flex gap-1 h-[42px] items-center">
                                {themes.map(t => (
                                    <button key={t.value} type="button" onClick={() => setFormData({...formData, theme: t.value})} className={\`w-full h-8 rounded border-2 transition-all \${t.bg} \${formData.theme === t.value ? 'border-slate-600 scale-110 shadow-sm' : 'border-transparent opacity-50'}\`} />
                                ))}
                             </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><FileText size={14}/> Observações / Resumo</label>
                        <textarea rows={3} value={formData.observacoes} onChange={e => setFormData({...formData, observacoes: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-teal-500 text-sm" placeholder="Detalhes do que foi feito..." />
                    </div>
                </div>

                <div className="bg-slate-50 px-6 py-4 flex justify-between items-center border-t border-slate-100">
                    <button onClick={() => setOpenModal(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
                    <button onClick={saveEvent} disabled={loading} className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900 transition-transform active:scale-95 flex items-center gap-2">
                        {loading && <Loader2 size={16} className="animate-spin"/>} Salvar
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
`;

// 2. DASHBOARD NOVO (Com Faturamento)
const dashboardCode = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Calendar, DollarSign, Activity, ChevronRight, TrendingUp } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const [stats, setStats] = useState({ pacientes: 0, hoje: 0, faturamento: 0 });

  useEffect(() => {
    async function getStats() {
      // Total Pacientes
      const { count: totalPacientes } = await supabase.from('pacientes').select('*', { count: 'exact', head: true });
      
      // Agendamentos Hoje
      const hoje = new Date().toISOString().split('T')[0];
      const { count: totalHoje } = await supabase.from('agendamentos')
        .select('*', { count: 'exact', head: true })
        .gte('data_hora', \`\${hoje}T00:00:00\`)
        .lte('data_hora', \`\${hoje}T23:59:59\`)
        .neq('status', 'cancelado');

      // Faturamento (Soma dos 'concluidos' do mês atual)
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const fimMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString();
      
      const { data: faturamentoData } = await supabase.from('agendamentos')
        .select('valor')
        .eq('status', 'concluido')
        .gte('data_hora', inicioMes)
        .lte('data_hora', fimMes);

      const totalFat = faturamentoData?.reduce((acc, item) => acc + (Number(item.valor) || 0), 0) || 0;

      setStats({ 
        pacientes: totalPacientes || 0, 
        hoje: totalHoje || 0,
        faturamento: totalFat
      });
    }
    getStats();
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Painel Principal</h1>
        <p className="text-slate-500">Visão geral do desempenho da clínica este mês.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-xl"><Users size={24} /></div>
          <div><p className="text-sm text-slate-400 font-medium">Pacientes Ativos</p><p className="text-2xl font-bold text-slate-800">{stats.pacientes}</p></div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 bg-teal-50 text-teal-600 rounded-xl"><Calendar size={24} /></div>
          <div><p className="text-sm text-slate-400 font-medium">Agenda Hoje</p><p className="text-2xl font-bold text-slate-800">{stats.hoje}</p></div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="p-4 bg-green-50 text-green-600 rounded-xl"><DollarSign size={24} /></div>
          <div>
            <p className="text-sm text-slate-400 font-medium">Faturamento (Mês)</p>
            <p className="text-2xl font-bold text-green-600">R$ {stats.faturamento.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/agenda" className="bg-gradient-to-br from-teal-600 to-teal-800 p-8 rounded-3xl text-white shadow-lg hover:scale-[1.02] transition-transform cursor-pointer relative overflow-hidden">
            <div className="relative z-10">
                <h3 className="text-2xl font-bold mb-2">Acessar Agenda</h3>
                <p className="opacity-80 mb-6">Gerencie consultas, marque como concluído e lance valores.</p>
                <div className="inline-flex items-center gap-2 bg-white/20 px-4 py-2 rounded-lg backdrop-blur-sm font-medium">Ver Grade <ChevronRight size={16}/></div>
            </div>
            <Calendar className="absolute -bottom-4 -right-4 text-teal-500/30 w-40 h-40" />
        </Link>
        <Link href="/pacientes" className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:border-teal-200 hover:shadow-md transition-all cursor-pointer group relative overflow-hidden">
            <div className="relative z-10">
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Prontuários</h3>
                <p className="text-slate-500 mb-6">Consulte o histórico completo e dados de cada paciente.</p>
                <div className="inline-flex items-center gap-2 text-teal-600 font-bold group-hover:gap-3 transition-all">Ir para Pacientes <ChevronRight size={16}/></div>
            </div>
            <Activity className="absolute -bottom-4 -right-4 text-slate-100 w-40 h-40" />
        </Link>
      </div>
    </div>
  );
}
`;

fs.writeFileSync(path.join('app', 'agenda', 'page.tsx'), agendaCode.trim());
fs.writeFileSync(path.join('app', 'page.tsx'), dashboardCode.trim());

console.log('✅ Sistema Financeiro e Status Instalado!');