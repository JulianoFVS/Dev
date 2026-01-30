const fs = require('fs');
const path = require('path');

console.log('🎨 Atualizando Design da Agenda e Cores dos Serviços...');

// FUNÇÃO AUXILIAR
function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Atualizado: ${caminhoRelativo}`);
}

// 1. CONFIGURAÇÕES (Com Seletor de Cores)
const configPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Settings, Loader2 } from 'lucide-react';

export default function Configuracoes() {
  const [servicos, setServicos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [novoServico, setNovoServico] = useState({ nome: '', valor: '', cor: 'blue' });

  const cores = [
    { id: 'blue', bg: 'bg-blue-500' },
    { id: 'teal', bg: 'bg-teal-500' },
    { id: 'purple', bg: 'bg-purple-500' },
    { id: 'rose', bg: 'bg-rose-500' },
    { id: 'orange', bg: 'bg-orange-500' },
    { id: 'indigo', bg: 'bg-indigo-500' },
  ];

  useEffect(() => { fetchServicos(); }, []);

  async function fetchServicos() {
    const { data } = await supabase.from('servicos').select('*').order('nome');
    if (data) setServicos(data);
  }

  async function adicionarServico(e: any) {
    e.preventDefault();
    if (!novoServico.nome || !novoServico.valor) return;
    setLoading(true);
    await supabase.from('servicos').insert([{ 
        nome: novoServico.nome, 
        valor: parseFloat(novoServico.valor),
        cor: novoServico.cor 
    }]);
    setNovoServico({ nome: '', valor: '', cor: 'blue' });
    fetchServicos();
    setLoading(false);
  }

  async function excluirServico(id: number) {
    if (!confirm('Excluir este serviço?')) return;
    await supabase.from('servicos').delete().eq('id', id);
    fetchServicos();
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-10">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-4">
            <Settings className="text-teal-600"/> Catálogo de Procedimentos
        </h2>
        <p className="text-slate-500 mb-6">Cadastre procedimentos e escolha a cor padrão para a agenda.</p>

        <form onSubmit={adicionarServico} className="bg-slate-50 p-5 rounded-xl border border-slate-100 mb-6 space-y-4">
            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome</label>
                    <input value={novoServico.nome} onChange={e => setNovoServico({...novoServico, nome: e.target.value})} placeholder="Ex: Clareamento" className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                </div>
                <div className="w-32">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Valor (R$)</label>
                    <input type="number" value={novoServico.valor} onChange={e => setNovoServico({...novoServico, valor: e.target.value})} placeholder="0.00" className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
                </div>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cor na Agenda</label>
                    <div className="flex gap-2">
                        {cores.map(c => (
                            <button 
                                key={c.id} 
                                type="button" 
                                onClick={() => setNovoServico({...novoServico, cor: c.id})}
                                className={\`w-8 h-8 rounded-full \${c.bg} transition-all \${novoServico.cor === c.id ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'opacity-60 hover:opacity-100'}\`}
                            />
                        ))}
                    </div>
                </div>
                <button disabled={loading} className="bg-teal-600 text-white px-6 py-2.5 rounded-lg hover:bg-teal-700 font-bold flex items-center gap-2 h-fit self-end shadow-sm shadow-teal-200">
                    {loading ? <Loader2 className="animate-spin"/> : <Plus size={20}/>} Cadastrar
                </button>
            </div>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {servicos.map(s => {
                const colorMap: any = { 
                    blue: 'bg-blue-100 text-blue-700 border-blue-200',
                    teal: 'bg-teal-100 text-teal-700 border-teal-200',
                    purple: 'bg-purple-100 text-purple-700 border-purple-200',
                    rose: 'bg-rose-100 text-rose-700 border-rose-200',
                    orange: 'bg-orange-100 text-orange-700 border-orange-200',
                    indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
                };
                const style = colorMap[s.cor] || colorMap.blue;

                return (
                    <div key={s.id} className={\`flex justify-between items-center p-3 rounded-lg border \${style}\`}>
                        <div className="flex items-center gap-3">
                            <div className={\`w-3 h-3 rounded-full \${style.replace('bg-', 'bg-slate-').split(' ')[0].replace('100','500')}\`}></div>
                            <span className="font-bold">{s.nome}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="font-bold opacity-80">R$ {s.valor}</span>
                            <button onClick={() => excluirServico(s.id)} className="hover:text-red-600 transition-colors"><Trash2 size={16}/></button>
                        </div>
                    </div>
                )
            })}
            {servicos.length === 0 && <p className="col-span-2 text-center text-slate-400 py-4">Nenhum serviço cadastrado.</p>}
        </div>
      </div>
    </div>
  );
}
`;

// 2. AGENDA (Visual Melhorado + Lógica de Cor Automática)
const agendaPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronLeft, ChevronRight, X, Loader2, Plus, CheckCircle, XCircle, DollarSign, FileText, Clock } from 'lucide-react';

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function Agenda() {
  const [date, setDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [servicos, setServicos] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    id: null, title: '', date: '', time: '08:00', theme: 'blue', paciente_id: '', valor: '0', observacoes: '', status: 'agendado'
  });

  useEffect(() => { fetchEvents(); fetchPacientes(); fetchServicos(); }, [date]); 

  async function fetchEvents() {
    const start = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString();
    const { data } = await supabase.from('agendamentos').select('*, pacientes(nome)').gte('data_hora', start).lte('data_hora', end);
    if (data) setEvents(data);
  }
  async function fetchPacientes() { const { data } = await supabase.from('pacientes').select('id, nome').order('nome'); if (data) setPacientes(data); }
  async function fetchServicos() { const { data } = await supabase.from('servicos').select('*').order('nome'); if (data) setServicos(data); }

  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const blankDays = Array.from({ length: firstDayOfMonth });
  const dayArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const handlePrevMonth = () => setDate(new Date(date.getFullYear(), date.getMonth() - 1, 1));
  const handleNextMonth = () => setDate(new Date(date.getFullYear(), date.getMonth() + 1, 1));

  const openDateModal = (day: number) => {
    const formattedDate = \`\${date.getFullYear()}-\${String(date.getMonth() + 1).padStart(2, '0')}-\${String(day).padStart(2, '0')}\`;
    setFormData({ id: null, title: '', date: formattedDate, time: '09:00', theme: 'blue', paciente_id: '', valor: '0', observacoes: '', status: 'agendado' });
    setOpenModal(true);
  };

  const openEditModal = (e: any, event: any) => {
    e.stopPropagation(); 
    const d = new Date(event.data_hora);
    setFormData({
        id: event.id, title: event.procedimento, date: d.toISOString().split('T')[0], time: d.toTimeString().slice(0, 5),
        theme: event.cor || 'blue', paciente_id: event.paciente_id, valor: event.valor || '0', observacoes: event.observacoes || '', status: event.status || 'agendado'
    });
    setOpenModal(true);
  }

  // AÇÃO DE SALVAR E CONCLUIR
  async function saveOrUpdate(overrideStatus?: string) {
    if (!formData.title || !formData.paciente_id) return alert('Preencha paciente e procedimento');
    setLoading(true);

    const finalStatus = overrideStatus || formData.status;
    let finalTheme = formData.theme;

    // Se marcar como concluído, vira cinza/grafite (slate)
    if (finalStatus === 'concluido') finalTheme = 'gray';
    // Se cancelar, vira vermelho
    if (finalStatus === 'cancelado') finalTheme = 'red';
    // Se voltar para agendado, recupera a cor original do serviço ou azul
    if (finalStatus === 'agendado' && overrideStatus) {
        // Tenta achar a cor original do serviço pelo nome
        const servicoOriginal = servicos.find(s => s.nome === formData.title);
        finalTheme = servicoOriginal ? servicoOriginal.cor : 'blue';
    }

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
    fetchEvents(); 
    setLoading(false);
  }

  // SELEÇÃO DO SERVIÇO (Puxa cor automática)
  const handleServiceSelect = (e: any) => {
    const servicoId = e.target.value;
    if (!servicoId) return;
    const servico = servicos.find(s => s.id == servicoId);
    if (servico) {
        setFormData(prev => ({ 
            ...prev, 
            title: servico.nome, 
            valor: servico.valor,
            theme: servico.cor || 'blue' // Puxa a cor do cadastro
        }));
    }
  }

  // MAPA DE CORES (Estilo Novo)
  const colorStyles: any = {
    blue:   'bg-blue-50 border-l-4 border-l-blue-500 text-blue-700',
    teal:   'bg-teal-50 border-l-4 border-l-teal-500 text-teal-700',
    purple: 'bg-purple-50 border-l-4 border-l-purple-500 text-purple-700',
    rose:   'bg-rose-50 border-l-4 border-l-rose-500 text-rose-700',
    orange: 'bg-orange-50 border-l-4 border-l-orange-500 text-orange-700',
    indigo: 'bg-indigo-50 border-l-4 border-l-indigo-500 text-indigo-700',
    red:    'bg-red-50 border-l-4 border-l-red-500 text-red-700 opacity-60 line-through', // Cancelado
    gray:   'bg-slate-100 border-l-4 border-l-slate-500 text-slate-500 opacity-75 grayscale', // Concluído (Cinza)
  };

  return (
    <div className="antialiased sans-serif bg-slate-50 h-full flex flex-col animate-fade-in pb-20 md:pb-0">
      <div className="container mx-auto px-2 py-4 md:px-4 md:py-10">
        <div className="bg-white rounded-t-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2"><span className="text-lg md:text-xl font-bold text-slate-800">{MONTH_NAMES[date.getMonth()]}</span><span className="text-lg md:text-xl text-slate-500 font-normal">{date.getFullYear()}</span></div>
            <div className="flex gap-2"><button onClick={handlePrevMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-200"><ChevronLeft size={20} /></button><button onClick={() => setDate(new Date())} className="px-3 py-2 rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-200 text-sm font-bold">Hoje</button><button onClick={handleNextMonth} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 border border-slate-200"><ChevronRight size={20} /></button></div>
        </div>
        
        {/* GRADE */}
        <div className="bg-white shadow-sm rounded-b-xl border-x border-b border-slate-200 overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">{DAYS.map(d => <div key={d} className="py-3 text-center text-xs md:text-sm font-bold text-slate-500 uppercase tracking-wide">{d}</div>)}</div>
            <div className="grid grid-cols-7">
                {blankDays.map((_, i) => <div key={\`blank-\${i}\`} className="h-24 md:h-40 border-b border-r border-slate-100 bg-slate-50/30"></div>)}
                {dayArray.map(day => {
                    const currentDayStr = \`\${date.getFullYear()}-\${String(date.getMonth()+1).padStart(2,'0')}-\${String(day).padStart(2,'0')}\`;
                    const dayEvents = events.filter(e => e.data_hora.startsWith(currentDayStr) && e.status !== 'cancelado');
                    const isToday = new Date().toISOString().split('T')[0] === currentDayStr;
                    return (
                        <div key={day} onClick={() => openDateModal(day)} className={\`h-24 md:h-40 border-b border-r border-slate-100 p-1 md:p-2 relative cursor-pointer hover:bg-slate-50 transition-colors group \${isToday ? 'bg-teal-50/30' : ''}\`}>
                            <span className={\`w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-full text-xs md:text-sm font-bold mb-1 \${isToday ? 'bg-teal-600 text-white shadow-sm shadow-teal-200' : 'text-slate-700'}\`}>{day}</span>
                            
                            {/* EVENTOS COM DESIGN NOVO */}
                            <div className="space-y-1 overflow-y-auto max-h-[calc(100%-1.5rem)] no-scrollbar pt-1">
                                {dayEvents.map(ev => {
                                    // Define cor com base no status ou tema
                                    let corKey = ev.cor || 'blue';
                                    if(ev.status === 'concluido') corKey = 'gray'; // Força cinza se concluido
                                    
                                    const styleClass = colorStyles[corKey] || colorStyles.blue;
                                    const hora = new Date(ev.data_hora).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
                                    
                                    return (
                                        <div key={ev.id} onClick={(e) => openEditModal(e, ev)} className={\`px-2 py-1 rounded text-[10px] md:text-xs truncate font-medium shadow-sm hover:brightness-95 transition-all \${styleClass}\`}>
                                            <span className="font-bold mr-1 opacity-80">{hora}</span>
                                            {ev.pacientes?.nome.split(' ')[0]}
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

      {/* MODAL */}
      {openModal && (
        <div className="fixed z-50 inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-800 text-lg">{formData.id ? 'Detalhes' : 'Agendar'}</h3>
                    <button onClick={() => setOpenModal(false)} className="text-slate-400 hover:text-red-500 transition-colors"><X size={24}/></button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                    
                    {/* BOTOES DE STATUS - AGORA COM CINZA PARA CONCLUÍDO */}
                    {formData.id && ( 
                        <div className="flex gap-2 mb-2 p-2 bg-slate-50 rounded-lg border border-slate-100 justify-center">
                            <button type="button" onClick={() => saveOrUpdate('concluido')} className={\`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all \${formData.status === 'concluido' ? 'bg-slate-700 text-white ring-2 ring-slate-500' : 'bg-white text-slate-500 hover:bg-slate-200 border'}\`}>
                                <CheckCircle size={16}/> Concluir
                            </button>
                            <button type="button" onClick={() => saveOrUpdate('cancelado')} className={\`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition-all \${formData.status === 'cancelado' ? 'bg-red-100 text-red-700 ring-2 ring-red-500' : 'bg-white text-slate-500 hover:bg-red-50 hover:text-red-600 border'}\`}>
                                <XCircle size={16}/> Cancelar
                            </button>
                        </div> 
                    )}

                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Paciente</label><select value={formData.paciente_id} onChange={e => setFormData({...formData, paciente_id: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500"><option value="">Selecione...</option>{pacientes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
                    <div className="grid grid-cols-2 gap-4"><div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none" /></div><div><label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hora</label><input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none" /></div></div>
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Procedimento</label>
                        <select onChange={handleServiceSelect} className="w-full mb-2 bg-teal-50 border border-teal-100 rounded-lg text-sm p-2 text-teal-800 font-medium cursor-pointer hover:bg-teal-100 transition-colors">
                            <option value="">✨ Escolher Procedimento Salvo...</option>
                            {servicos.map(s => <option key={s.id} value={s.id}>{s.nome} - R$ {s.valor}</option>)}
                        </select>
                        <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ou digite manualmente..." className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-teal-500" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-1"><label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><DollarSign size={14}/> Valor (R$)</label><input type="number" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className="w-full bg-green-50 border border-green-200 text-green-800 font-bold rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-green-500" placeholder="0.00" /></div>
                        
                        {/* Seletor de Cor Manual (Caso queira mudar) */}
                        <div className="col-span-1">
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cor</label>
                             <div className="flex gap-1 h-[42px] items-center bg-slate-50 px-2 rounded-lg border border-slate-200">
                                {['blue', 'teal', 'purple', 'rose', 'orange', 'indigo'].map(c => (
                                    <button 
                                        key={c} type="button" 
                                        onClick={() => setFormData({...formData, theme: c})} 
                                        className={\`w-6 h-6 rounded-full transition-all bg-\${c === 'teal' ? 'teal' : c === 'purple' ? 'purple' : c === 'rose' ? 'rose' : c === 'orange' ? 'orange' : c === 'indigo' ? 'indigo' : 'blue'}-400 \${formData.theme === c ? 'ring-2 ring-offset-1 ring-slate-400 scale-125' : 'opacity-40 hover:opacity-100'}\`} 
                                    />
                                ))}
                             </div>
                        </div>
                    </div>

                    <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1"><FileText size={14}/> Observações</label><textarea rows={2} value={formData.observacoes} onChange={e => setFormData({...formData, observacoes: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 outline-none focus:ring-2 focus:ring-teal-500 text-sm" placeholder="Detalhes..." /></div>
                </div>
                <div className="bg-slate-50 px-6 py-4 flex justify-between items-center border-t border-slate-100"><button onClick={() => setOpenModal(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg">Cancelar</button><button onClick={() => saveOrUpdate()} disabled={loading} className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900 transition-transform active:scale-95 flex items-center gap-2">{loading && <Loader2 size={16} className="animate-spin"/>} Salvar</button></div>
            </div>
        </div>
      )}
    </div>
  );
}
`;

salvarArquivo('app/configuracoes/page.tsx', configPage);
salvarArquivo('app/agenda/page.tsx', agendaPage);

console.log('🎉 TUDO PRONTO! Cores e Status Cinza Ativados.');