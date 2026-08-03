'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AlertCircle, ArrowLeft, Building2, Calendar, CheckCircle2, DollarSign, FileText, FolderOpen, Loader2, MessageCircle, Phone, Smile, Sparkles, User, X } from 'lucide-react';
import { useClinica } from '@/app/context/ClinicaContext';
import AppointmentForm from '@/components/forms/AppointmentForm';
import ProsthesisForm from '@/components/forms/ProsthesisForm';
import TreatmentForm from '@/components/forms/TreatmentForm';
import { validarPaciente, isMenorDeIdade } from '@/lib/pacienteValidation';
import { buildDocumentoContexto } from '@/lib/documentVariables';
import PatientContactButtons from '@/components/PatientContactButtons';
import { receberAgendamento, carregarTaxasAtivas } from '@/lib/recebimentoAgendamento';
import Modal from '@/components/ui/Modal';
import CustomSelect from '@/components/ui/CustomSelect';
import { calcularValorLiquido, type TaxaMaquininha } from '@/lib/configDefaults';

type PatientActionModalContextValue = {
  openPatientActions: (patientId: string | number | null | undefined) => void;
  openQuickCapture: (initialClinicaId?: string | null) => void;
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
  email?: string | null;
  cpf?: string | null;
  clinica_id?: string | null;
  clinicas?: { nome?: string | null } | { nome?: string | null }[] | null;
  agendamentos?: Appointment[] | null;
};

type ActiveFlow = 'idle' | 'agendamento' | 'protese' | 'tratamento' | 'harmonizacao';

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
  harmonizacao: { title: 'Nova Harmonização', subtitle: 'Abrir mapa facial HOF do paciente.', gradient: 'from-purple-50 to-white' },
};

export function PatientActionModalProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { activeClinicId, clinics } = useClinica();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [taxasRecebimento, setTaxasRecebimento] = useState<TaxaMaquininha[]>([]);
  const [taxaRecebimento, setTaxaRecebimento] = useState('');
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFlow, setActiveFlow] = useState<ActiveFlow>('idle');
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'info' } | null>(null);

  // Quick Capture (Cadastro Rápido) state
  const [quickCapture, setQuickCapture] = useState(false);
  const [qcInitialClinicaId, setQcInitialClinicaId] = useState<string | null>(null);
  const [qcClinicaId, setQcClinicaId] = useState<string>('');
  const [qcNome, setQcNome] = useState('');
  const [qcTelefone, setQcTelefone] = useState('');
  const [qcSexo, setQcSexo] = useState('');
  const [qcDataNascimento, setQcDataNascimento] = useState('');
  const [qcCpf, setQcCpf] = useState('');
  
  // Endereço com ViaCEP
  const [qcCep, setQcCep] = useState('');
  const [qcRua, setQcRua] = useState('');
  const [qcNumero, setQcNumero] = useState('');
  const [qcComplemento, setQcComplemento] = useState('');
  const [qcBairro, setQcBairro] = useState('');
  const [qcCidade, setQcCidade] = useState('');
  const [qcUf, setQcUf] = useState('');
  const [qcBuscandoCep, setQcBuscandoCep] = useState(false);
  
  // Responsável (para menores)
  const [qcResponsavelNome, setQcResponsavelNome] = useState('');
  const [qcResponsavelParentesco, setQcResponsavelParentesco] = useState('');
  const [qcResponsavelTelefone, setQcResponsavelTelefone] = useState('');
  const [qcMostrarResponsavel, setQcMostrarResponsavel] = useState(false);
  
  // Plano/Convênio
  const [qcPlanoId, setQcPlanoId] = useState<string>('');
  const [planos, setPlanos] = useState<{id: string, nome: string}[]>([]);
  
  const [qcSaving, setQcSaving] = useState(false);
  const [qcError, setQcError] = useState<string | null>(null);

  const closePatientActions = useCallback(() => {
    setOpen(false);
    setActiveFlow('idle');
    setQuickCapture(false);
  }, []);

  const openPatientActions = useCallback(async (patientId: string | number | null | undefined) => {
    if (!patientId) return;
    setOpen(true);
    setQuickCapture(false);
    setActiveFlow('idle');
    setLoading(true);
    setError(null);
    setPatient(null);

    const { data, error } = await supabase
      .from('pacientes')
      .select('id, nome, telefone, email, cpf, clinica_id, clinicas(nome), agendamentos(id, data_hora, status, valor, valor_final)')
      .eq('id', patientId)
      .single();

    if (error) {
      setError(error.message);
    } else {
      setPatient(data as PatientData);
    }

    setLoading(false);
  }, []);

  const openQuickCapture = useCallback(async (initialClinicaId?: string | null) => {
    setQcInitialClinicaId(initialClinicaId || null);
    const preselect = initialClinicaId || (activeClinicId && activeClinicId !== 'all' ? activeClinicId : '');
    setQcClinicaId(preselect || '');
    setQcNome('');
    setQcTelefone('');
    setQcSexo('');
    setQcDataNascimento('');
    setQcCpf('');
    setQcCep('');
    setQcRua('');
    setQcNumero('');
    setQcComplemento('');
    setQcBairro('');
    setQcCidade('');
    setQcUf('');
    setQcResponsavelNome('');
    setQcResponsavelParentesco('');
    setQcResponsavelTelefone('');
    setQcMostrarResponsavel(false);
    setQcPlanoId('');
    setQcError(null);
    setQcSaving(false);
    setPatient(null);
    setError(null);
    setActiveFlow('idle');
    setQuickCapture(true);
    setOpen(true);
    
    // Carregar planos da clínica selecionada
    if (preselect) {
      const { data } = await supabase.from('planos').select('id, nome').eq('clinica_id', preselect).eq('ativo', true).order('nome');
      setPlanos(data || []);
    } else {
      setPlanos([]);
    }
  }, [activeClinicId]);

  async function submitQuickCapture() {
    const payload = {
      nome: qcNome.trim(),
      sexo: qcSexo,
      data_nascimento: qcDataNascimento || null,
      cep: qcCep.trim(),
      rua: qcRua.trim(),
      numero: qcNumero.trim(),
      bairro: qcBairro.trim(),
      cidade: qcCidade.trim(),
      uf: qcUf.trim(),
      responsavel_nome: qcResponsavelNome.trim(),
      responsavel_parentesco: qcResponsavelParentesco,
      responsavel_telefone: qcResponsavelTelefone.trim(),
    };

    const erro = validarPaciente(payload);
    if (erro) {
      setQcError(erro);
      return;
    }
    if (!qcClinicaId) {
      setQcError('Selecione a clínica do paciente.');
      return;
    }

    setQcSaving(true);
    setQcError(null);

    const insertPayload: any = {
      nome: payload.nome,
      telefone: qcTelefone.trim(),
      clinica_id: qcClinicaId,
      sexo: payload.sexo,
      data_nascimento: payload.data_nascimento,
      cpf: qcCpf.trim() || null,
      cep: payload.cep,
      rua: payload.rua,
      numero: payload.numero,
      complemento: qcComplemento.trim() || null,
      bairro: payload.bairro,
      cidade: payload.cidade,
      uf: payload.uf,
      plano_id: qcPlanoId || null,
    };

    if (isMenorDeIdade(payload.data_nascimento)) {
      insertPayload.responsavel_nome = payload.responsavel_nome;
      insertPayload.responsavel_parentesco = payload.responsavel_parentesco;
      insertPayload.responsavel_telefone = payload.responsavel_telefone;
    } else if (payload.responsavel_nome) {
      insertPayload.responsavel_nome = payload.responsavel_nome;
      insertPayload.responsavel_parentesco = payload.responsavel_parentesco || null;
      insertPayload.responsavel_telefone = payload.responsavel_telefone || null;
    }

    const { data, error } = await supabase
      .from('pacientes')
      .insert([insertPayload])
      .select('id, nome, telefone, email, cpf, clinica_id, clinicas(nome), agendamentos(id, data_hora, status, valor, valor_final)')
      .single();

    setQcSaving(false);

    if (error || !data) {
      setQcError(error?.message || 'Não foi possível cadastrar o paciente.');
      return;
    }

    // Notifica a lista de pacientes (e qualquer outro listener)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ortus:paciente-changed'));
    }

    // Transição in-place: mantém modal aberto, troca para o Hub de Ações
    setPatient(data as PatientData);
    setQuickCapture(false);
    setActiveFlow('idle');
    setToast({ message: `${(data as PatientData).nome} cadastrado. O que deseja fazer agora?`, tone: 'success' });
  }

  const value = useMemo(() => ({ openPatientActions, openQuickCapture, closePatientActions }), [openPatientActions, openQuickCapture, closePatientActions]);

  const goToPatientTab = useCallback((tab: string) => {
    if (!patient) return;
    closePatientActions();
    router.push(`/pacientes/${patient.id}?tab=${tab}`);
  }, [patient, closePatientActions, router]);

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

  async function abrirModalReceber() {
    if (!debtAppointments.length || !patient) return;
    const clinicaId = patient.clinica_id ?? activeClinicId;
    if (!clinicaId || clinicaId === 'all') {
      alert('Selecione uma clínica para registrar o recebimento.');
      return;
    }
    const taxas = await carregarTaxasAtivas(clinicaId);
    setTaxasRecebimento(taxas);
    setTaxaRecebimento(taxas[0]?.id || '');
    setReceiveModalOpen(true);
  }

  async function confirmarRecebimento() {
    if (!debtAppointments.length || !patient) return;
    const clinicaId = patient.clinica_id ?? activeClinicId;
    if (!clinicaId || clinicaId === 'all') return;
    setReceiving(true);
    try {
      for (const item of debtAppointments) {
        await receberAgendamento({
          id: item.id,
          clinica_id: clinicaId,
          profissional_id: (item as any).profissional_id,
          paciente_id: String(patient.id),
          procedimento: (item as any).procedimento,
          valor_final: item.valor_final ?? item.valor,
        }, taxaRecebimento || undefined, taxasRecebimento);
      }
      setPatient((current) => current ? {
        ...current,
        agendamentos: (current.agendamentos || []).map((item) =>
          debtAppointments.some((d) => d.id === item.id) ? { ...item, status: 'concluido' } : item,
        ),
      } : current);
      setReceiveModalOpen(false);
      setToast({ message: 'Saldo recebido. Comissões registradas.', tone: 'success' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ortus:agenda-changed'));
      }
    } catch (e: any) {
      alert('Não foi possível receber: ' + (e.message || e));
    }
    setReceiving(false);
  }

  useEffect(() => {
    if (isMenorDeIdade(qcDataNascimento)) {
      setQcMostrarResponsavel(true);
    }
  }, [qcDataNascimento]);

  const flowMeta = activeFlow !== 'idle' ? FLOW_META[activeFlow] : null;

  // Buscar endereço via ViaCEP
  async function buscarCep(cep: string) {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;
    
    setQcBuscandoCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      
      if (!data.erro) {
        setQcRua(data.logradouro || '');
        setQcBairro(data.bairro || '');
        setQcCidade(data.localidade || '');
        setQcUf(data.uf || '');
      }
    } catch (err) {
      console.error('Erro ao buscar CEP:', err);
    } finally {
      setQcBuscandoCep(false);
    }
  }

  return (
    <PatientActionModalContext.Provider value={value}>
      {children}

      <Modal open={open} onClose={closePatientActions} maxWidth="lg" zIndex={80} hideCloseButton panelClassName="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
          <div className={`p-5 border-b border-slate-100 bg-gradient-to-br ${quickCapture ? 'from-indigo-50 to-white' : (flowMeta?.gradient || 'from-blue-50 to-white')} flex items-start justify-between gap-4 shrink-0`}>
              <div className="flex items-center gap-3 min-w-0">
                {activeFlow !== 'idle' ? (
                  <button onClick={() => setActiveFlow('idle')} className="w-11 h-11 rounded-2xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 flex items-center justify-center shrink-0 transition-colors" aria-label="Voltar">
                    <ArrowLeft size={18} />
                  </button>
                ) : quickCapture ? (
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100 shrink-0">
                    <Sparkles size={22} />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-100 shrink-0 font-black text-lg tracking-wider">
                    {loading ? <Loader2 className="animate-spin" size={22} /> : getInitials(patient?.nome)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    {quickCapture ? 'Cadastro rápido' : activeFlow === 'idle' ? 'Ações rápidas' : flowMeta?.title}
                  </p>
                  <h2 className="text-xl font-black text-slate-900 truncate">
                    {quickCapture ? (qcNome.trim() || 'Novo paciente') : (patient?.nome || (loading ? 'Carregando...' : 'Paciente'))}
                  </h2>
                  <p className="text-xs font-bold text-slate-400 truncate">
                    {quickCapture ? 'Cadastre em segundos para iniciar uma ação.' : activeFlow === 'idle' ? getClinicName(patient) : flowMeta?.subtitle}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!quickCapture && patient && activeFlow === 'idle' && (
                  <PatientContactButtons
                    variant="icons"
                    telefone={patient.telefone}
                    email={patient.email}
                    clinicaId={patient.clinica_id || activeClinicId}
                    evento="pos_consulta"
                    contexto={buildDocumentoContexto({
                      paciente_nome: patient.nome?.split(' ')[0],
                      clinica_nome: getClinicName(patient),
                    })}
                  />
                )}
                <button onClick={closePatientActions} className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                  <X size={20} />
                </button>
              </div>
            </div>

            {quickCapture && (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Dados Básicos */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <User size={12} /> Nome <span className="text-red-500">*</span>
                  </label>
                  <input
                    autoFocus
                    type="text"
                    value={qcNome}
                    onChange={(event) => setQcNome(event.target.value)}
                    placeholder="Nome completo do paciente"
                    className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Sexo <span className="text-red-500">*</span></label>
                    <select
                      value={qcSexo}
                      onChange={(e) => setQcSexo(e.target.value)}
                      className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                    >
                      <option value="">Selecione...</option>
                      <option value="masculino">Masculino</option>
                      <option value="feminino">Feminino</option>
                      <option value="outro">Outro</option>
                      <option value="nao_informar">Prefiro não informar</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Data Nascimento</label>
                    <input
                      type="date"
                      value={qcDataNascimento}
                      onChange={(e) => setQcDataNascimento(e.target.value)}
                      className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">CPF</label>
                    <input
                      type="text"
                      value={qcCpf}
                      onChange={(e) => setQcCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Phone size={12} /> WhatsApp
                    </label>
                    <input
                      type="tel"
                      value={qcTelefone}
                      onChange={(event) => setQcTelefone(event.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Building2 size={12} /> Clínica <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={qcClinicaId}
                    onChange={(e) => {
                      setQcClinicaId(e.target.value);
                      setQcPlanoId('');
                      if (e.target.value) {
                        supabase.from('planos').select('id, nome').eq('clinica_id', e.target.value).eq('ativo', true).order('nome').then(({ data }) => {
                          setPlanos(data || []);
                        });
                      } else {
                        setPlanos([]);
                      }
                    }}
                    className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                  >
                    <option value="">Selecione a clínica...</option>
                    {clinics.map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>

                {/* Plano/Convênio — sempre visível */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Plano / Convênio</label>
                  <select
                    value={qcPlanoId}
                    onChange={(e) => setQcPlanoId(e.target.value)}
                    disabled={!qcClinicaId}
                    className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all disabled:opacity-50"
                  >
                    <option value="">Particular (sem convênio)</option>
                    {planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>

                {/* Endereço com ViaCEP */}
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">Endereço <span className="text-red-500">*</span> (ViaCEP)</p>
                  
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={qcCep}
                        onChange={(e) => {
                          setQcCep(e.target.value);
                          if (e.target.value.replace(/\D/g, '').length === 8) {
                            buscarCep(e.target.value);
                          }
                        }}
                        onBlur={(e) => buscarCep(e.target.value)}
                        placeholder="00000-000"
                        className="flex-1 p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                      {qcBuscandoCep && <Loader2 size={20} className="animate-spin text-indigo-500 self-center" />}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div className="col-span-2 space-y-1">
                      <input
                        type="text"
                        value={qcRua}
                        onChange={(e) => setQcRua(e.target.value)}
                        placeholder="Rua / Avenida"
                        className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700 text-sm outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={qcNumero}
                        onChange={(e) => setQcNumero(e.target.value)}
                        placeholder="Nº"
                        className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700 text-sm outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>
                  </div>

                  <input
                    type="text"
                    value={qcComplemento}
                    onChange={(e) => setQcComplemento(e.target.value)}
                    placeholder="Complemento (Apto, Bloco, Sala...)"
                    className="w-full mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700 text-sm outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input
                      type="text"
                      value={qcBairro}
                      onChange={(e) => setQcBairro(e.target.value)}
                      placeholder="Bairro"
                      className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700 text-sm outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                    <input
                      type="text"
                      value={qcCidade}
                      onChange={(e) => setQcCidade(e.target.value)}
                      placeholder="Cidade"
                      className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700 text-sm outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                  </div>

                  <select
                    value={qcUf}
                    onChange={(e) => setQcUf(e.target.value)}
                    className="w-full mt-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-700 text-sm outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                  >
                    <option value="">UF</option>
                    {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>

                {/* Responsável (para menores) */}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setQcMostrarResponsavel(!qcMostrarResponsavel)}
                    className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-2 hover:text-indigo-600 transition-colors"
                  >
                    {qcMostrarResponsavel ? '▼' : '▶'} Responsável {isMenorDeIdade(qcDataNascimento) && <span className="text-red-500">* (obrigatório)</span>}
                  </button>
                  
                  {(qcMostrarResponsavel || isMenorDeIdade(qcDataNascimento)) && (
                    <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2">
                      <input
                        type="text"
                        value={qcResponsavelNome}
                        onChange={(e) => setQcResponsavelNome(e.target.value)}
                        placeholder="Nome do responsável"
                        className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={qcResponsavelParentesco}
                          onChange={(e) => setQcResponsavelParentesco(e.target.value)}
                          className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                        >
                          <option value="">Parentesco...</option>
                          <option value="pai">Pai</option>
                          <option value="mae">Mãe</option>
                          <option value="tutor">Tutor</option>
                          <option value="avo">Avô/Avó</option>
                          <option value="outro">Outro</option>
                        </select>
                        <input
                          type="tel"
                          value={qcResponsavelTelefone}
                          onChange={(e) => setQcResponsavelTelefone(e.target.value)}
                          placeholder="Telefone do responsável"
                          className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {qcError && (
                  <div className="p-3 rounded-2xl bg-red-50 border border-red-100 text-red-700 flex gap-2 text-sm font-bold">
                    <AlertCircle size={18} className="shrink-0" />
                    <span>{qcError}</span>
                  </div>
                )}

                <button
                  onClick={submitQuickCapture}
                  disabled={qcSaving || !qcNome.trim() || !qcClinicaId}
                  className="w-full p-4 rounded-2xl bg-indigo-600 text-white font-black text-sm hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                >
                  {qcSaving ? (
                    <><Loader2 size={18} className="animate-spin" /> Cadastrando...</>
                  ) : (
                    <><Sparkles size={18} /> Cadastrar Paciente</>
                  )}
                </button>

                <p className="text-[11px] text-slate-400 font-medium text-center">
                  Após cadastrar, você poderá agendar, criar prótese ou abrir a ficha completa.
                </p>
              </div>
            )}

            {!quickCapture && activeFlow === 'idle' && (
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
                      onClick={() => {
                        if (!patient) return;
                        closePatientActions();
                        router.push(`/agenda?paciente=${patient.id}`);
                      }}
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
                      onClick={() => goToPatientTab('tratamentos')}
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
                      onClick={() => {
                        if (!patient) return;
                        closePatientActions();
                        router.push(`/proteses?paciente=${patient.id}`);
                      }}
                      disabled={loading || !patient}
                      className="p-4 rounded-3xl border-2 border-pink-100 bg-pink-50/40 text-pink-800 text-left hover:bg-pink-50 hover:border-pink-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <div className="w-10 h-10 rounded-2xl bg-pink-600 text-white flex items-center justify-center mb-3">
                        <FileText size={18} />
                      </div>
                      <p className="font-black text-sm">Nova Prótese</p>
                      <p className="text-xs font-medium opacity-80 mt-0.5">Pedido em 30 segundos.</p>
                    </button>

                    <button
                      onClick={() => goToPatientTab('hof')}
                      disabled={loading || !patient}
                      className="p-4 rounded-3xl border-2 border-purple-100 bg-purple-50/40 text-purple-800 text-left hover:bg-purple-50 hover:border-purple-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center mb-3">
                        <Sparkles size={18} />
                      </div>
                      <p className="font-black text-sm">Nova Harmonização</p>
                      <p className="text-xs font-medium opacity-80 mt-0.5">Mapa facial HOF.</p>
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
                      onClick={abrirModalReceber}
                      disabled={receiving}
                      className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      {receiving ? 'Recebendo...' : 'Receber'}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* fluxos in-place removidos — navegação direta para as telas dedicadas */}
      </Modal>

      <Modal open={receiveModalOpen} onClose={() => setReceiveModalOpen(false)} maxWidth="md" zIndex={90} hideCloseButton panelClassName="bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6">
          <h3 className="text-lg font-black text-slate-800 mb-1">Registrar recebimento</h3>
          <p className="text-sm text-slate-500 mb-2">{debtAppointments.length} lançamento(s) em aberto</p>
          <p className="text-2xl font-black text-emerald-700 mb-4">{currency(openBalance)}</p>
          {taxasRecebimento.length > 0 && (
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Forma de pagamento</label>
              <CustomSelect
                value={taxaRecebimento}
                onChange={setTaxaRecebimento}
                options={[{ value: '', label: 'Sem taxa' }, ...taxasRecebimento.map(t => ({ value: t.id, label: `${t.nome} (${t.taxa_percentual}%)` }))]}
                size="lg"
              />
              {taxaRecebimento && (() => {
                const taxa = taxasRecebimento.find(t => t.id === taxaRecebimento);
                if (!taxa) return null;
                return (
                  <p className="text-xs text-emerald-700 mt-2 font-bold">
                    Líquido: {currency(calcularValorLiquido(openBalance, taxa.taxa_percentual))}
                  </p>
                );
              })()}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setReceiveModalOpen(false)} disabled={receiving} className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
            <button onClick={confirmarRecebimento} disabled={receiving} className="flex-1 py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center gap-2">
              {receiving ? 'Recebendo...' : 'Confirmar'}
            </button>
          </div>
        </div>
      </Modal>

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
