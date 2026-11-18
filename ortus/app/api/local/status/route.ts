import { NextResponse } from 'next/server';
import { recusarForaDaJanela } from '@/lib/local/janela';
import { desktopAtivo } from '@/lib/local/ponte';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Identifica o ambiente para o renderer.
 *
 * A casca do app consulta isto no primeiro paint para saber se deve usar o
 * banco local, mostrar o indicador de sincronização e liberar o modo offline.
 * No site responde `desktop: false`. Dentro do aplicativo só responde à
 * própria janela, como todas as rotas locais.
 */
export async function GET(req: Request) {
  if (desktopAtivo()) {
    const fora = recusarForaDaJanela(req);
    if (fora) return fora;
  }
  return NextResponse.json({
    desktop: desktopAtivo(),
    versao: process.env.ORTUS_VERSAO || '',
    whatsapp: Boolean(process.env.WHATSAPP_GATEWAY_SECRET),
  });
}
