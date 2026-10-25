'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { AlertCircle, Camera, CheckCircle2, Loader2, User, X } from 'lucide-react';
import { useClinica } from '@/app/context/ClinicaContext';
import { validarPaciente, isMenorDeIdade } from '@/lib/pacienteValidation';
import Modal from '@/components/ui/Modal';
import CustomSelect from '@/components/ui/CustomSelect';
import { PARENTESCO_OPTIONS, SEXO_OPTIONS, UF_OPTIONS } from '@/lib/formOptions';
import { prepararFotoPaciente } from '@/lib/prepararFotoPaciente';
import { cpfValido, mascaraCep, mascaraCpf, mascaraNumero, mascaraTelefone, variantesCpf } from '@/lib/mascaras';
import CampoData from '@/components/ui/CampoData';

type PatientActionModalContextValue = {
  openQuickCapture: (initialClinicaId?: string | null) => void;
  closePatientActions: () => void;
};

const PatientActionModalContext = createContext<PatientActionModalContextValue | null>(null);

const qcInput = 'box-border h-10 max-h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900';
const qcLabel = 'mb-1.5 block text-xs font-medium text-neutral-500';
const qcSection = 'mb-3 text-sm font-semibold text-neutral-900';

export function PatientActionModalProvider({ children }: { children: React.ReactNode }) {
  const { activeClinicId, clinics } = useClinica();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'info' } | null>(null);
  const [quickCapture, setQuickCapture] = useState(false);
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
  
  // Plano/Convênio
  const [qcPlanoId, setQcPlanoId] = useState<string>('');
  const [planos, setPlanos] = useState<{id: string, nome: string}[]>([]);
  
  const [qcSaving, setQcSaving] = useState(false);
  const [qcError, setQcError] = useState<string | null>(null);
  const [qcCpfExistente, setQcCpfExistente] = useState<{ id: string; nome: string } | null>(null);
  const [qcFotoBlob, setQcFotoBlob] = useState<Blob | null>(null);
  const [qcFotoPreview, setQcFotoPreview] = useState<string | null>(null);
  const [qcFotoErro, setQcFotoErro] = useState<string | null>(null);
  const qcFotoInputRef = useRef<HTMLInputElement>(null);

  const limparFotoCadastro = useCallback(() => {
    setQcFotoPreview((atual) => {
      if (atual) URL.revokeObjectURL(atual);
      return null;
    });
    setQcFotoBlob(null);
    setQcFotoErro(null);
    if (qcFotoInputRef.current) qcFotoInputRef.current.value = '';
  }, []);

  async function escolherFotoCadastro(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const blob = await prepararFotoPaciente(file);
      setQcFotoPreview((atual) => {
        if (atual) URL.revokeObjectURL(atual);
        return URL.createObjectURL(blob);
      });
      setQcFotoBlob(blob);
      setQcFotoErro(null);
    } catch (err) {
      setQcFotoErro(err instanceof Error ? err.message : 'Não foi possível usar essa foto.');
    }
  }

  const closePatientActions = useCallback(() => {
    setOpen(false);
  }, []);

  const openQuickCapture = useCallback(async (initialClinicaId?: string | null) => {
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
    setQcPlanoId('');
    setQcError(null);
    setQcCpfExistente(null);
    setQcSaving(false);
    limparFotoCadastro();
    setQuickCapture(true);
    setOpen(true);
    
    // Carregar planos da clínica selecionada
    if (preselect) {
      const { data } = await supabase.from('planos').select('id, nome').eq('clinica_id', preselect).eq('ativo', true).order('nome');
      setPlanos(data || []);
    } else {
      setPlanos([]);
    }
  }, [activeClinicId, limparFotoCadastro]);

  async function buscarPacientePorCpf(cpf: string) {
    const { data } = await supabase.from('pacientes').select('id, nome, cpf').in('cpf', variantesCpf(cpf)).limit(1);
    const achado = data?.[0];
    setQcCpfExistente(achado ? { id: String(achado.id), nome: achado.nome || 'Paciente' } : null);
  }

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
      .select('id, nome')
      .single();

    setQcSaving(false);

    if (error || !data) {
      setQcError(error?.message || 'Não foi possível cadastrar o paciente.');
      return;
    }

    let avisoFoto = '';
    if (qcFotoBlob) {
      const caminho = `pacientes/${data.id}/avatar.jpg`;
      const { error: uploadErr } = await supabase.storage.from('arquivos_ortus').upload(caminho, qcFotoBlob, {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '3600',
      });
      if (uploadErr) {
        avisoFoto = ' A foto não foi salva.';
      } else {
        const { data: urlData } = supabase.storage.from('arquivos_ortus').getPublicUrl(caminho);
        const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;
        const { error: updErr } = await supabase.from('pacientes').update({ foto_url: publicUrl }).eq('id', data.id);
        if (updErr) avisoFoto = ' A foto não foi salva.';
      }
    }
    limparFotoCadastro();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ortus:paciente-changed'));
    }

    setOpen(false);
    setToast({ message: `${data.nome || 'Paciente'} cadastrado.${avisoFoto}`, tone: avisoFoto ? 'info' : 'success' });
  }

  const value = useMemo(() => ({ openQuickCapture, closePatientActions }), [openQuickCapture, closePatientActions]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

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

      <Modal open={open} onClose={closePatientActions} maxWidth="4xl" zIndex={80} hideCloseButton panelClassName="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl">
            {quickCapture && (
              <div className="px-5 py-4 sm:px-6 sm:py-5">
                <div className="mb-5 flex items-center justify-between gap-4 border-b border-black/5 pb-4">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <label className="relative h-16 w-16 shrink-0 cursor-pointer">
                      <input ref={qcFotoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={escolherFotoCadastro} />
                      <span className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border bg-[#f8f8f6] text-lg font-semibold text-neutral-700 ${qcFotoPreview ? 'border-[#c8f053] ring-2 ring-[#c8f053]' : 'border-black/10'}`}>
                        {qcFotoPreview ? (
                          <img src={qcFotoPreview} alt="" className="h-full w-full object-cover" />
                        ) : (
                          (qcNome.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0] || '').join('').toUpperCase() || <User size={20} className="text-neutral-400" />)
                        )}
                      </span>
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-white">
                        <Camera size={12} />
                      </span>
                    </label>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-neutral-900">Novo paciente</h2>
                      <div className={`mt-0.5 text-xs font-medium ${qcFotoErro ? 'text-red-600' : 'text-neutral-400'}`}>
                        {qcFotoErro || 'Foto opcional. JPG, PNG ou WebP, até 8 MB — a imagem é reduzida antes de enviar.'}
                        {qcFotoPreview && (
                          <button type="button" onClick={limparFotoCadastro} className="ml-2 text-neutral-700 underline">Remover</button>
                        )}
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={closePatientActions} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" aria-label="Fechar">
                    <X size={18} />
                  </button>
                </div>

                <section>
                  <h3 className={qcSection}>Identificação</h3>
                  <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="min-w-0">
                    <span className={qcLabel}>Nome <span className="text-red-500">*</span></span>
                    <input autoFocus type="text" value={qcNome} onChange={(event) => setQcNome(event.target.value)} placeholder="Nome completo do paciente" className={qcInput} />
                  </label>
                  <label className="min-w-0">
                    <span className={qcLabel}>Sexo <span className="text-red-500">*</span></span>
                    <CustomSelect value={qcSexo} onChange={setQcSexo} options={SEXO_OPTIONS} size="md" />
                  </label>
                  <label className="min-w-0">
                    <span className={qcLabel}>Nascimento</span>
                    <CampoData value={qcDataNascimento} onChange={setQcDataNascimento} />
                  </label>
                  <label className="min-w-0">
                    <span className={qcLabel}>CPF</span>
                    <input type="text" inputMode="numeric" value={qcCpf} onChange={(e) => { const cpf = mascaraCpf(e.target.value); setQcCpf(cpf); if (cpfValido(cpf)) buscarPacientePorCpf(cpf); else setQcCpfExistente(null); }} placeholder="000.000.000.00" className={qcInput} />
                    {qcCpfExistente && <span className="mt-1 block text-[11px] font-medium text-amber-700">CPF já cadastrado: {qcCpfExistente.nome}</span>}
                  </label>
                  <label className="min-w-0">
                    <span className={qcLabel}>WhatsApp</span>
                    <input type="tel" inputMode="numeric" value={qcTelefone} onChange={(event) => setQcTelefone(mascaraTelefone(event.target.value))} placeholder="(00)9 0000-0000" className={qcInput} />
                  </label>
                  <label className="min-w-0">
                    <span className={qcLabel}>Clínica <span className="text-red-500">*</span></span>
                    <CustomSelect
                      value={qcClinicaId}
                      onChange={(v) => {
                        setQcClinicaId(v);
                        setQcPlanoId('');
                        if (v) {
                          supabase.from('planos').select('id, nome').eq('clinica_id', v).eq('ativo', true).order('nome').then(({ data }) => {
                            setPlanos(data || []);
                          });
                        } else {
                          setPlanos([]);
                        }
                      }}
                      options={[{ value: '', label: 'Selecione a clínica' }, ...clinics.map((c: any) => ({ value: c.id, label: c.nome }))]}
                      size="md"
                    />
                  </label>
                  <label className="min-w-0">
                    <span className={qcLabel}>Plano / convênio</span>
                    <CustomSelect
                      value={qcPlanoId}
                      onChange={setQcPlanoId}
                      disabled={!qcClinicaId}
                      options={[{ value: '', label: 'Particular (sem convênio)' }, ...planos.map(p => ({ value: p.id, label: p.nome }))]}
                      size="md"
                    />
                  </label>
                  </div>
                </section>

                <section className="mt-5 border-t border-black/5 pt-4">
                  <h3 className={qcSection}>Endereço</h3>
                  <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="min-w-0">
                    <span className={qcLabel}>CEP</span>
                    <input
                      type="text"
                      value={qcCep}
                      onChange={(e) => {
                        const cep = mascaraCep(e.target.value);
                        setQcCep(cep);
                        if (cep.replace(/\D/g, '').length === 8) buscarCep(cep);
                      }}
                      onBlur={(e) => buscarCep(e.target.value)}
                      placeholder="00000-000"
                      className={qcInput}
                    />
                  </label>
                  <label className="min-w-0">
                    <span className={qcLabel}>Rua / avenida {qcBuscandoCep && <Loader2 size={12} className="ml-1 inline animate-spin" />}</span>
                    <input type="text" value={qcRua} onChange={(e) => setQcRua(e.target.value)} placeholder="Rua / Avenida" className={qcInput} />
                  </label>
                  <label className="min-w-0">
                    <span className={qcLabel}>Número</span>
                    <input type="text" inputMode="numeric" value={qcNumero} onChange={(e) => setQcNumero(mascaraNumero(e.target.value))} placeholder="Nº" className={qcInput} />
                  </label>
                  <label className="min-w-0">
                    <span className={qcLabel}>Complemento</span>
                    <input type="text" value={qcComplemento} onChange={(e) => setQcComplemento(e.target.value)} placeholder="Apto, bloco, sala" className={qcInput} />
                  </label>
                  <label className="min-w-0">
                    <span className={qcLabel}>Bairro</span>
                    <input type="text" value={qcBairro} onChange={(e) => setQcBairro(e.target.value)} placeholder="Bairro" className={qcInput} />
                  </label>
                  <label className="min-w-0">
                    <span className={qcLabel}>Cidade</span>
                    <input type="text" value={qcCidade} onChange={(e) => setQcCidade(e.target.value)} placeholder="Cidade" className={qcInput} />
                  </label>
                  <label className="min-w-0">
                    <span className={qcLabel}>UF</span>
                    <CustomSelect value={qcUf} onChange={setQcUf} options={UF_OPTIONS} size="md" />
                  </label>
                  </div>
                </section>

                <section className="mt-5 border-t border-black/5 pt-4">
                  <h3 className={qcSection}>Responsável {isMenorDeIdade(qcDataNascimento) && <span className="text-xs font-medium text-red-500">obrigatório para menor de 18 anos</span>}</h3>
                  <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="min-w-0">
                    <span className={qcLabel}>Nome</span>
                    <input type="text" value={qcResponsavelNome} onChange={(e) => setQcResponsavelNome(e.target.value)} placeholder="Nome do responsável" className={qcInput} />
                  </label>
                  <label className="min-w-0">
                    <span className={qcLabel}>Parentesco</span>
                    <CustomSelect value={qcResponsavelParentesco} onChange={setQcResponsavelParentesco} options={PARENTESCO_OPTIONS} size="md" />
                  </label>
                  <label className="min-w-0">
                    <span className={qcLabel}>Telefone</span>
                    <input type="tel" inputMode="numeric" value={qcResponsavelTelefone} onChange={(e) => setQcResponsavelTelefone(mascaraTelefone(e.target.value))} placeholder="(00)9 0000-0000" className={qcInput} />
                  </label>
                  </div>
                </section>

                {qcError && (
                  <p className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                    <AlertCircle size={16} className="shrink-0" />
                    {qcError}
                  </p>
                )}

                <div className="mt-5 flex items-center justify-end gap-3 border-t border-black/5 pt-4">
                  <button
                    type="button"
                    onClick={closePatientActions}
                    disabled={qcSaving}
                    className="h-10 px-3 text-sm font-medium text-neutral-500 hover:text-neutral-900 disabled:opacity-40"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={submitQuickCapture}
                    disabled={qcSaving || !qcNome.trim() || !qcClinicaId}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {qcSaving && <Loader2 size={15} className="animate-spin" />}
                    {qcSaving ? 'Cadastrando...' : 'Cadastrar'}
                  </button>
                </div>
              </div>
            )}


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
