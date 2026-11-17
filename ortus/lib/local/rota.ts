import { NextResponse } from 'next/server';
import { desktopAtivo, lerSessaoLocal, type SessaoLocal } from '@/lib/local/ponte';

/**
 * Guardas das rotas `/api/local/*`.
 *
 * Elas só existem dentro do .exe (`ORTUS_DESKTOP=1`). No site da Vercel
 * respondem 404 — não há como um visitante alcançar o banco local.
 */

export function negarForaDoDesktop(): NextResponse | null {
  if (!desktopAtivo()) {
    return NextResponse.json({ erro: 'Recurso do aplicativo desktop.' }, { status: 404 });
  }
  return null;
}

function tokenDoCabecalho(req: Request): string {
  const cabecalho = req.headers.get('authorization') || '';
  return cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : '';
}

/** `sub` do JWT, sem validar assinatura. A rota só escuta em 127.0.0.1. */
function usuarioDoToken(token: string): string | null {
  const parte = token.split('.')[1];
  if (!parte) return null;
  try {
    const json = Buffer.from(parte.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const corpo = JSON.parse(json) as { sub?: unknown };
    return typeof corpo.sub === 'string' ? corpo.sub : null;
  } catch {
    return null;
  }
}

/**
 * Quem pode falar com o banco local: a própria sessão guardada no userData.
 *
 * O programa é mono-usuário por máquina e as rotas só escutam em 127.0.0.1;
 * a sessão em cache é gravada pelo fluxo de login (online) e é a mesma que o
 * sincronizador usa. Um JWT mais novo do mesmo usuário também passa.
 */
export async function exigirSessaoLocal(req: Request): Promise<{ sessao: SessaoLocal } | { resposta: NextResponse }> {
  const fora = negarForaDoDesktop();
  if (fora) return { resposta: fora };

  const token = tokenDoCabecalho(req);

  const sessao = await lerSessaoLocal();
  if (!sessao?.access_token) {
    return { resposta: NextResponse.json({ erro: 'Nenhuma sessão local. Conecte-se à internet e entre uma vez.' }, { status: 401 }) };
  }

  // Sem token: o access token do Supabase venceu e a máquina está sem internet.
  // Com outro token do mesmo usuário: o cliente renovou o JWT e o cache ainda
  // tem o anterior. Os dois casos seguem, porque a rota só escuta em 127.0.0.1.
  if (!token || token === sessao.access_token) return { sessao };
  const sub = usuarioDoToken(token);
  if (sub && sessao.user?.id && sub === sessao.user.id) return { sessao };

  return { resposta: NextResponse.json({ erro: 'Sessão local inválida.' }, { status: 401 }) };
}
