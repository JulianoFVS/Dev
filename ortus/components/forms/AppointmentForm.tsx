'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Building2, Calendar, Clock, DollarSign, ExternalLink, Loader2, Plus, Save, User } from 'lucide-react';
import { fetchUserClinicas } from '@/lib/clinicScoped';
import CustomSelect from '@/components/ui/CustomSelect';
import { validarAgendamentoCompleto } from '@/lib/horarioProfissional';

export type AppointmentPatient = {
  id: string | number;
  nome: string;
  clinica_id?: string | null;
};

type TratamentoBase = { id: string | number; nome: string; valor_sugerido?: number | string | null };
type Clinica = { id: string | number; nome: string };
type Profissional = {
  id: string | number;
  nome: string;
  user_id?: string | null;
  profissionais_clinicas?: { clinica_id: string | number }[] | null;
};

type AppointmentFormProps = {
  paciente: AppointmentPatient;
  defaultDate?: string;
  defaultTime?: string;
  onSuccess?: (created: { id: string | number; data_hora: string }) => void;
  onCancel?: () => void;
};

export default function AppointmentForm({ paciente, defaultDate, defaultTime, onSuccess, onCancel }: AppointmentFormProps) {
  const router = useRouter();
  const [tratamentosBase, setTratamentosBase] = useState<TratamentoBase[]>([]);
  const [tratamentoSelecionadoId, setTratamentoSelecionadoId] = useState('');
  const [clinicas, setClinicas] = useState<Clinica[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [usuarioNivel, setUsuarioNivel] = useState<'admin' | 'user'>('admin');
  const [meuProfissionalId, setMeuProfissionalId] = useState<string | number | null>(null);
  const [loadingDeps, setLoadingDeps] = useState(true);

  const today = new Date();
  const [form, setForm] = useState({
    procedimento: '',
    date: defaultDate || today.toISOString().split('T')[0],
    time: defaultTime || '08:00',
    valor: '0',
    desconto: '0',
    status: 'agendado',
    clinica_id: String(paciente.clinica_id || ''),
    profissional_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [{ data: user }, clinicasUsuario] = await Promise.all([
        supabase.auth.getUser(),
        fetchUserClinicas(),
      ]);
      if (!mounted) return;

      const { data: pr } = await supabase.from('profissionais').select('id, nome, user_id, profissionais_clinicas(clinica_id)');
      setClinicas(clinicasUsuario.map((c) => ({ id: c.id, nome: c.nome })));
      setProfissionais(pr || []);

      const authedUserId = user?.user?.id;
      if (authedUserId) {
        const me = (pr || []).find((p) => p.user_id === authedUserId);
        if (me) {
          setMeuProfissionalId(me.id);
          setUsuarioNivel('user');
          setForm((current) => ({ ...current, profissional_id: current.profissional_id || String(me.id) }));
        }
      }

      const storedClinic = typeof window !== 'undefined' ? localStorage.getItem('ortus_clinica_id') : null;
      if (storedClinic && storedClinic !== 'todas' && !form.clinica_id) {
        setForm((current) => ({ ...current, clinica_id: storedClinic }));
      }

      setLoadingDeps(false);
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!form.clinica_id) {
        setTratamentosBase([]);
        setTratamentoSelecionadoId('');
        return;
      }
      const { data } = await supabase
        .from('tratamentos_base')
        .select('id, nome, valor_sugerido')
        .eq('clinica_id', form.clinica_id)
        .eq('ativo', true)
        .order('nome');
      if (mounted) setTratamentosBase(data || []);
    })();
    return () => { mounted = false; };
  }, [form.clinica_id]);

  const profissionaisFiltrados = useMemo(() => {
    if (!form.clinica_id) return [] as Profissional[];
    return profissionais.filter((p) => p.profissionais_clinicas?.some((v) => String(v.clinica_id) === String(form.clinica_id)));
  }, [form.clinica_id, profissionais]);

  function pickTratamento(trat: TratamentoBase) {
    setTratamentoSelecionadoId(String(trat.id));
    setForm((current) => ({ ...current, procedimento: trat.nome, valor: String(trat.valor_sugerido ?? current.valor) }));
  }

  async function submit() {
    setError(null);
    if (!form.procedimento.trim()) return setError('Informe o procedimento.');
    if (!form.clinica_id) return setError('Selecione a clínica.');

    if (form.profissional_id) {
      const erroHorario = await validarAgendamentoCompleto({
        clinicaId: form.clinica_id,
        profissionalId: form.profissional_id,
        date: form.date,
        time: form.time,
      });
      if (erroHorario) return setError(erroHorario);
    }

    setSaving(true);
    const dataLocal = new Date(`${form.date}T${form.time}:00`);
    const valor = parseFloat(form.valor) || 0;
    const desconto = parseFloat(form.desconto) || 0;
    const payload = {
      paciente_id: paciente.id,
      clinica_id: form.clinica_id,
      profissional_id: form.profissional_id || null,
      data_hora: dataLocal.toISOString(),
      procedimento: form.procedimento.trim(),
      cor: 'blue',
      valor,
      desconto,
      valor_final: valor - desconto,
      observacoes: '',
      status: form.status,
    };

    const { data, error: insertError } = await supabase
      .from('agendamentos')
      .insert([payload])
      .select('id, data_hora')
      .single();

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ortus:agenda-changed'));
    }

    onSuccess?.(data as { id: string | number; data_hora: string });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-blue-50 border border-blue-100">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <User size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-blue-700">Paciente</p>
            <p className="font-black text-slate-800 truncate">{paciente.nome}</p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">Procedimento <span className="text-rose-500">*</span></label>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => router.push('/ajustes/tratamentos')} className="text-[10px] font-bold text-purple-600 hover:underline flex items-center gap-1 uppercase">
                <Plus size={12}/> Novo serviço
              </button>
              <button type="button" onClick={() => router.push('/ajustes/tratamentos')} className="text-[10px] font-bold text-slate-500 hover:underline flex items-center gap-1 uppercase">
                <ExternalLink size={12}/> Tratamento Base
              </button>
            </div>
          </div>
          {tratamentosBase.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {tratamentosBase.slice(0, 8).map((t) => (
                <button key={t.id} type="button" onClick={() => pickTratamento(t)} className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${tratamentoSelecionadoId === String(t.id) ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700'}`}>
                  {t.nome}
                </button>
              ))}
            </div>
          )}
          <input
            autoFocus
            value={form.procedimento}
            onChange={(e) => { setTratamentoSelecionadoId(''); setForm({ ...form, procedimento: e.target.value }); }}
            className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ex: Limpeza, Restauração, Consulta..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1"><Calendar size={12} /> Data</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1"><Clock size={12} /> Hora</label>
            <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1"><Building2 size={12} /> Clínica <span className="text-rose-500">*</span></label>
            <CustomSelect value={form.clinica_id} onChange={(v) => setForm({ ...form, clinica_id: v, profissional_id: '' })} options={clinicas.map((c) => ({ value: String(c.id), label: c.nome }))} placeholder="Selecionar" size="lg"/>
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 block">Profissional</label>
            <CustomSelect disabled={usuarioNivel !== 'admin' && !!meuProfissionalId} value={form.profissional_id} onChange={(v) => setForm({ ...form, profissional_id: v })} options={profissionaisFiltrados.map((p) => ({ value: String(p.id), label: p.nome }))} placeholder="Selecionar" size="lg"/>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1"><DollarSign size={12} /> Valor (R$)</label>
            <input type="number" min="0" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 block">Desconto (R$)</label>
            <input type="number" min="0" step="0.01" value={form.desconto} onChange={(e) => setForm({ ...form, desconto: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {error && <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">{error}</div>}
        {loadingDeps && <div className="text-xs text-slate-400 italic flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando opções...</div>}
      </div>

      <div className="p-4 border-t border-slate-100 bg-white flex gap-2 shrink-0">
        <button type="button" onClick={onCancel} disabled={saving} className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50">
          Voltar
        </button>
        <button type="button" onClick={() => submit()} disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Agendar</>}
        </button>
      </div>
    </div>
  );
}
