'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Calendar, Clock, Plus, User, X, Loader2 } from 'lucide-react';

export default function Agenda() {
  const [agendamentos, setAgendamentos] = useState<any[]>([]);
  const [pacientes, setPacientes] = useState<any[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form
  const [pacienteId, setPacienteId] = useState('');
  const [dataHora, setDataHora] = useState('');
  const [procedimento, setProcedimento] = useState('');

  async function carregarDados() {
    // Busca agendamentos e "junta" com o nome do paciente
    const { data: agenda } = await supabase
      .from('agendamentos')
      .select('*, pacientes(nome, telefone)')
      .order('data_hora', { ascending: true });
    
    if (agenda) setAgendamentos(agenda);

    // Busca lista de pacientes para o select
    const { data: pac } = await supabase.from('pacientes').select('id, nome');
    if (pac) setPacientes(pac);
  }

  async function salvarAgendamento(e: any) {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from('agendamentos').insert([
      { paciente_id: pacienteId, data_hora: dataHora, procedimento }
    ]);

    if (error) {
      alert('Erro: ' + error.message);
    } else {
      setModalAberto(false);
      setProcedimento('');
      carregarDados();
    }
    setLoading(false);
  }

  // Formatar data para ficar bonito (Ex: 30/01 às 14:00)
  const formatarData = (dataIso: string) => {
    const data = new Date(dataIso);
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  useEffect(() => { carregarDados(); }, []);

  return (
    <div className="max-w-4xl mx-auto animate-fade-in space-y-6">
      
      {/* Cabeçalho */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Calendar className="text-teal-600" /> Agenda
          </h2>
          <p className="text-slate-400 text-sm">Próximos compromissos</p>
        </div>
        <button onClick={() => setModalAberto(true)} className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-3 rounded-xl font-medium transition-transform active:scale-95 flex items-center gap-2">
          <Plus size={20}/> Agendar
        </button>
      </div>

      {/* Lista de Agendamentos */}
      <div className="space-y-3">
        {agendamentos.length === 0 && (
          <div className="text-center p-10 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            Nenhum agendamento encontrado.
          </div>
        )}

        {agendamentos.map((item) => (
          <div key={item.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-teal-200 transition-colors">
            <div className="flex items-center gap-4">
              <div className="bg-teal-50 p-3 rounded-lg text-center min-w-[70px]">
                <p className="text-xs text-teal-600 font-bold uppercase">{new Date(item.data_hora).toLocaleString('pt-BR', { weekday: 'short' }).replace('.', '')}</p>
                <p className="text-xl font-bold text-teal-800">{new Date(item.data_hora).getDate()}</p>
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">{item.pacientes?.nome || 'Paciente removido'}</h3>
                <p className="text-slate-500 text-sm flex items-center gap-1">
                  <Clock size={14}/> {new Date(item.data_hora).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})} 
                  <span className="mx-2">•</span> 
                  {item.procedimento}
                </p>
              </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
               <a href={'https://wa.me/55' + item.pacientes?.telefone?.replace(/[^0-9]/g, '')} target="_blank" className="text-xs font-bold text-green-600 bg-green-50 px-3 py-2 rounded-lg hover:bg-green-100 flex-1 text-center border border-green-200">
                 Confirmar no Zap
               </a>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-700">Novo Agendamento</h3>
              <button onClick={() => setModalAberto(false)}><X className="text-slate-400 hover:text-red-500" /></button>
            </div>
            
            <form onSubmit={salvarAgendamento} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Paciente</label>
                <select required value={pacienteId} onChange={e => setPacienteId(e.target.value)} className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none appearance-none">
                  <option value="">Selecione...</option>
                  {pacientes.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Data e Hora</label>
                <input required type="datetime-local" value={dataHora} onChange={e => setDataHora(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Procedimento</label>
                <input required type="text" placeholder="Ex: Limpeza, Manutenção..." value={procedimento} onChange={e => setProcedimento(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none" />
              </div>

              <button disabled={loading} className="w-full bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-teal-700 flex justify-center gap-2">
                {loading ? <Loader2 className="animate-spin"/> : 'Salvar na Agenda'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}