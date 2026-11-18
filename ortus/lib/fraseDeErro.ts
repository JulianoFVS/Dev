/**
 * Frase para mostrar à pessoa quando uma gravação ou leitura das telas da
 * clínica falha. Só passa o que foi escrito para pessoas: o aviso do modo de
 * consulta ("Assinatura suspensa…") e as regras do Ortus levantadas pelos
 * gatilhos do banco (códigos P0001/22023, em português). Falha de rede,
 * sessão vencida e recusa de permissão viram frase fixa; o resto vira o
 * `padrao` da tela. Texto técnico cru ("TypeError: Failed to fetch",
 * "violates row-level security…") nunca chega à tela.
 */

export const FRASE_MODO_CONSULTA =
  'Assinatura suspensa: o sistema está em modo de consulta. Os dados continuam disponíveis para leitura; para voltar a gravar, regularize o pagamento em Assinatura.';

function partes(erro: unknown): { mensagem: string; codigo: string } {
  if (typeof erro === 'string') return { mensagem: erro.trim(), codigo: '' };
  if (erro && typeof erro === 'object') {
    const alvo = erro as { message?: unknown; code?: unknown };
    return {
      mensagem: typeof alvo.message === 'string' ? alvo.message.trim() : '',
      codigo: typeof alvo.code === 'string' ? alvo.code : '',
    };
  }
  return { mensagem: '', codigo: '' };
}

export function ehModoConsulta(erro: unknown): boolean {
  const { mensagem, codigo } = partes(erro);
  return codigo === 'PT402' || /^Assinatura suspensa/i.test(mensagem);
}

export function fraseDeErro(erro: unknown, padrao: string): string {
  const { mensagem, codigo } = partes(erro);
  if (ehModoConsulta(erro)) return mensagem || FRASE_MODO_CONSULTA;
  if (/failed to fetch|networkerror|network error|load failed|fetch failed/i.test(mensagem)) {
    return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  }
  if (/jwt expired|invalid jwt|token.*expired/i.test(mensagem)) return 'Sua sessão expirou. Entre de novo para continuar.';
  if (codigo === '42501' || /row-level security|permission denied/i.test(mensagem)) {
    return 'Você não tem permissão para fazer isso nesta clínica.';
  }
  // Regra do próprio Ortus, escrita para pessoas nos gatilhos do banco.
  if ((codigo === 'P0001' || codigo === '22023') && mensagem && !/violates|constraint|syntax|null value|[{}]/i.test(mensagem)) {
    return mensagem;
  }
  return padrao;
}
