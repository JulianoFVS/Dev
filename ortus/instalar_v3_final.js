const fs = require('fs');
const path = require('path');

console.log('🔵 Instalando V3: Multi-Vínculo, Correção de Bugs e Tema Azul Total...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Atualizado: ${caminhoRelativo}`);
}

// ==========================================
// 1. CONFIGURAÇÕES (Gestão de Profissionais Multi-Clínica)
// ==========================================
const configPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, User, Tag, CheckSquare, Square, Loader2, Building2 } from 'lucide-react';

export default function Configuracoes() {
  const [aba, setAba] = useState<'servicos' | 'profissionais'>('servicos');
  const [dados, setDados] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Forms
  const [novoServico, setNovoServico] = useState({ nome: '', valor: '' });
  const [novoProfissional, setNovoProfissional] = useState({ nome: '', cargo: '' });
  const [clinicasSelecionadas, setClinicasSelecionadas] = useState<number[]>([]); 

  useEffect(() => { 
      fetchClinicas();
      carregarLista();
  }, [aba]);

  async function fetchClinicas() {
      const { data } = await supabase.from('clinicas').select('*');
      if (data) setClinicas(data);
  }

  async function carregarLista() {
    setLoading(true);
    if (aba === 'servicos') {
        const { data } = await supabase.from('servicos').select('*').order('nome');
        if (data) setDados(data);
    } else {
        // Busca profissionais e as clinicas vinculadas (Many-to-Many)
        const { data } = await supabase.from('profissionais')
            .select('*, profissionais_clinicas(clinicas(nome))')
            .order('nome');
        if (data) setDados(data);
    }
    setLoading(false);
  }

  async function criar(e: any) {
    e.preventDefault();
    setLoading(true);

    if (aba === 'servicos') {
        await supabase.from('servicos').insert([{ nome: novoServico.nome, valor: parseFloat(novoServico.valor) }]);
        setNovoServico({ nome: '', valor: '' });
    } else {
        if (clinicasSelecionadas.length === 0) {
            alert('Selecione pelo menos uma clínica!');
            setLoading(false);
            return;
        }

        // 1. Cria o Profissional
        const { data: prof, error } = await supabase.from('profissionais')
            .insert([{ nome: novoProfissional.nome, cargo: novoProfissional.cargo }])
            .select()
            .single();
        
        if (error) { alert('Erro: ' + error.message); setLoading(false); return; }

        // 2. Cria os Vínculos
        const vinculos = clinicasSelecionadas.map(id => ({
            profissional_id: prof.id,
            clinica_id: id
        }));
        
        await supabase.from('profissionais_clinicas').insert(vinculos);

        setNovoProfissional({ nome: '', cargo: '' });
        setClinicasSelecionadas([]);
    }
    
    await carregarLista();
    setLoading(false);
  }

  async function excluir(id: number) {
    if(!confirm('Tem certeza?')) return;
    const tabela = aba === 'servicos' ? 'servicos' : 'profissionais';
    await supabase.from(tabela).delete().eq('id', id);
    carregarLista();
  }

  function toggleClinica(id: number) {
      if (clinicasSelecionadas.includes(id)) {
          setClinicasSelecionadas(prev => prev.filter(c => c !== id));
      } else {
          setClinicasSelecionadas(prev => [...prev, id]);
      }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-10">
      
      {/* Abas */}
      <div className="flex gap-4 border-b border-slate-200">
          <button onClick={() => setAba('servicos')} className={\`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors \${aba === 'servicos' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400'}\`}>
              <Tag size={18}/> Procedimentos
          </button>
          <button onClick={() => setAba('profissionais')} className={\`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors \${aba === 'profissionais' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400'}\`}>
              <User size={18}/> Profissionais
          </button>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            {aba === 'servicos' ? 'Catálogo de Preços' : 'Cadastro de Equipe'}
        </h2>

        {/* FORMULÁRIO */}
        <form onSubmit={criar} className="bg-slate-50 p-5 rounded-xl border border-slate-100 mb-6 space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-end">
                {aba === 'servicos' ? (
                    <>
                        <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400">NOME</label><input required value={novoServico.nome} onChange={e => setNovoServico({...novoServico, nome: e.target.value})} className="w-full p-2 rounded border border-slate-200 outline-blue-500" placeholder="Ex: Limpeza"/></div>
                        <div className="w-32"><label className="text-xs font-bold text-slate-400">VALOR (R$)</label><input required type="number" value={novoServico.valor} onChange={e => setNovoServico({...novoServico, valor: e.target.value})} className="w-full p-2 rounded border border-slate-200 outline-blue-500" placeholder="0.00"/></div>
                    </>
                ) : (
                    <>
                        <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400">NOME PROFISSIONAL</label><input required value={novoProfissional.nome} onChange={e => setNovoProfissional({...novoProfissional, nome: e.target.value})} className="w-full p-2 rounded border border-slate-200 outline-blue-500" placeholder="Ex: Dr. Silva"/></div>
                        <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400">CARGO / ESP.</label><input required value={novoProfissional.cargo} onChange={e => setNovoProfissional({...novoProfissional, cargo: e.target.value})} className="w-full p-2 rounded border border-slate-200 outline-blue-500" placeholder="Ex: Ortodontista"/></div>
                    </>
                )}
            </div>

            {/* SELEÇÃO DE CLÍNICAS (Checkboxes) */}
            {aba === 'profissionais' && (
                <div>
                    <label className="text-xs font-bold text-slate-400 block mb-2">ATENDE NAS CLÍNICAS:</label>
                    <div className="flex flex-wrap gap-2">
                        {clinicas.map(c => {
                            const isSelected = clinicasSelecionadas.includes(c.id);
                            return (
                                <button 
                                    key={c.id} 
                                    type="button"
                                    onClick={() => toggleClinica(c.id)}
                                    className={\`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all \${isSelected ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'}\`}
                                >
                                    {isSelected ? <CheckSquare size={16}/> : <Square size={16}/>}
                                    {c.nome}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            <button disabled={loading} className="w-full bg-blue-600 text-white p-3 rounded-lg font-bold hover:bg-blue-700 flex justify-center items-center gap-2 shadow-sm">
                {loading ? <Loader2 className="animate-spin"/> : <Plus size={20}/>} Cadastrar
            </button>
        </form>

        {/* LISTA DE REGISTROS */}
        <div className="space-y-2">
            {loading && dados.length === 0 && <p className="text-center text-slate-400">Carregando...</p>}
            
            {dados.map((item: any) => (
                <div key={item.id} className="flex justify-between items-center p-3 border border-slate-100 rounded-lg hover:border-blue-200 transition-colors bg-white">
                    <div>
                        <p className="font-bold text-slate-700">{item.nome}</p>
                        <div className="text-xs text-slate-400 flex flex-wrap gap-1 mt-1 items-center">
                            {aba === 'servicos' ? \`R$ \${item.valor}\` : item.cargo}
                            
                            {/* Lista as Clínicas Vinculadas */}
                            {aba === 'profissionais' && item.profissionais_clinicas?.map((pc: any, idx: number) => (
                                <span key={idx} className="flex items-center gap-1 bg-slate-50 text-slate-600 px-1.5 rounded border border-slate-200 text-[10px]">
                                    <Building2 size={10}/> {pc.clinicas?.nome}
                                </span>
                            ))}
                        </div>
                    </div>
                    <button onClick={() => excluir(item.id)} className="text-slate-300 hover:text-red-500 p-2"><Trash2 size={18}/></button>
                </div>
            ))}
            
            {!loading && dados.length === 0 && <p className="text-center text-slate-400 py-4">Nenhum registro encontrado.</p>}
        </div>
      </div>
    </div>
  );
}
`;

// ==========================================
// 2. AGENDA (Lógica Multi-Clínica + Cores Azuis)
// ==========================================
const agendaPage = `
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
import { Plus, X, Loader2, CheckCircle, XCircle, MapPin, User, Building2 } from 'lucide-react';

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
  const [profissionaisFiltrados, setProfissionaisFiltrados] = useState<any[]>([]);

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
    const clinicaSalva = typeof window !== 'undefined' ? localStorage.getItem('ortus_clinica_atual') : 'todas';
    if (clinicaSalva) setClinicaFiltro(clinicaSalva);
    if (window.innerWidth < 768) setView(Views.DAY);
    fetchDados();
  }, []);

  useEffect(() => { carregarEventos(); }, [clinicaFiltro]);

  // Filtra profissionais disponíveis quando muda a clínica no modal
  useEffect(() => {
      if (!formData.clinica_id) {
          setProfissionaisFiltrados([]);
      } else {
          // Lógica vital: Filtra quem tem vínculo com a clínica selecionada
          const filtrados = profissionais.filter((p: any) => 
              p.profissionais_clinicas?.some((vinculo: any) => vinculo.clinica_id == formData.clinica_id)
          );
          setProfissionaisFiltrados(filtrados);
      }
  }, [formData.clinica_id, profissionais]);


  async function fetchDados() {
    const { data: cl } = await supabase.from('clinicas').select('*');
    if (cl) setClinicas(cl);
    
    // Busca profissionais com seus vínculos
    const { data: pr } = await supabase.from('profissionais').select('*, profissionais_clinicas(clinica_id)');
    if (pr) setProfissionais(pr);

    const { data: pac } = await supabase.from('pacientes').select('id, nome').order('nome');
    if (pac) setPacientes(pac);
    
    const { data: serv } = await supabase.from('servicos').select('*').order('nome');
    if (serv) setServicos(serv);
  }

  async function carregarEventos() {
    let query = supabase.from('agendamentos').select('*, pacientes(nome), clinicas(nome, cor_tema)');
    
    if (clinicaFiltro !== 'todas') {
        query = query.eq('clinica_id', clinicaFiltro);
    }

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
    } else {
        setEvents([]);
    }
  }

  const handleSelectSlot = useCallback(({ start }: { start: Date }) => {
    const d = new Date(start);
    const preClinica = clinicaFiltro !== 'todas' ? clinicaFiltro : '';
    setFormData(prev => ({ 
        ...prev, id: null, title: '', date: d.toISOString().split('T')[0], time: d.toTimeString().slice(0, 5), 
        status: 'agendado', desconto: '0', valor: '0', clinica_id: preClinica 
    }));
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

  const eventStyleGetter = (event: any) => {
    const status = event.resource.status;
    let bg = '#3b82f6'; // Azul
    let color = 'white';
    let border = 'none';

    if (status === 'cancelado') {
        bg = '#fee2e2'; color = '#ef4444'; border = '1px solid #fca5a5';
    } else if (status === 'concluido') {
        bg = '#f1f5f9'; color = '#64748b'; border = '1px solid #cbd5e1';
    } else {
        bg = '#eff6ff'; color = '#2563eb'; border = '1px solid #bfdbfe';
    }

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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in duration-200">
                <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">{formData.id ? 'Editar' : 'Novo'}</h3>
                    <button onClick={() => setOpenModal(false)}><X size={20} className="text-slate-400 hover:text-red-500"/></button>
                </div>
                
                <div className="p-6 space-y-4 overflow-y-auto">
                    {formData.id && ( <div className="flex gap-2 justify-center pb-2 border-b border-slate-100"><button onClick={() => saveOrUpdate('concluido')} className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-slate-200"><CheckCircle size={16}/> Concluir</button><button onClick={() => saveOrUpdate('cancelado')} className="flex-1 bg-red-50 text-red-600 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-red-100"><XCircle size={16}/> Cancelar</button></div> )}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1"><MapPin size={12}/> Clínica</label>
                            <select value={formData.clinica_id} onChange={e => setFormData({...formData, clinica_id: e.target.value})} className="w-full p-2.5 bg-blue-50/50 border border-slate-200 rounded-lg font-medium text-sm outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">Selecione...</option>
                                {clinicas.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1 mb-1"><User size={12}/> Profissional</label>
                            <select value={formData.profissional_id} onChange={e => setFormData({...formData, profissional_id: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-medium text-sm outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">Qualquer um...</option>
                                {profissionaisFiltrados.map((p: any) => <option key={p.id} value={p.id}>{p.nome} - {p.cargo}</option>)}
                            </select>
                        </div>
                    </div>

                    <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Paciente</label><select value={formData.paciente_id} onChange={e => setFormData({...formData, paciente_id: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg font-medium outline-none focus:ring-2 focus:ring-blue-500"><option value="">Selecione...</option>{pacientes.map((p: any) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
                    <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Data</label><input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg font-medium outline-none focus:ring-2 focus:ring-blue-500" /></div><div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Hora</label><input type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg font-medium outline-none focus:ring-2 focus:ring-blue-500" /></div></div>
                    
                    <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Procedimento</label><select onChange={(e) => { const s = servicos.find(x => x.id == e.target.value); if(s) setFormData(p => ({...p, title: s.nome, valor: s.valor})) }} className="w-full p-2 bg-blue-50 border-none rounded-lg text-sm mb-2 font-semibold text-blue-700 outline-none"><option value="">✨ Selecionar do Catálogo...</option>{servicos.map((s: any) => <option key={s.id} value={s.id}>{s.nome} - R$ {s.valor}</option>)}</select><input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg font-medium outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ou digite o nome..."/></div>
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100"><div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1">Valor (R$)</label><input type="number" value={formData.valor} onChange={e => setFormData({...formData, valor: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg font-bold text-slate-700 outline-none"/></div><div><label className="text-[10px] font-bold text-slate-400 uppercase mb-1">Desconto (R$)</label><input type="number" value={formData.desconto} onChange={e => setFormData({...formData, desconto: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg font-bold text-red-500 outline-none"/></div><div className="col-span-2 text-right border-t border-slate-200 pt-2"><span className="text-xs font-bold text-slate-500 mr-2">TOTAL FINAL:</span><span className="text-lg font-black text-blue-600">R$ {(parseFloat(formData.valor || '0') - parseFloat(formData.desconto || '0')).toFixed(2)}</span></div></div>
                    <div><label className="text-xs font-bold text-slate-500 uppercase mb-1">Observações</label><textarea value={formData.observacoes} onChange={e => setFormData({...formData, observacoes: e.target.value})} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" rows={2}></textarea></div>
                </div>
                
                <div className="p-4 border-t bg-slate-50 flex justify-end gap-2"><button onClick={() => setOpenModal(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button><button onClick={() => saveOrUpdate()} disabled={loading} className="px-6 py-2 bg-blue-900 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-black transition-colors shadow-lg">{loading && <Loader2 className="animate-spin" size={16}/>} Salvar</button></div>
            </div>
        </div>
      )}
    </div>
  );
}
`;

salvarArquivo('app/configuracoes/page.tsx', configPage);
salvarArquivo('app/agenda/page.tsx', agendaPage);