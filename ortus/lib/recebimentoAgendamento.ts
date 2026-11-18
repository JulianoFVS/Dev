import { dados as tabelas } from '@/lib/local/consulta';
import { carregarConfig, carregarConfigComErro, salvarConfig } from '@/lib/configClinica';
import { CONFIG_KEYS } from '@/lib/configKeys';
import { calcularValorLiquido, TAXAS_MAQUININHA_PADRAO, normalizarTaxasMaquininha, type TaxaMaquininha } from '@/lib/configDefaults';
import { registrarComissaoDebitoRecebido } from '@/lib/comissao';

export type ParteRecebimento = { taxaId?: string; valor: number };

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
  partes?: ParteRecebimento[],
) {
  const bruto = Number(agendamento.valor_final ?? agendamento.valor ?? 0);
  const taxasLista = taxas ?? (await carregarTaxasAtivas(agendamento.clinica_id));
  const partesEfetivas = partes && partes.length > 0 ? partes : [{ taxaId, valor: bruto }];

  const formas = partesEfetivas
    .map((parte) => {
      const valor = Number(parte.valor) || 0;
      const taxa = parte.taxaId ? taxasLista.find((t) => t.id === parte.taxaId) : undefined;
      return {
        valor,
        valor_liquido: taxa ? calcularValorLiquido(valor, taxa.taxa_percentual) : valor,
        taxa_id: taxa?.id || null,
        taxa_nome: taxa?.nome || 'Dinheiro',
        taxa_percentual: taxa?.taxa_percentual || 0,
      };
    })
    .filter((parte) => parte.valor > 0);

  const valorLiquido = formas.reduce((soma, parte) => soma + parte.valor_liquido, 0) || bruto;
  const unica = formas.length === 1 ? formas[0] : null;
  const taxaMeta: Record<string, unknown> = formas.length
    ? {
        valor_bruto: bruto,
        valor_liquido: valorLiquido,
        taxa_id: unica?.taxa_id ?? null,
        taxa_nome: formas.map((parte) => parte.taxa_nome).join(' + '),
        taxa_percentual: unica ? unica.taxa_percentual : null,
      }
    : {};

  // Só recebe débito em aberto (status 'fiado') e confere que a linha mudou: duas telas recebendo
  // a mesma consulta ao mesmo tempo não recebem duas vezes nem lançam a comissão em dobro.
  const { data: recebidas, error } = await tabelas.from('agendamentos')
    .update({
      status: 'concluido',
      data_pagamento: new Date().toISOString(),
      ...taxaMeta,
    })
    .eq('id', agendamento.id)
    .eq('status', 'fiado')
    .select('id');

  if (error) throw error;
  if (!Array.isArray(recebidas) || recebidas.length === 0) {
    // Frase para a pessoa (o código P0001 faz fraseDeErro deixá-la passar).
    throw Object.assign(new Error('Este débito já foi recebido ou não está mais em aberto. Atualize a tela.'), { code: 'P0001' });
  }

  if (formas.length > 0) {
    // `lancamentos_meta` está em desuso: o bruto, o líquido e a taxa já foram
    // gravados no agendamento. Só o administrador grava configuração; para os
    // outros, a recusa desta cópia não desfaz o recebimento nem barra a comissão.
    try {
      // Leitura conferida: se falhar, a cópia é pulada (gravar o JSON lido como vazio apagaria a
      // forma e a taxa de todos os outros lançamentos da clínica).
      const meta = await carregarConfigComErro<Record<string, unknown>>(
        agendamento.clinica_id,
        CONFIG_KEYS.lancamentos_meta,
        {},
      );
      await salvarConfig(agendamento.clinica_id, CONFIG_KEYS.lancamentos_meta, {
        ...meta,
        [`ag_${agendamento.id}`]: { ...taxaMeta, formas },
      });
    } catch {
      // segue sem a cópia (ver acima)
    }
  }

  const comissao = await registrarComissaoDebitoRecebido(agendamento, valorLiquido);
  return { valorLiquido, comissaoLancamentos: comissao.lancamentos };
}
