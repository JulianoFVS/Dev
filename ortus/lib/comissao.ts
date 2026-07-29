import { supabase } from '@/lib/supabase';
import type { ComissaoRegra } from '@/lib/types/permissions';

export type ComissaoGatilho = 'debito_recebido' | 'tratamento_finalizado' | 'orcamento_aprovado';

export type RegistrarComissaoParams = {
  clinicaId: number | string;
  profissionalId: number | string | null | undefined;
  pacienteId?: string | null;
  agendamentoId?: number | string | null;
  gatilho: ComissaoGatilho;
  valorBase: number;
  descricao: string;
};

function calcularValorComissao(regra: ComissaoRegra, valorBase: number): number {
  if (regra.tipo === 'percentual') {
    return Math.round(valorBase * (Number(regra.valor) / 100) * 100) / 100;
  }
  return Number(regra.valor);
}

export async function registrarComissaoAutomatica(params: RegistrarComissaoParams): Promise<{ ok: boolean; lancamentos: number }> {
  const { clinicaId, profissionalId, pacienteId, agendamentoId, gatilho, valorBase, descricao } = params;

  if (!profissionalId || valorBase <= 0) return { ok: true, lancamentos: 0 };

  const { data: regras, error } = await supabase
    .from('comissoes_regras')
    .select('*')
    .eq('clinica_id', Number(clinicaId))
    .eq('profissional_id', Number(profissionalId))
    .eq('gatilho', gatilho)
    .eq('ativo', true);

  if (error || !regras?.length) return { ok: !error, lancamentos: 0 };

  let inseridos = 0;
  for (const regra of regras as ComissaoRegra[]) {
    const valorComissao = calcularValorComissao(regra, valorBase);
    if (valorComissao <= 0) continue;

    const { error: insErr } = await supabase.from('comissoes_lancamentos').insert({
      profissional_id: Number(profissionalId),
      clinica_id: Number(clinicaId),
      paciente_id: pacienteId || null,
      agendamento_id: agendamentoId ? Number(agendamentoId) : null,
      regra_id: regra.id,
      descricao,
      valor_base: valorBase,
      percentual_comissao: regra.tipo === 'percentual' ? Number(regra.valor) : null,
      valor_comissao: valorComissao,
      status: 'pendente',
    });

    if (!insErr) inseridos++;
  }

  return { ok: true, lancamentos: inseridos };
}

export async function registrarComissaoDebitoRecebido(
  agendamento: {
    id: number | string;
    clinica_id: number | string;
    profissional_id?: number | string | null;
    paciente_id?: string | null;
    procedimento?: string;
    valor_final?: number | string | null;
    valor?: number | string | null;
  },
  valorRecebido?: number,
) {
  const base = valorRecebido ?? Number(agendamento.valor_final ?? agendamento.valor ?? 0);
  return registrarComissaoAutomatica({
    clinicaId: agendamento.clinica_id,
    profissionalId: agendamento.profissional_id,
    pacienteId: agendamento.paciente_id,
    agendamentoId: agendamento.id,
    gatilho: 'debito_recebido',
    valorBase: base,
    descricao: `Comissão — recebimento: ${agendamento.procedimento || 'Atendimento'}`,
  });
}

export async function registrarComissaoTratamentoFinalizado(params: {
  clinicaId: number | string;
  profissionalId?: number | string | null;
  pacienteId: string;
  procedimento: string;
  valor: number;
}) {
  return registrarComissaoAutomatica({
    clinicaId: params.clinicaId,
    profissionalId: params.profissionalId,
    pacienteId: params.pacienteId,
    gatilho: 'tratamento_finalizado',
    valorBase: params.valor,
    descricao: `Comissão — tratamento finalizado: ${params.procedimento}`,
  });
}
