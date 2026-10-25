'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Plus, Sparkles, User } from 'lucide-react';

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
      paciente_id: paciente.id,
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

  const marca = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#d7dece] bg-[#eef2e8] text-xs font-medium text-neutral-800';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
        <div className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-[#f3f4f1] p-3">
          <span className={marca}><User size={14} /></span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-neutral-500">Paciente</p>
            <p className="truncate text-sm font-medium text-neutral-900">{paciente.nome}</p>
          </div>
        </div>

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900"><span className={marca}>A</span> Categoria <span className="text-neutral-900">*</span></h3>
          <div className="grid grid-cols-2 gap-2">
            {(['Removível', 'Fixa'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setForm({ ...form, categoria: cat, tipo_protese: '' })}
                className={`rounded-md border p-3 text-left text-sm font-medium ${form.categoria === cat ? 'border-neutral-900 bg-[#f3f4f1] text-neutral-900' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {visibleTypes.length > 0 && (
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900"><span className={marca}>B</span> Tipo <span className="text-neutral-900">*</span></h3>
            <div className="grid grid-cols-2 gap-2">
              {visibleTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm({ ...form, tipo_protese: type })}
                  className={`rounded-md border px-3 py-2.5 text-left text-sm font-medium ${form.tipo_protese === type ? 'border-neutral-900 bg-[#f3f4f1] text-neutral-900' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900"><span className={marca}><Sparkles size={13} /></span> Detalhamento</h3>
          <div className="grid grid-cols-2 gap-2">
            <input value={form.cor_dente} onChange={(e) => setForm({ ...form, cor_dente: e.target.value })} className="h-10 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900" placeholder="Cor do dente: A2, B1..." />
            <input value={form.cor_gengiva} onChange={(e) => setForm({ ...form, cor_gengiva: e.target.value })} className="h-10 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900" placeholder="Cor da gengiva / STG" />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(['Superior', 'Inferior', 'Ambas'] as const).map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => setForm({ ...form, posicao: pos })}
                className={`rounded-md border px-3 py-2.5 text-xs font-medium ${form.posicao === pos ? 'border-neutral-900 bg-[#f3f4f1] text-neutral-900' : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'}`}
              >
                {pos}
              </button>
            ))}
          </div>
          <textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} className="mt-2 w-full resize-none rounded-md border border-neutral-200 bg-white p-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900" placeholder="Observações rápidas para o laboratório" />
        </section>

        {form.tipo_protese && (
          <div className="rounded-md border border-neutral-200 bg-[#f3f4f1] p-3">
            <p className="mb-2 text-xs font-medium text-neutral-500">Checklist que será criado</p>
            <div className="space-y-1">
              {buildChecklist(form.tipo_protese).map((item) => (
                <p key={item.tarefa} className="flex items-center gap-2 text-xs font-medium text-neutral-700"><span className="h-1.5 w-1.5 rounded-full bg-[#9aab78]" />{item.tarefa}</p>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        {loadingDeps && <p className="flex items-center gap-2 text-xs text-neutral-400"><Loader2 size={14} className="animate-spin" /> Carregando etapas</p>}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-neutral-200 bg-white p-4">
        <button type="button" onClick={onCancel} disabled={saving} className="h-9 rounded-md px-3 text-sm font-medium text-neutral-500 hover:bg-neutral-50 disabled:opacity-50">
          Cancelar
        </button>
        <button type="button" onClick={submit} disabled={saving || !form.categoria || !form.tipo_protese} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400">
          {saving ? <Loader2 className="animate-spin" size={16} /> : <><Plus size={16} /> Criar pedido</>}
        </button>
      </div>
    </div>
  );
}
