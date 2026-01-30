const fs = require('fs');
const path = require('path');

console.log('🔵 Aplicando Tema Azul e Redesign da Agenda...');

function salvarArquivo(caminho, conteudo) {
    const fullPath = path.join(__dirname, caminho);
    fs.writeFileSync(fullPath, conteudo.trim());
    console.log(`✅ ${caminho} atualizado.`);
}

// 1. AGENDA AZUL (Estética Bonita + Filtro Automático)
const agendaAzul = `
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
import { Plus, X, Loader2, CheckCircle, XCircle, DollarSign, MapPin, User, Search } from 'lucide-react';

const locales = { 'pt-BR': ptBR };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });
const messages = { allDay: 'Dia inteiro', previous: '<', next: '>', today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia', agenda: 'Lista', date: 'Data', time: 'Hora', event: 'Evento', noEventsInRange: 'Sem agendamentos.' };

export default function Agenda() {
  const [events, setEvents] = useState<any[]>([]);
  const [view, setView] = useState(Views.WEEK);
  const [date, setDate] = useState(new Date());
  
  // Listas
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [servicos, setServicos] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);

  // Filtro Global
  const [clinicaFiltro, setClinicaFiltro] = useState<string>('todas');

  // Modal
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ 
    id: null, title: '', date: '', time: '08:00', theme: 'blue', 
    paciente_id: '', valor: '0', desconto: '0', observacoes: '', status: 'agendado',
    clinica_id: '', profissional_id: ''
  });

  useEffect(() => {
    // 1. Verifica localStorage para definir filtro inicial
    const clinicaSalva = typeof window !== 'undefined' ? localStorage.getItem('ortus_clinica_atual') : 'todas';
    if (clinicaSalva) setClinicaFiltro(clinicaSalva);
    
    // 2. Responsividade
    if (window.innerWidth < 768) setView(Views.DAY);
    
    fetchDados();
  }, []);

  useEffect(() => { carregarEventos(); }, [clinicaFiltro]);

  async function fetchDados() {
    const { data: cl } = await supabase.from('clinicas').select('*');
    if (cl) setClinicas(cl);
    const { data: pr } = await supabase.from('profissionais').select('*');
    if (pr) setProfissionais(pr);
    const { data: pac } = await supabase.from('pacientes').select('id, nome').order('nome');
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
            title: \`\${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome} - \${e.procedimento}\`,
            start: new Date(e.data_hora),
            end: new Date(new Date(e.data_hora).getTime() + 60*60*1000),
            resource: e
        }));
        setEvents(fmt);
    }
  }

  const eventStyleGetter = (event: any) => {
    const status = event.resource.status;
    let bg = '#3b82f6'; // Azul Padrão (Blue-500)
    let border = 'none';
    let color = 'white';

    if (status === 'cancelado') {
        bg = '#fee2e2'; // Red-100
        color = '#ef4444'; // Red-500
        border = '1px solid #fca5a5';
    } else if (status === 'concluido') {
        bg = '#f1f5f9'; // Slate-100
        color = '#64748b'; // Slate-500
        border = '1px solid #cbd5e1';
    } else {
        // Agendado (Azul forte ou cor da clinica)
        bg = '#eff6ff'; // Blue-50
        color = '#2563eb'; // Blue-600
        border = '1px solid #bfdbfe'; // Blue-200
        // Se quiser usar cor da clinica, descomente:
        // const map: any = { teal: '#ccfbf1', purple: '#f3e8ff' };
        // if(event.resource.clinicas?.cor_tema) bg = map[event.resource.clinicas.cor_tema] || bg;
    }

    return { style: { backgroundColor: bg, color: color, border: border, borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', padding: '2px 4px' } };
  };

  // ... (Funções saveOrUpdate, handleSelectSlot, handleSelectEvent IGUAIS AO ANTERIOR, mas omitidas aqui para brevidade do script. O importante é o estilo acima)
  // Vou reincluir a lógica mínima para funcionar
  
  const handleSelectSlot = useCallback(({ start }: { start: Date }) => {
    const d = new Date(start);
    setFormData(prev => ({ ...prev, id: null, title: '', date: d.toISOString().split('T')[0], time: d.toTimeString().slice(0, 5), status: 'agendado', desconto: '0', valor: '0', clinica_id: clinicaFiltro !== 'todas' ? clinicaFiltro : '' }));
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
      if (!formData.title || !formData.paciente_id || !formData.clinica_id) return alert('Preencha os campos obrigatórios');
      setLoading(true);
      const finalStatus = overrideStatus || formData.status;
      const valorNum = parseFloat(formData.valor) || 0;
      const descontoNum = parseFloat(formData.desconto) || 0;
      
      const payload = {
          paciente_id: formData.paciente_id, clinica_id: formData.clinica_id, profissional_id: formData.profissional_id || null,
          data_hora: \`\${formData.date}T\${formData.time}:00\`, procedimento: formData.title, cor: 'blue',
          valor: valorNum, desconto: descontoNum, valor_final: valorNum - descontoNum, observacoes: formData.observacoes, status: finalStatus
      };
  
      if (formData.id) await supabase.from('agendamentos').update(payload).eq('id', formData.id);
      else await supabase.from('agendamentos').insert([payload]);
      
      setOpenModal(false); carregarEventos(); setLoading(false);
    }

  return (
    <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-2rem)] p-4 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col">
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
        <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800">Agenda</h2>
            <select value={clinicaFiltro} onChange={e => setClinicaFiltro(e.target.value)} className="text-sm font-semibold text-blue-700 bg-blue-50 border-none rounded-lg p-2 outline-none cursor-pointer hover:bg-blue-100 transition-colors">
                <option value="todas">Todas as Clínicas</option>
                {clinicas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
        </div>
        <button onClick={() => { setOpenModal(true); setFormData(prev => ({...prev, id: null})); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-2 text-sm shadow-md shadow-blue-200 transition-all"><Plus size={18}/> Novo</button>
      </div>
      
      <div className="flex-1 text-xs md:text-sm font-medium">
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
            <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in duration-200">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">{formData.id ? 'Editar' : 'Novo'}</h3>
                    <button onClick={() => setOpenModal(false)}><X size={20} className="text-slate-400 hover:text-red-500"/></button>
                </div>
                
                <div className="p-6 space-y-4 overflow-y-auto">
                    {formData.id && ( <div className="flex gap-2 justify-center pb-2 border-b border-slate-100"><button onClick={() => saveOrUpdate('concluido')} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-slate-200"><CheckCircle size={16}/> Concluir</button><button onClick={() => saveOrUpdate('cancelado')} className="flex-1 bg-red-50 text-red-600 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-red-100"><XCircle size={16}/> Cancelar</button></div> )}

                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1"><MapPin size={12}/> Clínica</label><select value={formData.clinica_id} onChange={e => setFormData({...formData, clinica_id: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-sm outline-none focus:ring-2 focus:ring-blue-500"><option value="">Selecione...</option>{clinicas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1"><User size={12}/> Profissional</label><select value={formData.profissional_id} onChange={e => setFormData({...formData, profissional_id: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-sm outline-none focus:ring-2 focus:ring-blue-500"><option value="">Qualquer um...</option>{profissionais.filter(p => !formData.clinica_id || p.clinica_id == formData.clinica_id).map((p: any) => <option key={p.id} value={p.id}>{p.nome} - {p.cargo}</option>)}</select></div>
                    </div>

                    <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Paciente</label><select value={formData.paciente_id} onChange={e => setFormData({...formData, paciente_id: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg font-medium outline-none focus:ring-2 focus:ring-blue-500"><option value="">Selecione...</option>{pacientes.map((p: any) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
                    <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Data</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg font-medium outline-none" /></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Hora</label><input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg font-medium outline-none" /></div></div>
                    
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase mb-1">Procedimento</label>
                        <select onChange={(e) => { const s = servicos.find(x => x.id == e.target.value); if(s) setFormData(p => ({...p, title: s.nome, valor: s.valor})) }} className="w-full p-2 bg-blue-50 border-none rounded-lg text-sm mb-2 font-semibold text-blue-700 outline-none"><option value="">✨ Selecionar do Catálogo...</option>{servicos.map((s: any) => <option key={s.id} value={s.id}>{s.nome} - R$ {s.valor}</option>)}</select>
                        <input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg font-medium" placeholder="Ou digite o nome..."/>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1">Valor (R$)</label><input type="number" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg font-bold text-slate-700 outline-none"/></div>
                        <div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1">Desconto (R$)</label><input type="number" value={formData.desconto} onChange={e => setFormData({...formData, desconto: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg font-bold text-red-500 outline-none"/></div>
                        <div className="col-span-2 text-right border-t border-slate-200 pt-2"><span className="text-xs font-bold text-slate-500 mr-2">TOTAL FINAL:</span><span className="text-lg font-black text-blue-600">R$ {(parseFloat(formData.valor || '0') - parseFloat(formData.desconto || '0')).toFixed(2)}</span></div>
                    </div>

                    <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Observações</label><textarea value={formData.observacoes} onChange={e => setFormData({...formData, observacoes: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm" rows={2}></textarea></div>
                </div>
                
                <div className="p-4 border-t bg-slate-50 flex justify-end gap-2">
                    <button onClick={() => setOpenModal(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
                    <button onClick={() => saveOrUpdate()} disabled={loading} className="px-6 py-2 bg-blue-900 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-black transition-colors shadow-lg">{loading && <Loader2 className="animate-spin" size={16}/>} Salvar</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
`;

// 2. FINANCEIRO AZUL (Entradas = Azul, Saídas = Vermelho)
// O código é similar ao V2, mas com cores trocadas (emerald -> blue)
const financeiroAzul = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { DollarSign, TrendingUp, TrendingDown, Filter, ArrowDownCircle, ArrowUpCircle, Trash2, RefreshCw } from 'lucide-react';

export default function Financeiro() {
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [resumo, setResumo] = useState({ entradas: 0, saidas: 0, saldo: 0 });
  const [loading, setLoading] = useState(false);
  const [mes, setMes] = useState(new Date().getMonth());
  const [ano, setAno] = useState(new Date().getFullYear());
  const [novoLancamento, setNovoLancamento] = useState({ descricao: '', valor: '', data: new Date().toISOString().split('T')[0], tipo: 'saida' });

  useEffect(() => { carregarDados(); }, [mes, ano]);

  async function carregarDados() {
    setLoading(true);
    const i = new Date(ano, mes, 1);
    const f = new Date(ano, mes + 1, 0);
    const inicioISO = new Date(i.setHours(0,0,0,0)).toISOString();
    const fimISO = new Date(f.setHours(23,59,59,999)).toISOString();

    const { data: agendamentos } = await supabase.from('agendamentos').select('id, procedimento, valor_final, data_hora, pacientes(nome)').eq('status', 'concluido').gte('data_hora', inicioISO).lte('data_hora', fimISO);
    const { data: manuais } = await supabase.from('despesas').select('*').gte('data', inicioISO).lte('data', fimISO);

    const listaAgendamentos = agendamentos?.map((e: any) => ({ id: e.id, tipo: 'entrada', descricao: \`\${Array.isArray(e.pacientes) ? e.pacientes[0]?.nome : e.pacientes?.nome} - \${e.procedimento}\`, valor: Number(e.valor_final || 0), data: e.data_hora, origem: 'agendamento' })) || [];
    const listaManuais = manuais?.map((s: any) => ({ id: s.id, tipo: s.tipo_transacao || 'saida', descricao: s.descricao, valor: Number(s.valor), data: s.data, origem: 'manual' })) || [];

    const tudo = [...listaAgendamentos, ...listaManuais].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    const totalEnt = tudo.filter(t => t.tipo === 'entrada').reduce((acc, item) => acc + item.valor, 0);
    const totalSai = tudo.filter(t => t.tipo === 'saida').reduce((acc, item) => acc + item.valor, 0);

    setTransacoes(tudo);
    setResumo({ entradas: totalEnt, saidas: totalSai, saldo: totalEnt - totalSai });
    setLoading(false);
  }

  async function salvarLancamento(e: any) {
    e.preventDefault();
    if (!novoLancamento.descricao || !novoLancamento.valor) return;
    await supabase.from('despesas').insert([{ descricao: novoLancamento.descricao, valor: parseFloat(novoLancamento.valor), data: novoLancamento.data, tipo_transacao: novoLancamento.tipo }]);
    setNovoLancamento({ ...novoLancamento, descricao: '', valor: '' });
    carregarDados();
  }

  async function excluirItem(id: number, origem: string) {
    if (!confirm('Tem certeza?')) return;
    if (origem === 'manual') await supabase.from('despesas').delete().eq('id', id);
    else await supabase.from('agendamentos').update({ status: 'agendado', cor: 'blue' }).eq('id', id);
    carregarDados();
  }

  return (
    <div className="space-y-6 animate-fade-in pb-20 max-w-6xl mx-auto">
      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><DollarSign className="text-blue-600"/> Financeiro</h2>
        <div className="flex gap-2 items-center">
             <select value={mes} onChange={e => setMes(Number(e.target.value))} className="p-2 border rounded-lg bg-slate-50 font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">{['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
             <select value={ano} onChange={e => setAno(Number(e.target.value))} className="p-2 border rounded-lg bg-slate-50 font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"><option value={2025}>2025</option><option value={2026}>2026</option></select>
             <button onClick={carregarDados} className="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 rounded-lg hover:bg-blue-50 transition-colors"><RefreshCw size={18}/></button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 shadow-sm"><p className="text-blue-700 font-bold text-xs uppercase tracking-wider flex items-center gap-2"><TrendingUp size={16}/> Receitas</p><p className="text-3xl font-extrabold text-blue-800 mt-2">R$ {resumo.entradas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p></div>
        <div className="bg-red-50 p-6 rounded-2xl border border-red-100 shadow-sm"><p className="text-red-700 font-bold text-xs uppercase tracking-wider flex items-center gap-2"><TrendingDown size={16}/> Despesas</p><p className="text-3xl font-extrabold text-red-800 mt-2">R$ {resumo.saidas.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p></div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><p className="text-slate-500 font-bold text-xs uppercase tracking-wider">Saldo Líquido</p><p className={\`text-3xl font-extrabold mt-2 \${resumo.saldo >= 0 ? 'text-slate-800' : 'text-red-600'}\`}>R$ {resumo.saldo.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 sticky top-4">
                <h3 className="font-bold text-slate-800 mb-4 text-lg">Lançamento</h3>
                <div className="flex bg-slate-100 p-1 rounded-lg mb-4">
                    <button onClick={() => setNovoLancamento({...novoLancamento, tipo: 'entrada'})} className={\`flex-1 py-1.5 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 \${novoLancamento.tipo === 'entrada' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}\`}><ArrowUpCircle size={16}/> Entrada</button>
                    <button onClick={() => setNovoLancamento({...novoLancamento, tipo: 'saida'})} className={\`flex-1 py-1.5 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 \${novoLancamento.tipo === 'saida' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}\`}><ArrowDownCircle size={16}/> Saída</button>
                </div>
                <form onSubmit={salvarLancamento} className="space-y-3">
                    <input value={novoLancamento.descricao} onChange={e => setNovoLancamento({...novoLancamento, descricao: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-400 font-medium" placeholder="Descrição" required />
                    <div className="grid grid-cols-2 gap-3">
                        <input type="number" value={novoLancamento.valor} onChange={e => setNovoLancamento({...novoLancamento, valor: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-400 font-bold" placeholder="R$ 0,00" required />
                        <input type="date" value={novoLancamento.data} onChange={e => setNovoLancamento({...novoLancamento, data: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-slate-400 text-sm font-medium" required />
                    </div>
                    <button type="submit" className={\`w-full text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2 \${novoLancamento.tipo === 'entrada' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}\`}>Confirmar</button>
                </form>
            </div>
        </div>
        <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center"><h3 className="font-bold text-slate-700 flex items-center gap-2"><Filter size={16}/> Extrato</h3><span className="text-xs text-slate-400 font-bold">{transacoes.length} lançamentos</span></div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left"><tbody className="divide-y divide-slate-100">{transacoes.map((t) => (<tr key={t.tipo + t.id} className="hover:bg-slate-50 transition-colors group"><td className="px-4 py-4 text-slate-500 font-medium whitespace-nowrap w-24">{new Date(t.data).toLocaleDateString('pt-BR')}</td><td className="px-4 py-4 font-semibold text-slate-700">{t.descricao} {t.origem === 'agendamento' && <span className="ml-2 text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full border border-indigo-100 uppercase tracking-wide">Consulta</span>}</td><td className={\`px-4 py-4 text-right font-bold w-32 \${t.tipo === 'entrada' ? 'text-blue-600' : 'text-red-600'}\`}>{t.tipo === 'entrada' ? '+' : '-'} R$ {t.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td><td className="px-4 py-4 text-center w-12"><button onClick={() => excluirItem(t.id, t.origem)} className="text-slate-300 hover:text-red-500 transition-colors p-2"><Trash2 size={16} /></button></td></tr>))}</tbody></table>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
`;

salvarArquivo('app/agenda/page.tsx', agendaAzul);
salvarArquivo('app/financeiro/page.tsx', financeiroAzul);