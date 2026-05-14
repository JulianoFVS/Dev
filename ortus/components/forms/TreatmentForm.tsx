'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckCircle, Clock, DollarSign, Loader2, Save, Smile, User } from 'lucide-react';

export type TreatmentPatient = {
  id: string | number;
  nome: string;
};

type TreatmentFormProps = {
  paciente: TreatmentPatient;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export default function TreatmentForm({ paciente, onSuccess, onCancel }: TreatmentFormProps) {
  const [loadingDeps, setLoadingDeps] = useState(true);
  const [fichaMedica, setFichaMedica] = useState<any>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    procedimento: '',
    dente: '',
    valor: '0',
    status: 'planejado' as 'planejado' | 'concluido',
    data: new Date().toISOString().split('T')[0],
    observacoes: '',
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error: fetchError } = await supabase
        .from('pacientes')
        .select('ficha_medica')
        .eq('id', paciente.id)
        .single();
      if (!mounted) return;
      if (fetchError) {
        setError(fetchError.message);
      } else {
        setFichaMedica(data?.ficha_medica || {});
      }
      setLoadingDeps(false);
    })();
    return () => { mounted = false; };
  }, [paciente.id]);

  async function submit() {
    setError(null);
    if (!form.procedimento.trim()) return setError('Informe o procedimento.');

    setSaving(true);

    const novoTratamento = {
      id: Date.now().toString(),
      procedimento: form.procedimento.trim(),
      dente: form.dente.trim(),
      valor: parseFloat(form.valor) || 0,
      status: form.status,
      data: form.data,
      observacoes: form.observacoes.trim(),
      criado_em: new Date().toISOString(),
    };

    const listaAtual: any[] = Array.isArray(fichaMedica?.tratamentos) ? fichaMedica.tratamentos : [];
    const novaFicha = { ...(fichaMedica || {}), tratamentos: [...listaAtual, novoTratamento] };

    const { error: updateError } = await supabase
      .from('pacientes')
      .update({ ficha_medica: novaFicha })
      .eq('id', paciente.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ortus:tratamento-changed', { detail: { pacienteId: paciente.id } }));
    }

    onSuccess?.();
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <User size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Paciente</p>
            <p className="font-black text-slate-800 truncate">{paciente.nome}</p>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1"><Smile size={12} /> Procedimento <span className="text-rose-500">*</span></label>
          <input
            autoFocus
            value={form.procedimento}
            onChange={(e) => setForm({ ...form, procedimento: e.target.value })}
            className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder="Ex: Restauração, Limpeza, Canal..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 block">Dente</label>
            <input value={form.dente} onChange={(e) => setForm({ ...form, dente: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Ex: 16, 21..." />
          </div>
          <div>
            <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1"><DollarSign size={12} /> Valor</label>
            <input type="number" min="0" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 block">Data</label>
          <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>

        <div>
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 block">Status</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm({ ...form, status: 'planejado' })}
              className={`p-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition-all ${form.status === 'planejado' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-100 bg-white text-slate-500 hover:border-amber-200'}`}
            >
              <Clock size={14} /> Planejado
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, status: 'concluido' })}
              className={`p-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition-all ${form.status === 'concluido' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 bg-white text-slate-500 hover:border-emerald-200'}`}
            >
              <CheckCircle size={14} /> Concluído
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1.5 block">Observações</label>
          <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500" placeholder="Notas clínicas (opcional)" />
        </div>

        {error && <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">{error}</div>}
        {loadingDeps && <div className="text-xs text-slate-400 italic flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando ficha do paciente...</div>}
      </div>

      <div className="p-4 border-t border-slate-100 bg-white flex gap-2 shrink-0">
        <button type="button" onClick={onCancel} disabled={saving} className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50">
          Voltar
        </button>
        <button type="button" onClick={submit} disabled={saving || loadingDeps} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-black hover:bg-emerald-700 transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Registrar</>}
        </button>
      </div>
    </div>
  );
}
