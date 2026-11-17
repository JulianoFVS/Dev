import 'server-only';

/**
 * Ponte entre o Next local e a API de dados do processo principal do Electron.
 *
 * No navegador (Vercel) nada disso existe: `desktopAtivo()` é false e as telas
 * seguem falando direto com o Supabase. Dentro do .exe, o SQLite é a fonte de
 * verdade e a nuvem só recebe o que o sincronizador empurrar.
 */

const URL_DADOS = (process.env.ORTUS_DB_URL || '').replace(/\/$/, '');
const SEGREDO = process.env.ORTUS_DB_SEGREDO || '';

export function desktopAtivo(): boolean {
  return process.env.ORTUS_DESKTOP === '1' && Boolean(URL_DADOS) && Boolean(SEGREDO);
}

export type RespostaDados<T> = { dados: T };

async function chamar<T>(caminho: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (!desktopAtivo()) {
    throw Object.assign(new Error('A camada local só existe no aplicativo desktop.'), { status: 501 });
  }
  const resposta = await fetch(`${URL_DADOS}${caminho}`, {
    method: init?.method || 'GET',
    headers: {
      'content-type': 'application/json',
      'x-ortus-db-secret': SEGREDO,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : {};
  if (!resposta.ok) {
    throw Object.assign(new Error((dados as { erro?: string }).erro || 'Falha na camada local.'), {
      status: resposta.status,
    });
  }
  return dados as T;
}

export type FiltroLocal = { col: string; op: string; valor?: unknown };
export type OrdemLocal = { col: string; asc?: boolean };

export type OperacaoLocal = {
  tabela: string;
  op?: 'insert' | 'update' | 'upsert' | 'delete';
  dados?: Record<string, unknown>;
  id?: string | number | null;
};

export async function consultarLocal<T = Record<string, unknown>>(
  tabela: string,
  opcoes: { filtros?: FiltroLocal[]; ordem?: OrdemLocal[]; limite?: number; offset?: number } = {},
): Promise<T[]> {
  const resposta = await chamar<RespostaDados<T[]>>('/consulta', {
    method: 'POST',
    body: { tabela, ...opcoes },
  });
  return resposta.dados || [];
}

export async function contarLocal(tabela: string, filtros: FiltroLocal[] = []): Promise<number> {
  const resposta = await chamar<{ total: number }>('/contar', { method: 'POST', body: { tabela, filtros } });
  return Number(resposta.total || 0);
}

export async function gravarLocal<T = Record<string, unknown>>(operacao: OperacaoLocal): Promise<T | null> {
  const resposta = await chamar<RespostaDados<T | null>>('/gravar', { method: 'POST', body: operacao });
  return resposta.dados ?? null;
}

export async function gravarLoteLocal(operacoes: OperacaoLocal[]): Promise<void> {
  await chamar('/lote', { method: 'POST', body: { operacoes } });
}

export type EstadoSync = {
  estado: 'iniciando' | 'sincronizando' | 'sincronizado' | 'offline' | 'erro' | 'login';
  pendentes: number;
  conflitos: number;
  ultimoEnvioOk: string | null;
  ultimaTentativa: string | null;
  ultimoErro: string | null;
  online: boolean | null;
  bootstrap: boolean;
};

export async function estadoSync(): Promise<EstadoSync> {
  return chamar<EstadoSync>('/sync/estado');
}

export async function sincronizarAgora(): Promise<EstadoSync> {
  return chamar<EstadoSync>('/sync/agora', { method: 'POST' });
}

export async function bootstrapLocal(): Promise<{ ok: boolean; linhas?: number; motivo?: string }> {
  return chamar('/bootstrap', { method: 'POST' });
}

export type ConflitoSync = {
  id: number;
  tabela: string;
  linha_id: string;
  clinica_id: string | null;
  versao_local: Record<string, unknown> | null;
  versao_remota: Record<string, unknown> | null;
  escolhido: string;
  resolucao: string;
  detectado_em: string;
};

export async function listarConflitos(): Promise<ConflitoSync[]> {
  const resposta = await chamar<{ dados: ConflitoSync[] }>('/sync/conflitos');
  return resposta.dados || [];
}

export async function resolverConflito(id: number, escolha: 'local' | 'remoto'): Promise<void> {
  await chamar('/sync/resolver', { method: 'POST', body: { id, escolha } });
}

export type SessaoLocal = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user?: { id: string; email?: string | null };
  perfil?: Record<string, unknown> | null;
  clinicas?: Array<{ id: string | number; nome: string }>;
  salvoEm?: string;
};

export async function lerSessaoLocal(): Promise<SessaoLocal | null> {
  const resposta = await chamar<{ dados: SessaoLocal | null }>('/sessao');
  return resposta.dados ?? null;
}

export async function salvarSessaoLocal(sessao: SessaoLocal | null): Promise<void> {
  await chamar('/sessao', { method: 'POST', body: { dados: sessao } });
}

export async function estatisticasLocais(): Promise<Record<string, unknown>> {
  return chamar('/estatisticas');
}

/** Caminho absoluto da pasta de arquivos locais (fotos, documentos, mídia). */
export const PASTA_ARQUIVOS = process.env.ORTUS_ARQUIVOS_DIR || '';
