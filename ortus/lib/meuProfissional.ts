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

/**
 * A pessoa administra esta clínica? (admin e não convidado, ou dono da
 * plataforma) — a mesma regra de user_is_clinic_admin no banco. Só esconde
 * botões: quem decide de verdade é a RLS.
 */
export function useAdminDaClinica(clinicaId: number | null): boolean {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const id = await meuProfissionalId();
      if (!id || !clinicaId) { if (vivo) setAdmin(false); return; }
      const [{ data: prof }, { data: vinculo }] = await Promise.all([
        tabelas.from('profissionais').select('nivel_acesso, is_super_admin').eq('id', id).maybeSingle(),
        tabelas.from('profissionais_clinicas').select('convidado').eq('profissional_id', id).eq('clinica_id', clinicaId).maybeSingle(),
      ]);
      const p = prof as { nivel_acesso?: string; is_super_admin?: boolean } | null;
      const v = vinculo as { convidado?: boolean } | null;
      if (vivo) setAdmin(Boolean(p?.is_super_admin) || (p?.nivel_acesso === 'admin' && Boolean(v) && !v?.convidado));
    })().catch(() => { if (vivo) setAdmin(false); });
    return () => { vivo = false; };
  }, [clinicaId]);
  return admin;
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
