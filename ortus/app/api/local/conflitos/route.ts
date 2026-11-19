import { NextResponse } from 'next/server';
import { listarConflitos, resolverConflito } from '@/lib/local/ponte';
import { exigirSessaoLocal, falhaLocal } from '@/lib/local/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Conflitos de sincronização: a versão que perdeu fica guardada aqui. */
export async function GET(req: Request) {
  const sessao = await exigirSessaoLocal(req);
  if ('resposta' in sessao) return sessao.resposta;

  try {
    return NextResponse.json({ dados: await listarConflitos() });
  } catch (err) {
    return falhaLocal('api/local/conflitos', err);
  }
}

export async function POST(req: Request) {
  const sessao = await exigirSessaoLocal(req, { json: true });
  if ('resposta' in sessao) return sessao.resposta;

  const corpo = (await req.json().catch(() => ({}))) as { id?: number; escolha?: 'local' | 'remoto' };
  if (!corpo.id) return NextResponse.json({ erro: 'Informe o conflito.' }, { status: 400 });

  try {
    await resolverConflito(Number(corpo.id), corpo.escolha === 'remoto' ? 'remoto' : 'local');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return falhaLocal('api/local/conflitos', err);
  }
}
