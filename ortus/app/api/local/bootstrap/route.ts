import { NextResponse } from 'next/server';
import { bootstrapLocal } from '@/lib/local/ponte';
import { exigirJanelaLocal, exigirSessaoLocal, falhaLocal } from '@/lib/local/rota';
import { ERRO_INTERNO } from '@/lib/registro';

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
    if (resultado.ok) return NextResponse.json(resultado);
    // O motivo vindo do sincronizador pode ser a resposta crua da nuvem (fica no log do programa).
    const motivo = resultado.motivo === 'sem-sessao' ? 'sem-sessao' : 'falha';
    return NextResponse.json({ ok: false, motivo, erro: ERRO_INTERNO }, { status: 409 });
  } catch (err) {
    return falhaLocal('api/local/bootstrap', err);
  }
}

export async function GET(req: Request) {
  const fora = exigirJanelaLocal(req);
  if (fora) return fora;
  return NextResponse.json({ bemVindo: true });
}
