/**
 * Tipos das marcações do mapa HOF.
 *
 * A simulação de "depois" (`renderizarDepois`) foi removida a pedido: o
 * sistema não deve sugerir resultado clínico. Ficaram apenas os tipos
 * usados pelo mapa e pela prévia do rosto.
 */

export type MarcacaoPreview = {
  x: number;
  y: number;
  tipo: string;
  dosagem?: string;
};

export type Referencia = 'feminina' | 'masculina';
