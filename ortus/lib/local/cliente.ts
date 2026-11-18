'use client';

import { supabase } from '@/lib/supabase';

/**
 * Camada de dados das telas.
 *
 * Em produção na nuvem fala direto com o Supabase (como sempre). Dentro do
 * .exe fala com `/api/local/db`, que atende pelo SQLite e enfileira a
 * escrita para o sincronizador.
 *
 * A intenção é que as telas migradas não saibam a diferença: chamam
 * `listar/inserir/atualizar/remover` e o transporte resolve.
 */

export type FiltroLocal = {
  col: string;
  op: 'eq' | 'neq' | 'in' | 'is' | 'notnull' | 'gte' | 'lte' | 'gt' | 'lt' | 'like' | 'ilike';
  valor?: unknown;
};

export type OrdemLocal = { col: string; asc?: boolean };

export type OpcoesLista = {
  filtros?: FiltroLocal[];
  ordem?: OrdemLocal[];
  limite?: number;
};

let modoCache: 'local' | 'nuvem' | null = null;
let modoPromessa: Promise<'local' | 'nuvem'> | null = null;

/** Descobre (uma vez por sessão de página) se estamos dentro do desktop. */
export function modoDados(): Promise<'local' | 'nuvem'> {
  if (modoCache) return Promise.resolve(modoCache);
  if (modoPromessa) return modoPromessa;
  modoPromessa = (async () => {
    try {
      const resposta = await fetch('/api/local/status', { cache: 'no-store' });
      if (resposta.ok) {
        const dados = (await resposta.json()) as { desktop?: boolean };
        modoCache = dados.desktop ? 'local' : 'nuvem';
      } else {
        modoCache = 'nuvem';
      }
    } catch {
      modoCache = 'nuvem';
    }
    return modoCache;
  })();
  return modoPromessa;
}

export function modoDadosSincrono(): 'local' | 'nuvem' | null {
  return modoCache;
}

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

async function chamarLocal<T>(corpo: Record<string, unknown>): Promise<T> {
  const resposta = await fetch('/api/local/db', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${await token()}`,
    },
    body: JSON.stringify(corpo),
    cache: 'no-store',
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error((dados as { erro?: string }).erro || 'Falha no banco local.');
  return dados as T;
}

/** Traduz um filtro neutro para o encadeamento do supabase-js. */
function aplicarFiltros(consulta: any, filtros: FiltroLocal[] = []) {
  let atual = consulta;
  for (const filtro of filtros) {
    switch (filtro.op) {
      case 'eq': atual = atual.eq(filtro.col, filtro.valor); break;
      case 'neq': atual = atual.neq(filtro.col, filtro.valor); break;
      case 'in': atual = atual.in(filtro.col, filtro.valor as unknown[]); break;
      case 'is': atual = atual.is(filtro.col, filtro.valor as null | boolean); break;
      case 'notnull': atual = atual.not(filtro.col, 'is', null); break;
      case 'gte': atual = atual.gte(filtro.col, filtro.valor); break;
      case 'lte': atual = atual.lte(filtro.col, filtro.valor); break;
      case 'gt': atual = atual.gt(filtro.col, filtro.valor); break;
      case 'lt': atual = atual.lt(filtro.col, filtro.valor); break;
      case 'like': atual = atual.like(filtro.col, filtro.valor); break;
      case 'ilike': atual = atual.ilike(filtro.col, filtro.valor); break;
      default: break;
    }
  }
  return atual;
}

export async function listar<T = Record<string, unknown>>(
  tabela: string,
  opcoes: OpcoesLista = {},
): Promise<T[]> {
  const modo = await modoDados();
  if (modo === 'local') {
    const dados = await chamarLocal<{ dados: T[] }>({
      tabela,
      op: 'select',
      filtros: opcoes.filtros || [],
      ordem: opcoes.ordem || [],
      limite: opcoes.limite,
    });
    return dados.dados || [];
  }

  let consulta: any = supabase.from(tabela).select('*');
  consulta = aplicarFiltros(consulta, opcoes.filtros);
  for (const ordem of opcoes.ordem || []) {
    consulta = consulta.order(ordem.col, { ascending: ordem.asc !== false });
  }
  if (opcoes.limite) consulta = consulta.limit(opcoes.limite);

  const { data, error } = await consulta;
  if (error) throw error;
  return (data || []) as T[];
}

export async function contar(tabela: string, filtros: FiltroLocal[] = []): Promise<number> {
  const modo = await modoDados();
  if (modo === 'local') {
    const dados = await chamarLocal<{ total: number }>({ tabela, op: 'count', filtros });
    return Number(dados.total || 0);
  }
  let consulta: any = supabase.from(tabela).select('*', { count: 'exact', head: true });
  consulta = aplicarFiltros(consulta, filtros);
  const { count, error } = await consulta;
  if (error) throw error;
  return Number(count || 0);
}

export async function inserir<T = Record<string, unknown>>(
  tabela: string,
  dados: Record<string, unknown>,
): Promise<T> {
  const modo = await modoDados();
  if (modo === 'local') {
    const resposta = await chamarLocal<{ dados: T }>({ tabela, op: 'insert', dados });
    return resposta.dados;
  }
  const { data, error } = await supabase.from(tabela).insert(dados).select('*').single();
  if (error) throw error;
  return data as T;
}

export async function atualizar<T = Record<string, unknown>>(
  tabela: string,
  id: string | number,
  dados: Record<string, unknown>,
): Promise<T> {
  const modo = await modoDados();
  if (modo === 'local') {
    const resposta = await chamarLocal<{ dados: T }>({ tabela, op: 'update', id, dados });
    return resposta.dados;
  }
  const { data, error } = await supabase.from(tabela).update(dados).eq('id', id).select('*').single();
  if (error) throw error;
  return data as T;
}

export async function remover(tabela: string, id: string | number): Promise<void> {
  const modo = await modoDados();
  if (modo === 'local') {
    await chamarLocal({ tabela, op: 'delete', id });
    return;
  }
  const { error } = await supabase.from(tabela).delete().eq('id', id);
  if (error) throw error;
}

/** Upsert: no local o processo principal decide entre INSERT e UPDATE. */
export async function salvar<T = Record<string, unknown>>(
  tabela: string,
  dados: Record<string, unknown>,
  id?: string | number | null,
): Promise<T> {
  const modo = await modoDados();
  if (modo === 'local') {
    const resposta = await chamarLocal<{ dados: T }>({ tabela, op: 'upsert', id: id ?? dados.id ?? null, dados });
    return resposta.dados;
  }
  const { data, error } = await supabase.from(tabela).upsert(dados).select('*').single();
  if (error) throw error;
  return data as T;
}

// ---------------------------------------------------------------------
// Sessão em cache (login offline)
// ---------------------------------------------------------------------

export type SessaoCache = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user?: { id: string; email?: string | null };
  perfil?: Record<string, unknown> | null;
  clinicas?: Array<{ id: string | number; nome: string }>;
};

export async function salvarSessaoCache(sessao: SessaoCache | null, senha?: string): Promise<void> {
  const modo = await modoDados();
  if (modo !== 'local') return;
  try {
    if (sessao) {
      await fetch('/api/local/sessao', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(senha ? { dados: sessao, senha } : { dados: sessao }),
      });
    } else {
      await fetch('/api/local/sessao', { method: 'DELETE' });
    }
  } catch {
    /* cache é melhor-esforço: nunca impede o login */
  }
}

/** Guarda a senha nova para o próximo acesso sem internet. No site é no-op. */
export async function gravarVerificadorSenha(senha: string): Promise<void> {
  if (!senha) return;
  const { data } = await supabase.auth.getSession();
  const sessao = data.session;
  if (!sessao?.access_token || !sessao.user?.id) return;
  await salvarSessaoCache({
    access_token: sessao.access_token,
    refresh_token: sessao.refresh_token,
    expires_at: sessao.expires_at ?? undefined,
    user: { id: sessao.user.id, email: sessao.user.email ?? null },
  }, senha);
}

export type SessaoCacheUI = {
  autenticado: boolean;
  expira_em?: number | null;
  user?: { id: string; email?: string | null } | null;
  perfil?: Record<string, unknown> | null;
  clinicas?: Array<{ id: string | number; nome: string }>;
  salvo_em?: string | null;
};

/** Sessão em cache (sem tokens) — usada para abrir o app sem internet. */
export async function lerSessaoCacheUI(): Promise<SessaoCacheUI | null> {
  try {
    const resposta = await fetch('/api/local/sessao', { cache: 'no-store' });
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as SessaoCacheUI;
    return dados.autenticado ? dados : null;
  } catch {
    return null;
  }
}

export type EstadoSyncUI = {
  estado: 'iniciando' | 'sincronizando' | 'sincronizado' | 'offline' | 'erro' | 'login';
  pendentes: number;
  conflitos: number;
  ultimoEnvioOk: string | null;
  online: boolean | null;
  bootstrap: boolean;
};

export async function estadoSyncUI(): Promise<EstadoSyncUI | null> {
  const modo = await modoDados();
  if (modo !== 'local') return null;
  try {
    const resposta = await fetch('/api/local/sync', {
      headers: { Authorization: `Bearer ${await token()}` },
      cache: 'no-store',
    });
    if (!resposta.ok) return null;
    return (await resposta.json()) as EstadoSyncUI;
  } catch {
    return null;
  }
}

export type ConflitoSyncUI = {
  id: number;
  tabela: string;
  linha_id: string;
  clinica_id: string | null;
  versao_local: Record<string, unknown> | null;
  versao_remota: Record<string, unknown> | null;
  escolhido: string;
  resolucao: string;
  /** Só em `resolucao: 'recusado'`: 'consulta' (402), 'permissao' (403) ou 'rejeitado'. */
  motivo?: string | null;
  detectado_em: string;
};

export async function listarConflitosUI(): Promise<ConflitoSyncUI[]> {
  const modo = await modoDados();
  if (modo !== 'local') return [];
  try {
    const resposta = await fetch('/api/local/conflitos', {
      headers: { Authorization: `Bearer ${await token()}` },
      cache: 'no-store',
    });
    if (!resposta.ok) return [];
    const dados = (await resposta.json()) as { dados?: ConflitoSyncUI[] };
    return dados.dados || [];
  } catch {
    return [];
  }
}

export async function resolverConflitoUI(id: number, escolha: 'local' | 'remoto'): Promise<void> {
  const resposta = await fetch('/api/local/conflitos', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${await token()}`,
    },
    body: JSON.stringify({ id, escolha }),
  });
  if (!resposta.ok) {
    const dados = (await resposta.json().catch(() => ({}))) as { erro?: string };
    throw new Error(dados.erro || 'Não foi possível resolver o conflito.');
  }
}

export async function sincronizarAgoraUI(): Promise<EstadoSyncUI | null> {
  const modo = await modoDados();
  if (modo !== 'local') return null;
  try {
    const resposta = await fetch('/api/local/sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}` },
    });
    if (!resposta.ok) return null;
    return (await resposta.json()) as EstadoSyncUI;
  } catch {
    return null;
  }
}
