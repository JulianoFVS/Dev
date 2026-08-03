'use client';

import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Plus, X } from 'lucide-react';
import CustomSelect from '@/components/ui/CustomSelect';
import Modal from '@/components/ui/Modal';

export type TratamentoCriado = {
  id: number | string;
  nome: string;
  valor_sugerido: number | null;
};

type Especialidade = { id: string; nome: string };

type Props = {
  open: boolean;
  onClose: () => void;
  clinicaId: string | number | null | undefined;
  /** quick = Novo serviço (campos mínimos); full = Tratamento base completo */
  variant: 'quick' | 'full';
  onCreated: (tratamento: TratamentoCriado) => void;
};

const formVazio = {
  nome: '',
  valor: '',
  custo: '0',
  codigo_tuss: '',
  aceita_faces: false,
};

export default function QuickTratamentoModal({ open, onClose, clinicaId, variant, onCreated }: Props) {
  const [especialidades, setEspecialidades] = useState<Especialidade[]>([]);
  const [espId, setEspId] = useState('');
  const [novaEsp, setNovaEsp] = useState('');
  const [mostrarNovaEsp, setMostrarNovaEsp] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [loading, setLoading] = useState(false);
  const [loadingEsp, setLoadingEsp] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !clinicaId) return;
    setForm(formVazio);
    setErro(null);
    setMostrarNovaEsp(false);
    setNovaEsp('');
    carregarEspecialidades();
  }, [open, clinicaId]);

  async function carregarEspecialidades() {
    if (!clinicaId) return;
    setLoadingEsp(true);
    const { data } = await supabase
      .from('especialidades')
      .select('id, nome')
      .eq('clinica_id', Number(clinicaId))
      .eq('ativo', true)
      .order('nome');
    const lista = data || [];
    setEspecialidades(lista);
    setEspId(lista[0]?.id || '');
    setLoadingEsp(false);
  }

  async function garantirEspecialidade(): Promise<string | null> {
    if (!clinicaId) return null;
    if (espId) return espId;

    if (mostrarNovaEsp && novaEsp.trim()) {
      const { data, error } = await supabase
        .from('especialidades')
        .insert({ clinica_id: Number(clinicaId), nome: novaEsp.trim() })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    }

    if (variant === 'quick') {
      const { data, error } = await supabase
        .from('especialidades')
        .insert({ clinica_id: Number(clinicaId), nome: 'Geral' })
        .select('id')
        .single();
      if (error?.code === '23505') {
        const { data: existente } = await supabase
          .from('especialidades')
          .select('id')
          .eq('clinica_id', Number(clinicaId))
          .eq('nome', 'Geral')
          .maybeSingle();
        return existente?.id || null;
      }
      if (error) throw error;
      return data.id;
    }

    return null;
  }

  function parseNum(v: string) {
    const n = Number(v.replace(',', '.').trim());
    return Number.isFinite(n) ? n : null;
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!clinicaId) {
      setErro('Selecione a clínica antes de cadastrar.');
      return;
    }
    const nome = form.nome.trim();
    if (!nome) {
      setErro('Informe o nome do procedimento.');
      return;
    }

    const valor = parseNum(form.valor);
    const custo = parseNum(form.custo ?? '0');

    if (valor === null) {
      setErro('Informe o valor sugerido.');
      return;
    }
    if (variant === 'full' && custo === null) {
      setErro('Informe o custo padrão.');
      return;
    }

    setLoading(true);
    try {
      const especialidadeId = await garantirEspecialidade();
      if (!especialidadeId) {
        setErro('Selecione ou crie uma especialidade.');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('tratamentos_base')
        .insert({
          clinica_id: Number(clinicaId),
          especialidade_id: especialidadeId,
          nome,
          valor_sugerido: valor,
          custo_padrao: custo ?? 0,
          codigo_tuss_padrao: variant === 'full' ? form.codigo_tuss.trim() || null : null,
          aceita_faces: variant === 'full' ? form.aceita_faces : false,
          ativo: true,
        })
        .select('id, nome, valor_sugerido')
        .single();

      if (error) throw error;

      onCreated({
        id: data.id,
        nome: data.nome,
        valor_sugerido: data.valor_sugerido,
      });
      onClose();
    } catch (err: any) {
      setErro(err?.message || 'Erro ao salvar procedimento.');
    }
    setLoading(false);
  }

  const titulo = variant === 'quick' ? 'Novo serviço' : 'Novo tratamento base';
  const subtitulo = variant === 'quick'
    ? 'Cadastro rápido no catálogo da clínica.'
    : 'Procedimento completo no catálogo da clínica.';

  return (
    <Modal open={open} onClose={onClose} zIndex={100} maxWidth="lg" hideCloseButton panelClassName="bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b bg-slate-50 flex justify-between items-start gap-3">
          <div>
            <h3 className="font-bold text-slate-800">{titulo}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{subtitulo}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-red-500 p-1 shrink-0">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={salvar} className="p-5 space-y-4">
          {variant === 'full' && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Especialidade</label>
                <button
                  type="button"
                  onClick={() => setMostrarNovaEsp(!mostrarNovaEsp)}
                  className="text-[10px] font-bold text-purple-600 hover:underline flex items-center gap-1 uppercase"
                >
                  <Plus size={12} /> Nova
                </button>
              </div>
              {mostrarNovaEsp ? (
                <input
                  value={novaEsp}
                  onChange={(e) => setNovaEsp(e.target.value)}
                  placeholder="Ex.: Clínica Geral, Endodontia..."
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-purple-500"
                  autoFocus
                />
              ) : loadingEsp ? (
                <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando...</p>
              ) : (
                <CustomSelect
                  value={espId}
                  onChange={setEspId}
                  options={especialidades.map((e) => ({ value: e.id, label: e.nome }))}
                  placeholder={especialidades.length ? 'Selecione...' : 'Nenhuma — clique em Nova'}
                />
              )}
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Nome do procedimento</label>
            <input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex.: Limpeza, Restauração resinosa..."
              className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus={variant === 'quick'}
            />
          </div>

          <div className={`grid gap-3 ${variant === 'full' ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Valor sugerido (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0,00"
              />
            </div>
            {variant === 'full' && (
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Custo padrão (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.custo}
                  onChange={(e) => setForm({ ...form, custo: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0,00"
                />
              </div>
            )}
          </div>

          {variant === 'full' && (
            <>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Código TUSS (opcional)</label>
                <input
                  value={form.codigo_tuss}
                  onChange={(e) => setForm({ ...form, codigo_tuss: e.target.value })}
                  className="w-full p-2.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex.: 81000030"
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.aceita_faces}
                  onChange={(e) => setForm({ ...form, aceita_faces: e.target.checked })}
                  className="rounded border-slate-300"
                />
                Aceita marcação por faces (odontograma)
              </label>
            </>
          )}

          {erro && (
            <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-lg">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Salvar e usar
            </button>
          </div>
        </form>
    </Modal>
  );
}
