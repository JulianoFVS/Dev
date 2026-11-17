import { NextResponse } from 'next/server';
import { bootstrapLocal, desktopAtivo } from '@/lib/local/ponte';
import { exigirSessaoLocal } from '@/lib/local/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Primeiro uso com internet (ou instalação nova em outro PC): baixa do
 * Supabase tudo o que a clínica pode ver e grava no SQLite antes de liberar
 * a tela.
 */
export async function POST(req: Request) {
  const sessao = await exigirSessaoLocal(req);
  if ('resposta' in sessao) return sessao.resposta;

  try {
    const resultado = await bootstrapLocal();
    return NextResponse.json(resultado, { status: resultado.ok ? 200 : 409 });
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : 'Falha ao baixar o backup.' }, { status: 500 });
  }
}

export async function GET() {
  if (!desktopAtivo()) {
    return NextResponse.json({ erro: 'Recurso do aplicativo desktop.' }, { status: 404 });
  }
  return NextResponse.json({ bemVindo: true });
}
