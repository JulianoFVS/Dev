import { supabase } from '@/lib/supabase';
import { dados as tabelas } from '@/lib/local/consulta';
import { rowToTratamento, type TratamentoPaciente } from '@/lib/db/types';
import { atualizar, inserir, listar, modoDados, remover } from '@/lib/local/cliente';

export async function listarTratamentos(pacienteId: string): Promise<TratamentoPaciente[]> {
  const modo = await modoDados();
  if (modo === 'local') {
    const linhas = await listar<Record<string, unknown>>('paciente_tratamentos', {
      filtros: [{ col: 'paciente_id', op: 'eq', valor: pacienteId }],
      ordem: [
        { col: 'data', asc: false },
        { col: 'criado_em', asc: false },
      ],
    });
    return linhas.map(rowToTratamento);
  }

  const { data, error } = await tabelas.from('paciente_tratamentos')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('data', { ascending: false, nullsFirst: false })
    .order('criado_em', { ascending: false });

  if (error) throw error;
  return (data || []).map(rowToTratamento);
}

export async function criarTratamento(
  pacienteId: string,
  clinicaId: number | string | null | undefined,
  input: Omit<TratamentoPaciente, 'id' | 'paciente_id' | 'criado_em'>,
): Promise<TratamentoPaciente> {
  const legacyId = Date.now().toString();
  const payload = {
    paciente_id: pacienteId,
    clinica_id: clinicaId ? Number(clinicaId) : null,
    legacy_id: legacyId,
    procedimento: input.procedimento,
    dente: input.dente || null,
    valor: input.valor ?? 0,
    status: input.status || 'planejado',
    data: input.data || null,
    observacoes: input.observacoes || null,
  };

  const modo = await modoDados();
  if (modo === 'local') {
    const salvo = await inserir<Record<string, unknown>>('paciente_tratamentos', payload);
    return rowToTratamento(salvo);
  }

  const { data, error } = await tabelas.from('paciente_tratamentos')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return rowToTratamento(data);
}

export async function atualizarTratamento(
  id: string,
  input: Partial<Omit<TratamentoPaciente, 'id' | 'paciente_id' | 'criado_em'>>,
): Promise<TratamentoPaciente> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.procedimento !== undefined) payload.procedimento = input.procedimento;
  if (input.dente !== undefined) payload.dente = input.dente;
  if (input.valor !== undefined) payload.valor = input.valor;
  if (input.status !== undefined) payload.status = input.status;
  if (input.data !== undefined) payload.data = input.data;
  if (input.observacoes !== undefined) payload.observacoes = input.observacoes;

  const modo = await modoDados();
  if (modo === 'local') {
    const salvo = await atualizar<Record<string, unknown>>('paciente_tratamentos', id, payload);
    if (!salvo) throw new Error('Tratamento não encontrado no banco local.');
    return rowToTratamento(salvo);
  }

  const { data, error } = await tabelas.from('paciente_tratamentos')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return rowToTratamento(data);
}

export async function excluirTratamento(id: string): Promise<void> {
  const modo = await modoDados();
  if (modo === 'local') {
    await remover('paciente_tratamentos', id);
    return;
  }

  const { error } = await tabelas.from('paciente_tratamentos').delete().eq('id', id);
  if (error) throw error;
}
