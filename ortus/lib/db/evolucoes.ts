import { supabase } from '@/lib/supabase';
import { dados as tabelas } from '@/lib/local/consulta';
import { rowToEvolucao, type EvolucaoPaciente } from '@/lib/db/types';
import { inserir, listar, modoDados, remover } from '@/lib/local/cliente';

export async function listarEvolucoes(pacienteId: string): Promise<EvolucaoPaciente[]> {
  const modo = await modoDados();
  if (modo === 'local') {
    const linhas = await listar<Record<string, unknown>>('paciente_evolucoes', {
      filtros: [{ col: 'paciente_id', op: 'eq', valor: pacienteId }],
      ordem: [
        { col: 'data', asc: false },
        { col: 'criado_em', asc: false },
      ],
    });
    return linhas.map(rowToEvolucao);
  }

  const { data, error } = await tabelas.from('paciente_evolucoes')
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
  const payload = {
    paciente_id: pacienteId,
    legacy_id: Date.now().toString(),
    texto: input.texto,
    data: input.data || null,
    profissional_nome: input.profissional || null,
  };

  const modo = await modoDados();
  if (modo === 'local') {
    const salva = await inserir<Record<string, unknown>>('paciente_evolucoes', payload);
    return rowToEvolucao(salva);
  }

  const { data, error } = await tabelas.from('paciente_evolucoes')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return rowToEvolucao(data);
}

export async function excluirEvolucao(id: string): Promise<void> {
  const modo = await modoDados();
  if (modo === 'local') {
    await remover('paciente_evolucoes', id);
    return;
  }

  const { error } = await tabelas.from('paciente_evolucoes').delete().eq('id', id);
  if (error) throw error;
}
