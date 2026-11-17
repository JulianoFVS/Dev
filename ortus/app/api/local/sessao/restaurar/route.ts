import { NextResponse } from 'next/server';
import { lerSessaoLocal } from '@/lib/local/ponte';
import { negarForaDoDesktop } from '@/lib/local/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Devolve a sessão em cache para a tela reabrir sem chamar o Supabase. */
export async function GET() {
  const fora = negarForaDoDesktop();
  if (fora) return fora;

  const sessao = await lerSessaoLocal();
  if (!sessao?.access_token || !sessao.refresh_token || !sessao.user?.id) {
    return NextResponse.json({ autenticado: false }, { status: 401 });
  }

  return NextResponse.json({
    access_token: sessao.access_token,
    refresh_token: sessao.refresh_token,
    expires_at: sessao.expires_at ?? null,
    user: { id: sessao.user.id, email: sessao.user.email ?? null },
  });
}
