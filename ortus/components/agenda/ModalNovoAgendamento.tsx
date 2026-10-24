'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchUserClinicas, fetchUserEquipe, type ProfissionalEquipe } from '@/lib/clinicScoped';
import { useClinica } from '@/app/context/ClinicaContext';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { validarAgendamentoCompleto } from '@/lib/horarioProfissional';
import CustomSelect from '@/components/ui/CustomSelect';
import CampoData from '@/components/ui/CampoData';
import CampoHora from '@/components/ui/CampoHora';
import Modal from '@/components/ui/Modal';
import ProcedureCombobox from '@/components/forms/ProcedureCombobox';

type PacienteOpcao = { id: string | number; nome: string; clinica_id?: string | number | null; telefone?: string | null; email?: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  pacienteId?: string;
  pacienteNome?: string;
  clinicaId?: string;
  procedimento?: string;
  observacoes?: string;
  data?: string;
};

function isoLocal(d: Date) {
  const y = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${mes}-${dia}`;
}

const inputClass = 'box-border h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-neutral-900';

export default function ModalNovoAgendamento({
  open,
  onClose,
  onSaved,
  pacienteId = '',
  pacienteNome = '',
  clinicaId,
  procedimento = '',
  observacoes = '',
  data,
}: Props) {
  const { activeClinicId } = useClinica();
  const { showAlert } = useCustomAlert();
  const clinicaTravada = !!activeClinicId && activeClinicId !== 'all';
  const [clinicas, setClinicas] = useState<{ id: string | number; nome: string; telefone?: string | null }[]>([]);
  const [profissionais, setProfissionais] = useState<ProfissionalEquipe[]>([]);
  const [pacientes, setPacientes] = useState<PacienteOpcao[]>([]);
  const [tratamentos, setTratamentos] = useState<{ id: string | number; nome: string; valor_sugerido?: number | string | null; especialidade_id?: string | null }[]>([]);
  const [especialidades, setEspecialidades] = useState<{ id: string; nome: string }[]>([]);
  const [nivel, setNivel] = useState<string>('admin');
  const [meuProfissionalId, setMeuProfissionalId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    clinica_id: '',
    profissional_id: '',
    paciente_id: '',
    date: '',
    time: '08:00',
    title: '',
    valor: '0',
    desconto: '0',
    observacoes: '',
  });

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    const hoje = isoLocal(new Date());
    const dataSugerida = data && data >= hoje ? data : hoje;
    const clinicaInicial = clinicaTravada ? String(activeClinicId) : (clinicaId || '');

    async function carregar() {
      const [{ data: { user } }, listaClinicas, equipe] = await Promise.all([
        supabase.auth.getUser(),
        fetchUserClinicas(),
        fetchUserEquipe(),
      ]);
      if (cancelado) return;
      let nivelAtual = 'admin';
      let profAtual = '';
      if (user) {
        const { data: prof } = await supabase.from('profissionais').select('id, nivel_acesso').eq('user_id', user.id).maybeSingle();
        if (prof) {
          nivelAtual = prof.nivel_acesso || 'admin';
          profAtual = nivelAtual !== 'admin' ? String(prof.id) : '';
        }
      }
      setNivel(nivelAtual);
      setMeuProfissionalId(profAtual);
      setClinicas(listaClinicas);
      setProfissionais(equipe);
      setForm({
        clinica_id: clinicaInicial || (listaClinicas[0] ? String(listaClinicas[0].id) : ''),
        profissional_id: profAtual,
        paciente_id: pacienteId,
        date: dataSugerida,
        time: '08:00',
        title: procedimento,
        valor: '0',
        desconto: '0',
        observacoes,
      });
    }

    carregar();
    return () => { cancelado = true; };
  }, [open, pacienteId, clinicaId, procedimento, observacoes, data, clinicaTravada, activeClinicId]);

  useEffect(() => {
    if (!open || !form.clinica_id) return;
    let cancelado = false;
    async function carregarClinica() {
      const [tr, esp, pac] = await Promise.all([
        supabase.from('tratamentos_base').select('id, nome, valor_sugerido, especialidade_id').eq('clinica_id', form.clinica_id).eq('ativo', true).order('nome'),
        supabase.from('especialidades').select('id, nome').eq('clinica_id', Number(form.clinica_id)).eq('ativo', true).order('nome'),
        supabase.from('pacientes').select('id, nome, clinica_id, telefone').eq('clinica_id', form.clinica_id).order('nome'),
      ]);
      if (cancelado) return;
      setTratamentos(tr.data || []);
      setEspecialidades((esp.data || []) as { id: string; nome: string }[]);
      const lista = (pac.data || []) as PacienteOpcao[];
      if (pacienteId && !lista.some((p) => String(p.id) === String(pacienteId))) {
        lista.unshift({ id: pacienteId, nome: pacienteNome || 'Paciente', clinica_id: form.clinica_id });
      }
      setPacientes(lista);
    }
    carregarClinica();
    return () => { cancelado = true; };
  }, [open, form.clinica_id, pacienteId, pacienteNome]);

  const profissionaisDaClinica = profissionais.filter((p) => p.clinicas?.some((c) => String(c.id) === String(form.clinica_id)));

  async function salvar() {
    if (!form.title || !form.paciente_id || !form.clinica_id || !form.date || !form.time) {
      await showAlert('Preencha clínica, paciente, data, hora e procedimento.', { type: 'warning' });
      return;
    }
    if (form.profissional_id) {
      const erroHorario = await validarAgendamentoCompleto({
        clinicaId: form.clinica_id,
        profissionalId: form.profissional_id,
        date: form.date,
        time: form.time,
      });
      if (erroHorario) {
        await showAlert(erroHorario, { type: 'warning' });
        return;
      }
    }
    setSalvando(true);
    const valor = parseFloat(form.valor) || 0;
    const desconto = parseFloat(form.desconto) || 0;
    const { error } = await supabase.from('agendamentos').insert([{
      paciente_id: form.paciente_id,
      clinica_id: form.clinica_id,
      profissional_id: form.profissional_id || null,
      data_hora: new Date(`${form.date}T${form.time}:00`).toISOString(),
      procedimento: form.title,
      cor: 'blue',
      valor,
      desconto,
      valor_final: valor - desconto,
      observacoes: form.observacoes,
      status: 'agendado',
    }]);
    setSalvando(false);
    if (error) {
      await showAlert('Erro ao agendar: ' + error.message, { type: 'error' });
      return;
    }
    window.dispatchEvent(new CustomEvent('ortus:agenda-changed'));
    onClose();
    onSaved?.();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="lg"
      hideCloseButton
      zIndex={80}
      panelClassName="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/5 px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Novo agendamento</h2>
          <p className="mt-0.5 text-xs font-medium text-neutral-400">Paciente, horário e procedimento.</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Fechar"><X size={18} /></button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Clínica</label>
            <CustomSelect
              value={form.clinica_id}
              onChange={(v) => setForm((p) => ({ ...p, clinica_id: v, profissional_id: nivel !== 'admin' ? meuProfissionalId : '' }))}
              disabled={clinicaTravada}
              options={clinicas.map((c) => ({ value: String(c.id), label: c.nome }))}
              placeholder="Selecione..."
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Profissional</label>
            <CustomSelect
              value={form.profissional_id}
              onChange={(v) => setForm((p) => ({ ...p, profissional_id: v }))}
              disabled={nivel !== 'admin'}
              options={profissionaisDaClinica.map((p) => ({ value: String(p.id), label: p.nome }))}
              placeholder="Qualquer um..."
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Paciente</label>
          <CustomSelect
            value={form.paciente_id}
            onChange={(v) => setForm((p) => ({ ...p, paciente_id: v }))}
            options={pacientes.map((p) => ({ value: String(p.id), label: p.nome }))}
            placeholder={pacienteNome || 'Selecione...'}
            searchable
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Data</label>
            <CampoData value={form.date} onChange={(v) => setForm((p) => ({ ...p, date: v }))} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Hora</label>
            <CampoHora value={form.time} onChange={(v) => setForm((p) => ({ ...p, time: v }))} passo={30} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Procedimento</label>
          <ProcedureCombobox
            clinicaId={form.clinica_id}
            especialidades={especialidades}
            tratamentos={tratamentos}
            value={form.title}
            onChange={(nome, t) => setForm((p) => ({ ...p, title: nome, valor: t ? String(t.valor_sugerido ?? p.valor) : p.valor }))}
            disabled={!form.clinica_id}
          />
        </div>
        <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Valor (R$)</label>
            <input type="number" step="0.01" value={form.valor} onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} className={inputClass} placeholder="0,00" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Desconto (R$)</label>
            <input type="number" step="0.01" value={form.desconto} onChange={(e) => setForm((p) => ({ ...p, desconto: e.target.value }))} className={inputClass} placeholder="0,00" />
          </div>
          <div className="flex flex-col justify-center sm:text-right">
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Total</label>
            <p className="flex h-10 items-center text-sm font-medium text-neutral-900">R$ {(parseFloat(form.valor || '0') - parseFloat(form.desconto || '0')).toFixed(2)}</p>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-black/5 px-5 py-4 sm:px-6">
        <button type="button" onClick={onClose} className="h-10 px-3 text-sm font-medium text-neutral-500 hover:text-neutral-900">Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando} className="inline-flex h-10 items-center gap-2 rounded-md bg-neutral-900 px-5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60">
          {salvando && <Loader2 className="animate-spin" size={16} />} Salvar
        </button>
      </div>
    </Modal>
  );
}
