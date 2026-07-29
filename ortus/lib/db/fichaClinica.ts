import { supabase } from '@/lib/supabase';
import type { FichaClinicaJson } from '@/lib/db/types';

const CHAVES_CLINICAS = ['odontograma', 'texto_livre', 'marcacoes_hof', 'hof_fotos'] as const;

/** Extrai só os campos clínicos gráficos do JSON legado. */
export function extrairFichaClinica(ficha: Record<string, unknown> | null | undefined): FichaClinicaJson {
  const fm = ficha || {};
  return {
    odontograma: (fm.odontograma as Record<string, unknown>) || {},
    texto_livre: (fm.texto_livre as string) || '',
    marcacoes_hof: (fm.marcacoes_hof as unknown[]) || [],
    hof_fotos: (fm.hof_fotos as unknown[]) || [],
  };
}

/** Mescla campos clínicos no JSON existente (preserva outras chaves legadas). */
export function mesclarFichaClinica(
  atual: Record<string, unknown> | null | undefined,
  parcial: Partial<FichaClinicaJson>,
): Record<string, unknown> {
  const base = { ...(atual || {}) };
  for (const k of CHAVES_CLINICAS) {
    if (parcial[k] !== undefined) base[k] = parcial[k];
  }
  return base;
}

export async function carregarFichaClinica(pacienteId: string): Promise<FichaClinicaJson> {
  const { data, error } = await supabase
    .from('pacientes')
    .select('ficha_medica')
    .eq('id', pacienteId)
    .single();

  if (error) throw error;
  return extrairFichaClinica(data?.ficha_medica as Record<string, unknown>);
}

export async function salvarFichaClinica(
  pacienteId: string,
  parcial: Partial<FichaClinicaJson>,
  atual?: Record<string, unknown> | null,
): Promise<FichaClinicaJson> {
  let base = atual;
  if (!base) {
    const { data } = await supabase.from('pacientes').select('ficha_medica').eq('id', pacienteId).single();
    base = (data?.ficha_medica as Record<string, unknown>) || {};
  }
  const merged = mesclarFichaClinica(base, parcial);
  const { error } = await supabase.from('pacientes').update({ ficha_medica: merged }).eq('id', pacienteId);
  if (error) throw error;
  return extrairFichaClinica(merged);
}
