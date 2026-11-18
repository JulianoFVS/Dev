/**
 * Regra e mensagens da senha escolhida pela pessoa: primeiro acesso
 * (`/primeiro-acesso`) e "Esqueci a senha" (`/redefinir-senha`). Um lugar só,
 * para as duas telas nunca pedirem coisas diferentes.
 */

/** 8 caracteres ou mais, com letras e números. Devolve o problema ou null. */
export function validarSenhaNova(senha: string): string | null {
  if (senha.length < 8) return 'A senha deve ter pelo menos 8 caracteres.';
  if (!/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) return 'Use letras e números na nova senha.';
  return null;
}

export type ErroDeSenha = { name?: string; code?: string; status?: number } | null;

/** Sessão vencida ou recusada pelo serviço de login: o link precisa ser pedido de novo. */
export function sessaoDaSenhaPerdida(erro: ErroDeSenha): boolean {
  return erro?.name === 'AuthSessionMissingError' || erro?.status === 401 || erro?.status === 403;
}

/** Frase fixa por tipo de recusa: o texto do serviço de login (em inglês, técnico) não vai para a tela. */
export function fraseDoErroDeSenha(erro: ErroDeSenha): string {
  if (erro?.code === 'same_password') return 'A senha nova precisa ser diferente da atual.';
  if (erro?.code === 'weak_password') {
    return 'O serviço de login achou esta senha fraca. Use uma senha mais longa, misturando letras maiúsculas, minúsculas e números.';
  }
  if (erro?.status === 429) return 'Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo.';
  if (erro?.name === 'AuthRetryableFetchError' || erro?.status === 0) return 'Sem conexão. Confira a internet e tente de novo.';
  return 'Não foi possível alterar a senha. Tente de novo em instantes.';
}
