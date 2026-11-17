import { NextResponse } from 'next/server';
import { desktopAtivo, lerSessaoLocal, salvarSessaoLocal, type SessaoLocal } from '@/lib/local/ponte';
import { negarForaDoDesktop } from '@/lib/local/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sessão em cache para abrir o programa sem internet.
 *
 * - `GET` devolve só o necessário para a casca saber que está logado
 *   (nunca tokens).
 * - `POST` grava a sessão do Supabase depois do login online (é o que o
 *   sincronizador vai usar como JWT).
 * - `DELETE` limpa (logout).
 */
export async function GET() {
  const fora = negarForaDoDesktop();
  if (fora) return fora;

  const sessao = await lerSessaoLocal();
  if (!sessao?.access_token) return NextResponse.json({ autenticado: false });

  return NextResponse.json({
    autenticado: true,
    expira_em: sessao.expires_at ?? null,
    user: sessao.user ? { id: sessao.user.id, email: sessao.user.email ?? null } : null,
    perfil: sessao.perfil ?? null,
    clinicas: sessao.clinicas ?? [],
    salvo_em: sessao.salvoEm ?? null,
  });
}

export async function POST(req: Request) {
  const fora = negarForaDoDesktop();
  if (fora) return fora;

  const corpo = (await req.json().catch(() => ({}))) as { dados?: SessaoLocal | null };
  if (!corpo.dados) return NextResponse.json({ erro: 'Informe a sessão.' }, { status: 400 });
  if (!corpo.dados.access_token) return NextResponse.json({ erro: 'Sessão sem token.' }, { status: 400 });

  await salvarSessaoLocal({ ...corpo.dados, salvoEm: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const fora = negarForaDoDesktop();
  if (fora) return fora;

  await salvarSessaoLocal(null);
  return NextResponse.json({ ok: true });
}
