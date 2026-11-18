import { createSupabaseAdmin } from '@/lib/supabaseAdmin';

type Admin = ReturnType<typeof createSupabaseAdmin>;
export type Chamador = {
  admin: Admin;
  userId: string;
  email: string | null;
  prof: { id: number; nome: string | null; nivel_acesso: string | null; is_super_admin: boolean | null };
};

type Vinculo = { clinica_id: number | string; convidado?: boolean | null };

/** Quem está chamando a rota, pelo token da sessão. null = sem login válido ou sem perfil. */
export async function identificarChamador(req: Request): Promise<Chamador | null> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: prof } = await admin
    .from('profissionais')
    .select('id, nome, nivel_acesso, is_super_admin')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (!prof) return null;
  return { admin, userId: data.user.id, email: data.user.email ?? null, prof: prof as Chamador['prof'] };
}

/**
 * Vínculos do chamador. `convidado` marca a clínica em que a pessoa entrou
 * por convite de outra rede (migration 20261121_seguranca_reforco).
 */
async function vinculosDoChamador(chamador: Chamador): Promise<Vinculo[]> {
  const completo = await chamador.admin
    .from('profissionais_clinicas')
    .select('clinica_id, convidado')
    .eq('profissional_id', chamador.prof.id);
  if (!completo.error) return (completo.data || []) as Vinculo[];
  // Coluna ausente = migration de reforço ainda não aplicada neste banco.
  // Falha fechada: sem saber quem é convidado, ninguém é tratado como admin.
  const basico = await chamador.admin
    .from('profissionais_clinicas')
    .select('clinica_id')
    .eq('profissional_id', chamador.prof.id);
  return ((basico.data || []) as Vinculo[]).map((v) => ({ ...v, convidado: true }));
}

export async function clinicasDoChamador(chamador: Chamador) {
  const vinculos = await vinculosDoChamador(chamador);
  return new Set(vinculos.map((v) => String(v.clinica_id)));
}

/** O chamador trabalha nesta clínica (como membro da casa ou convidado)? */
export async function temAcessoAClinica(chamador: Chamador, clinicaId: string | number): Promise<boolean> {
  if (chamador.prof.is_super_admin === true) return true;
  return (await clinicasDoChamador(chamador)).has(String(clinicaId));
}

/**
 * Clínicas em que o chamador é administrador de verdade: nível `admin` no
 * perfil E vínculo que não veio de convite. É a mesma regra da função
 * `user_is_clinic_admin` do banco — as duas pontas têm que concordar.
 */
export async function clinicasQueAdministra(chamador: Chamador): Promise<Set<string>> {
  if (chamador.prof.nivel_acesso !== 'admin') return new Set();
  const vinculos = await vinculosDoChamador(chamador);
  return new Set(vinculos.filter((v) => v.convidado !== true).map((v) => String(v.clinica_id)));
}

export async function ehAdminDaClinica(chamador: Chamador, clinicaId: string | number): Promise<boolean> {
  if (chamador.prof.is_super_admin === true) return true;
  return (await clinicasQueAdministra(chamador)).has(String(clinicaId));
}

export function ehSuperAdmin(chamador: Chamador) {
  return chamador.prof.is_super_admin === true;
}
