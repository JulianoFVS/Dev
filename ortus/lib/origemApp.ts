/**
 * Endereço público do Ortus, para montar links que saem do sistema (link de
 * anamnese, e-mail, retorno do pagamento).
 *
 * `NEXT_PUBLIC_APP_URL` é a fonte. Sem ela, usa o endereço pelo qual a
 * própria requisição chegou — bom o bastante para um link devolvido a quem
 * acabou de pedir, mas não para e-mail (veja `origemParaEmail`).
 */
function configurada(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
}

export function origemDoApp(req?: Request): string {
  const fixa = configurada();
  if (fixa) return fixa;
  if (req) {
    const origem = req.headers.get('origin');
    if (origem && /^https?:\/\/[^\s/]+$/.test(origem)) return origem;
    try {
      return new URL(req.url).origin;
    } catch {
      /* segue para o padrão */
    }
  }
  return 'http://localhost:3000';
}

/**
 * Endereço para link em e-mail. O destinatário é um terceiro, então o
 * cabeçalho `Origin`/`Host` da requisição não serve: quem chama a API escreve
 * o que quiser ali e o e-mail sairia apontando para o site de outra pessoa.
 * Em produção, sem `NEXT_PUBLIC_APP_URL`, devolve '' e o e-mail vai sem link.
 */
export function origemParaEmail(): string {
  const fixa = configurada();
  if (fixa) return fixa;
  return process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';
}
