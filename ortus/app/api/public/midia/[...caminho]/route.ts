import { NextResponse } from 'next/server';
import { lerArquivoPublico } from '@/lib/armazenamentoServidor';
import { lerPublicoDesktop, respostaOuPrazo } from '@/lib/arquivosDesktop';
import { desktopAtivo } from '@/lib/local/ponte';

export const runtime = 'nodejs';

type RouteParams = { params: Promise<{ caminho: string[] }> };

const SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Cross-Origin-Resource-Policy': 'same-site',
};

export async function GET(_req: Request, ctx: RouteParams) {
  const { caminho: partes } = await ctx.params;
  let caminho = '';
  try {
    caminho = partes.map((parte) => decodeURIComponent(parte)).join('/');
  } catch {
    return NextResponse.json({ erro: 'Não encontrado.' }, { status: 404, headers: { ...SEGURANCA, 'Cache-Control': 'public, s-maxage=600' } });
  }
  if (desktopAtivo()) {
    const local = await lerPublicoDesktop(caminho);
    if (local) {
      return new NextResponse(Buffer.from(local.bytes), {
        headers: {
          ...SEGURANCA,
          'Content-Type': local.contentType,
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }
    return respostaOuPrazo(lerNaNuvem(caminho));
  }
  return lerNaNuvem(caminho);
}

async function lerNaNuvem(caminho: string) {
  const arquivo = await lerArquivoPublico(caminho);
  if ('erro' in arquivo) {
    return NextResponse.json({ erro: arquivo.erro }, {
      status: arquivo.status,
      headers: { ...SEGURANCA, 'Cache-Control': 'public, s-maxage=600' },
    });
  }
  return new NextResponse(Buffer.from(arquivo.bytes), {
    headers: {
      ...SEGURANCA,
      'Content-Type': arquivo.contentType,
      'Cache-Control': 'public, max-age=86400, s-maxage=2592000',
    },
  });
}
