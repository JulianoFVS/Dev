import { supabase } from '@/lib/supabase';

import { carregarConfig } from '@/lib/configClinica';

import { CONFIG_KEYS } from '@/lib/configKeys';

import { calcularValorLiquido, TAXAS_MAQUININHA_PADRAO, normalizarTaxasMaquininha, type TaxaMaquininha } from '@/lib/configDefaults';

import { registrarComissaoDebitoRecebido } from '@/lib/comissao';



export async function carregarTaxasAtivas(clinicaId: string | number): Promise<TaxaMaquininha[]> {

  const raw = await carregarConfig<TaxaMaquininha[]>(clinicaId, CONFIG_KEYS.taxas_maquininha, 'ortus_taxas_maquininha', TAXAS_MAQUININHA_PADRAO);

  const lista = normalizarTaxasMaquininha(raw);

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

  const bruto = Number(agendamento.valor_final ?? agendamento.valor ?? 0);

  let valorLiquido = bruto;

  let taxaMeta: Record<string, unknown> = {};



  const taxasLista = taxas ?? (await carregarTaxasAtivas(agendamento.clinica_id));

  if (taxaId) {

    const taxa = taxasLista.find((t) => t.id === taxaId);

    if (taxa) {

      valorLiquido = calcularValorLiquido(bruto, taxa.taxa_percentual);

      taxaMeta = {

        valor_bruto: bruto,

        valor_liquido: valorLiquido,

        taxa_id: taxa.id,

        taxa_nome: taxa.nome,

        taxa_percentual: taxa.taxa_percentual,

      };

    }

  }



  const { error } = await supabase

    .from('agendamentos')

    .update({

      status: 'concluido',

      ...taxaMeta,

    })

    .eq('id', agendamento.id);



  if (error) throw error;



  // Legado: mantém meta JSON durante transição (financeiro ainda lê)

  if (taxaMeta.taxa_id) {

    const meta = await carregarConfig<Record<string, unknown>>(

      agendamento.clinica_id,

      CONFIG_KEYS.lancamentos_meta,

      'ortus_lancamentos_meta',

      {},

    );

    await import('@/lib/configClinica').then(({ salvarConfig }) =>

      salvarConfig(agendamento.clinica_id, CONFIG_KEYS.lancamentos_meta, {

        ...meta,

        [`ag_${agendamento.id}`]: taxaMeta,

      }),

    );

  }



  const comissao = await registrarComissaoDebitoRecebido(agendamento, valorLiquido);

  return { valorLiquido, comissaoLancamentos: comissao.lancamentos };

}


