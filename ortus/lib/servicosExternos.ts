/**
 * Endereço dos serviços externos (Resend, R2, provedor de pagamento, Google).
 * GOOGLE_PUBLICA é o endereço do consentimento que o navegador abre, quando
 * difere do que o servidor usa (na demo o servidor fala por 127.0.0.1).
 *
 * Em produção vale sempre o endereço oficial. Fora de produção, uma variável
 * `ORTUS_TESTE_URL_<SERVICO>` aponta o serviço para um servidor local de
 * teste, para exercitar o fluxo inteiro sem mandar e-mail, gravar arquivo ou
 * cobrar ninguém de verdade. A variável é ignorada quando
 * `NODE_ENV=production`: um ambiente publicado nunca fala com um endereço
 * trocado, nem por descuido.
 *
 * A única exceção é a homologação: um servidor de demonstração rodando o build
 * de produção contra serviços falsos declara `ORTUS_HOMOLOGACAO=1`. São duas
 * variáveis para trocar um endereço em produção (esta e a ORTUS_TESTE_URL_*),
 * e a produção de verdade não define nenhuma das duas.
 */
export type ServicoExterno = 'RESEND' | 'R2' | 'PAGAMENTO' | 'GOOGLE' | 'GOOGLE_PUBLICA';

export function emHomologacao(): boolean {
  return process.env.ORTUS_HOMOLOGACAO === '1';
}

export function enderecoDeTeste(servico: ServicoExterno): string | null {
  if (process.env.NODE_ENV === 'production' && !emHomologacao()) return null;
  const valor = (process.env[`ORTUS_TESTE_URL_${servico}`] || '').trim().replace(/\/$/, '');
  return valor || null;
}

export function enderecoDoServico(servico: ServicoExterno, oficial: string): string {
  return enderecoDeTeste(servico) || oficial;
}
