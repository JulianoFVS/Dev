'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ExternalLink, Loader2, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { receberAgendamento } from '@/lib/recebimentoAgendamento';

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
  profissional_id?: string | number | null;
};

type PatientData = {
  id: string | number;
  clinica_id?: string | number | null;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  data_nascimento?: string | null;
  ficha_medica?: any;
  clinicas?: { nome?: string | null } | { nome?: string | null }[] | null;
  planos?: { nome?: string | null; tipo?: string | null } | { nome?: string | null; tipo?: string | null }[] | null;
  agendamentos?: Appointment[] | null;
};

type ProsthesisItem = {
  id?: string | number;
  tipo_protese?: string | null;
  etapa?: string | null;
};

const PatientSlideOverContext = createContext<PatientSlideOverContextValue | null>(null);

function currency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function getClinicName(patient: PatientData | null) {
  const clinic = patient?.clinicas;
  if (Array.isArray(clinic)) return clinic[0]?.nome || '';
  return clinic?.nome || '';
}

function planoNome(planos?: PatientData['planos']) {
  const plano = Array.isArray(planos) ? planos[0] : planos;
  if (!plano) return 'Particular';
  if (plano.tipo === 'particular') return 'Particular';
  return plano.nome || 'Particular';
}

function idade(nasc?: string | null) {
  if (!nasc) return null;
  const d = new Date(nasc + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  let n = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) n -= 1;
  return n >= 0 ? n : null;
}

function alergiasDe(ficha: any) {
  if (!ficha) return 'Não informado';
  if (typeof ficha.alergia === 'string' && ficha.alergia.trim()) return ficha.alergia;
  if (typeof ficha.alergias === 'string' && ficha.alergias.trim()) return ficha.alergias;
  if (Array.isArray(ficha.alergias) && ficha.alergias.length) return ficha.alergias.join(', ');
  if (ficha['Alergia Antibiótico']) return 'Alergia a antibiótico';
  if (ficha['Alergia Anestésico']) return 'Alergia a anestésico';
  return 'Nenhuma registrada';
}

const STATUS: Record<string, string> = {
  agendado: 'Agendado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  fiado: 'Em aberto',
};

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

    const { data, error: fetchError } = await supabase
      .from('pacientes')
      .select('id, nome, telefone, email, data_nascimento, clinica_id, ficha_medica, clinicas(nome), planos(nome, tipo), agendamentos(id, data_hora, procedimento, status, valor, valor_final, profissional_id)')
      .eq('id', patientId)
      .single();

    if (fetchError) {
      setError('Não foi possível abrir a ficha.');
      setPatient(null);
      setLoading(false);
      return;
    }

    setPatient(data as PatientData);
    setLoading(false);

    let cartoes = supabase
      .from('kanban_cartoes')
      .select('id, tipo_protese, coluna_id')
      .eq('paciente_id', String(patientId))
      .limit(4);
    if (data?.clinica_id) cartoes = cartoes.eq('clinica_id', data.clinica_id);
    const { data: cards } = await cartoes;

    if (cards?.length) {
      const colunaIds = [...new Set(cards.map((card: { coluna_id?: string | number | null }) => card.coluna_id).filter(Boolean))];
      let columnMap: Record<string, string> = {};
      if (colunaIds.length) {
        const { data: columns } = await supabase.from('kanban_colunas').select('id, titulo').in('id', colunaIds);
        columnMap = (columns || []).reduce((acc: Record<string, string>, column: { id: string | number; titulo?: string }) => {
          acc[String(column.id)] = column.titulo || '';
          return acc;
        }, {});
      }
      setKanbanProstheses(cards.map((card: { id: string | number; tipo_protese?: string | null; coluna_id?: string | number | null }) => ({
        id: card.id,
        tipo_protese: card.tipo_protese,
        etapa: columnMap[String(card.coluna_id)] || 'Em produção',
      })));
    }
  }, []);

  const value = useMemo(() => ({ openPatient, closePatient }), [openPatient, closePatient]);

  const appointments = useMemo(() => {
    const list = [...(patient?.agendamentos || [])];
    return list.sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime());
  }, [patient]);

  const nextAppointment = appointments.find((item) => new Date(item.data_hora).getTime() >= openedAt && item.status !== 'cancelado' && item.status !== 'concluido');
  const debtAppointments = appointments.filter((item) => item.status === 'fiado');
  const openBalance = debtAppointments.reduce((sum, item) => sum + Number(item.valor_final || item.valor || 0), 0);
  const anos = idade(patient?.data_nascimento);
  const subtitulo = [getClinicName(patient), anos != null ? `${anos} anos` : '', patient ? planoNome(patient.planos) : ''].filter(Boolean).join(' · ');

  async function receiveOpenBalance() {
    if (!debtAppointments.length || !patient?.clinica_id) return;
    setReceiving(true);
    setError(null);
    try {
      for (const item of debtAppointments) {
        await receberAgendamento({
          id: item.id,
          clinica_id: patient.clinica_id,
          profissional_id: item.profissional_id,
          paciente_id: String(patient.id),
          procedimento: item.procedimento ?? undefined,
          valor_final: item.valor_final ?? item.valor,
        });
      }
      setPatient((current) => current ? {
        ...current,
        agendamentos: (current.agendamentos || []).map((item) =>
          debtAppointments.some((d) => d.id === item.id) ? { ...item, status: 'concluido' } : item,
        ),
      } : current);
    } catch {
      setError('Não foi possível registrar o recebimento.');
    }
    setReceiving(false);
  }

  return (
    <PatientSlideOverContext.Provider value={value}>
      {children}
      <Modal
        open={open}
        onClose={closePatient}
        zIndex={80}
        maxWidth="lg"
        hideCloseButton
        panelClassName="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-neutral-900">{loading ? 'Ficha' : (patient?.nome || 'Paciente')}</h2>
            <p className="mt-0.5 truncate text-xs font-medium text-neutral-400">{loading ? 'Carregando…' : (subtitulo || 'Resumo do atendimento')}</p>
          </div>
          <button type="button" onClick={closePatient} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {loading && (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-md bg-neutral-100" />
              ))}
            </div>
          )}

          {!loading && error && !patient && (
            <p className="rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-600">{error}</p>
          )}

          {!loading && patient && (
            <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-medium text-neutral-500">Telefone</p>
                <p className="text-sm text-neutral-900">{patient.telefone || 'Sem telefone'}</p>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-neutral-500">E-mail</p>
                <p className="truncate text-sm text-neutral-900">{patient.email || 'Sem e-mail'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-xs font-medium text-neutral-500">Alergias</p>
                <p className="text-sm text-neutral-900">{alergiasDe(patient.ficha_medica)}</p>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-neutral-500">Saldo em aberto</p>
                <p className={`text-sm font-medium ${openBalance > 0 ? 'text-rose-600' : 'text-neutral-900'}`}>{currency(openBalance)}</p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {debtAppointments.length > 0 ? `${debtAppointments.length} débito(s)` : 'Nenhum débito'}
                </p>
                {openBalance > 0 && (
                  <button
                    type="button"
                    onClick={receiveOpenBalance}
                    disabled={receiving}
                    className="mt-2 inline-flex h-8 items-center rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                  >
                    {receiving ? <Loader2 size={14} className="animate-spin" /> : 'Receber'}
                  </button>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-neutral-500">Próxima consulta</p>
                {nextAppointment ? (
                  <>
                    <p className="truncate text-sm font-medium text-neutral-900">{nextAppointment.procedimento || 'Consulta'}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {dateTime(nextAppointment.data_hora)} · {STATUS[nextAppointment.status || ''] || 'Agendado'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-neutral-500">Nenhuma consulta futura</p>
                )}
              </div>
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-xs font-medium text-neutral-500">Próteses</p>
                {kanbanProstheses.length > 0 ? (
                  <ul className="divide-y divide-black/5 rounded-md border border-neutral-200">
                    {kanbanProstheses.map((item) => (
                      <li key={String(item.id)} className="flex items-center justify-between gap-3 px-3 py-2">
                        <p className="truncate text-sm text-neutral-900">{item.tipo_protese || 'Prótese'}</p>
                        <p className="shrink-0 text-xs text-neutral-500">{item.etapa}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-500">Nenhuma prótese em andamento</p>
                )}
              </div>
              {error && <p className="text-sm text-rose-600 sm:col-span-2">{error}</p>}
            </div>
          )}
        </div>

        {patient && (
          <div className="flex shrink-0 justify-end border-t border-black/5 px-5 py-4 sm:px-6">
            <Link
              href={`/pacientes/${patient.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Abrir prontuário
              <ExternalLink size={14} />
            </Link>
          </div>
        )}
      </Modal>
    </PatientSlideOverContext.Provider>
  );
}

export function usePatientSlideOver() {
  const context = useContext(PatientSlideOverContext);
  if (!context) throw new Error('usePatientSlideOver deve ser usado dentro de PatientSlideOverProvider');
  return context;
}
