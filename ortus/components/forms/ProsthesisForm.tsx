'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Plus, Smile, Sparkles, User } from 'lucide-react';

export type ProsthesisPatient = {
  id: string | number;
  nome: string;
  clinica_id?: string | null;
};

type Column = { id: number; titulo: string; ordem: number; clinica_id?: string | null };
type ChecklistItem = { tarefa: string; feito: boolean };

type ProsthesisFormProps = {
  paciente: ProsthesisPatient;
  onSuccess?: () => void;
  onCancel?: () => void;
};

const REMOVABLE_TYPES = ['PPR (Com grampo)', 'PPR (Sem grampo)', 'PT', 'Flexível'];
const FIXED_TYPES = ['Coroa sobre dente', 'Coroa sobre implante', 'Protocolo', 'Fixa adesiva'];

function buildChecklist(tipo: string): ChecklistItem[] {
  if (tipo === 'PPR (Com grampo)') return [{ tarefa: 'Prova do Grampo', feito: false }, { tarefa: 'Prova do Dente', feito: false }];
  if (tipo === 'PPR (Sem grampo)') return [{ tarefa: 'Prova da Cera', feito: false }, { tarefa: 'Prova do Dente', feito: false }];
  if (tipo === 'PT' || tipo === 'Protocolo') return [{ tarefa: 'Prova dos Dentes', feito: false }, { tarefa: 'Prova da Barra/Estrutura', feito: false }];
  return [{ tarefa: 'Prova da Peça', feito: false }];
}

function normalizeClinicId(value: string | null) {
  if (!value || value === 'todas') return null;
  return value;
}

export default function ProsthesisForm({ paciente, onSuccess, onCancel }: ProsthesisFormProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [loadingDeps, setLoadingDeps] = useState(true);
  const [clinicId, setClinicId] = useState<string | null>(null);

  const [form, setForm] = useState({
    categoria: '' as '' | 'Removível' | 'Fixa',
    tipo_protese: '',
    cor_dente: '',
    cor_gengiva: '',
    posicao: '' as '' | 'Superior' | 'Inferior' | 'Ambas',
    descricao: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const storedClinic = typeof window !== 'undefined' ? localStorage.getItem('ortus_clinica_id') : null;
      const nextClinicId = normalizeClinicId(storedClinic) || (paciente.clinica_id ? String(paciente.clinica_id) : null);

      let cols = supabase.from('kanban_colunas').select('id, titulo, ordem, clinica_id').order('ordem');
      if (nextClinicId) cols = cols.eq('clinica_id', nextClinicId);
      const { data } = await cols;
      if (!mounted) return;
      setClinicId(nextClinicId);
      setColumns(data || []);
      setLoadingDeps(false);
    })();
    return () => { mounted = false; };
  }, [paciente.clinica_id]);

  const visibleTypes = form.categoria === 'Removível' ? REMOVABLE_TYPES : form.categoria === 'Fixa' ? FIXED_TYPES : [];

  async function submit() {
    setError(null);
    if (!form.categoria) return setError('Escolha a categoria da prótese.');
    if (!form.tipo_protese) return setError('Escolha o tipo da prótese.');

    const solicitado = columns.find((c) => c.titulo === 'Solicitado') || columns[0];
    if (!solicitado || solicitado.id < 0) return setError('Etapas do kanban ainda não foram carregadas.');

    setSaving(true);
    const payload = {
      coluna_id: solicitado.id,
      clinica_id: clinicId,
      paciente_nome: paciente.nome,
      descricao: form.descricao.trim(),
      categoria: form.categoria,
      tipo_protese: form.tipo_protese,
      cor_dente: form.cor_dente.trim(),
      cor_gengiva: form.cor_gengiva.trim(),
      posicao: form.posicao,
      checklist: buildChecklist(form.tipo_protese),
    };

    const { error: insertError } = await supabase.from('kanban_cartoes').insert([payload]);
    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ortus:protese-changed'));
    }

    onSuccess?.();
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-pink-50 border border-pink-100">
          <div className="w-9 h-9 rounded-xl bg-pink-600 text-white flex items-center justify-center shrink-0">
            <User size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-pink-700">Paciente</p>
            <p className="font-black text-slate-800 truncate">{paciente.nome}</p>
          </div>
        </div>

        <section>
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5"><Smile size={12} /> Categoria <span className="text-rose-500">*</span></h3>
          <div className="grid grid-cols-2 gap-2">
            {(['Removível', 'Fixa'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setForm({ ...form, categoria: cat, tipo_protese: '' })}
                className={`p-4 rounded-2xl border-2 text-sm font-black transition-all ${form.categoria === cat ? 'border-pink-600 bg-pink-50 text-pink-800' : 'border-slate-100 bg-white hover:border-pink-200 hover:bg-pink-50/40 text-slate-700'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {visibleTypes.length > 0 && (
          <section>
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Tipo <span className="text-rose-500">*</span></h3>
            <div className="grid grid-cols-2 gap-2">
              {visibleTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm({ ...form, tipo_protese: type })}
                  className={`p-3 rounded-2xl border text-xs font-black transition-all ${form.tipo_protese === type ? 'border-pink-600 bg-pink-50 text-pink-800' : 'border-slate-100 bg-white hover:border-pink-200 hover:bg-pink-50/40 text-slate-700'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5"><Sparkles size={12} /> Detalhamento</h3>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.cor_dente} onChange={(e) => setForm({ ...form, cor_dente: e.target.value })} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none focus:ring-2 focus:ring-pink-500" placeholder="Cor do dente (A2, B1...)" />
            <input value={form.cor_gengiva} onChange={(e) => setForm({ ...form, cor_gengiva: e.target.value })} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none focus:ring-2 focus:ring-pink-500" placeholder="Cor da gengiva / STG" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {(['Superior', 'Inferior', 'Ambas'] as const).map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => setForm({ ...form, posicao: pos })}
                className={`p-3 rounded-2xl border text-xs font-black transition-all ${form.posicao === pos ? 'border-pink-600 bg-pink-50 text-pink-800' : 'border-slate-100 bg-white hover:border-pink-200 text-slate-600'}`}
              >
                {pos}
              </button>
            ))}
          </div>
          <textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} className="mt-3 w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 font-medium outline-none focus:ring-2 focus:ring-pink-500" placeholder="Observações rápidas para o laboratório" />
        </section>

        {form.tipo_protese && (
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Checklist que será criado</p>
            <div className="space-y-1">
              {buildChecklist(form.tipo_protese).map((item) => (
                <div key={item.tarefa} className="text-xs font-bold text-slate-600 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-pink-400" />{item.tarefa}</div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">{error}</div>}
        {loadingDeps && <div className="text-xs text-slate-400 italic flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando etapas do kanban...</div>}
      </div>

      <div className="p-4 border-t border-slate-100 bg-white flex gap-2 shrink-0">
        <button type="button" onClick={onCancel} disabled={saving} className="flex-1 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50">
          Voltar
        </button>
        <button type="button" onClick={submit} disabled={saving || !form.categoria || !form.tipo_protese} className="flex-1 py-3 rounded-xl bg-pink-600 text-white font-black hover:bg-pink-700 transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <><Plus size={16} /> Criar pedido</>}
        </button>
      </div>
    </div>
  );
}
