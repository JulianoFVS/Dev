import { supabase } from '@/lib/supabase';
import { receberAgendamento } from '@/lib/recebimentoAgendamento';
import type { TaxaMaquininha } from '@/lib/configDefaults';

export type DebitoPaciente = {
  id: string | number;
  origem: 'manual' | 'agendamento' | 'tratamento';
  descricao: string;
  valor: number;
  status: 'pendente' | 'pago';
  data_pagamento?: string | null;
  created_at?: string | null;
  agendamento_id?: number | null;
  tratamento_id?: string | null;
  profissionais?: { nome?: string } | null;
  data_hora?: string | null;
};

export async function listarDebitosPaciente(pacienteId: string | number): Promise<DebitoPaciente[]> {
  const items: DebitoPaciente[] = [];

  const { data: manuais } = await supabase
    .from('paciente_debitos')
    .select('*')
    .eq('paciente_id', pacienteId)
    .eq('status', 'pendente')
    .order('created_at', { ascending: false });

  (manuais || []).forEach((d: any) => {
    items.push({
      id: d.id,
      origem: 'manual',
      descricao: d.descricao,
      valor: Number(d.valor) || 0,
      status: d.status,
      data_pagamento: d.data_pagamento,
      created_at: d.created_at,
      agendamento_id: d.agendamento_id,
      tratamento_id: d.tratamento_id,
    });
  });

  const { data: fiados } = await supabase
    .from('agendamentos')
    .select('*, profissionais(nome)')
    .eq('paciente_id', pacienteId)
    .eq('status', 'fiado')
    .order('data_hora', { ascending: false });

  (fiados || [])
    .filter((a: any) => a.tipo_registro !== 'debito_manual' && a.observacoes !== 'Débito manual')
    .forEach((a: any) => {
      if (items.some(i => i.origem === 'agendamento' && i.agendamento_id === a.id)) return;
      items.push({
        id: `ag_${a.id}`,
        origem: 'agendamento',
        descricao: a.procedimento || 'Atendimento',
        valor: Number(a.valor_final ?? a.valor) || 0,
        status: 'pendente',
        agendamento_id: a.id,
        profissionais: a.profissionais,
        data_hora: a.data_hora,
        created_at: a.data_hora,
      });
    });

  return items;
}

export async function listarOpcoesMarcarNaoPago(pacienteId: string | number) {
  const { data: ags } = await supabase
    .from('agendamentos')
    .select('id, procedimento, data_hora, valor_final, valor, status, observacoes, tipo_registro')
    .eq('paciente_id', pacienteId)
    .neq('status', 'fiado')
    .neq('status', 'cancelado')
    .or('tipo_registro.is.null,tipo_registro.eq.agenda')
    .order('data_hora', { ascending: false });

  const { data: trats } = await supabase
    .from('paciente_tratamentos')
    .select('id, procedimento, valor, data, status')
    .eq('paciente_id', pacienteId)
    .in('status', ['concluido', 'andamento'])
    .order('data', { ascending: false });

  return {
    agendamentos: (ags || []).filter((a: any) => a.observacoes !== 'Débito manual' && a.tipo_registro !== 'debito_manual'),
    tratamentos: trats || [],
  };
}

export async function receberDebito(
  debito: DebitoPaciente & { clinica_id?: string | number },
  taxaId?: string,
  taxas?: TaxaMaquininha[],
) {
  if (debito.origem === 'manual') {
    const { error } = await supabase
      .from('paciente_debitos')
      .update({ status: 'pago', data_pagamento: new Date().toISOString() })
      .eq('id', debito.id);
    if (error) throw error;
    return { valorLiquido: debito.valor, comissaoLancamentos: 0 };
  }

  const agId = debito.agendamento_id ?? (typeof debito.id === 'string' && debito.id.startsWith('ag_')
    ? Number(debito.id.slice(3))
    : debito.id);

  return receberAgendamento(
    {
      id: agId,
      clinica_id: debito.clinica_id!,
      valor_final: debito.valor,
      valor: debito.valor,
      procedimento: debito.descricao,
    },
    taxaId,
    taxas,
  );
}

export async function criarDebitoManual(input: {
  paciente_id: string | number;
  clinica_id: string | number;
  descricao: string;
  valor: number;
  agendamento_id?: number | null;
  tratamento_id?: string | null;
}) {
  const { data, error } = await supabase
    .from('paciente_debitos')
    .insert([{
      paciente_id: input.paciente_id,
      clinica_id: input.clinica_id,
      descricao: input.descricao.trim(),
      valor: input.valor,
      agendamento_id: input.agendamento_id || null,
      tratamento_id: input.tratamento_id || null,
      status: 'pendente',
    }])
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function marcarAgendamentoNaoPago(agendamentoId: number) {
  const { data, error } = await supabase
    .from('agendamentos')
    .update({ status: 'fiado' })
    .eq('id', agendamentoId)
    .select('*, profissionais(nome)')
    .single();
  if (error) throw error;
  return data;
}

export async function marcarTratamentoNaoPago(tratamentoId: string, valor?: number) {
  const updates: Record<string, unknown> = { status: 'andamento' };
  if (valor != null) updates.valor = valor;
  const { data, error } = await supabase
    .from('paciente_tratamentos')
    .update(updates)
    .eq('id', tratamentoId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
