type Db = { from: (table: string) => any };

function celula(valor: unknown) {
  return `"${String(valor ?? '').replace(/"/g, '""')}"`;
}

/** CSV da tabela de tratamentos da clínica, um bloco por plano. */
export async function baixarTabelaTratamentos(db: Db, clinicaId: number) {
  const [planosRes, espRes, trRes] = await Promise.all([
    db.from('planos').select('id, nome, tipo').eq('clinica_id', clinicaId).order('nome'),
    db.from('especialidades').select('id, nome').eq('clinica_id', clinicaId),
    db.from('tratamentos_base').select('id, nome, especialidade_id, valor_sugerido, custo_padrao, codigo_tuss_padrao, aceita_faces, ativo').eq('clinica_id', clinicaId).order('nome'),
  ]);
  if (planosRes.error) throw planosRes.error;
  if (espRes.error) throw espRes.error;
  if (trRes.error) throw trRes.error;

  const planos = (planosRes.data || []) as { id: string; nome: string; tipo: string }[];
  const especialidades = new Map((espRes.data || []).map((item: { id: string; nome: string }) => [item.id, item.nome]));
  const tratamentos = (trRes.data || []) as {
    id: number;
    nome: string;
    especialidade_id: string | null;
    valor_sugerido: number | null;
    custo_padrao: number | null;
    codigo_tuss_padrao: string | null;
    aceita_faces: boolean;
    ativo: boolean;
  }[];
  const ids = planos.map((plano) => plano.id);
  let precos: { plano_id: string; tratamento_id: number; valor: number | null; custo: number | null; codigo_tuss: string | null; aceita_faces: boolean; ativo: boolean }[] = [];
  if (ids.length) {
    const { data, error } = await db
      .from('planos_tratamentos')
      .select('plano_id, tratamento_id, valor, custo, codigo_tuss, aceita_faces, ativo')
      .in('plano_id', ids);
    if (error) throw error;
    precos = data || [];
  }

  const header = ['Plano', 'Especialidade', 'Tratamento', 'Valor', 'Custo', 'Código TUSS', 'Aceita faces', 'Ativo'];
  const linhas: string[] = [];
  const ordem = [
    ...planos.filter((plano) => plano.tipo === 'particular'),
    ...planos.filter((plano) => plano.tipo !== 'particular').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  ];
  for (const plano of ordem) {
    const nomePlano = plano.tipo === 'particular' ? 'Particular' : plano.nome;
    for (const tratamento of tratamentos) {
      const preco = precos.find((item) => item.plano_id === plano.id && item.tratamento_id === tratamento.id);
      const especialidade = tratamento.especialidade_id ? especialidades.get(tratamento.especialidade_id) || '-' : '-';
      const valores = plano.tipo === 'particular'
        ? [tratamento.valor_sugerido ?? '', tratamento.custo_padrao ?? '', tratamento.codigo_tuss_padrao || '', tratamento.aceita_faces ? 'sim' : 'não', tratamento.ativo ? 'sim' : 'não']
        : [preco?.valor ?? '', preco?.custo ?? '', preco?.codigo_tuss || '', preco?.aceita_faces ? 'sim' : 'não', preco?.ativo ? 'sim' : 'não'];
      linhas.push([nomePlano, especialidade, tratamento.nome, ...valores].map(celula).join(','));
    }
  }

  const blob = new Blob(['\uFEFF' + header.join(',') + '\n' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tabela_tratamentos.csv';
  link.click();
  URL.revokeObjectURL(url);
}
