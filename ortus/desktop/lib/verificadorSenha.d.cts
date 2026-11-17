export type VerificadorSenha = { email: string; salt: string; hash: string };

export function criarVerificadorSenha(email: string, senha: string): VerificadorSenha;

export function conferirVerificadorSenha(
  verificador: VerificadorSenha | null | undefined,
  email: string,
  senha: string,
): boolean;
