/** Preço do procedimento na agenda: convênio usa a tabela do plano; Particular usa o catálogo. */

export type PlanoTipo = { id: string; tipo: string | null };

export type LinhaPreco = {
  plano_id: string;
  tratamento_id: string | number;
  valor: number | string | null;
  ativo: boolean;
};

export function valorNaAgenda(
  tratamento: { id: string | number; valor_sugerido?: number | string | null } | null | undefined,
  plano: PlanoTipo | null,
  linhas: LinhaPreco[],
): string | null {
  if (!tratamento) return null;
  if (plano && plano.tipo !== 'particular') {
    const linha = linhas.find(
      (item) => item.plano_id === plano.id && String(item.tratamento_id) === String(tratamento.id) && item.ativo,
    );
    if (!linha || linha.valor == null || linha.valor === '') return null;
    return String(linha.valor);
  }
  if (tratamento.valor_sugerido == null || tratamento.valor_sugerido === '') return null;
  return String(tratamento.valor_sugerido);
}

export function tratamentosVisiveis<T extends { id: string | number }>(
  catalogo: T[],
  plano: PlanoTipo | null,
  linhas: LinhaPreco[],
): T[] {
  if (!plano || plano.tipo === 'particular') return catalogo;
  const cobertos = new Set(
    linhas.filter((item) => item.plano_id === plano.id && item.ativo).map((item) => String(item.tratamento_id)),
  );
  return catalogo.filter((item) => cobertos.has(String(item.id)));
}

type Db = { from: (table: string) => any };

/** Mantém o plano Particular espelhado quando um tratamento nasce fora desta tela. */
export async function garantirLinhaParticular(
  db: Db,
  clinicaId: number,
  tratamento: {
    id: number | string;
    valor_sugerido?: number | string | null;
    custo_padrao?: number | null;
    codigo_tuss_padrao?: string | null;
    aceita_faces?: boolean;
  },
) {
  const { data: existente } = await db
    .from('planos')
    .select('id')
    .eq('clinica_id', clinicaId)
    .eq('tipo', 'particular')
    .limit(1);
  let planoId = existente?.[0]?.id as string | undefined;
  if (!planoId) {
    const { data: criado, error } = await db
      .from('planos')
      .insert({ clinica_id: clinicaId, nome: 'Particular', tipo: 'particular', ativo: true })
      .select('id')
      .single();
    if (error) throw error;
    planoId = criado.id as string;
  }
  const { error } = await db.from('planos_tratamentos').upsert(
    {
      plano_id: planoId,
      clinica_id: clinicaId,
      tratamento_id: tratamento.id,
      valor: tratamento.valor_sugerido ?? null,
      custo: tratamento.custo_padrao ?? null,
      codigo_tuss: tratamento.codigo_tuss_padrao ?? null,
      aceita_faces: !!tratamento.aceita_faces,
      ativo: true,
    },
    { onConflict: 'plano_id,tratamento_id' },
  );
  if (error) throw error;
}
