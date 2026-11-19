/**
 * Datas no fuso da clínica, sem depender do fuso do servidor (que é UTC na
 * Vercel e pode ser qualquer um na VM).
 */

export const FUSO_PADRAO = 'America/Sao_Paulo';

/** Devolve o fuso informado se o Node o conhece; senão o de Brasília. */
export function fusoValido(fuso: unknown): string {
  if (typeof fuso !== 'string' || !fuso.trim()) return FUSO_PADRAO;
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: fuso.trim() });
    return fuso.trim();
  } catch {
    return FUSO_PADRAO;
  }
}

export type PartesLocais = { ano: number; mes: number; dia: number; hora: number; minuto: number };

/** Ano, mês, dia, hora e minuto de um instante, vistos no fuso dado. */
export function partesLocais(instante: Date, fuso: string): PartesLocais {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(instante);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value || 0);
  return { ano: valor('year'), mes: valor('month'), dia: valor('day'), hora: valor('hour'), minuto: valor('minute') };
}

/**
 * Instante UTC em que o relógio do fuso marca a data/hora dada.
 * `dia` pode passar do fim do mês (ex.: dia 32): o calendário ajusta.
 */
export function instanteLocal(ano: number, mes: number, dia: number, hora: number, minuto: number, fuso: string): Date {
  const alvo = Date.UTC(ano, mes - 1, dia, hora, minuto);
  // Duas voltas bastam para acertar o desvio, inclusive em troca de horário de verão.
  let chute = alvo;
  for (let i = 0; i < 2; i += 1) {
    const p = partesLocais(new Date(chute), fuso);
    const visto = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto);
    chute += alvo - visto;
  }
  return new Date(chute);
}

/** "AAAA-MM-DD" de hoje no fuso dado. */
export function hojeNoFuso(fuso: string = FUSO_PADRAO, agora: Date = new Date()): string {
  const p = partesLocais(agora, fuso);
  return `${p.ano}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`;
}
