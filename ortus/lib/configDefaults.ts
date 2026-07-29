export type CategoriaFinanceira = {
  id: string;
  nome: string;
  tipo: 'receita' | 'despesa';
  cor: string;
  ativo: boolean;
};

export type TemplateComunicacao = {
  id: string;
  canal: 'whatsapp' | 'email' | 'sms';
  nome: string;
  assunto?: string;
  corpo: string;
  ativo: boolean;
};

export type TaxaMaquininha = {
  id: string;
  nome: string;
  bandeira: string;
  tipo: 'debito' | 'credito_vista' | 'credito_parcelado' | 'pix';
  taxa_percentual: number;
  prazo_recebimento_dias: number;
  ativo: boolean;
};

export const CATEGORIAS_FINANCEIRAS_PADRAO: CategoriaFinanceira[] = [
  { id: 'cat_consulta', nome: 'Consulta', tipo: 'receita', cor: '#10b981', ativo: true },
  { id: 'cat_procedimento', nome: 'Procedimento', tipo: 'receita', cor: '#3b82f6', ativo: true },
  { id: 'cat_protese', nome: 'Prótese', tipo: 'receita', cor: '#8b5cf6', ativo: true },
  { id: 'cat_material', nome: 'Material', tipo: 'despesa', cor: '#f59e0b', ativo: true },
  { id: 'cat_laboratorio', nome: 'Laboratório', tipo: 'despesa', cor: '#ef4444', ativo: true },
  { id: 'cat_aluguel', nome: 'Aluguel', tipo: 'despesa', cor: '#64748b', ativo: true },
  { id: 'cat_salarios', nome: 'Salários', tipo: 'despesa', cor: '#0ea5e9', ativo: true },
  { id: 'cat_marketing', nome: 'Marketing', tipo: 'despesa', cor: '#ec4899', ativo: true },
];

export const TEMPLATES_COMUNICACAO_PADRAO: TemplateComunicacao[] = [
  {
    id: 'wa_confirmacao',
    canal: 'whatsapp',
    nome: 'Confirmação de consulta',
    corpo: 'Olá {{paciente_nome}}! Confirmamos sua consulta na {{clinica_nome}} em {{data_consulta}} às {{hora_consulta}}. Responda SIM para confirmar ou ligue {{clinica_telefone}}.',
    ativo: true,
  },
  {
    id: 'wa_lembrete',
    canal: 'whatsapp',
    nome: 'Lembrete 24h',
    corpo: 'Oi {{paciente_nome}}, passando para lembrar da sua consulta amanhã ({{data_consulta}}) às {{hora_consulta}}. Até lá! — {{clinica_nome}}',
    ativo: true,
  },
  {
    id: 'wa_pos_consulta',
    canal: 'whatsapp',
    nome: 'Pós-consulta',
    corpo: 'Olá {{paciente_nome}}! Obrigado por comparecer à {{clinica_nome}}. Qualquer dúvida sobre orientações ou retorno, estamos à disposição.',
    ativo: true,
  },
  {
    id: 'wa_aniversario',
    canal: 'whatsapp',
    nome: 'Aniversário',
    corpo: 'Feliz aniversário, {{paciente_nome}}! 🎂 A equipe {{clinica_nome}} deseja um dia especial. Conte conosco para cuidar do seu sorriso!',
    ativo: true,
  },
  {
    id: 'email_padrao',
    canal: 'email',
    nome: 'E-mail institucional',
    assunto: 'Mensagem de {{clinica_nome}}',
    corpo: 'Prezado(a) {{paciente_nome}},\n\n[Escreva sua mensagem aqui]\n\nAtenciosamente,\n{{clinica_nome}}\n{{clinica_telefone}}',
    ativo: true,
  },
  {
    id: 'email_confirmacao',
    canal: 'email',
    nome: 'Confirmação de consulta (e-mail)',
    assunto: 'Consulta confirmada — {{clinica_nome}}',
    corpo: 'Prezado(a) {{paciente_nome}},\n\nConfirmamos sua consulta na {{clinica_nome}} em {{data_consulta}} às {{hora_consulta}}.\n\nEm caso de dúvidas, entre em contato: {{clinica_telefone}}.\n\nAtenciosamente,\n{{clinica_nome}}',
    ativo: true,
  },
  {
    id: 'email_lembrete',
    canal: 'email',
    nome: 'Lembrete 24h (e-mail)',
    assunto: 'Lembrete: consulta amanhã — {{clinica_nome}}',
    corpo: 'Prezado(a) {{paciente_nome}},\n\nPassando para lembrar da sua consulta amanhã ({{data_consulta}}) às {{hora_consulta}} na {{clinica_nome}}.\n\nAté lá!\n\n{{clinica_nome}}',
    ativo: true,
  },
  {
    id: 'sms_lembrete',
    canal: 'sms',
    nome: 'Lembrete 24h (SMS)',
    corpo: 'Oi {{paciente_nome}}, lembrete: consulta amanha {{data_consulta}} as {{hora_consulta}}. {{clinica_nome}}',
    ativo: true,
  },
  {
    id: 'sms_confirmacao',
    canal: 'sms',
    nome: 'Confirmação de consulta (SMS)',
    corpo: '{{clinica_nome}}: consulta confirmada em {{data_consulta}} as {{hora_consulta}}. Duvidas: {{clinica_telefone}}',
    ativo: true,
  },
  {
    id: 'sms_padrao',
    canal: 'sms',
    nome: 'SMS institucional',
    corpo: 'Ola {{paciente_nome}}, mensagem da {{clinica_nome}}. Contato: {{clinica_telefone}}',
    ativo: true,
  },
];

export const TAXAS_MAQUININHA_PADRAO: TaxaMaquininha[] = [
  { id: 'pix', nome: 'PIX', bandeira: 'PIX', tipo: 'pix', taxa_percentual: 0, prazo_recebimento_dias: 0, ativo: true },
  { id: 'deb_visa', nome: 'Débito Visa/Master', bandeira: 'Visa/Master', tipo: 'debito', taxa_percentual: 1.5, prazo_recebimento_dias: 1, ativo: true },
  { id: 'cred_vista', nome: 'Crédito à vista', bandeira: 'Visa/Master', tipo: 'credito_vista', taxa_percentual: 2.5, prazo_recebimento_dias: 30, ativo: true },
  { id: 'cred_parc_2_6', nome: 'Crédito 2–6x', bandeira: 'Visa/Master', tipo: 'credito_parcelado', taxa_percentual: 3.2, prazo_recebimento_dias: 30, ativo: true },
  { id: 'cred_parc_7_12', nome: 'Crédito 7–12x', bandeira: 'Visa/Master', tipo: 'credito_parcelado', taxa_percentual: 4.5, prazo_recebimento_dias: 30, ativo: true },
  { id: 'elo_deb', nome: 'Débito Elo', bandeira: 'Elo', tipo: 'debito', taxa_percentual: 1.8, prazo_recebimento_dias: 1, ativo: true },
];

export function normalizarCategoriasFinanceiras(raw: unknown): CategoriaFinanceira[] {
  if (!Array.isArray(raw) || raw.length === 0) return CATEGORIAS_FINANCEIRAS_PADRAO;
  if (typeof raw[0] === 'string') {
    return (raw as string[]).map((nome, i) => ({
      id: `cat_migrada_${i}`,
      nome,
      tipo: 'despesa' as const,
      cor: '#64748b',
      ativo: true,
    }));
  }
  return raw as CategoriaFinanceira[];
}

export function nomesCategoriasAtivas(categorias: CategoriaFinanceira[]): string[] {
  return categorias.filter((c) => c.ativo).map((c) => c.nome).sort();
}

export function calcularValorLiquido(valorBruto: number, taxaPercentual: number): number {
  return Math.round(valorBruto * (1 - taxaPercentual / 100) * 100) / 100;
}
