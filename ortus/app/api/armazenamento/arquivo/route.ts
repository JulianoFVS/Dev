import { NextResponse } from 'next/server';
import { exigirProfissional, lerArquivoPrivado } from '@/lib/armazenamentoServidor';
import { gravarPrivadoDesktop, lerPrivadoDesktop, respostaOuPrazo } from '@/lib/arquivosDesktop';
import { desktopAtivo } from '@/lib/local/ponte';

export const runtime = 'nodejs';

export async function PUT(req: Request) {
  if (!desktopAtivo()) return NextResponse.json({ erro: 'Recurso do aplicativo desktop.' }, { status: 404 });
  return gravarPrivadoDesktop(req);
}

async function lerNaNuvem(req: Request) {
  const quem = await exigirProfissional(req);
  if ('negado' in quem) return quem.negado;
  const caminho = new URL(req.url).searchParams.get('caminho') || '';
  const arquivo = await lerArquivoPrivado(quem, caminho);
  if ('erro' in arquivo) return NextResponse.json({ erro: arquivo.erro }, { status: arquivo.status });
  return new NextResponse(Buffer.from(arquivo.bytes), {
    headers: {
      'Content-Type': arquivo.contentType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}

export async function GET(req: Request) {
  if (!desktopAtivo()) return lerNaNuvem(req);
  const local = await lerPrivadoDesktop(req);
  if (local.status !== 404) return local;
  return respostaOuPrazo(lerNaNuvem(req));
}
