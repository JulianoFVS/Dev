import { NextResponse } from 'next/server';
import { estadoSync, sincronizarAgora, type EstadoSync } from '@/lib/local/ponte';
import { exigirSessaoLocal, falhaLocal } from '@/lib/local/rota';
import { ERRO_INTERNO } from '@/lib/registro';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** O último erro do sincronizador traz a resposta crua da nuvem: fica no log, a tela recebe a frase fixa. */
function paraTela(estado: EstadoSync): EstadoSync {
  return { ...estado, ultimoErro: estado.ultimoErro ? ERRO_INTERNO : null };
}

/** Estado do backup na nuvem (usado pelo indicador fixo do shell). */
export async function GET(req: Request) {
  const sessao = await exigirSessaoLocal(req);
  if ('resposta' in sessao) return sessao.resposta;

  try {
    return NextResponse.json(paraTela(await estadoSync()));
  } catch (err) {
    return falhaLocal('api/local/sync', err);
  }
}

/** Força um ciclo de envio/recebimento agora. */
export async function POST(req: Request) {
  const sessao = await exigirSessaoLocal(req);
  if ('resposta' in sessao) return sessao.resposta;

  try {
    return NextResponse.json(paraTela(await sincronizarAgora()));
  } catch (err) {
    return falhaLocal('api/local/sync', err);
  }
}
