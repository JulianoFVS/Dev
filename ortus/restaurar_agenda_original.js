const fs = require('fs');
const path = require('path');

console.log('🔙 RESTAURANDO AGENDA ORIGINAL (V64 - Visual Limpo)...');

function salvarArquivo(caminhoRelativo, conteudo) {
    const caminhoCompleto = path.join(__dirname, caminhoRelativo);
    fs.writeFileSync(caminhoCompleto, conteudo.trim());
    console.log(`✅ Agenda Restaurada: ${caminhoRelativo}`);
}

const agendaPage = `
'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, X, Loader2, MapPin } from 'lucide-react';

export default function Agenda() {
  const [dataAtual, setDataAtual] = useState(new Date());
  const [agendamentos, setAgendamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  
  // Variáveis para o Novo Agendamento
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [profissionais, setProfissionais] = useState<any[]>([]);
  
  // ESTADO DA CLÍNICA
  const [clinicaId, setClinicaId] = useState<string | null>(null);
  const [nomeClinica, setNomeClinica] = useState('');

  const [novoAgendamento, setNovoAgendamento] = useState({
      paciente_id: '',
      profissional_id: '',
      data: new Date().toISOString().split('T')[0],
      hora: '09:00',
      procedimento: 'Avaliação',
      observacoes: ''
  });

  // Carrega a clínica selecionada no localStorage
  useEffect(() => {
      const idSalvo = localStorage.getItem('ortus_clinica_id');
      setClinicaId(idSalvo);
      carregarDados(idSalvo);
  }, [dataAtual]); 

  async function carregarDados(idDaClinica: string | null) {
      setLoading(true);
      
      const ano = dataAtual.getFullYear();
      const mes = dataAtual.getMonth();
      const inicioMes = new Date(ano, mes, 1).toISOString();
      const fimMes = new Date(ano, mes + 1, 0, 23, 59, 59).toISOString();

      // 1. Buscando Agendamentos (COM FILTRO DE CLÍNICA)
      let query = supabase
          .from('agendamentos')
          .select('*, pacientes(nome), profissionais(nome)')
          .gte('data_hora', inicioMes)
          .lte('data_hora', fimMes);

      if (idDaClinica) {
          query = query.eq('clinica_id', idDaClinica);
          // Busca o nome da clínica só para exibir (opcional)
          const { data: c } = await supabase.from('clinicas').select('nome').eq('id', idDaClinica).single();
          if (c) setNomeClinica(c.nome);
      }

      const { data } = await query;
      setAgendamentos(data || []);

      // 2. Buscando Listas para o Modal
      const { data: pac } = await supabase.from('pacientes').select('id, nome').order('nome');
      const { data: prof } = await supabase.from('profissionais').select('id, nome').order('nome');
      
      setPacientes(pac || []);
      setProfissionais(prof || []);
      setLoading(false);
  }

  async function salvarAgendamento(e: any) {
      e.preventDefault();
      const dataHoraISO = \`\${novoAgendamento.data}T\${novoAgendamento.hora}:00\`;

      // Se não tiver clínica selecionada (modo admin geral), alerta ou define uma padrão
      if (!clinicaId) {
          alert("Por favor, selecione uma clínica no topo da página antes de agendar.");
          return;
      }

      const payload = {
          paciente_id: novoAgendamento.paciente_id,
          profissional_id: novoAgendamento.profissional_id,
          data_hora: dataHoraISO,
          procedimento: novoAgendamento.procedimento,
          observacoes: novoAgendamento.observacoes,
          status: 'agendado',
          clinica_id: clinicaId // VINCULA À CLÍNICA ATUAL
      };

      const { error } = await supabase.from('agendamentos').insert([payload]);

      if (error) alert('Erro: ' + error.message);
      else {
          setModalAberto(false);
          carregarDados(clinicaId);
          setNovoAgendamento({...novoAgendamento, observacoes: ''}); 
      }
  }

  const mudarMes = (direcao: number) => {
      const novaData = new Date(dataAtual.setMonth(dataAtual.getMonth() + direcao));
      setDataAtual(new Date(novaData));
  };

  const diasNoMes = new Date(dataAtual.getFullYear(), dataAtual.getMonth() + 1, 0).getDate();
  const primeiroDiaSemana = new Date(dataAtual.getFullYear(), dataAtual.getMonth(), 1).getDay();
  const dias = Array.from({ length: diasNoMes }, (_, i) => i + 1);
  const slotsVazios = Array.from({ length: primeiroDiaSemana }, (_, i) => i);

  return (
    <div className="max-w-7xl mx-auto pb-20 space-y-6 animate-fade-in">
      
      {/* HEADER ORIGINAL */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div>
              <h1 className="text-3xl font-black text-slate-800 flex items-center gap-2">
                  Agenda
                  {/* Indicador discreto da clínica atual */}
                  {nomeClinica && <span className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded-full border border-blue-100 flex items-center gap-1 font-bold"><MapPin size={12}/> {nomeClinica}</span>}
              </h1>
              <p className="text-slate-500 font-medium mt-1">Gerencie seus atendimentos.</p>
          </div>
          
          <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-100">
              <button onClick={() => mudarMes(-1)} className="p-3 hover:bg-white hover:shadow-md rounded-xl transition-all text-slate-500"><ChevronLeft size={20}/></button>
              <span className="font-black text-lg text-slate-700 w-40 text-center uppercase tracking-wide">
                  {dataAtual.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
              </span>
              <button onClick={() => mudarMes(1)} className="p-3 hover:bg-white hover:shadow-md rounded-xl transition-all text-slate-500"><ChevronRight size={20}/></button>
          </div>

          <button onClick={() => setModalAberto(true)} className="bg-blue-600 text-white px-6 py-4 rounded-2xl font-bold hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all active:scale-95 flex items-center gap-2">
              <Plus size={20}/> Novo Agendamento
          </button>
      </div>

      {/* CALENDÁRIO ORIGINAL */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="grid grid-cols-7 mb-4">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(dia => (
                  <div key={dia} className="text-center text-xs font-bold text-slate-400 uppercase tracking-wider py-2">{dia}</div>
              ))}
          </div>
          
          <div className="grid grid-cols-7 gap-2 md:gap-4">
              {slotsVazios.map(i => <div key={i} className="h-32 md:h-40 bg-slate-50/30 rounded-2xl border border-dashed border-slate-100"></div>)}
              
              {dias.map(dia => {
                  const dataDoDia = new Date(dataAtual.getFullYear(), dataAtual.getMonth(), dia).toISOString().split('T')[0];
                  // Filtro local permanece igual
                  const eventosDoDia = agendamentos.filter(a => a.data_hora.startsWith(dataDoDia));
                  const ehHoje = new Date().toISOString().split('T')[0] === dataDoDia;

                  return (
                      <div key={dia} className={\`h-32 md:h-40 border rounded-2xl p-2 relative transition-all group hover:border-blue-200 hover:shadow-md \${ehHoje ? 'bg-blue-50/30 border-blue-200' : 'bg-white border-slate-100'}\`}>
                          <span className={\`absolute top-2 right-2 text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full \${ehHoje ? 'bg-blue-600 text-white' : 'text-slate-400 group-hover:bg-slate-100'}\`}>{dia}</span>
                          
                          <div className="mt-6 space-y-1 overflow-y-auto max-h-[calc(100%-24px)] custom-scrollbar">
                              {loading ? (
                                  dia === 1 && <Loader2 className="animate-spin mx-auto mt-4 text-slate-300"/> 
                              ) : eventosDoDia.map(ev => (
                                  <div key={ev.id} className={\`text-[10px] md:text-xs p-1.5 rounded-lg border truncate font-bold flex items-center gap-1 \${ev.status === 'concluido' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-blue-50 text-blue-700 border-blue-100'}\`}>
                                      <div className={\`w-1.5 h-1.5 rounded-full \${ev.status === 'concluido' ? 'bg-green-500' : 'bg-blue-500'}\`}></div>
                                      {new Date(ev.data_hora).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})} {ev.pacientes?.nome.split(' ')[0]}
                                  </div>
                              ))}
                          </div>
                      </div>
                  );
              })}
          </div>
      </div>

      {/* MODAL ORIGINAL */}
      {modalAberto && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 relative">
                  <button onClick={() => setModalAberto(false)} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={20}/></button>
                  
                  <h2 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2"><CalendarIcon size={24} className="text-blue-600"/> Agendar Paciente</h2>
                  
                  <form onSubmit={salvarAgendamento} className="space-y-4">
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase ml-1">Paciente</label>
                          <select required className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" value={novoAgendamento.paciente_id} onChange={e => setNovoAgendamento({...novoAgendamento, paciente_id: e.target.value})}>
                              <option value="">Selecione...</option>
                              {pacientes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase ml-1">Profissional</label>
                          <select required className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" value={novoAgendamento.profissional_id} onChange={e => setNovoAgendamento({...novoAgendamento, profissional_id: e.target.value})}>
                              <option value="">Selecione...</option>
                              {profissionais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                          </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Data</label><input required type="date" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" value={novoAgendamento.data} onChange={e => setNovoAgendamento({...novoAgendamento, data: e.target.value})} /></div>
                          <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Hora</label><input required type="time" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" value={novoAgendamento.hora} onChange={e => setNovoAgendamento({...novoAgendamento, hora: e.target.value})} /></div>
                      </div>
                      <div><label className="text-xs font-bold text-slate-400 uppercase ml-1">Procedimento</label><input required className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" placeholder="Ex: Limpeza" value={novoAgendamento.procedimento} onChange={e => setNovoAgendamento({...novoAgendamento, procedimento: e.target.value})} /></div>
                      <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-[0.98] mt-2">Confirmar Agendamento</button>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
}
`;

salvarArquivo('app/agenda/page.tsx', agendaPage);


