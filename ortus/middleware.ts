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
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (/\.(svg|png|jpg|jpeg|gif|webp|ico)$/i.test(pathname)) return true;
  return false;
}

export function middleware(request: NextRequest) {
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
