import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { salvarSessaoCache, type SessaoCache } from '@/lib/local/cliente';

export type SessaoRestaurada = {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
  user: { id: string; email?: string | null };
};

export type EntradaDesktop = {
  user: { id: string; email?: string | null };
  session: {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    user: { id: string; email?: string | null };
  };
  online: boolean;
};

export function chaveSessaoSupabase(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  try {
    const host = new URL(url).hostname.split('.')[0];
    if (host) return `sb-${host}-auth-token`;
  } catch {
    /* url ainda não configurada */
  }
  return 'supabase.auth.token';
}

export function falhaDeRede(err: unknown): boolean {
  if (isAuthRetryableFetchError(err)) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /failed to fetch|networkerror|network request|load failed|authretryable|econn|enotfound|timeout/i.test(msg);
}

function sessaoNavegadorValida(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const cru = localStorage.getItem(chaveSessaoSupabase());
    if (!cru) return false;
    const sessao = JSON.parse(cru) as { access_token?: string; refresh_token?: string; expires_at?: number };
    const agora = Math.floor(Date.now() / 1000);
    return Boolean(sessao?.access_token && sessao.refresh_token && Number(sessao.expires_at || 0) > agora + 180);
  } catch {
    return false;
  }
}

export function gravarSessaoNoNavegador(sessao: SessaoRestaurada): void {
  if (typeof localStorage === 'undefined') return;
  const agora = Math.floor(Date.now() / 1000);
  const real = Number(sessao.expires_at || 0);
  const expira = real > agora + 180 ? real : agora + 12 * 60 * 60;
  const payload = {
    access_token: sessao.access_token,
    refresh_token: sessao.refresh_token,
    expires_at: expira,
    expires_in: expira - agora,
    token_type: 'bearer',
    user: {
      id: sessao.user.id,
      email: sessao.user.email ?? undefined,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
    },
  };
  localStorage.setItem(chaveSessaoSupabase(), JSON.stringify(payload));
}

/** Copia a sessão do userData para o navegador quando o token da tela venceu. */
export async function prepararSessaoLocal(): Promise<boolean> {
  if (sessaoNavegadorValida()) return true;
  try {
    const resposta = await fetch('/api/local/sessao/restaurar', { cache: 'no-store' });
    if (!resposta.ok) return false;
    const dados = (await resposta.json()) as SessaoRestaurada;
    if (!dados?.access_token || !dados.refresh_token || !dados.user?.id) return false;
    gravarSessaoNoNavegador(dados);
    return true;
  } catch {
    return false;
  }
}

async function entrarOffline(email: string, senha: string): Promise<EntradaDesktop> {
  const resposta = await fetch('/api/local/entrar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  const dados = (await resposta.json().catch(() => ({}))) as SessaoRestaurada & { erro?: string };
  if (!resposta.ok) {
    throw new Error(dados.erro || 'Acesso negado. Verifique e-mail e senha.');
  }
  if (!dados.access_token || !dados.refresh_token || !dados.user?.id) {
    throw new Error('O primeiro acesso neste computador precisa de internet.');
  }
  gravarSessaoNoNavegador(dados);
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) {
    throw new Error(dados.erro || 'Não foi possível abrir a sessão salva neste computador.');
  }
  return { user: data.session.user, session: data.session, online: false };
}

function cacheDe(session: EntradaDesktop['session'], userId: string): SessaoCache {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    user: { id: userId, email: session.user.email ?? null },
  };
}

/**
 * No desktop, tenta o Supabase e, se a rede não responder, entra com a
 * sessão que ficou neste computador no último acesso online.
 */
export async function entrarNoDesktop(email: string, senha: string): Promise<EntradaDesktop> {
  const pedido = supabase.auth.signInWithPassword({ email, password: senha });
  const limite = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
  const cedo = await Promise.race([pedido.then((resultado) => resultado), limite]);

  if (cedo && !cedo.error && cedo.data.session && cedo.data.user) {
    await salvarSessaoCache(cacheDe(cedo.data.session, cedo.data.user.id), senha);
    return { user: cedo.data.user, session: cedo.data.session, online: true };
  }
  if (cedo?.error && !falhaDeRede(cedo.error)) throw cedo.error;

  try {
    const local = await entrarOffline(email, senha);
    void pedido.then(async (resultado) => {
      if (resultado.data.session && resultado.data.user) {
        await salvarSessaoCache(cacheDe(resultado.data.session, resultado.data.user.id), senha);
      }
    }).catch(() => {});
    return local;
  } catch (offlineErr) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw offlineErr;
    const final = cedo ?? await Promise.race([
      pedido.then((resultado) => resultado),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    if (final && !final.error && final.data.session && final.data.user) {
      await salvarSessaoCache(cacheDe(final.data.session, final.data.user.id), senha);
      return { user: final.data.user, session: final.data.session, online: true };
    }
    if (final?.error && !falhaDeRede(final.error)) throw final.error;
    throw offlineErr;
  }
}
