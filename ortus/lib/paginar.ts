/**
 * Leitura paginada para somas e funis.
 *
 * O PostgREST devolve no máximo 1000 linhas por pedido e não avisa quando
 * corta. Quem soma valores ou monta funis precisa ler tudo: este helper pede
 * página por página (`range`) até a página vir incompleta.
 *
 * Funciona com `dados.from(...)` (nuvem e banco local do desktop), porque só
 * usa `range`, que os dois entendem.
 */

type Resposta<T> = { data: T[] | null; error: { message: string } | null };

export type MontarPagina<T> = (de: number, ate: number) => PromiseLike<Resposta<T>>;

/**
 * Lê todas as páginas. `montar(de, ate)` precisa devolver a mesma consulta
 * com `.range(de, ate)` no fim e uma ordem estável (com desempate pela chave).
 */
export async function lerTudo<T>(
  montar: MontarPagina<T>,
  { tamanho = 1000, maximo = 50000 }: { tamanho?: number; maximo?: number } = {},
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; de < maximo; de += tamanho) {
    const { data, error } = await montar(de, de + tamanho - 1);
    if (error) throw new Error(error.message);
    const pagina = data || [];
    todas.push(...pagina);
    if (pagina.length < tamanho) break;
  }
  return todas;
}

/** Divide uma lista de ids em blocos (o banco local recusa `in` com mais de 900 itens). */
export function emBlocos<T>(lista: T[], tamanho = 400): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) blocos.push(lista.slice(i, i + tamanho));
  return blocos;
}
