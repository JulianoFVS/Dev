import { supabase } from '@/lib/supabase';
import { rowToEvolucao, type EvolucaoPaciente } from '@/lib/db/types';

export async function listarEvolucoes(pacienteId: string): Promise<EvolucaoPaciente[]> {
  const { data, error } = await supabase
    .from('paciente_evolucoes')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('data', { ascending: false, nullsFirst: false })
    .order('criado_em', { ascending: false });

  if (error) throw error;
  return (data || []).map(rowToEvolucao);
}

export async function criarEvolucao(
  pacienteId: string,
  input: { texto: string; data?: string | null; profissional?: string | null },
): Promise<EvolucaoPaciente> {
  const { data, error } = await supabase
    .from('paciente_evolucoes')
    .insert({
      paciente_id: pacienteId,
      legacy_id: Date.now().toString(),
      texto: input.texto,
      data: input.data || null,
      profissional_nome: input.profissional || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return rowToEvolucao(data);
}

export async function excluirEvolucao(id: string): Promise<void> {
  const { error } = await supabase.from('paciente_evolucoes').delete().eq('id', id);
  if (error) throw error;
}
