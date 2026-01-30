const fs = require('fs');
const path = require('path');

const code = `
'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { addDays, format, startOfWeek, addHours, isSameDay, parseISO, startOfHour } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalIcon, X, Loader2 } from 'lucide-react';

export default function AgendaVisual() {
  const [dataBase, setDataBase] = useState(new Date()); // Data de referência (hoje)
  const [agendamentos, setAgendamentos] = useState<any[]>([]);
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form
  const [pacienteId, setPacienteId] = useState('');
  const [dataHora, setDataHora] = useState('');
  const [procedimento, setProcedimento] = useState('');
  const [cor, setCor] = useState('blue');

  // Gera os dias da semana atual
  const inicioDaSemana = startOfWeek(dataBase, { weekStartsOn: 0 });
  const diasDaSemana = Array.from({ length: 7 }).map((_, i) => addDays(inicioDaSemana, i));
  const horarios = Array.from({ length: 11 }).map((_, i) => i + 8); // 08:00 até 18:00

  async function carregarDados() {
    // Busca agendamentos
    const { data: agenda } = await supabase
      .from('agendamentos')
      .select('*, pacientes(nome)')
      .gte('data_hora', inicioDaSemana.toISOString())
      .lte('data_hora', addDays(inicioDaSemana, 7).toISOString());
    
    if (agenda) setAgendamentos(agenda);

    // Busca pacientes para o select
    const { data: pac } = await supabase.from('pacientes').select('id, nome');
    if (pac) setPacientes(pac);
  }

  useEffect(() => { carregarDados(); }, [dataBase]);

  async function salvarAgendamento(e: any) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('agendamentos').insert([
      { paciente_id: pacienteId, data_hora: dataHora, procedimento, cor }
    ]);
    if (error) alert(error.message);
    else { setModalAberto(false); carregarDados(); }
    setLoading(false);
  }

  // Função para encontrar agendamento em um dia/hora específico
  const getAgendamento = (dia: Date, hora: number) => {
    return agendamentos.find(item => {
      const itemData = parseISO(item.data_hora);
      return isSameDay(itemData, dia) && itemData.getHours() === hora;
    });
  };

  const cores: any = {
    blue: 'bg-blue-100 border-blue-200 text-blue-700',
    green: 'bg-green-100 border-green-200 text-green-700',
    purple: 'bg-purple-100 border-purple-200 text-purple-700',
    rose: 'bg-rose-100 border-rose-200 text-rose-700',
  };

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-fade-in">
      
      {/* 1. TOPO: Navegação e Botão */}
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-700 capitalize">
            {format(dataBase, 'MMMM yyyy', { locale: ptBR })}
          </h2>
          <div className="flex bg-white rounded-lg border border-slate-200 shadow-sm">
            <button onClick={() => setDataBase(addDays(dataBase, -7))} className="p-2 hover:bg-slate-50 text-slate-600"><ChevronLeft size={18}/></button>
            <button onClick={() => setDataBase(new Date())} className="px-3 py-2 text-sm font-medium border-x border-slate-200 hover:bg-slate-50 text-slate-600">Hoje</button>
            <button onClick={() => setDataBase(addDays(dataBase, 7))} className="p-2 hover:bg-slate-50 text-slate-600"><ChevronRight size={18}/></button>
          </div>
        </div>
        <button onClick={() => setModalAberto(true)} className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 flex items-center gap-2 shadow-sm shadow-teal-200">
          <Plus size={18} /> Novo Agendamento
        </button>
      </div>

      {/* 2. O CALENDÁRIO VISUAL (Grid) */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[800px]">
          {/* Cabeçalho dos Dias */}
          <div className="grid grid-cols-8 border-b border-slate-100 bg-slate-50 sticky top-0 z-10">
            <div className="p-4 text-xs font-medium text-slate-400 text-center uppercase border-r border-slate-100">Horário</div>
            {diasDaSemana.map((dia, i) => (
              <div key={i} className={\`p-3 text-center border-r border-slate-100 \${isSameDay(dia, new Date()) ? 'bg-teal-50/50' : ''}\`}>
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">{format(dia, 'EEE', { locale: ptBR })}</p>
                <p className={\`text-xl font-bold \${isSameDay(dia, new Date()) ? 'text-teal-600' : 'text-slate-700'}\`}>{format(dia, 'd')}</p>
              </div>
            ))}
          </div>

          {/* Corpo do Grid */}
          <div className="relative">
            {horarios.map((hora) => (
              <div key={hora} className="grid grid-cols-8 border-b border-slate-50 h-24">
                {/* Coluna da Hora */}
                <div className="text-xs text-slate-400 font-medium p-2 text-center border-r border-slate-100 relative -top-3">
                  {hora}:00
                </div>

                {/* Células dos Dias */}
                {diasDaSemana.map((dia, i) => {
                  const agendamento = getAgendamento(dia, hora);
                  return (
                    <div key={i} className="border-r border-slate-100 relative p-1 group hover:bg-slate-50 transition-colors">
                      {agendamento ? (
                        <div className={\`w-full h-full rounded-lg p-2 text-xs border-l-4 shadow-sm cursor-pointer hover:brightness-95 transition-all \${cores[agendamento.cor] || cores.blue}\`}>
                          <p className="font-bold truncate">{agendamento.pacientes?.nome}</p>
                          <p className="opacity-80 truncate">{agendamento.procedimento}</p>
                        </div>
                      ) : (
                        <button 
                          onClick={() => {
                            const dataClicada = new Date(dia);
                            dataClicada.setHours(hora);
                            dataClicada.setMinutes(0);
                            // Ajuste fuso horário simples para input local
                            const isoString = new Date(dataClicada.getTime() - (dataClicada.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                            setDataHora(isoString);
                            setModalAberto(true);
                          }}
                          className="w-full h-full hidden group-hover:flex items-center justify-center text-teal-600/30"
                        >
                          <Plus size={20} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL (Formulário) */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl animate-in zoom-in duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <h3 className="font-bold text-slate-700">Agendar</h3>
              <button onClick={() => setModalAberto(false)}><X className="text-slate-400 hover:text-red-500" size={20}/></button>
            </div>
            
            <form onSubmit={salvarAgendamento} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Paciente</label>
                <select required value={pacienteId} onChange={e => setPacienteId(e.target.value)} className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none">
                  <option value="">Selecione...</option>
                  {pacientes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Data/Hora</label>
                    <input required type="datetime-local" value={dataHora} onChange={e => setDataHora(e.target.value)} className="w-full mt-1 p-2 border border-slate-200 rounded-lg outline-none text-sm" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Cor</label>
                    <select value={cor} onChange={e => setCor(e.target.value)} className="w-full mt-1 p-2 bg-white border border-slate-200 rounded-lg outline-none text-sm">
                        <option value="blue">Azul (Padrão)</option>
                        <option value="green">Verde (Pago)</option>
                        <option value="purple">Roxo (Cirurgia)</option>
                        <option value="rose">Rosa (Urgência)</option>
                    </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Procedimento</label>
                <input required placeholder="Ex: Manutenção" value={procedimento} onChange={e => setProcedimento(e.target.value)} className="w-full mt-1 p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>

              <button disabled={loading} className="w-full bg-teal-600 text-white py-2.5 rounded-lg font-bold hover:bg-teal-700 flex justify-center gap-2 mt-2">
                {loading ? <Loader2 className="animate-spin" /> : 'Salvar na Agenda'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync('app/agenda/page.tsx', code.trim());
console.log('✅ Agenda Visual Estilo "Google Calendar" Instalada!');