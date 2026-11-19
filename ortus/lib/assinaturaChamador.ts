import 'server-only';
import { clinicasQueAdministra, ehSuperAdmin, type Chamador } from '@/lib/chamadorApi';

/**
 * Redes cuja assinatura o chamador pode ver e pagar: aquelas em que ele
 * administra a MATRIZ (perfil admin, vínculo próprio — não convidado). É a
 * mesma regra do banco (`user_is_rede_admin` / `rede_matriz`, 20261127):
 * administrador de filial cuida da própria unidade, não da assinatura.
 * Matriz = a clínica marcada como matriz; sem marca, a mais antiga.
 * O dono da plataforma responde por qualquer rede; devolve 'todas'.
 */
export async function redesQueAdministra(chamador: Chamador): Promise<Set<string> | 'todas'> {
  if (ehSuperAdmin(chamador)) return 'todas';
  const clinicas = await clinicasQueAdministra(chamador);
  if (!clinicas.size) return new Set();
  const { data: minhas } = await chamador.admin.from('clinicas').select('rede_id').in('id', [...clinicas]);
  const redes = [...new Set((minhas || []).map((c) => c.rede_id).filter(Boolean).map(String))];
  if (!redes.length) return new Set();
  const { data: todas } = await chamador.admin
    .from('clinicas')
    .select('id, rede_id, is_matriz')
    .in('rede_id', redes)
    .order('is_matriz', { ascending: false })
    .order('id', { ascending: true });
  const matriz = new Map<string, string>();
  for (const c of todas || []) {
    const rede = String(c.rede_id);
    if (!matriz.has(rede)) matriz.set(rede, String(c.id));
  }
  return new Set(redes.filter((rede) => clinicas.has(matriz.get(rede) || '')));
}

/** Para as funções que recebem um conjunto: resolve 'todas' na rede da própria fatura. */
export async function redesPermitidasParaFatura(chamador: Chamador, faturaId: number): Promise<Set<string>> {
  const redes = await redesQueAdministra(chamador);
  if (redes !== 'todas') return redes;
  const { data } = await chamador.admin.from('faturas').select('rede_id').eq('id', faturaId).maybeSingle();
  return new Set(data?.rede_id ? [String(data.rede_id)] : []);
}
