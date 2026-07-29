/** Tipos do prontuário relacional (Fase 2). */

export type TratamentoPaciente = {
  id: string;
  paciente_id?: string;
  clinica_id?: number | null;
  procedimento: string;
  dente?: string | null;
  valor: number;
  status: string;
  data?: string | null;
  observacoes?: string | null;
  criado_em?: string;
};

export type AnamnesePaciente = {
  id: string;
  modelo_id?: string | null;
  modelo_nome?: string | null;
  data?: string | null;
  preenchido_por?: string | null;
  respostas: Record<string, unknown>;
  perguntas_snapshot?: unknown[] | null;
  criado_em?: string;
};

export type DocumentoPaciente = {
  id: string;
  nome: string;
  tipo?: string | null;
  storage_path?: string | null;
  criado_em?: string;
};

export type EvolucaoPaciente = {
  id: string;
  texto: string;
  data?: string | null;
  profissional?: string | null;
  criado_em?: string;
};

/** Dados gráficos que permanecem em ficha_medica JSON. */
export type FichaClinicaJson = {
  odontograma?: Record<string, unknown>;
  texto_livre?: string;
  marcacoes_hof?: unknown[];
  hof_fotos?: unknown[];
  [key: string]: unknown;
};

export type ProntuarioPaciente = {
  fichaClinica: FichaClinicaJson;
  tratamentos: TratamentoPaciente[];
  anamneses: AnamnesePaciente[];
  documentos: DocumentoPaciente[];
  evolucoes: EvolucaoPaciente[];
};

function rowToTratamento(r: Record<string, unknown>): TratamentoPaciente {
  return {
    id: String(r.id),
    paciente_id: r.paciente_id ? String(r.paciente_id) : undefined,
    clinica_id: r.clinica_id as number | null,
    procedimento: String(r.procedimento || ''),
    dente: (r.dente as string) || null,
    valor: Number(r.valor ?? 0),
    status: String(r.status || 'planejado'),
    data: r.data ? String(r.data).slice(0, 10) : null,
    observacoes: (r.observacoes as string) || null,
    criado_em: r.criado_em ? String(r.criado_em) : undefined,
  };
}

function rowToAnamnese(r: Record<string, unknown>): AnamnesePaciente {
  return {
    id: String(r.id),
    modelo_id: (r.modelo_id as string) || null,
    modelo_nome: (r.modelo_nome as string) || null,
    data: r.data ? String(r.data).slice(0, 10) : null,
    preenchido_por: (r.preenchido_por as string) || null,
    respostas: (r.respostas as Record<string, unknown>) || {},
    perguntas_snapshot: (r.perguntas_snapshot as unknown[]) || null,
    criado_em: r.criado_em ? String(r.criado_em) : undefined,
  };
}

function rowToDocumento(r: Record<string, unknown>): DocumentoPaciente {
  return {
    id: String(r.id),
    nome: String(r.nome || ''),
    tipo: (r.tipo as string) || null,
    storage_path: (r.storage_path as string) || null,
    criado_em: r.criado_em ? String(r.criado_em) : undefined,
  };
}

function rowToEvolucao(r: Record<string, unknown>): EvolucaoPaciente {
  return {
    id: String(r.id),
    texto: String(r.texto || ''),
    data: r.data ? String(r.data).slice(0, 10) : null,
    profissional: (r.profissional_nome as string) || null,
    criado_em: r.criado_em ? String(r.criado_em) : undefined,
  };
}

/** Converte linhas legadas do JSON para tipos UI. */
export function legacyJsonToProntuario(ficha: Record<string, unknown> | null | undefined): ProntuarioPaciente {
  const fm = ficha || {};
  return {
    fichaClinica: {
      odontograma: (fm.odontograma as Record<string, unknown>) || {},
      texto_livre: (fm.texto_livre as string) || '',
      marcacoes_hof: (fm.marcacoes_hof as unknown[]) || [],
      hof_fotos: (fm.hof_fotos as unknown[]) || [],
    },
    tratamentos: ((fm.tratamentos as unknown[]) || []).map((t, i) => ({
      id: String((t as any)?.id || i),
      procedimento: String((t as any)?.procedimento || ''),
      dente: (t as any)?.dente || null,
      valor: Number((t as any)?.valor ?? 0),
      status: String((t as any)?.status || 'planejado'),
      data: (t as any)?.data || null,
      observacoes: (t as any)?.observacoes || null,
      criado_em: (t as any)?.criado_em,
    })),
    anamneses: ((fm.anamneses as unknown[]) || []).map((a, i) => ({
      id: String((a as any)?.id || i),
      modelo_id: (a as any)?.modelo_id,
      modelo_nome: (a as any)?.modelo_nome,
      data: (a as any)?.data,
      preenchido_por: (a as any)?.preenchido_por,
      respostas: (a as any)?.respostas || {},
      perguntas_snapshot: (a as any)?.perguntas_snapshot,
      criado_em: (a as any)?.criado_em,
    })),
    documentos: ((fm.documentos as unknown[]) || []).map((d, i) => ({
      id: String((d as any)?.id || i),
      nome: String((d as any)?.nome || ''),
      tipo: (d as any)?.tipo,
      storage_path: (d as any)?.storage_path,
      criado_em: (d as any)?.criado_em,
    })),
    evolucoes: ((fm.evolucoes as unknown[]) || []).map((e, i) => ({
      id: String((e as any)?.id || i),
      texto: String((e as any)?.texto || ''),
      data: (e as any)?.data,
      profissional: (e as any)?.profissional || (e as any)?.profissional_nome,
      criado_em: (e as any)?.criado_em,
    })),
  };
}

export { rowToTratamento, rowToAnamnese, rowToDocumento, rowToEvolucao };
