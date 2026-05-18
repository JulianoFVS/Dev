'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Building2, Calendar, Clock, DollarSign, Loader2, Save, User } from 'lucide-react';
import { fetchUserClinicas } from '@/lib/clinicScoped';
import CustomSelect from '@/components/ui/CustomSelect';

export type AppointmentPatient = {
  id: string | number;
  nome: string;
  clinica_id?: string | null;
};

type Servico = { id: string | number; nome: string; valor?: number | string | null };
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

const THEMES = [
  { value: 'blue', cls: 'from-blue-500 to-blue-600' },
  { value: 'green', cls: 'from-emerald-500 to-emerald-600' },
  { value: 'red', cls: 'from-rose-500 to-rose-600' },
  { value: 'yellow', cls: 'from-amber-400 to-amber-500' },
  { value: 'purple', cls: 'from-violet-500 to-violet-600' },
  { value: 'slate', cls: 'from-slate-500 to-slate-600' },
];

export default function AppointmentForm({ paciente, defaultDate, defaultTime, onSuccess, onCancel }: AppointmentFormProps) {
  const [servicos, setServicos] = useState<Servico[]>([]);
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
    theme: 'blue',
    valor: '0',
    desconto: '0',
    observacoes: '',
    status: 'agendado',
    clinica_id: String(paciente.clinica_id || ''),
    profissional_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [{ data: user }, deps, clinicasUsuario] = await Promise.all([
        supabase.auth.getUser(),
        Promise.all([
          supabase.from('servicos').select('*').order('nome'),
          supabase.from('profissionais').select('id, nome, user_id, profissionais_clinicas(clinica_id)'),
        ]),
        fetchUserClinicas(),
      ]);
      if (!mounted) return;

      const [{ data: serv }, { data: pr }] = deps;
      setServicos(serv || []);
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

  const profissionaisFiltrados = useMemo(() => {
    if (!form.clinica_id) return [] as Profissional[];
    return profissionais.filter((p) => p.profissionais_clinicas?.some((v) => String(v.clinica_id) === String(form.clinica_id)));
  }, [form.clinica_id, profissionais]);

  function pickServico(serv: Servico) {
    setForm((current) => ({ ...current, procedimento: serv.nome, valor: String(serv.valor ?? current.valor) }));
  }

  async function submit(overrideStatus?: string) {
    setError(null);
    if (!form.procedimento.trim()) return setError('Informe o procedimento.');
    if (!form.clinica_id) return setError('Selecione a clínica.');

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
      cor: form.theme,
      valor,
      desconto,
      valor_final: valor - desconto,
      observacoes: form.observacoes,
      status: overrideStatus || form.status,
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
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 block">Procedimento <span className="text-rose-500">*</span></label>
          <input
            autoFocus
            value={form.procedimento}
            onChange={(e) => setForm({ ...form, procedimento: e.target.value })}
            className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ex: Limpeza, Restauração, Consulta..."
          />
          {servicos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {servicos.slice(0, 8).map((s) => (
                <button key={s.id} type="button" onClick={() => pickServico(s)} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-100 text-xs font-bold text-slate-600 hover:text-blue-700 transition-colors">
                  {s.nome}
                </button>
              ))}
            </div>
          )}
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

        <div>
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 block">Cor do Card</label>
          <div className="flex gap-2">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm({ ...form, theme: t.value })}
                className={`w-9 h-9 rounded-xl bg-gradient-to-br ${t.cls} shadow-md transition-all ${form.theme === t.value ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'opacity-70 hover:opacity-100'}`}
                aria-label={`Tema ${t.value}`}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 block">Observações</label>
          <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Notas adicionais (opcional)" />
        </div>

        {error && <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">{error}</div>}
        {loadingDeps && <div className="text-xs text-slate-400 italic flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando opções...</div>}
      </div>

      <div className="p-4 border-t border-slate-100 bg-white flex gap-2 shrink-0">
        <button type="button" onClick={onCancel} disabled={saving} className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50">
          Voltar
        </button>
        <button type="button" onClick={() => submit('concluido')} disabled={saving} className="flex-1 py-3 rounded-xl font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50">
          Concluir
        </button>
        <button type="button" onClick={() => submit()} disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Agendar</>}
        </button>
      </div>
    </div>
  );
}
