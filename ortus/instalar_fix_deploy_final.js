const fs = require('fs');
const path = require('path');

console.log('🚀 Instalando V32: Correção de Tipagem para Vercel (Agenda, Config e Pacientes)...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Corrigido: ${caminhoRelativo}`);
}

// ======================================================
// 1. CONFIGURAÇÕES (Corrigindo erro de 'never[]')
// ======================================================
const configPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, User, Tag, CheckSquare, Square, Loader2, Edit, X, Save, Shield, Mail, Lock, AlertCircle, Palette } from 'lucide-react';

export default function Configuracoes() {
  const [aba, setAba] = useState('servicos');
  // CORREÇÃO: Tipagem <any[]> adicionada
  const [dados, setDados] = useState<any[]>([]);
  const [clinicas, setClinicas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [editandoId, setEditandoId] = useState(null); 
  const [userIdAuth, setUserIdAuth] = useState(null); 

  const [novoServico, setNovoServico] = useState({ nome: '', valor: '', cor: 'blue' });
  const [novoProfissional, setNovoProfissional] = useState({ nome: '', cargo: '', nivel_acesso: 'padrao', email: '', password: '' });
  const [clinicasSelecionadas, setClinicasSelecionadas] = useState<any[]>([]); 

  const coresDisponiveis = [
    { nome: 'slate',   classe: 'bg-slate-500' }, { nome: 'gray',    classe: 'bg-gray-500' },
    { nome: 'zinc',    classe: 'bg-zinc-500' }, { nome: 'red',     classe: 'bg-red-500' },
    { nome: 'orange',  classe: 'bg-orange-500' }, { nome: 'amber',   classe: 'bg-amber-500' },
    { nome: 'yellow',  classe: 'bg-yellow-500' }, { nome: 'lime',    classe: 'bg-lime-500' },
    { nome: 'green',   classe: 'bg-green-500' }, { nome: 'emerald', classe: 'bg-emerald-500' },
    { nome: 'teal',    classe: 'bg-teal-500' }, { nome: 'cyan',    classe: 'bg-cyan-500' },
    { nome: 'sky',     classe: 'bg-sky-500' }, { nome: 'blue',    classe: 'bg-blue-500' },
    { nome: 'indigo',  classe: 'bg-indigo-500' }, { nome: 'violet',  classe: 'bg-violet-500' },
    { nome: 'purple',  classe: 'bg-purple-500' }, { nome: 'fuchsia', classe: 'bg-fuchsia-500' },
    { nome: 'pink',    classe: 'bg-pink-500' }, { nome: 'rose',    classe: 'bg-rose-500' }
  ];

  useEffect(() => { fetchClinicas(); carregarLista(); }, [aba]);

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
        const { data } = await supabase.from('profissionais').select('*, profissionais_clinicas(clinica_id, clinicas(nome))').order('nome');
        if (data) setDados(data);
    }
    setLoading(false);
  }

  function editarItem(item: any) {
      setEditandoId(item.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });

      if (aba === 'servicos') {
          setNovoServico({ nome: item.nome, valor: item.valor, cor: item.cor || 'blue' });
      } else {
          setUserIdAuth(item.user_id);
          setNovoProfissional({ 
              nome: item.nome, cargo: item.cargo, nivel_acesso: item.nivel_acesso, 
              email: item.email || '', password: '' 
          });
          const idsClinicas = item.profissionais_clinicas?.map((pc: any) => pc.clinica_id) || [];
          setClinicasSelecionadas(idsClinicas);
      }
  }

  function cancelarEdicao() {
      setEditandoId(null);
      setUserIdAuth(null);
      setNovoServico({ nome: '', valor: '', cor: 'blue' });
      setNovoProfissional({ nome: '', cargo: '', nivel_acesso: 'padrao', email: '', password: '' });
      setClinicasSelecionadas([]);
  }

  async function salvar(e: any) {
    e.preventDefault();
    setLoading(true);
    try {
        if (aba === 'servicos') {
            const payload = { ...novoServico, valor: parseFloat(novoServico.valor) };
            if (editandoId) await supabase.from('servicos').update(payload).eq('id', editandoId);
            else await supabase.from('servicos').insert([payload]);
            setNovoServico({ nome: '', valor: '', cor: 'blue' });
        } else {
            if (clinicasSelecionadas.length === 0) throw new Error('Selecione pelo menos uma clínica.');
            if (editandoId) {
                await fetch('/api/editar-usuario', { method: 'POST', body: JSON.stringify({ id: editandoId, user_id: userIdAuth, ...novoProfissional, clinicas: clinicasSelecionadas }) });
            } else {
                if (!novoProfissional.email || !novoProfissional.password) throw new Error('Email e Senha obrigatórios.');
                await fetch('/api/criar-usuario', { method: 'POST', body: JSON.stringify({ ...novoProfissional, clinicas: clinicasSelecionadas }) });
            }
            setNovoProfissional({ nome: '', cargo: '', nivel_acesso: 'padrao', email: '', password: '' });
            setClinicasSelecionadas([]);
        }
        cancelarEdicao();
        await carregarLista();
    } catch (err: any) {
        alert('Erro: ' + err.message);
    }
    setLoading(false);
  }

  async function excluir(id: any) {
    if(!confirm('ATENÇÃO: Excluir removerá o histórico. Confirmar?')) return;
    setLoading(true);
    const tabela = aba === 'servicos' ? 'servicos' : 'profissionais';
    await supabase.from(tabela).delete().eq('id', id);
    await carregarLista();
    setLoading(false);
  }

  function toggleClinica(id: any) {
      if (clinicasSelecionadas.includes(id)) setClinicasSelecionadas(prev => prev.filter(c => c !== id));
      else setClinicasSelecionadas(prev => [...prev, id]);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-20">
      <div className="flex gap-4 border-b border-slate-200">
          <button onClick={() => { setAba('servicos'); cancelarEdicao(); }} className={\`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors \${aba === 'servicos' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400'}\`}><Tag size={18}/> Procedimentos</button>
          <button onClick={() => { setAba('profissionais'); cancelarEdicao(); }} className={\`pb-3 px-4 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors \${aba === 'profissionais' ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400'}\`}><User size={18}/> Profissionais</button>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                {editandoId ? 'Editando Registro' : (aba === 'servicos' ? 'Novo Procedimento' : 'Novo Profissional')}
            </h2>
            {editandoId && <button onClick={cancelarEdicao} className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-red-100"><X size={14}/> Cancelar</button>}
        </div>

        <form onSubmit={salvar} className={\`p-5 rounded-xl border mb-6 space-y-4 transition-colors \${editandoId ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100'}\`}>
            <div className="flex flex-col md:flex-row gap-4 items-start">
                {aba === 'servicos' ? (
                    <>
                        <div className="flex-1 w-full"><label className="text-xs font-bold text-slate-400 mb-1 block">NOME</label><input required value={novoServico.nome} onChange={e => setNovoServico({...novoServico, nome: e.target.value})} className="w-full p-2.5 bg-white rounded-lg border border-slate-200 outline-blue-500 font-medium" placeholder="Ex: Limpeza"/></div>
                        <div className="w-32"><label className="text-xs font-bold text-slate-400 mb-1 block">VALOR (R$)</label><input required type="number" value={novoServico.valor} onChange={e => setNovoServico({...novoServico, valor: e.target.value})} className="w-full p-2.5 bg-white rounded-lg border border-slate-200 outline-blue-500 font-medium" placeholder="0.00"/></div>
                        
                        <div className="w-full md:w-auto">
                            <label className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1"><Palette size={12}/> COR</label>
                            <div className="flex flex-wrap gap-2 max-w-[280px]">
                                {coresDisponiveis.map(c => (
                                    <button key={c.nome} type="button" onClick={() => setNovoServico({...novoServico, cor: c.nome})} className={\`w-6 h-6 rounded-full \${c.classe} transition-all hover:scale-110 \${novoServico.cor === c.nome ? 'ring-2 ring-offset-2 ring-slate-400 scale-110 shadow-md' : 'opacity-70 hover:opacity-100'}\`} title={c.nome} />
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="w-full space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-slate-400">NOME</label><input required value={novoProfissional.nome} onChange={e => setNovoProfissional({...novoProfissional, nome: e.target.value})} className="w-full p-2.5 rounded border border-slate-200 outline-blue-500 bg-white" placeholder="Ex: Dr. Silva"/></div>
                            <div><label className="text-xs font-bold text-slate-400">CARGO</label><input required value={novoProfissional.cargo} onChange={e => setNovoProfissional({...novoProfissional, cargo: e.target.value})} className="w-full p-2.5 rounded border border-slate-200 outline-blue-500 bg-white" placeholder="Ex: Dentista"/></div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                            <div><label className="text-xs font-bold text-slate-400 flex items-center gap-1 mb-1"><Mail size={12}/> EMAIL</label><input required type="email" value={novoProfissional.email} onChange={e => setNovoProfissional({...novoProfissional, email: e.target.value})} className="w-full p-2.5 rounded border border-slate-200 outline-blue-500 font-medium"/></div>
                            <div><label className="text-xs font-bold text-slate-400 flex items-center gap-1 mb-1"><Lock size={12}/> SENHA {editandoId && '(Vazio = Não mudar)'}</label><input type="password" value={novoProfissional.password} onChange={e => setNovoProfissional({...novoProfissional, password: e.target.value})} className="w-full p-2.5 rounded border border-slate-200 outline-blue-500 font-medium" placeholder="******"/></div>
                        </div>
                        <div className="w-full"><label className="text-xs font-bold text-slate-400 flex items-center gap-1 mb-1"><Shield size={12}/> PERMISSÃO</label><select value={novoProfissional.nivel_acesso} onChange={e => setNovoProfissional({...novoProfissional, nivel_acesso: e.target.value})} className="w-full p-2.5 rounded border border-slate-200 outline-blue-500 bg-white"><option value="padrao">Padrão</option><option value="admin">Administrador</option></select></div>
                    </div>
                )}
            </div>

            {aba === 'profissionais' && (
                <div>
                    <label className="text-xs font-bold text-slate-400 block mb-2">ATENDE NAS CLÍNICAS:</label>
                    <div className="flex flex-wrap gap-2">{clinicas.map(c => { const isSelected = clinicasSelecionadas.includes(c.id); return (<button key={c.id} type="button" onClick={() => toggleClinica(c.id)} className={\`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all \${isSelected ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'}\`}>{isSelected ? <CheckSquare size={16}/> : <Square size={16}/>}{c.nome}</button>)})}</div>
                </div>
            )}

            <button disabled={loading} className={\`w-full text-white p-3.5 rounded-xl font-bold flex justify-center items-center gap-2 shadow-sm transition-colors \${editandoId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}\`}>
                {loading ? <Loader2 className="animate-spin"/> : (editandoId ? <><Save size={20}/> Salvar Alterações</> : <><Plus size={20}/> Cadastrar</>)}
            </button>
        </form>

        <div className="space-y-2">
            {dados.map((item: any) => (
                <div key={item.id} className={\`flex justify-between items-center p-4 border rounded-xl transition-all group \${editandoId === item.id ? 'bg-amber-50 border-amber-300 shadow-md ring-1 ring-amber-300' : 'bg-white border-slate-100 hover:border-blue-200 hover:shadow-sm'}\`}>
                    <div className="flex items-center gap-4">
                        {aba === 'servicos' && (
                            <div className={\`w-6 h-6 rounded-full shadow-sm border border-white ring-1 ring-slate-100 \${coresDisponiveis.find(c => c.nome === item.cor)?.classe || 'bg-blue-500'}\`}></div>
                        )}
                        <div>
                            <p className="font-bold text-slate-700 flex items-center gap-2 text-base">{item.nome}{item.nivel_acesso === 'admin' && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded border border-yellow-200 font-bold uppercase flex items-center gap-1"><Shield size={10}/> Admin</span>}</p>
                            <div className="text-xs text-slate-400 flex flex-wrap gap-1 mt-1 items-center">
                                {aba === 'servicos' ? \`R$ \${item.valor}\` : <span className="flex items-center gap-1"><Mail size={10}/> {item.email || 'Sem email'}</span>}
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => editarItem(item)} className="text-slate-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors" title="Editar"><Edit size={18}/></button>
                        <button onClick={() => excluir(item.id)} className="text-slate-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors" title="Excluir"><Trash2 size={18}/></button>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}
`;

// ======================================================
// 2. AGENDA (Corrigindo 'never' e listas)
// ======================================================
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
  
  // CORREÇÃO: <any[]> em tudo que é lista
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
          // CORREÇÃO: Tipagem para evitar erro no build
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

// ======================================================
// 3. PACIENTES (Corrigindo 'never' e Loader)
// ======================================================
const pacientesPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Search, Plus, Filter, LayoutGrid, List as ListIcon, 
    User, Phone, Calendar, FileText, Trash2, Edit, 
    ChevronRight, Activity, Clock, Loader2, X, Save, 
    MapPin, Mail, Hash, AlertCircle
} from 'lucide-react';
import Link from 'next/link';

export default function Pacientes() {
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [visualizacao, setVisualizacao] = useState('cards');
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');

  // Estado do Modal e Formulário
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<any>({
      id: null, nome: '', cpf: '', data_nascimento: '',
      telefone: '', email: '', endereco: '', observacoes: ''
  });

  useEffect(() => { carregarPacientes(); }, []);

  async function carregarPacientes() {
    setLoading(true);
    const { data } = await supabase
        .from('pacientes')
        .select('*, agendamentos(data_hora, status)')
        .order('created_at', { ascending: false });
    
    if (data) {
        const formatados = data.map(p => {
            const agendamentos = p.agendamentos || [];
            agendamentos.sort((a:any, b:any) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());
            const ultimoAgendamento = agendamentos[0];
            const statusCalculado = ultimoAgendamento 
                ? (new Date(ultimoAgendamento.data_hora) > new Date() ? 'agendado' : 'ativo')
                : 'novo';
            return { ...p, status: statusCalculado, ultimo_atendimento: ultimoAgendamento?.data_hora };
        });
        setPacientes(formatados);
    }
    setLoading(false);
  }

  function abrirModal(paciente: any = null) {
      if (paciente) {
          setForm({
              id: paciente.id,
              nome: paciente.nome || '',
              cpf: paciente.cpf || '',
              data_nascimento: paciente.data_nascimento || '',
              telefone: paciente.telefone || '',
              email: paciente.email || '',
              endereco: paciente.endereco || '',
              observacoes: paciente.observacoes || ''
          });
      } else {
          setForm({ id: null, nome: '', cpf: '', data_nascimento: '', telefone: '', email: '', endereco: '', observacoes: '' });
      }
      setModalAberto(true);
  }

  async function salvarPaciente(e: any) {
      e.preventDefault();
      setSalvando(true);

      const payload = {
          nome: form.nome,
          cpf: form.cpf,
          data_nascimento: form.data_nascimento || null,
          telefone: form.telefone,
          email: form.email,
          endereco: form.endereco,
          observacoes: form.observacoes
      };

      try {
          if (form.id) {
              const { error } = await supabase.from('pacientes').update(payload).eq('id', form.id);
              if (error) throw error;
          } else {
              const { error } = await supabase.from('pacientes').insert([payload]);
              if (error) throw error;
          }
          setModalAberto(false);
          carregarPacientes();
      } catch (error: any) {
          alert('Erro ao salvar: ' + error.message);
      }
      setSalvando(false);
  }

  async function excluirPaciente(id: any) {
      if (!confirm('Tem certeza? Isso apagará todo o histórico e agendamentos deste paciente.')) return;
      setLoading(true); 
      const { error } = await supabase.from('pacientes').delete().eq('id', id);
      if (error) alert('Erro ao excluir: ' + error.message);
      else await carregarPacientes();
      setLoading(false);
  }

  // --- FILTROS ---
  const pacientesFiltrados = pacientes.filter(p => {
      const termo = busca.toLowerCase();
      const bateBusca = p.nome.toLowerCase().includes(termo) || (p.cpf || '').includes(termo) || (p.telefone || '').includes(termo);
      const bateStatus = filtroStatus === 'todos' ? true : p.status === filtroStatus;
      return bateBusca && bateStatus;
  });

  const stats = {
      total: pacientes.length,
      novos: pacientes.filter(p => {
          const d = new Date(p.created_at); const h = new Date();
          return d.getMonth() === h.getMonth() && d.getFullYear() === h.getFullYear();
      }).length,
      ativos: pacientes.filter(p => p.status === 'ativo' || p.status === 'agendado').length
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Pacientes</h1>
            <p className="text-slate-500 font-medium">Cadastro e histórico completo.</p>
        </div>
        <button onClick={() => abrirModal()} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-95">
            <Plus size={20}/> Novo Paciente
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><span className="text-xs font-bold text-slate-400 uppercase">Total</span><p className="text-2xl font-black text-slate-800 mt-1">{stats.total}</p></div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><Activity size={12} className="text-green-500"/> Ativos</span><p className="text-2xl font-black text-slate-800 mt-1">{stats.ativos}</p></div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm"><span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><User size={12} className="text-blue-500"/> Novos (Mês)</span><p className="text-2xl font-black text-slate-800 mt-1">{stats.novos}</p></div>
      </div>

      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-2">
          <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-slate-400" size={20}/>
              <input type="text" placeholder="Buscar por nome, CPF ou telefone..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-50 border-transparent focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none font-medium transition-all" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
              <select className="px-4 py-2.5 rounded-xl bg-slate-50 text-sm font-bold text-slate-600 outline-none cursor-pointer hover:bg-slate-100 border-r-8 border-transparent" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
                  <option value="todos">Status: Todos</option><option value="ativo">Ativos</option><option value="novo">Novos</option><option value="agendado">Com Agendamento</option>
              </select>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button onClick={() => setVisualizacao('lista')} className={\`p-2 rounded-lg transition-all \${visualizacao === 'lista' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}\`}><ListIcon size={20}/></button>
                  <button onClick={() => setVisualizacao('cards')} className={\`p-2 rounded-lg transition-all \${visualizacao === 'cards' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}\`}><LayoutGrid size={20}/></button>
              </div>
          </div>
      </div>

      {loading ? (
          <div className="py-20 text-center text-slate-400 flex flex-col items-center"><Loader2 className="animate-spin mb-2" size={32}/> Carregando...</div>
      ) : pacientesFiltrados.length === 0 ? (
          <div className="py-20 text-center text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200"><User size={48} className="mx-auto mb-4 opacity-20"/><p className="font-bold text-lg">Nenhum paciente encontrado.</p></div>
      ) : (
          visualizacao === 'lista' ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100"><tr><th className="p-4 text-xs font-bold text-slate-400 uppercase pl-6">Nome</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Contato</th><th className="p-4 text-xs font-bold text-slate-400 uppercase hidden md:table-cell">Última Visita</th><th className="p-4 text-xs font-bold text-slate-400 uppercase">Status</th><th className="p-4 text-xs font-bold text-slate-400 uppercase text-right pr-6">Ações</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">{pacientesFiltrados.map(p => (<tr key={p.id} className="hover:bg-slate-50/80 transition-colors"><td className="p-4 pl-6"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">{p.nome.charAt(0)}</div><div><p className="font-bold text-slate-700">{p.nome}</p><p className="text-[10px] text-slate-400 font-medium">CPF: {p.cpf || '---'}</p></div></div></td><td className="p-4"><div className="text-sm text-slate-600"><Phone size={14} className="inline mr-1"/> {p.telefone || '-'}</div></td><td className="p-4 hidden md:table-cell text-sm text-slate-500">{p.ultimo_atendimento ? new Date(p.ultimo_atendimento).toLocaleDateString('pt-BR') : 'Nunca'}</td><td className="p-4"><StatusBadge status={p.status} /></td><td className="p-4 text-right pr-6 flex justify-end gap-2"><button onClick={() => abrirModal(p)} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"><Edit size={18}/></button><button onClick={() => excluirPaciente(p.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50"><Trash2 size={18}/></button></td></tr>))}</tbody>
                </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{pacientesFiltrados.map(p => (<div key={p.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative"><div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => abrirModal(p)} className="p-2 bg-white border rounded-full hover:text-blue-600"><Edit size={14}/></button><button onClick={() => excluirPaciente(p.id)} className="p-2 bg-white border rounded-full hover:text-red-600"><Trash2 size={14}/></button></div><div className="flex items-center gap-4 mb-4"><div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center font-black text-xl">{p.nome.charAt(0)}</div><div><h3 className="font-bold text-slate-800 text-lg truncate w-40">{p.nome}</h3><StatusBadge status={p.status} /></div></div><div className="space-y-2 mb-4"><div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 p-2 rounded-lg"><Phone size={14}/> {p.telefone || 'Sem telefone'}</div><div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 p-2 rounded-lg"><Clock size={14}/> Última: {p.ultimo_atendimento ? new Date(p.ultimo_atendimento).toLocaleDateString('pt-BR') : 'Nenhuma'}</div></div></div>))}</div>
          )
      )}

      {modalAberto && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in duration-200">
                <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                    <h3 className="font-black text-xl text-slate-800">{form.id ? 'Editar Paciente' : 'Novo Paciente'}</h3>
                    <button onClick={() => setModalAberto(false)} className="p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-50"><X size={20}/></button>
                </div>
                
                <form onSubmit={salvarPaciente} className="p-8 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-2 md:col-span-1 space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Nome Completo *</label><input required value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="Ex: João da Silva" /></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">CPF</label><input value={form.cpf} onChange={e => setForm({...form, cpf: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="000.000.000-00" /></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Data de Nascimento</label><input type="date" value={form.data_nascimento} onChange={e => setForm({...form, data_nascimento: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" /></div>
                        <div className="space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Telefone / WhatsApp *</label><input required value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="(00) 90000-0000" /></div>
                        <div className="col-span-2 space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Email</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="cliente@email.com" /></div>
                        <div className="col-span-2 space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Endereço Completo</label><input value={form.endereco} onChange={e => setForm({...form, endereco: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="Rua, Número, Bairro..." /></div>
                        <div className="col-span-2 space-y-1"><label className="text-xs font-bold text-slate-400 uppercase">Observações Médicas / Gerais</label><textarea value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none" placeholder="Alergias, histórico, preferências..." /></div>
                    </div>
                    <div className="pt-4 flex gap-4">
                        <button type="button" onClick={() => setModalAberto(false)} className="flex-1 py-3.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
                        <button type="submit" disabled={salvando} className="flex-1 bg-blue-600 text-white rounded-xl font-bold py-3.5 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex justify-center items-center gap-2">{salvando ? <Loader2 className="animate-spin"/> : <><Save size={20}/> Salvar Paciente</>}</button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: {status: any}) {
    const styles: any = { ativo: 'bg-green-100 text-green-700 border-green-200', novo: 'bg-blue-100 text-blue-700 border-blue-200', agendado: 'bg-purple-100 text-purple-700 border-purple-200', inativo: 'bg-slate-100 text-slate-500 border-slate-200' };
    const labels: any = { ativo: 'Cliente Ativo', novo: 'Novo Cadastro', agendado: 'Agendado', inativo: 'Inativo' };
    return <span className={\`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wide \${styles[status] || styles.inativo}\`}>{labels[status] || 'Desconhecido'}</span>;
}
`;

salvarArquivo('app/configuracoes/page.tsx', configPage);
salvarArquivo('app/agenda/page.tsx', agendaPage);
salvarArquivo('app/pacientes/page.tsx', pacientesPage);