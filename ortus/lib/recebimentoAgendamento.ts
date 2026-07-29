import { supabase } from '@/lib/supabase';
import { carregarConfig, salvarConfig } from '@/lib/configClinica';
import { calcularValorLiquido, TAXAS_MAQUININHA_PADRAO, type TaxaMaquininha } from '@/lib/configDefaults';
import { registrarComissaoDebitoRecebido } from '@/lib/comissao';

export async function carregarTaxasAtivas(clinicaId: string | number): Promise<TaxaMaquininha[]> {
  const raw = await carregarConfig<TaxaMaquininha[]>(clinicaId, 'taxas_maquininha', 'ortus_taxas_maquininha', TAXAS_MAQUININHA_PADRAO);
  const lista = Array.isArray(raw) && raw.length ? raw : TAXAS_MAQUININHA_PADRAO;
  return lista.filter((t) => t.ativo);
}

export async function receberAgendamento(
  agendamento: {
    id: number | string;
    clinica_id: number | string;
    profissional_id?: number | string | null;
    paciente_id?: string | null;
    procedimento?: string;
    valor_final?: number | string | null;
    valor?: number | string | null;
  },
  taxaId?: string,
  taxas?: TaxaMaquininha[],
) {
  const { error } = await supabase.from('agendamentos').update({ status: 'concluido' }).eq('id', agendamento.id);
  if (error) throw error;

  const bruto = Number(agendamento.valor_final ?? agendamento.valor ?? 0);
  let valorLiquido = bruto;

  const taxasLista = taxas ?? (await carregarTaxasAtivas(agendamento.clinica_id));
  if (taxaId) {
    const taxa = taxasLista.find((t) => t.id === taxaId);
    if (taxa) {
      valorLiquido = calcularValorLiquido(bruto, taxa.taxa_percentual);
      const meta = await carregarConfig<Record<string, unknown>>(
        agendamento.clinica_id,
        'lancamentos_meta',
        'ortus_lancamentos_meta',
        {},
      );
      const novos = {
        ...meta,
        [`ag_${agendamento.id}`]: {
          taxa_id: taxa.id,
          taxa_nome: taxa.nome,
          taxa_percentual: taxa.taxa_percentual,
          valor_bruto: bruto,
          valor_liquido: valorLiquido,
        },
      };
      await salvarConfig(agendamento.clinica_id, 'lancamentos_meta', novos);
    }
  }

  const comissao = await registrarComissaoDebitoRecebido(agendamento, valorLiquido);
  return { valorLiquido, comissaoLancamentos: comissao.lancamentos };
}
