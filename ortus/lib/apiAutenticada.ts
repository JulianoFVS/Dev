/** Chamada às rotas /api do site com o token da sessão (Authorization: Bearer). */
import { supabase } from '@/lib/supabase';

export type RespostaApi<T> = { ok: boolean; status: number; dados: T & { error?: string } };

export async function chamarApi<T = Record<string, unknown>>(
  caminho: string,
  { metodo = 'GET', corpo }: { metodo?: 'GET' | 'POST'; corpo?: unknown } = {},
): Promise<RespostaApi<T>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, status: 401, dados: { error: 'Sua sessão expirou. Entre de novo.' } as T & { error?: string } };
  try {
    const r = await fetch(caminho, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    const dados = (await r.json().catch(() => ({}))) as T & { error?: string };
    return { ok: r.ok, status: r.status, dados };
  } catch {
    return { ok: false, status: 0, dados: { error: 'Sem conexão com o servidor. Confira a internet.' } as T & { error?: string } };
  }
}
