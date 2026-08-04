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
  input: Omit<AnamnesePaciente, 'id' | 'criado_em' | 'atualizado_em'>,
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

export async function atualizarAnamnese(
  id: string,
  input: Partial<Omit<AnamnesePaciente, 'id' | 'criado_em'>>,
): Promise<AnamnesePaciente> {
  const payload: Record<string, unknown> = {
    atualizado_em: new Date().toISOString(),
  };
  if (input.modelo_id !== undefined) payload.modelo_id = input.modelo_id;
  if (input.modelo_nome !== undefined) payload.modelo_nome = input.modelo_nome;
  if (input.data !== undefined) payload.data = input.data;
  if (input.preenchido_por !== undefined) payload.preenchido_por = input.preenchido_por;
  if (input.respostas !== undefined) payload.respostas = input.respostas;
  if (input.perguntas_snapshot !== undefined) payload.perguntas_snapshot = input.perguntas_snapshot;

  const { data, error } = await supabase
    .from('paciente_anamneses')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return rowToAnamnese(data);
}

export async function excluirAnamnese(id: string): Promise<void> {
  const { error } = await supabase.from('paciente_anamneses').delete().eq('id', id);
  if (error) throw error;
}

export async function gerarLinkAnamnesePaciente(
  pacienteId: string,
  modeloId: string,
  clinicaId?: number | string | null,
): Promise<{ url: string; expires_at: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.');

  const res = await fetch('/api/anamnese/gerar-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      paciente_id: pacienteId,
      modelo_id: modeloId,
      clinica_id: clinicaId ?? null,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Erro ao gerar link.');
  return { url: body.url, expires_at: body.expires_at };
}
