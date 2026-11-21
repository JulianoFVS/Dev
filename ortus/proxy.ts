import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { moduleForPath } from '@/lib/permissionPresets';
import { COOKIE_AUTH, COOKIE_MODULES, decodeModulesCookie } from '@/lib/authCookies';
import { ehPaginaPublica, ehRotaDeExperimento, ehTelaSemCasca } from '@/lib/rotasPublicas';
import { recusarForaDaJanela } from '@/lib/local/janela';

const PUBLIC_PREFIXES = [
  '/_next',
  '/api/public',
  '/assets',
  '/favicon',
  '/icon',
  '/apple-icon',
  // Rotina do agendador (cron da Vercel ou timer da VM): não carrega cookie de
  // sessão. A barreira real é a própria rota, que exige
  // `Authorization: Bearer $CRON_SECRET` e falha fechada (401) sem a variável.
  '/api/lembretes/processar',
  '/api/assinaturas/processar',
  '/api/rotinas/rapida',
  // Volta do consentimento do Google Agenda: quem vale é o "state" de uso
  // único conferido na rota (no desktop o navegador do sistema não tem sessão).
  '/api/google/retorno',
  // Saúde do servidor para o monitor externo. Não devolve dado de clínica.
  '/api/saude',
  // Webhook do provedor de pagamento: quem autentica é a assinatura HMAC da
  // requisição, conferida dentro da rota. Sem assinatura válida, 401.
  '/api/pagamentos/webhook',
  // Rotas do aplicativo desktop. Elas mesmas checam se estão dentro do .exe
  // (404 no site) e exigem a sessão local; o guard não deve redirecionar
  // chamadas de dados para a tela de login.
  '/api/local',
];

/** Extensões de arquivo estático que nunca precisam de sessão (imagens e ícones). */
const EXTENSAO_ESTATICA = /\.(svg|png|jpg|jpeg|gif|webp|ico|avif|webmanifest|txt|xml)$/i;

function isPublicPath(pathname: string): boolean {
  if (ehPaginaPublica(pathname) || ehTelaSemCasca(pathname)) return true;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (EXTENSAO_ESTATICA.test(pathname)) return true;
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // No aplicativo desktop o servidor local só atende a janela do Ortus (segredo por execução, Host e Origin locais):
  // outro programa da máquina, site aberto no navegador e DNS rebinding recebem 403 em qualquer rota.
  if (process.env.ORTUS_DESKTOP === '1') {
    const fora = recusarForaDaJanela(request);
    if (fora) return fora;
  }

  if (process.env.NODE_ENV === 'production' && ehRotaDeExperimento(pathname)) {
    return new NextResponse('Não encontrado.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const authed = request.cookies.get(COOKIE_AUTH)?.value === '1';
  if (!authed) {
    // API sem sessão responde 401 em JSON: redirecionar um fetch para a
    // página de login devolvia HTML com status 200 e escondia o erro.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/login') {
      // Com a busca: o link do convite (?id=…&chave=…) precisa chegar inteiro depois do login.
      loginUrl.searchParams.set('redirect', `${pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(loginUrl);
  }

  // O dashboard é para onde o "acesso negado" manda: se ele próprio exigisse
  // módulo, quem não tem "Inteligência" (o padrão de recepção e de dentista)
  // ficava num laço de redirecionamento e não abria o sistema.
  const ehDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  const modulo = ehDashboard ? null : moduleForPath(pathname);
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
