'use client';

/**
 * Id do profissional da pessoa logada (para gravar quem criou o orçamento,
 * quem registrou o contato etc.). Lido uma vez por sessão do navegador.
 */
import { useEffect, useState } from 'react';
import { dados as tabelas, usuarioDaSessao } from '@/lib/local/consulta';

let cache: { userId: string; id: number | null } | null = null;

export async function meuProfissionalId(): Promise<number | null> {
  const user = await usuarioDaSessao();
  if (!user) return null;
  if (cache && cache.userId === user.id) return cache.id;
  const { data } = await tabelas.from('profissionais').select('id').eq('user_id', user.id).maybeSingle();
  const id = data && (data as { id?: unknown }).id != null ? Number((data as { id: unknown }).id) : null;
  cache = { userId: user.id, id: Number.isFinite(id) ? id : null };
  return cache.id;
}

export function useMeuProfissionalId(): number | null {
  const [id, setId] = useState<number | null>(() => cache?.id ?? null);
  useEffect(() => {
    let vivo = true;
    void meuProfissionalId().then((v) => { if (vivo) setId(v); }).catch(() => undefined);
    return () => { vivo = false; };
  }, []);
  return id;
}
