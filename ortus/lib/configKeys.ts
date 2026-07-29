/** Chaves tipadas em configuracoes_clinica.valor (JSONB). */
export const CONFIG_KEYS = {
  preferencias: 'preferencias',
  categorias_financeiro: 'categorias_financeiro',
  modelos_documentos: 'modelos_documentos',
  templates_comunicacao: 'templates_comunicacao',
  taxas_maquininha: 'taxas_maquininha',
  anamnese_modelos: 'anamnese_modelos',
  /** @deprecated usar tabela lembretes_agenda */
  lembretes_enviados: 'lembretes_enviados',
  /** @deprecated usar colunas em agendamentos */
  lancamentos_meta: 'lancamentos_meta',
  /** @deprecated usar tabela profissionais_horarios */
  horario_profissional_prefix: 'horario_profissional_',
} as const;

export type ConfigKey = typeof CONFIG_KEYS[keyof typeof CONFIG_KEYS];

export function horarioProfissionalKey(profissionalId: string | number): string {
  return `${CONFIG_KEYS.horario_profissional_prefix}${profissionalId}`;
}
