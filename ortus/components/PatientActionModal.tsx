'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AlertCircle, ArrowLeft, Calendar, CheckCircle2, DollarSign, FileText, FolderOpen, Loader2, Smile, X } from 'lucide-react';
import AppointmentForm from '@/components/forms/AppointmentForm';
import ProsthesisForm from '@/components/forms/ProsthesisForm';
import TreatmentForm from '@/components/forms/TreatmentForm';

type PatientActionModalContextValue = {
  openPatientActions: (patientId: string | number | null | undefined) => void;
  closePatientActions: () => void;
};

type Appointment = {
  id: string | number;
  data_hora: string;
  status?: string | null;
  valor?: number | string | null;
  valor_final?: number | string | null;
};

type PatientData = {
  id: string | number;
  nome?: string | null;
  telefone?: string | null;
  cpf?: string | null;
  clinica_id?: string | null;
  clinicas?: { nome?: string | null } | { nome?: string | null }[] | null;
  agendamentos?: Appointment[] | null;
};

type ActiveFlow = 'idle' | 'agendamento' | 'protese' | 'tratamento';

const PatientActionModalContext = createContext<PatientActionModalContextValue | null>(null);

function currency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getClinicName(patient: PatientData | null) {
  const clinic = patient?.clinicas;
  if (Array.isArray(clinic)) return clinic[0]?.nome || 'Sem clínica';
  return clinic?.nome || 'Sem clínica';
}

function getInitials(name?: string | null) {
  if (!name) return 'PT';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

const FLOW_META: Record<Exclude<ActiveFlow, 'idle'>, { title: string; subtitle: string; gradient: string }> = {
  agendamento: { title: 'Novo Agendamento', subtitle: 'Reserve um horário sem sair da página.', gradient: 'from-blue-50 to-white' },
  protese: { title: 'Nova Prótese', subtitle: 'Pedido com checklist automático.', gradient: 'from-pink-50 to-white' },
  tratamento: { title: 'Novo Tratamento', subtitle: 'Registro rápido na ficha do paciente.', gradient: 'from-emerald-50 to-white' },
};

export function PatientActionModalProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFlow, setActiveFlow] = useState<ActiveFlow>('idle');
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'info' } | null>(null);

  const closePatientActions = useCallback(() => {
    setOpen(false);
    setActiveFlow('idle');
  }, []);

  const openPatientActions = useCallback(async (patientId: string | number | null | undefined) => {
    if (!patientId) return;
    setOpen(true);
    setActiveFlow('idle');
    setLoading(true);
    setError(null);
    setPatient(null);

    const { data, error } = await supabase
      .from('pacientes')
      .select('id, nome, telefone, cpf, clinica_id, clinicas(nome), agendamentos(id, data_hora, status, valor, valor_final)')
      .eq('id', patientId)
      .single();

    if (error) {
      setError(error.message);
    } else {
      setPatient(data as PatientData);
    }

    setLoading(false);
  }, []);

  const value = useMemo(() => ({ openPatientActions, closePatientActions }), [openPatientActions, closePatientActions]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (activeFlow !== 'idle') setActiveFlow('idle');
        else closePatientActions();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, activeFlow, closePatientActions]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const debtAppointments = useMemo(() => {
    return (patient?.agendamentos || []).filter((item) => item.status === 'fiado');
  }, [patient]);

  const openBalance = useMemo(() => {
    return debtAppointments.reduce((sum, item) => sum + Number(item.valor_final || item.valor || 0), 0);
  }, [debtAppointments]);

  function openFichaCompleta() {
    if (!patient) return;
    closePatientActions();
    router.push(`/pacientes/${patient.id}`);
  }

  function flowSuccess(message: string) {
    setToast({ message, tone: 'success' });
    setOpen(false);
    setActiveFlow('idle');
  }

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
      setToast({ message: 'Saldo recebido. Lançamentos quitados.', tone: 'success' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ortus:agenda-changed'));
      }
    } else {
      alert('Não foi possível receber: ' + error.message);
    }

    setReceiving(false);
  }

  const flowMeta = activeFlow !== 'idle' ? FLOW_META[activeFlow] : null;

  return (
    <PatientActionModalContext.Provider value={value}>
      {children}

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/30 animate-in fade-in">
          <button aria-label="Fechar" className="absolute inset-0" onClick={closePatientActions} />
          <div className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
            <div className={`p-5 border-b border-slate-100 bg-gradient-to-br ${flowMeta?.gradient || 'from-blue-50 to-white'} flex items-start justify-between gap-4 shrink-0`}>
              <div className="flex items-center gap-3 min-w-0">
                {activeFlow !== 'idle' ? (
                  <button onClick={() => setActiveFlow('idle')} className="w-11 h-11 rounded-2xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 flex items-center justify-center shrink-0 transition-colors" aria-label="Voltar">
                    <ArrowLeft size={18} />
                  </button>
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 shrink-0 font-black text-lg tracking-wider">
                    {loading ? <Loader2 className="animate-spin" size={22} /> : getInitials(patient?.nome)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    {activeFlow === 'idle' ? 'Ações rápidas' : flowMeta?.title}
                  </p>
                  <h2 className="text-xl font-black text-slate-900 truncate">{patient?.nome || (loading ? 'Carregando...' : 'Paciente')}</h2>
                  <p className="text-xs font-bold text-slate-400 truncate">
                    {activeFlow === 'idle' ? getClinicName(patient) : flowMeta?.subtitle}
                  </p>
                </div>
              </div>
              <button onClick={closePatientActions} className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                <X size={20} />
              </button>
            </div>

            {activeFlow === 'idle' && (
              <>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
                  {error && (
                    <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 flex gap-3">
                      <AlertCircle size={20} className="shrink-0" />
                      <div>
                        <p className="font-black text-sm">Não foi possível abrir o paciente</p>
                        <p className="text-xs mt-1">{error}</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={openFichaCompleta}
                      disabled={loading || !patient}
                      className="group sm:col-span-2 p-5 rounded-3xl bg-slate-900 text-white text-left hover:bg-black transition-all shadow-lg shadow-slate-200 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                          <FolderOpen size={20} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-wider opacity-70">Recomendado</p>
                          <p className="font-black text-base">Abrir ficha completa</p>
                          <p className="text-xs opacity-70 mt-0.5">Dados, anamnese, odontograma e documentos.</p>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => setActiveFlow('agendamento')}
                      disabled={loading || !patient}
                      className="p-4 rounded-3xl border-2 border-blue-100 bg-blue-50/40 text-blue-800 text-left hover:bg-blue-50 hover:border-blue-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center mb-3">
                        <Calendar size={18} />
                      </div>
                      <p className="font-black text-sm">Agendar Consulta</p>
                      <p className="text-xs font-medium opacity-80 mt-0.5">Sem sair desta tela.</p>
                    </button>

                    <button
                      onClick={() => setActiveFlow('tratamento')}
                      disabled={loading || !patient}
                      className="p-4 rounded-3xl border-2 border-emerald-100 bg-emerald-50/40 text-emerald-800 text-left hover:bg-emerald-50 hover:border-emerald-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mb-3">
                        <Smile size={18} />
                      </div>
                      <p className="font-black text-sm">Adicionar Tratamento</p>
                      <p className="text-xs font-medium opacity-80 mt-0.5">Registro direto na ficha.</p>
                    </button>

                    <button
                      onClick={() => setActiveFlow('protese')}
                      disabled={loading || !patient}
                      className="p-4 rounded-3xl border-2 border-pink-100 bg-pink-50/40 text-pink-800 text-left hover:bg-pink-50 hover:border-pink-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed sm:col-span-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-pink-600 text-white flex items-center justify-center shrink-0">
                          <FileText size={18} />
                        </div>
                        <div>
                          <p className="font-black text-sm">Nova Prótese</p>
                          <p className="text-xs font-medium opacity-80 mt-0.5">Pedido em até 30 segundos.</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                {!loading && patient && openBalance > 0 && (
                  <div className="p-4 border-t border-slate-100 bg-rose-50 flex items-center gap-3 shrink-0">
                    <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center shrink-0">
                      <DollarSign size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-wider text-rose-700">Saldo em aberto</p>
                      <p className="font-black text-rose-800 text-sm truncate">{currency(openBalance)} · {debtAppointments.length} lançamento(s)</p>
                    </div>
                    <button
                      onClick={receiveOpenBalance}
                      disabled={receiving}
                      className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      {receiving ? 'Recebendo...' : 'Receber'}
                    </button>
                  </div>
                )}
              </>
            )}

            {activeFlow === 'agendamento' && patient && (
              <AppointmentForm
                paciente={{ id: patient.id, nome: patient.nome || 'Paciente', clinica_id: patient.clinica_id || null }}
                onCancel={() => setActiveFlow('idle')}
                onSuccess={() => flowSuccess('Agendamento criado com sucesso.')}
              />
            )}

            {activeFlow === 'protese' && patient && (
              <ProsthesisForm
                paciente={{ id: patient.id, nome: patient.nome || 'Paciente', clinica_id: patient.clinica_id || null }}
                onCancel={() => setActiveFlow('idle')}
                onSuccess={() => flowSuccess('Pedido de prótese criado.')}
              />
            )}

            {activeFlow === 'tratamento' && patient && (
              <TreatmentForm
                paciente={{ id: patient.id, nome: patient.nome || 'Paciente' }}
                onCancel={() => setActiveFlow('idle')}
                onSuccess={() => flowSuccess('Tratamento registrado na ficha.')}
              />
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] animate-in slide-in-from-bottom duration-200">
          <div className="px-5 py-3 rounded-2xl bg-slate-900 text-white font-bold text-sm shadow-2xl flex items-center gap-3 border border-slate-700">
            <CheckCircle2 size={18} className="text-emerald-400" />
            {toast.message}
          </div>
        </div>
      )}
    </PatientActionModalContext.Provider>
  );
}

export function usePatientActionModal() {
  const context = useContext(PatientActionModalContext);
  if (!context) throw new Error('usePatientActionModal deve ser usado dentro de PatientActionModalProvider');
  return context;
}
