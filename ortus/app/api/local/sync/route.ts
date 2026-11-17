import { NextResponse } from 'next/server';
import { estadoSync, sincronizarAgora } from '@/lib/local/ponte';
import { exigirSessaoLocal } from '@/lib/local/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Estado do backup na nuvem (usado pelo indicador fixo do shell). */
export async function GET(req: Request) {
  const sessao = await exigirSessaoLocal(req);
  if ('resposta' in sessao) return sessao.resposta;

  try {
    return NextResponse.json(await estadoSync());
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : 'Falha ao ler o estado.' }, { status: 500 });
  }
}

/** Força um ciclo de envio/recebimento agora. */
export async function POST(req: Request) {
  const sessao = await exigirSessaoLocal(req);
  if ('resposta' in sessao) return sessao.resposta;

  try {
    return NextResponse.json(await sincronizarAgora());
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : 'Falha ao sincronizar.' }, { status: 500 });
  }
}
