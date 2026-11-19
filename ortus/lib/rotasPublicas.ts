/**
 * Rotas que abrem sem sessão. Fonte única para o proxy (servidor) e para o
 * AuthGuard (navegador): as duas listas divergiam e uma página pública no
 * proxy era barrada pelo guard, ou o contrário.
 */

/** Páginas públicas: landing, login, textos legais, a compra do plano, o link de acesso que chega por e-mail e o "Esqueci a senha". */
const PAGINAS_PUBLICAS = new Set(['/', '/login', '/termos', '/privacidade', '/checkout', '/cadastro', '/acesso', '/recuperar-senha']);

/** Formulário de anamnese que o paciente abre pelo link, sem conta. */
const PREFIXOS_PAGINA_PUBLICA = ['/anamnese/', '/checkout/'];

/** Telas que exigem sessão, mas aparecem sem a casca (sidebar e barra). A senha nova usa a sessão aberta pelo link do e-mail. */
const TELAS_SEM_CASCA = new Set(['/selecao', '/primeiro-acesso', '/redefinir-senha']);

export function ehPaginaPublica(pathname: string): boolean {
  if (PAGINAS_PUBLICAS.has(pathname)) return true;
  return PREFIXOS_PAGINA_PUBLICA.some((prefixo) => pathname.startsWith(prefixo));
}

export function ehTelaSemCasca(pathname: string): boolean {
  return TELAS_SEM_CASCA.has(pathname);
}

/**
 * Telas de experimento nunca abrem em produção, mesmo que alguém recrie a
 * pasta. O proxy responde 404 antes de qualquer página ser montada.
 */
const EXPERIMENTO = /^\/(teste|experimento|lab|playground|demo)(-|\/|$)/i;

export function ehRotaDeExperimento(pathname: string): boolean {
  return EXPERIMENTO.test(pathname);
}
