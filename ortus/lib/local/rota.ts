import { NextResponse } from 'next/server';
import { recusarForaDaJanela } from '@/lib/local/janela';
import { desktopAtivo, lerSessaoLocal, type SessaoLocal } from '@/lib/local/ponte';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';

/**
 * Guardas das rotas `/api/local/*`.
 *
 * Elas só existem dentro do .exe (`ORTUS_DESKTOP=1`). No site da Vercel
 * respondem 404 — não há como um visitante alcançar o banco local.
 *
 * Dentro do .exe, escutar em 127.0.0.1 não é prova de quem chama: um site
 * aberto no navegador da mesma máquina também alcança esse endereço. Toda
 * rota local passa por `exigirJanelaLocal`, que confere `Host`, `Origin` e o
 * segredo que só a janela do aplicativo manda (ver `lib/local/janela.ts`).
 */

export function negarForaDoDesktop(): NextResponse | null {
  if (!desktopAtivo()) {
    return NextResponse.json({ erro: 'Recurso do aplicativo desktop.' }, { status: 404 });
  }
  return null;
}

/**
 * Corpo só em JSON. Formulário e `text/plain` são o que outra página consegue
 * mandar sem preflight; aqui nem chegam a ser lidos.
 */
export function exigirCorpoJson(req: Request): NextResponse | null {
  const tipo = (req.headers.get('content-type') || '').trim().toLowerCase();
  if (/^application\/json\s*(;|$)/.test(tipo)) return null;
  return NextResponse.json(
    { erro: 'Envie os dados em JSON.' },
    { status: 415, headers: { 'Cache-Control': 'no-store' } },
  );
}

type OpcoesGuarda = {
  /** A rota lê o corpo da requisição: exige `Content-Type: application/json`. */
  json?: boolean;
};

/** 404 fora do aplicativo; 403 para quem não é a janela do aplicativo; 415 para corpo que não é JSON. */
export function exigirJanelaLocal(req: Request, opcoes: OpcoesGuarda = {}): NextResponse | null {
  return negarForaDoDesktop() ?? recusarForaDaJanela(req) ?? (opcoes.json ? exigirCorpoJson(req) : null);
}

/**
 * Falha inesperada numa rota local. O detalhe (que pode trazer texto do
 * SQLite ou da nuvem) vai para o log do programa; a tela recebe a frase fixa.
 */
export async function falhaLocal(origem: string, err: unknown): Promise<NextResponse> {
  await registrarFalha({ origem }, err);
  return NextResponse.json({ erro: ERRO_INTERNO }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
}

function tokenDoCabecalho(req: Request): string {
  const cabecalho = req.headers.get('authorization') || '';
  return cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : '';
}

/**
 * `sub` do JWT, sem validar assinatura: aqui o token só diz de qual usuário é
 * a tela. Quem autentica a chamada é a prova de janela, conferida antes.
 */
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
 * Quem pode falar com o banco local: a janela do aplicativo, com a sessão
 * guardada no userData.
 *
 * O programa é mono-usuário por máquina; a sessão em cache é gravada pelo
 * fluxo de login (online) e é a mesma que o sincronizador usa. Um JWT mais
 * novo do mesmo usuário também passa.
 */
export async function exigirSessaoLocal(
  req: Request,
  opcoes: OpcoesGuarda = {},
): Promise<{ sessao: SessaoLocal } | { resposta: NextResponse }> {
  const fora = exigirJanelaLocal(req, opcoes);
  if (fora) return { resposta: fora };

  const token = tokenDoCabecalho(req);

  const sessao = await lerSessaoLocal();
  if (!sessao?.access_token) {
    return { resposta: NextResponse.json({ erro: 'Nenhuma sessão local. Conecte-se à internet e entre uma vez.' }, { status: 401 }) };
  }

  // Sem token: o access token do Supabase venceu e a máquina está sem internet.
  // Com outro token do mesmo usuário: o cliente renovou o JWT e o cache ainda
  // tem o anterior. Os dois casos seguem porque a chamada já provou, acima,
  // que vem da janela do aplicativo.
  if (!token || token === sessao.access_token) return { sessao };
  const sub = usuarioDoToken(token);
  if (sub && sessao.user?.id && sub === sessao.user.id) return { sessao };

  return { resposta: NextResponse.json({ erro: 'Sessão local inválida.' }, { status: 401 }) };
}
