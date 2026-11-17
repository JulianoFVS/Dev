'use strict';

/**
 * Espelho local (SQLite) das tabelas que funcionam offline.
 *
 * Fonte única de verdade: o processo principal usa este módulo para criar o
 * schema e para converter valores; o Next local pergunta o schema pelo
 * endpoint `GET /esquema` da API de dados, então não existe cópia divergente.
 *
 * Tipos:
 *   texto  → TEXT
 *   inteiro→ INTEGER
 *   real   → REAL
 *   data   → TEXT ISO-8601 em UTC (timestamptz)
 *   dia    → TEXT "YYYY-MM-DD" (coluna date do Postgres)
 *   json   → TEXT (JSON serializado)
 *   bool   → INTEGER 0/1
 */

/** @typedef {'texto'|'inteiro'|'real'|'data'|'dia'|'json'|'bool'} TipoColuna */

/** @typedef {{
 *   nome: string,
 *   pk: string,
 *   pkTipo: 'uuid'|'inteiro',
 *   colunas: Record<string, string>,
 *   clinicaCol: string|null,
 *   pai?: { tabela: string, fk: string },
 *   semSync?: boolean
 * }} DefTabela */

const CRIADO_EM = { created_at: 'data' };

/**
 * Ordem importa: tabelas pai antes das filhas (o bootstrap baixa nesta ordem
 * e o pull incremental respeita a mesma sequência).
 * @type {Record<string, DefTabela>}
 */
const TABELAS = {
  // ---------------------------------------------------------------------
  // Referência (somente leitura no desktop): nomes de clínica e de
  // profissional precisam existir offline para a agenda e as tarefas não
  // mostrarem apenas ids. O desktop não escreve nelas; elas descem no pull.
  // ---------------------------------------------------------------------
  clinicas: {
    nome: 'clinicas',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: null,
    colunas: {
      id: 'inteiro',
      nome: 'texto',
      cor_tema: 'texto',
      horario_abertura: 'texto',
      horario_fechamento: 'texto',
      created_at: 'data',
      endereco: 'texto',
      rede_id: 'texto',
      is_matriz: 'bool',
      cnpj: 'texto',
      responsavel_nome: 'texto',
      email: 'texto',
      telefone: 'texto',
      horario_inicio: 'texto',
      horario_fim: 'texto',
      fuso_horario: 'texto',
      emitir_notas_em_nome: 'texto',
      logo_url: 'texto',
      cep: 'texto',
      rua: 'texto',
      numero: 'texto',
      complemento: 'texto',
      bairro: 'texto',
      cidade: 'texto',
      uf: 'texto',
      limite_armazenamento_mb: 'inteiro',
      updated_at: 'data',
    },
  },

  profissionais_clinicas: {
    nome: 'profissionais_clinicas',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'inteiro',
      profissional_id: 'inteiro',
      clinica_id: 'inteiro',
      created_at: 'data',
      permissao: 'texto',
      updated_at: 'data',
    },
  },

  profissionais: {
    nome: 'profissionais',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: null,
    colunas: {
      id: 'inteiro',
      nome: 'texto',
      cargo: 'texto',
      created_at: 'data',
      nivel_acesso: 'texto',
      usuario_email: 'texto',
      user_id: 'texto',
      foto_url: 'texto',
      cro: 'texto',
      especialidade: 'texto',
      bio: 'texto',
      email: 'texto',
      telefone: 'texto',
      cpf: 'texto',
      conselho: 'texto',
      numero_conselho: 'texto',
      uf_conselho: 'texto',
      sexo: 'texto',
      endereco: 'texto',
      cep: 'texto',
      cidade: 'texto',
      estado: 'texto',
      uf: 'texto',
      precisa_trocar_senha: 'bool',
      is_super_admin: 'bool',
      exclusao_solicitada_em: 'data',
      ativo: 'bool',
      cor_agenda: 'texto',
      updated_at: 'data',
    },
  },


  pacientes: {
    nome: 'pacientes',
    pk: 'id',
    pkTipo: 'uuid',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'texto',
      created_at: 'data',
      nome: 'texto',
      telefone: 'texto',
      clinica_id: 'inteiro',
      email: 'texto',
      data_nascimento: 'dia',
      endereco: 'texto',
      observacoes: 'texto',
      cpf: 'texto',
      ficha_medica: 'json',
      sexo: 'texto',
      cep: 'texto',
      rua: 'texto',
      numero: 'texto',
      complemento: 'texto',
      bairro: 'texto',
      cidade: 'texto',
      uf: 'texto',
      plano_id: 'texto',
      responsavel_nome: 'texto',
      responsavel_parentesco: 'texto',
      responsavel_telefone: 'texto',
      foto_url: 'texto',
      updated_at: 'data',
    },
  },

  agendamentos: {
    nome: 'agendamentos',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'inteiro',
      created_at: 'data',
      paciente_id: 'texto',
      data_hora: 'data',
      duracao_minutos: 'inteiro',
      procedimento: 'texto',
      cor: 'texto',
      status: 'texto',
      observacoes: 'texto',
      valor: 'real',
      clinica_id: 'inteiro',
      profissional_id: 'inteiro',
      desconto: 'real',
      valor_final: 'real',
      tratamento_base_id: 'inteiro',
      valor_bruto: 'real',
      valor_liquido: 'real',
      taxa_id: 'texto',
      taxa_nome: 'texto',
      taxa_percentual: 'real',
      tipo_registro: 'texto',
      data_pagamento: 'data',
      grupo_id: 'texto',
      parte_indice: 'inteiro',
      parte_total: 'inteiro',
      parte_titulo: 'texto',
      updated_at: 'data',
    },
  },

  paciente_tratamentos: {
    nome: 'paciente_tratamentos',
    pk: 'id',
    pkTipo: 'uuid',
    clinicaCol: 'clinica_id',
    pai: { tabela: 'pacientes', fk: 'paciente_id' },
    colunas: {
      id: 'texto',
      paciente_id: 'texto',
      clinica_id: 'inteiro',
      legacy_id: 'texto',
      procedimento: 'texto',
      dente: 'texto',
      valor: 'real',
      status: 'texto',
      data: 'dia',
      observacoes: 'texto',
      criado_em: 'data',
      updated_at: 'data',
    },
  },

  paciente_anamneses: {
    nome: 'paciente_anamneses',
    pk: 'id',
    pkTipo: 'uuid',
    clinicaCol: null,
    pai: { tabela: 'pacientes', fk: 'paciente_id' },
    colunas: {
      id: 'texto',
      paciente_id: 'texto',
      legacy_id: 'texto',
      modelo_id: 'texto',
      modelo_nome: 'texto',
      data: 'dia',
      preenchido_por: 'texto',
      respostas: 'json',
      perguntas_snapshot: 'json',
      criado_em: 'data',
      atualizado_em: 'data',
      updated_at: 'data',
    },
  },

  paciente_evolucoes: {
    nome: 'paciente_evolucoes',
    pk: 'id',
    pkTipo: 'uuid',
    clinicaCol: null,
    pai: { tabela: 'pacientes', fk: 'paciente_id' },
    colunas: {
      id: 'texto',
      paciente_id: 'texto',
      legacy_id: 'texto',
      texto: 'texto',
      data: 'dia',
      profissional_nome: 'texto',
      criado_em: 'data',
      updated_at: 'data',
    },
  },

  paciente_documentos: {
    nome: 'paciente_documentos',
    pk: 'id',
    pkTipo: 'uuid',
    clinicaCol: null,
    pai: { tabela: 'pacientes', fk: 'paciente_id' },
    colunas: {
      id: 'texto',
      paciente_id: 'texto',
      legacy_id: 'texto',
      nome: 'texto',
      tipo: 'texto',
      storage_path: 'texto',
      meta: 'json',
      criado_em: 'data',
      updated_at: 'data',
    },
  },

  paciente_debitos: {
    nome: 'paciente_debitos',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: 'clinica_id',
    pai: { tabela: 'pacientes', fk: 'paciente_id' },
    colunas: {
      id: 'inteiro',
      paciente_id: 'texto',
      clinica_id: 'inteiro',
      descricao: 'texto',
      valor: 'real',
      agendamento_id: 'inteiro',
      tratamento_id: 'texto',
      status: 'texto',
      data_pagamento: 'data',
      created_at: 'data',
      updated_at: 'data',
    },
  },

  tarefas: {
    nome: 'tarefas',
    pk: 'id',
    pkTipo: 'uuid',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'texto',
      clinica_id: 'inteiro',
      titulo: 'texto',
      descricao: 'texto',
      responsavel_id: 'inteiro',
      prioridade: 'texto',
      status: 'texto',
      data_limite: 'dia',
      paciente_id: 'texto',
      created_at: 'data',
      updated_at: 'data',
    },
  },

  configuracoes_clinica: {
    nome: 'configuracoes_clinica',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'inteiro',
      clinica_id: 'inteiro',
      chave: 'texto',
      valor: 'json',
      updated_at: 'data',
    },
  },

  whatsapp_agendadas: {
    nome: 'whatsapp_agendadas',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'inteiro',
      clinica_id: 'inteiro',
      paciente_id: 'texto',
      nome: 'texto',
      telefone: 'texto',
      texto: 'texto',
      enviar_em: 'data',
      status: 'texto',
      erro: 'texto',
      enviada_em: 'data',
      criado_por: 'texto',
      created_at: 'data',
      updated_at: 'data',
    },
  },

  whatsapp_envios: {
    nome: 'whatsapp_envios',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'inteiro',
      clinica_id: 'inteiro',
      chave: 'texto',
      tipo: 'texto',
      paciente_id: 'texto',
      nome: 'texto',
      telefone: 'texto',
      texto: 'texto',
      status: 'texto',
      erro: 'texto',
      ...CRIADO_EM,
      updated_at: 'data',
    },
  },


  whatsapp_mensagens: {
    nome: 'whatsapp_mensagens',
    pk: 'id',
    pkTipo: 'uuid',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'texto',
      clinica_id: 'inteiro',
      chat_id: 'texto',
      wwebjs_id: 'texto',
      texto: 'texto',
      tipo: 'texto',
      de_mim: 'bool',
      em: 'data',
      ack: 'inteiro',
      contato_nome: 'texto',
      contato_telefone: 'texto',
      midia_caminho: 'texto',
      midia_tipo: 'texto',
      created_at: 'data',
      updated_at: 'data',
    },
  },

  // Catálogo clínico. Pais antes dos filhos: um plano criado offline precisa
  // subir antes do paciente ou do preço que aponta para ele.
  especialidades: {
    nome: 'especialidades',
    pk: 'id',
    pkTipo: 'uuid',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'texto',
      nome: 'texto',
      clinica_id: 'inteiro',
      descricao: 'texto',
      ordem: 'inteiro',
      ativo: 'bool',
      created_at: 'data',
      updated_at: 'data',
    },
  },

  planos: {
    nome: 'planos',
    pk: 'id',
    pkTipo: 'uuid',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'texto',
      clinica_id: 'inteiro',
      nome: 'texto',
      tipo: 'texto',
      ativo: 'bool',
      observacoes: 'texto',
      created_at: 'data',
      updated_at: 'data',
    },
  },

  tratamentos_base: {
    nome: 'tratamentos_base',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'inteiro',
      clinica_id: 'inteiro',
      especialidade_id: 'texto',
      nome: 'texto',
      descricao: 'texto',
      aceita_faces: 'bool',
      valor_sugerido: 'real',
      codigo_tuss_padrao: 'texto',
      ativo: 'bool',
      created_at: 'data',
      updated_at: 'data',
      custo_padrao: 'real',
    },
  },

  planos_tratamentos: {
    nome: 'planos_tratamentos',
    pk: 'id',
    pkTipo: 'uuid',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'texto',
      clinica_id: 'inteiro',
      plano_id: 'texto',
      tratamento_id: 'inteiro',
      valor: 'real',
      custo: 'real',
      codigo_tuss: 'texto',
      aceita_faces: 'bool',
      ativo: 'bool',
      created_at: 'data',
      updated_at: 'data',
    },
  },

  profissionais_horarios: {
    nome: 'profissionais_horarios',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'inteiro',
      profissional_id: 'inteiro',
      clinica_id: 'inteiro',
      inicio: 'texto',
      fim: 'texto',
      intervalo_minutos: 'inteiro',
      limite_simultaneo: 'inteiro',
      dias_semana: 'json',
      observacoes: 'texto',
      updated_at: 'data',
    },
  },

  permissoes_modulos: {
    nome: 'permissoes_modulos',
    pk: 'id',
    pkTipo: 'uuid',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'texto',
      profissional_id: 'inteiro',
      clinica_id: 'inteiro',
      modulo: 'texto',
      pode_acessar: 'bool',
      created_at: 'data',
      updated_at: 'data',
    },
  },

  despesas: {
    nome: 'despesas',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'inteiro',
      descricao: 'texto',
      valor: 'real',
      data: 'dia',
      categoria: 'texto',
      created_at: 'data',
      tipo_transacao: 'texto',
      clinica_id: 'inteiro',
      tipo: 'texto',
      user_id: 'texto',
      status: 'texto',
      motivo_cancelamento: 'texto',
      cancelado_em: 'data',
      paciente_id: 'texto',
      centro_custo_id: 'texto',
      updated_at: 'data',
    },
  },

  kanban_colunas: {
    nome: 'kanban_colunas',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'inteiro',
      clinica_id: 'texto',
      titulo: 'texto',
      ordem: 'inteiro',
      created_at: 'data',
      icone: 'texto',
      checklist_ativo: 'bool',
      updated_at: 'data',
    },
  },

  kanban_cartoes: {
    nome: 'kanban_cartoes',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'inteiro',
      coluna_id: 'inteiro',
      clinica_id: 'texto',
      paciente_nome: 'texto',
      descricao: 'texto',
      tipo_protese: 'texto',
      data_entrega: 'dia',
      valor: 'real',
      created_at: 'data',
      categoria: 'texto',
      cor_dente: 'texto',
      cor_gengiva: 'texto',
      posicao: 'texto',
      checklist: 'json',
      status: 'texto',
      paciente_id: 'texto',
      updated_at: 'data',
    },
  },

  lembretes_agenda: {
    nome: 'lembretes_agenda',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'inteiro',
      agendamento_id: 'inteiro',
      clinica_id: 'inteiro',
      canal: 'texto',
      enviado_em: 'data',
      updated_at: 'data',
    },
  },

  comissoes_regras: {
    nome: 'comissoes_regras',
    pk: 'id',
    pkTipo: 'uuid',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'texto',
      profissional_id: 'inteiro',
      clinica_id: 'inteiro',
      gatilho: 'texto',
      tipo: 'texto',
      valor: 'real',
      ativo: 'bool',
      created_at: 'data',
      updated_at: 'data',
    },
  },

  comissoes_lancamentos: {
    nome: 'comissoes_lancamentos',
    pk: 'id',
    pkTipo: 'uuid',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'texto',
      profissional_id: 'inteiro',
      clinica_id: 'inteiro',
      paciente_id: 'texto',
      agendamento_id: 'inteiro',
      regra_id: 'texto',
      descricao: 'texto',
      valor_base: 'real',
      percentual_comissao: 'real',
      valor_comissao: 'real',
      status: 'texto',
      data_pagamento: 'dia',
      created_at: 'data',
      updated_at: 'data',
    },
  },

  notificacoes: {
    nome: 'notificacoes',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: null,
    colunas: {
      id: 'inteiro',
      user_id: 'texto',
      titulo: 'texto',
      mensagem: 'texto',
      lida: 'bool',
      tipo: 'texto',
      created_at: 'data',
      expires_at: 'data',
      updated_at: 'data',
    },
  },

  anamnese_links: {
    nome: 'anamnese_links',
    pk: 'id',
    pkTipo: 'uuid',
    clinicaCol: 'clinica_id',
    colunas: {
      id: 'texto',
      paciente_id: 'texto',
      clinica_id: 'inteiro',
      modelo_id: 'texto',
      token_hash: 'texto',
      expires_at: 'data',
      usado_em: 'data',
      created_at: 'data',
      updated_at: 'data',
    },
  },

  convites_equipe: {
    nome: 'convites_equipe',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: null,
    colunas: {
      id: 'inteiro',
      rede_id: 'texto',
      clinica_ids: 'json',
      convidado_user_id: 'texto',
      convidado_profissional_id: 'inteiro',
      convidado_email: 'texto',
      convidado_nome: 'texto',
      convidante_profissional_id: 'inteiro',
      convidante_nome: 'texto',
      cargo: 'texto',
      mensagem: 'texto',
      status: 'texto',
      criado_em: 'data',
      respondido_em: 'data',
      expires_at: 'data',
      updated_at: 'data',
    },
  },

  // Registro local de auditoria. Não entra na fila: a policy da nuvem só
  // deixa o super-admin ler, e um upsert recusado travaria o backup inteiro.
  audit_log: {
    nome: 'audit_log',
    pk: 'id',
    pkTipo: 'inteiro',
    clinicaCol: null,
    semFila: true,
    colunas: {
      id: 'inteiro',
      criado_em: 'data',
      user_id: 'texto',
      profissional_nome: 'texto',
      acao: 'texto',
      entidade: 'texto',
      entidade_id: 'texto',
      detalhes: 'json',
      ip: 'texto',
      user_agent: 'texto',
      updated_at: 'data',
    },
  },
};

/**
 * Ordem de envio e de descida. Pai antes do filho, para um registro criado
 * offline não subir antes da linha da qual ele depende.
 */
const ORDEM_SYNC = [
  'clinicas',
  'profissionais',
  'profissionais_clinicas',
  'especialidades',
  'planos',
  'tratamentos_base',
  'planos_tratamentos',
  'permissoes_modulos',
  'profissionais_horarios',
  'pacientes',
  'configuracoes_clinica',
  'agendamentos',
  'lembretes_agenda',
  'despesas',
  'kanban_colunas',
  'kanban_cartoes',
  'paciente_tratamentos',
  'paciente_anamneses',
  'paciente_evolucoes',
  'paciente_documentos',
  'paciente_debitos',
  'tarefas',
  'comissoes_regras',
  'comissoes_lancamentos',
  'notificacoes',
  'anamnese_links',
  'convites_equipe',
  'audit_log',
  'whatsapp_agendadas',
  'whatsapp_envios',
  'whatsapp_mensagens',
];

/** Colunas que guardam JSON e precisam de parse/stringify na borda. */
const COLUNAS_JSON = Object.fromEntries(
  Object.values(TABELAS).map((t) => [
    t.nome,
    Object.entries(t.colunas).filter(([, tipo]) => tipo === 'json').map(([nome]) => nome),
  ]),
);

/** @param {string} tabela */
function def(tabela) {
  const t = TABELAS[tabela];
  if (!t) throw new Error(`Tabela não sincronizada: ${tabela}`);
  return t;
}

/** SQL do CREATE TABLE a partir da definição. */
function sqlCriacao(tabela) {
  const t = def(tabela);
  const tipoSql = {
    texto: 'TEXT',
    inteiro: 'INTEGER',
    real: 'REAL',
    data: 'TEXT',
    dia: 'TEXT',
    json: 'TEXT',
    bool: 'INTEGER',
  };
  const colunas = Object.entries(t.colunas).map(([nome, tipo]) => {
    if (nome === t.pk) return `"${nome}" ${tipoSql[tipo]} PRIMARY KEY`;
    return `"${nome}" ${tipoSql[tipo]}`;
  });
  return `CREATE TABLE IF NOT EXISTS "${tabela}" (${colunas.join(', ')});`;
}

module.exports = { TABELAS, ORDEM_SYNC, COLUNAS_JSON, def, sqlCriacao };
