'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AlertCircle, Calendar, CheckCircle, Clock, DollarSign, ExternalLink, Loader2, Phone, Smile, User, X } from 'lucide-react';

type PatientSlideOverContextValue = {
  openPatient: (patientId: string | number | null | undefined) => void;
  closePatient: () => void;
};

type Appointment = {
  id: string | number;
  data_hora: string;
  procedimento?: string | null;
  status?: string | null;
  valor?: number | string | null;
  valor_final?: number | string | null;
};

type PatientData = {
  id: string | number;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  cpf?: string | null;
  data_nascimento?: string | null;
  ficha_medica?: any;
  clinicas?: { nome?: string | null } | { nome?: string | null }[] | null;
  agendamentos?: Appointment[] | null;
};

type ProsthesisItem = {
  id?: string | number;
  tipo?: string | null;
  tipo_protese?: string | null;
  nome?: string | null;
  status?: string | null;
  etapa?: string | null;
  descricao?: string | null;
};

const PatientSlideOverContext = createContext<PatientSlideOverContextValue | null>(null);

function currency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateTime(value?: string | null) {
  if (!value) return '--';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function getClinicName(patient: PatientData | null) {
  const clinic = patient?.clinicas;
  if (Array.isArray(clinic)) return clinic[0]?.nome || 'Sem clínica';
  return clinic?.nome || 'Sem clínica';
}

function getProsthesisItems(patient: PatientData | null) {
  const ficha = patient?.ficha_medica || {};
  const candidates = [ficha.proteses, ficha.proteses_status, ficha.protesesStatus, ficha.kanban_proteses];
  const list = candidates.find(Array.isArray);
  return Array.isArray(list) ? list.slice(0, 3) : [];
}

export function PatientSlideOverProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [openedAt, setOpenedAt] = useState(0);
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [kanbanProstheses, setKanbanProstheses] = useState<ProsthesisItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const closePatient = useCallback(() => {
    setOpen(false);
  }, []);

  const openPatient = useCallback(async (patientId: string | number | null | undefined) => {
    if (!patientId) return;
    setOpen(true);
    setLoading(true);
    setOpenedAt(Date.now());
    setError(null);
    setPatient(null);
    setKanbanProstheses([]);

    const { data, error } = await supabase
      .from('pacientes')
      .select('*, clinicas(nome), agendamentos(id, data_hora, procedimento, status, valor, valor_final)')
      .eq('id', patientId)
      .single();

    if (error) {
      setError(error.message);
      setPatient(null);
    } else {
      setPatient(data as PatientData);
      if (data?.nome) {
        const { data: cards } = await supabase
          .from('kanban_cartoes')
          .select('id, tipo_protese, descricao, coluna_id, data_entrega, valor')
          .eq('paciente_nome', data.nome)
          .limit(5);

        if (cards?.length) {
          const colunaIds = [...new Set(cards.map((card: any) => card.coluna_id).filter(Boolean))];
          let columnMap: Record<string, string> = {};

          if (colunaIds.length) {
            const { data: columns } = await supabase
              .from('kanban_colunas')
              .select('id, titulo')
              .in('id', colunaIds);

            columnMap = (columns || []).reduce((acc: Record<string, string>, column: any) => {
              acc[String(column.id)] = column.titulo;
              return acc;
            }, {});
          }

          setKanbanProstheses(cards.map((card: any) => ({
            ...card,
            etapa: columnMap[String(card.coluna_id)] || 'Em produção',
          })));
        }
      }
    }

    setLoading(false);
  }, []);

  const value = useMemo(() => ({ openPatient, closePatient }), [openPatient, closePatient]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closePatient();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, closePatient]);

  const appointments = useMemo(() => {
    const list = [...(patient?.agendamentos || [])];
    return list.sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime());
  }, [patient]);

  const nextAppointment = appointments.find((item) => new Date(item.data_hora).getTime() >= openedAt && item.status !== 'cancelado');
  const debtAppointments = appointments.filter((item) => item.status === 'fiado');
  const openBalance = debtAppointments.reduce((sum, item) => sum + Number(item.valor_final || item.valor || 0), 0);
  const prosthesisItems = kanbanProstheses.length ? kanbanProstheses : getProsthesisItems(patient);

  async function receiveOpenBalance() {
    if (!debtAppointments.length) return;
    setReceiving(true);
    const ids = debtAppointments.map((item) => item.id);
    const { error } = await supabase.from('agendamentos').update({ status: 'concluido' }).in('id', ids);

    if (!error) {
      setPatient((current) => current ? {
        ...current,
        agendamentos: (current.agendamentos || []).map((item) => ids.includes(item.id) ? { ...item, status: 'concluido' } : item),
      } : current);
    } else {
      alert('Não foi possível receber: ' + error.message);
    }

    setReceiving(false);
  }

  return (
    <PatientSlideOverContext.Provider value={value}>
      {children}
      {open && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <button aria-label="Fechar visão do paciente" className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={closePatient} />
          <aside className="relative h-full w-full max-w-md bg-white shadow-2xl border-l border-slate-200 animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-5 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 shrink-0">
                    <User size={22} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-blue-600">Visão 360º</p>
                    <h2 className="text-xl font-black text-slate-900 truncate">{patient?.nome || 'Paciente'}</h2>
                    <p className="text-xs font-bold text-slate-400 truncate">{getClinicName(patient)}</p>
                  </div>
                </div>
                <button onClick={closePatient} className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 bg-slate-50/60">
              {loading && (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <Loader2 className="animate-spin text-blue-600" size={28} />
                  <span className="text-sm font-bold">Carregando paciente...</span>
                </div>
              )}

              {!loading && error && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 flex gap-3">
                  <AlertCircle size={20} className="shrink-0" />
                  <div>
                    <p className="font-black text-sm">Não foi possível abrir o paciente</p>
                    <p className="text-xs mt-1">{error}</p>
                  </div>
                </div>
              )}

              {!loading && !error && patient && (
                <>
                  <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-black text-slate-800">Resumo rápido</h3>
                      <span className="text-[10px] font-black uppercase text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">Contextual</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] font-black uppercase text-slate-400">WhatsApp</p>
                        <p className="font-bold text-slate-700 truncate flex items-center gap-1.5 mt-1"><Phone size={13} />{patient.telefone || 'Não informado'}</p>
                      </div>
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] font-black uppercase text-slate-400">Cadastro</p>
                        <p className="font-bold text-slate-700 mt-1">{patient.cpf ? 'Completo' : 'Incompleto'}</p>
                      </div>
                    </div>
                  </section>

                  <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 flex items-center gap-1.5"><DollarSign size={13} />Saldo financeiro</p>
                        <p className={`text-3xl font-black mt-1 ${openBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{currency(openBalance)}</p>
                        <p className="text-xs text-slate-400 font-medium mt-1">{debtAppointments.length > 0 ? `${debtAppointments.length} débito(s) em aberto` : 'Nenhum débito em aberto'}</p>
                      </div>
                      <button onClick={receiveOpenBalance} disabled={openBalance <= 0 || receiving} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors">
                        {receiving ? 'Recebendo...' : 'Receber'}
                      </button>
                    </div>
                  </section>

                  <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 flex items-center gap-1.5 mb-3"><Calendar size={13} />Próximo agendamento</p>
                    {nextAppointment ? (
                      <div className="flex gap-3 items-start">
                        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Clock size={18} /></div>
                        <div className="min-w-0">
                          <p className="font-black text-slate-800 truncate">{nextAppointment.procedimento || 'Consulta'}</p>
                          <p className="text-sm font-bold text-slate-500 mt-0.5">{dateTime(nextAppointment.data_hora)}</p>
                          <span className="inline-flex mt-2 text-[10px] font-black uppercase bg-blue-50 text-blue-700 px-2 py-1 rounded-lg">{nextAppointment.status || 'agendado'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center text-sm font-bold text-slate-400">Nenhum próximo agendamento</div>
                    )}
                  </section>

                  <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-pink-600 flex items-center gap-1.5 mb-3"><Smile size={13} />Status de próteses</p>
                    {prosthesisItems.length > 0 ? (
                      <div className="space-y-2">
                        {prosthesisItems.map((item: any, index: number) => (
                          <div key={`${item.id || item.tipo || index}`} className="p-3 rounded-2xl bg-pink-50/60 border border-pink-100 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-black text-slate-800 text-sm truncate">{item.tipo || item.tipo_protese || item.nome || 'Prótese'}</p>
                              <p className="text-xs font-bold text-pink-700 truncate">{item.status || item.etapa || 'Em acompanhamento'}</p>
                            </div>
                            <CheckCircle size={16} className="text-pink-500 shrink-0" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center text-sm font-bold text-slate-400">Nenhuma prótese vinculada</div>
                    )}
                  </section>
                </>
              )}
            </div>

            {patient && (
              <div className="p-4 border-t border-slate-100 bg-white flex gap-3">
                <Link href={`/pacientes/${patient.id}`} className="flex-1 px-4 py-3 rounded-2xl bg-slate-900 text-white text-sm font-black text-center hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
                  Abrir ficha completa <ExternalLink size={15} />
                </Link>
              </div>
            )}
          </aside>
        </div>
      )}
    </PatientSlideOverContext.Provider>
  );
}

export function usePatientSlideOver() {
  const context = useContext(PatientSlideOverContext);
  if (!context) throw new Error('usePatientSlideOver deve ser usado dentro de PatientSlideOverProvider');
  return context;
}
