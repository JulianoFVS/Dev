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

/**
 * Quem pode falar com o banco local: a própria sessão guardada no userData.
 *
 * O programa é mono-usuário por máquina e as rotas só escutam em 127.0.0.1;
 * a sessão em cache é gravada pelo fluxo de login (online) e é a mesma que o
 * sincronizador usa. Token diferente do cache é recusado.
 */
export async function exigirSessaoLocal(req: Request): Promise<{ sessao: SessaoLocal } | { resposta: NextResponse }> {
  const fora = negarForaDoDesktop();
  if (fora) return { resposta: fora };

  const token = tokenDoCabecalho(req);

  const sessao = await lerSessaoLocal();
  if (!sessao?.access_token) {
    return { resposta: NextResponse.json({ erro: 'Nenhuma sessão local. Conecte-se à internet e entre uma vez.' }, { status: 401 }) };
  }

  // Com token: precisa ser o mesmo da sessão em cache.
  if (token && sessao.access_token !== token) {
    return { resposta: NextResponse.json({ erro: 'Sessão local inválida.' }, { status: 401 }) };
  }

  // Sem token: só acontece quando o token do Supabase venceu e a máquina está
  // sem internet. Como a sessão em cache existe e as rotas só escutam em
  // 127.0.0.1 (mesma máquina, mesmo usuário do sistema), seguimos com ela —
  // é o que mantém a clínica trabalhando offline.
  return { sessao };
}
