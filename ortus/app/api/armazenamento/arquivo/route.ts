import { NextResponse } from 'next/server';
import { exigirProfissional, lerArquivoPrivado } from '@/lib/armazenamentoServidor';

export const runtime = 'nodejs';

export async function GET(req: Request) {
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
