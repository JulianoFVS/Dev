import { NextResponse } from 'next/server';
import { criarVerificadorSenha } from '@/desktop/lib/verificadorSenha.cjs';
import { lerSessaoLocal, salvarSessaoLocal, type SessaoLocal } from '@/lib/local/ponte';
import { exigirJanelaLocal } from '@/lib/local/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function expiraDoToken(token: string): number | undefined {
  const parte = token.split('.')[1];
  if (!parte) return undefined;
  try {
    const json = Buffer.from(parte.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const exp = Number((JSON.parse(json) as { exp?: unknown }).exp);
    return Number.isFinite(exp) ? exp : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sessão em cache para abrir o programa sem internet.
 *
 * - `GET` devolve só o necessário para a casca saber que está logado
 *   (nunca tokens).
 * - `POST` grava a sessão do Supabase depois do login online (é o que o
 *   sincronizador vai usar como JWT).
 * - `DELETE` limpa (logout).
 *
 * As três exigem a prova de janela: gravar a sessão troca o JWT que o
 * sincronizador usa, e apagar desloga a clínica.
 */
export async function GET(req: Request) {
  const fora = exigirJanelaLocal(req);
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
  const fora = exigirJanelaLocal(req, { json: true });
  if (fora) return fora;

  const corpo = (await req.json().catch(() => ({}))) as { dados?: SessaoLocal | null; senha?: string };
  if (!corpo.dados) return NextResponse.json({ erro: 'Informe a sessão.' }, { status: 400 });
  if (!corpo.dados.access_token) return NextResponse.json({ erro: 'Sessão sem token.' }, { status: 400 });

  const atual = await lerSessaoLocal();
  const mesmoUsuario = !atual?.user?.id || !corpo.dados.user?.id || atual.user.id === corpo.dados.user.id;
  const senha = typeof corpo.senha === 'string' && corpo.senha.length <= 200 ? corpo.senha : '';
  const email = String(corpo.dados.user?.email || atual?.user?.email || '').trim();
  const dados = { ...corpo.dados };
  delete dados.verificador;
  let verificador = mesmoUsuario ? atual?.verificador : undefined;
  if (senha && email) verificador = criarVerificadorSenha(email, senha);
  const expiraReal = expiraDoToken(dados.access_token);

  await salvarSessaoLocal({
    ...(mesmoUsuario && atual ? atual : {}),
    ...dados,
    expires_at: expiraReal ?? dados.expires_at,
    perfil: dados.perfil ?? (mesmoUsuario ? atual?.perfil ?? null : null),
    clinicas: dados.clinicas?.length ? dados.clinicas : (mesmoUsuario ? atual?.clinicas ?? [] : []),
    verificador,
    salvoEm: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const fora = exigirJanelaLocal(req);
  if (fora) return fora;

  await salvarSessaoLocal(null);
  return NextResponse.json({ ok: true });
}
