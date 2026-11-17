import { NextResponse } from 'next/server';
import { conferirVerificadorSenha } from '@/desktop/lib/verificadorSenha.cjs';
import { lerSessaoLocal } from '@/lib/local/ponte';
import { negarForaDoDesktop } from '@/lib/local/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Login do aplicativo sem internet.
 *
 * A senha é conferida com o verificador gravado no último acesso online.
 * Contas salvas antes disso entram pelo e-mail já usado neste computador:
 * o programa já abre o painel com essa sessão quando ela existe.
 */
export async function POST(req: Request) {
  const fora = negarForaDoDesktop();
  if (fora) return fora;

  const corpo = (await req.json().catch(() => ({}))) as { email?: string; senha?: string };
  const email = String(corpo.email || '').trim().toLowerCase();
  const senha = typeof corpo.senha === 'string' ? corpo.senha : '';
  if (!email || !senha || senha.length > 200) {
    return NextResponse.json({ erro: 'Acesso negado. Verifique e-mail e senha.' }, { status: 401 });
  }

  const sessao = await lerSessaoLocal();
  const emailSalvo = String(sessao?.user?.email || '').trim().toLowerCase();
  if (!sessao?.access_token || !sessao.refresh_token || !sessao.user?.id || !emailSalvo) {
    return NextResponse.json(
      { erro: 'O primeiro acesso neste computador precisa de internet.' },
      { status: 401 },
    );
  }
  if (emailSalvo !== email) {
    return NextResponse.json(
      { erro: 'Sem internet, este computador entra com a conta que já foi usada aqui.' },
      { status: 401 },
    );
  }
  if (sessao.verificador && !conferirVerificadorSenha(sessao.verificador, email, senha)) {
    return NextResponse.json({ erro: 'Acesso negado. Verifique e-mail e senha.' }, { status: 401 });
  }

  return NextResponse.json({
    access_token: sessao.access_token,
    refresh_token: sessao.refresh_token,
    expires_at: sessao.expires_at ?? null,
    user: { id: sessao.user.id, email: sessao.user.email ?? null },
  });
}
