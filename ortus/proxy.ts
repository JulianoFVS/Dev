import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { moduleForPath } from '@/lib/permissionPresets';
import { COOKIE_AUTH, COOKIE_MODULES, decodeModulesCookie } from '@/lib/authCookies';

const PUBLIC_EXACT = new Set([
  '/',
  '/login',
  '/site',
  '/termos',
  '/checkout',
  '/cadastro',
  '/primeiro-acesso',
  '/selecao',
]);

const PUBLIC_PREFIXES = [
  '/_next',
  '/api/public',
  '/anamnese',
  '/assets',
  '/favicon',
  '/icon',
  '/apple-icon',
  // Modelo e WASM do MediaPipe (análise da foto do paciente). São arquivos
  // estáticos sem dado de cliente; se ficarem atrás do login, o navegador
  // recebe um 307 para /login ao carregar o modelo e a captura com análise
  // cai no fallback sem motivo. O uso real continua exigindo sessão, porque
  // só o app autenticado abre a tela de captura.
  '/mediapipe',
  // Rotina do Vercel Cron: não carrega cookie de sessão. A barreira real é a
  // própria rota, que exige `Authorization: Bearer $CRON_SECRET` e falha
  // fechada (401) quando a variável não existe.
  '/api/lembretes/processar',
  // Rotas do aplicativo desktop. Elas mesmas checam se estão dentro do .exe
  // (404 no site) e exigem a sessão local; o guard não deve redirecionar
  // chamadas de dados para a tela de login.
  '/api/local',
];

/**
 * Extensões de arquivo estático que nunca precisam de sessão.
 * Inclui `.task` e `.wasm` do MediaPipe e os ícones/manifest do PWA.
 */
const EXTENSAO_ESTATICA = /\.(svg|png|jpg|jpeg|gif|webp|ico|avif|task|wasm|webmanifest|txt|xml)$/i;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (EXTENSAO_ESTATICA.test(pathname)) return true;
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const authed = request.cookies.get(COOKIE_AUTH)?.value === '1';
  if (!authed) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/login') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  const modulo = moduleForPath(pathname);
  if (modulo) {
    const modules = decodeModulesCookie(request.cookies.get(COOKIE_MODULES)?.value);
    if (modules !== 'all' && !modules.has(modulo)) {
      return NextResponse.redirect(new URL('/dashboard?acesso=negado', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
