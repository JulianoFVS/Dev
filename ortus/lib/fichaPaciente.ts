import { listarAnamneses } from '@/lib/db/anamneses';
import { listarDocumentos } from '@/lib/db/documentos';
import { listarEvolucoes } from '@/lib/db/evolucoes';
import { carregarFichaClinica } from '@/lib/db/fichaClinica';
import { listarTratamentos } from '@/lib/db/tratamentos';
import { legacyJsonToProntuario, type ProntuarioPaciente } from '@/lib/db/types';
import { supabase } from '@/lib/supabase';

/** Carrega prontuário completo (tabelas relacionais + JSON clínico). */
export async function carregarProntuario(pacienteId: string): Promise<ProntuarioPaciente> {
  const [fichaClinica, tratamentos, anamneses, documentos, evolucoes] = await Promise.all([
    carregarFichaClinica(pacienteId),
    listarTratamentos(pacienteId).catch(() => []),
    listarAnamneses(pacienteId).catch(() => []),
    listarDocumentos(pacienteId).catch(() => []),
    listarEvolucoes(pacienteId).catch(() => []),
  ]);

  const temRelacional =
    tratamentos.length + anamneses.length + documentos.length + evolucoes.length > 0;

  if (temRelacional) {
    return { fichaClinica, tratamentos, anamneses, documentos, evolucoes };
  }

  // Fallback: dados ainda só no JSON (pré-migration ou tabelas indisponíveis)
  const { data } = await supabase.from('pacientes').select('ficha_medica').eq('id', pacienteId).single();
  return legacyJsonToProntuario(data?.ficha_medica as Record<string, unknown>);
}
