export const CHAVE_AUTOMACOES_WHATSAPP = 'whatsapp_automacoes';

export type AutomacoesWhatsapp = {
  janela: { inicio: string; fim: string };
  confirmacao: { ativo: boolean; desde: string | null; texto: string };
  lembrete: { ativo: boolean; horasAntes: number; texto: string };
  pos_consulta: { ativo: boolean; desde: string | null; horasDepois: number; texto: string };
  aniversario: { ativo: boolean; hora: string; texto: string };
  retorno: { ativo: boolean; meses: number; limiteDia: number; texto: string };
};

export type TipoAutomacao = Exclude<keyof AutomacoesWhatsapp, 'janela'>;

export const AUTOMACOES_PADRAO: AutomacoesWhatsapp = {
  janela: { inicio: '08:00', fim: '20:00' },
  confirmacao: {
    ativo: false,
    desde: null,
    texto: 'Olá {{paciente_nome}}! Sua consulta na {{clinica_nome}} está marcada para {{data_consulta}} às {{hora_consulta}}. Qualquer dúvida, é só responder aqui.',
  },
  lembrete: {
    ativo: false,
    horasAntes: 24,
    texto: 'Oi {{paciente_nome}}, passando para lembrar da sua consulta em {{data_consulta}} às {{hora_consulta}}. Até lá! — {{clinica_nome}}',
  },
  pos_consulta: {
    ativo: false,
    desde: null,
    horasDepois: 3,
    texto: 'Olá {{paciente_nome}}! Obrigado por vir à {{clinica_nome}} hoje. Se tiver qualquer dúvida sobre as orientações, estamos por aqui.',
  },
  aniversario: {
    ativo: false,
    hora: '09:00',
    texto: 'Feliz aniversário, {{paciente_nome}}! A equipe {{clinica_nome}} deseja um dia muito especial.',
  },
  retorno: {
    ativo: false,
    meses: 6,
    limiteDia: 20,
    texto: 'Oi {{paciente_nome}}, já faz um tempo desde sua última visita à {{clinica_nome}}. Que tal agendar uma avaliação? É só responder esta mensagem.',
  },
};

export const VARIAVEIS_WHATSAPP: { chave: string; label: string; soConsulta?: boolean }[] = [
  { chave: 'paciente_nome', label: 'Nome do paciente' },
  { chave: 'clinica_nome', label: 'Nome da clínica' },
  { chave: 'clinica_telefone', label: 'Telefone da clínica' },
  { chave: 'data_consulta', label: 'Data da consulta', soConsulta: true },
  { chave: 'hora_consulta', label: 'Hora da consulta', soConsulta: true },
  { chave: 'procedimento', label: 'Procedimento', soConsulta: true },
];

export function normalizarAutomacoes(valor: unknown): AutomacoesWhatsapp {
  const salvo = (valor && typeof valor === 'object' ? valor : {}) as Partial<AutomacoesWhatsapp>;
  return {
    janela: { ...AUTOMACOES_PADRAO.janela, ...salvo.janela },
    confirmacao: { ...AUTOMACOES_PADRAO.confirmacao, ...salvo.confirmacao },
    lembrete: { ...AUTOMACOES_PADRAO.lembrete, ...salvo.lembrete },
    pos_consulta: { ...AUTOMACOES_PADRAO.pos_consulta, ...salvo.pos_consulta },
    aniversario: { ...AUTOMACOES_PADRAO.aniversario, ...salvo.aniversario },
    retorno: { ...AUTOMACOES_PADRAO.retorno, ...salvo.retorno },
  };
}

export function aplicarVariaveisWhatsapp(texto: string, ctx: Record<string, string | undefined>): string {
  return texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (inteiro, chave: string) => ctx[chave.toLowerCase()] ?? inteiro);
}
