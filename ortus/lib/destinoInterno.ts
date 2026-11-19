/**
 * Destino de volta depois do login ou da escolha de unidade (?redirect=).
 *
 * Só aceita caminho deste site. Contrabarra e caractere de controle são
 * recusados antes de resolver: o navegador trata '\' como '/' e descarta TAB e
 * quebra de linha, então '/\golpe.example' e '/<TAB>/golpe.example' virariam
 * '//golpe.example' (outro site). Depois de resolver, a origem tem de ser a
 * desta página. `recusar` lista caminhos que não servem de destino (ex.: a
 * própria tela de login).
 */
export function destinoInterno(pedido: string | null | undefined, recusar: string[] = []): string | null {
  if (typeof window === 'undefined') return null;
  const bruto = String(pedido || '');
  if (!bruto.startsWith('/') || bruto.startsWith('//') || bruto.length > 2048) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(bruto)) return null;
  let url: URL;
  try {
    url = new URL(bruto, window.location.origin);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  // Depois de resolver, '/..//golpe.example' vira '//golpe.example': caminho que começa com duas
  // barras seria lido pelo navegador como outro site.
  if (url.pathname.startsWith('//')) return null;
  if (recusar.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
