'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchUserClinicas, fetchUserEquipe, type ProfissionalEquipe } from '@/lib/clinicScoped';
import { useClinica } from '@/app/context/ClinicaContext';
import { useCustomAlert } from '@/components/ui/CustomAlert';
import { validarAgendamentoCompleto } from '@/lib/horarioProfissional';
import CustomSelect from '@/components/ui/CustomSelect';
import Modal from '@/components/ui/Modal';
import ProcedureCombobox from '@/components/forms/ProcedureCombobox';
import PatientContactButtons from '@/components/PatientContactButtons';

type PacienteOpcao = { id: string | number; nome: string; clinica_id?: string | number | null; telefone?: string | null; email?: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  pacienteId: string;
  pacienteNome: string;
  clinicaId?: string;
  procedimento: string;
  observacoes: string;
  data?: string;
};

const OPCOES_HORA = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 ? '30' : '00';
  const value = `${h}:${m}`;
  return { value, label: value };
});

function isoLocal(d: Date) {
  const y = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${mes}-${dia}`;
}

function opcoesData(atual?: string) {
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  const opcoes = Array.from({ length: 120 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const value = isoLocal(d);
    const label = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    return { value, label };
  });
  if (atual && !opcoes.some((o) => o.value === atual)) {
    const d = new Date(`${atual}T12:00:00`);
    opcoes.unshift({
      value: atual,
      label: Number.isNaN(d.getTime()) ? atual : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }),
    });
  }
  return opcoes;
}

const inputClass = 'w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm font-medium text-neutral-800 outline-none focus:border-neutral-400';

export default function ModalNovoAgendamento({
  open,
  onClose,
  onSaved,
  pacienteId,
  pacienteNome,
  clinicaId,
  procedimento,
  observacoes,
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
      if (!lista.some((p) => String(p.id) === String(pacienteId))) {
        lista.unshift({ id: pacienteId, nome: pacienteNome || 'Paciente', clinica_id: form.clinica_id });
      }
      setPacientes(lista);
    }
    carregarClinica();
    return () => { cancelado = true; };
  }, [open, form.clinica_id, pacienteId, pacienteNome]);

  const profissionaisDaClinica = profissionais.filter((p) => p.clinicas?.some((c) => String(c.id) === String(form.clinica_id)));
  const pacienteAtual = pacientes.find((p) => String(p.id) === String(form.paciente_id));
  const clinicaAtual = clinicas.find((c) => String(c.id) === String(form.clinica_id));

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
      panelClassName="flex max-h-[95vh] flex-col overflow-hidden rounded-[1.35rem] border border-black/8 bg-white shadow-xl sm:rounded-[1.5rem]"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-black/6 px-5 py-4">
        <h3 className="text-lg font-semibold text-neutral-900">Novo agendamento</h3>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800"><X size={20} /></button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Clínica
              {clinicaTravada && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold normal-case text-amber-600">Travada no filtro</span>}
            </label>
            <CustomSelect
              value={form.clinica_id}
              onChange={(v) => setForm((p) => ({ ...p, clinica_id: v, profissional_id: nivel !== 'admin' ? meuProfissionalId : '' }))}
              disabled={clinicaTravada}
              options={clinicas.map((c) => ({ value: String(c.id), label: c.nome }))}
              placeholder="Selecione..."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Profissional</label>
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
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Paciente</label>
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
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Data</label>
            <CustomSelect value={form.date} onChange={(v) => setForm((p) => ({ ...p, date: v }))} options={opcoesData(form.date)} placeholder="Selecione a data" searchable />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Hora</label>
            <CustomSelect value={form.time} onChange={(v) => setForm((p) => ({ ...p, time: v }))} options={OPCOES_HORA} placeholder="Selecione a hora" searchable />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500">Procedimento</label>
          <ProcedureCombobox
            clinicaId={form.clinica_id}
            especialidades={especialidades}
            tratamentos={tratamentos}
            value={form.title}
            onChange={(nome, t) => setForm((p) => ({ ...p, title: nome, valor: t ? String(t.valor_sugerido ?? p.valor) : p.valor }))}
            disabled={!form.clinica_id}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-black/6 bg-[#f3f4f1] p-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-neutral-500">Valor (R$)</label>
            <input type="number" step="0.01" value={form.valor} onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} className={inputClass} placeholder="0,00" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase text-neutral-500">Desconto (R$)</label>
            <input type="number" step="0.01" value={form.desconto} onChange={(e) => setForm((p) => ({ ...p, desconto: e.target.value }))} className={inputClass} placeholder="0,00" />
          </div>
          <div className="flex flex-col justify-center sm:text-right">
            <label className="mb-1 block text-[10px] font-semibold uppercase text-neutral-500">Total</label>
            <span className="text-xl font-semibold text-neutral-900">R$ {(parseFloat(form.valor || '0') - parseFloat(form.desconto || '0')).toFixed(2)}</span>
          </div>
        </div>
        {pacienteAtual && form.date && form.time && form.clinica_id && (
          <div className="space-y-2 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Confirmar consulta</p>
            <PatientContactButtons
              variant="row"
              telefone={pacienteAtual.telefone}
              email={pacienteAtual.email}
              clinicaId={form.clinica_id}
              evento="confirmacao"
              contexto={{
                paciente_nome: (pacienteAtual.nome || '').split(' ')[0],
                data_consulta: new Date(form.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                hora_consulta: form.time,
                clinica_nome: clinicaAtual?.nome,
                clinica_telefone: clinicaAtual?.telefone || undefined,
              }}
              className="w-full"
            />
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-black/6 px-5 py-4">
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100">Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60">
          {salvando && <Loader2 className="animate-spin" size={16} />} Salvar
        </button>
      </div>
    </Modal>
  );
}
