import { createSupabaseAdmin } from '@/lib/supabaseAdmin';

type Admin = ReturnType<typeof createSupabaseAdmin>;
export type Chamador = {
  admin: Admin;
  userId: string;
  prof: { id: number; nivel_acesso: string | null; is_super_admin: boolean | null };
};

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
    .select('id, nivel_acesso, is_super_admin')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (!prof) return null;
  return { admin, userId: data.user.id, prof: prof as Chamador['prof'] };
}

export async function clinicasDoChamador(chamador: Chamador) {
  const { data } = await chamador.admin
    .from('profissionais_clinicas')
    .select('clinica_id')
    .eq('profissional_id', chamador.prof.id);
  return new Set((data || []).map((v) => String(v.clinica_id)));
}

export function ehGestor(chamador: Chamador) {
  return chamador.prof.is_super_admin === true || chamador.prof.nivel_acesso === 'admin';
}
