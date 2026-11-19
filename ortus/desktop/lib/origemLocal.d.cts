export const CABECALHO_JANELA: string;
export const TAMANHO_SEGREDO: number;

export type RequisicaoLocal = {
  host?: string | null;
  origin?: string | null;
  secFetchSite?: string | null;
  segredoRecebido?: string | null;
  segredoEsperado?: string | null;
  porta?: string | number | null;
};

export type ConferenciaLocal =
  | { ok: true }
  | { ok: false; motivo: 'configuracao' | 'host' | 'origem' | 'site' | 'segredo' };

export function cabecalhosDaJanela(pedido: {
  url: string;
  iniciador?: string | null;
  cabecalhos?: Record<string, string>;
  porta: number;
  segredo: string;
}): Record<string, string> | null;
export function conferirRequisicaoLocal(requisicao: RequisicaoLocal): ConferenciaLocal;
export function hostLocalValido(host: string | null | undefined, porta: string | number | null | undefined): boolean;
export function iguaisSeguro(recebido: string | null | undefined, esperado: string | null | undefined): boolean;
export function origemLocal(porta: string | number | null | undefined): string;
export function origemValida(origin: string | null | undefined, porta: string | number | null | undefined): boolean;
export function siteValido(secFetchSite: string | null | undefined): boolean;
export function urlEhLocal(url: string, porta: string | number | null | undefined): boolean;
