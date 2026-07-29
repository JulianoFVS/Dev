import { supabase } from '@/lib/supabase';
import { rowToAnamnese, type AnamnesePaciente } from '@/lib/db/types';

export async function listarAnamneses(pacienteId: string): Promise<AnamnesePaciente[]> {
  const { data, error } = await supabase
    .from('paciente_anamneses')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('data', { ascending: false, nullsFirst: false })
    .order('criado_em', { ascending: false });

  if (error) throw error;
  return (data || []).map(rowToAnamnese);
}

export async function criarAnamnese(
  pacienteId: string,
  input: Omit<AnamnesePaciente, 'id' | 'criado_em'>,
): Promise<AnamnesePaciente> {
  const { data, error } = await supabase
    .from('paciente_anamneses')
    .insert({
      paciente_id: pacienteId,
      legacy_id: Date.now().toString(),
      modelo_id: input.modelo_id || null,
      modelo_nome: input.modelo_nome || null,
      data: input.data || null,
      preenchido_por: input.preenchido_por || 'profissional',
      respostas: input.respostas || {},
      perguntas_snapshot: input.perguntas_snapshot || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return rowToAnamnese(data);
}

export async function excluirAnamnese(id: string): Promise<void> {
  const { error } = await supabase.from('paciente_anamneses').delete().eq('id', id);
  if (error) throw error;
}
