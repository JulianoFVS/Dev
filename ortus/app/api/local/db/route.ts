import { NextResponse } from 'next/server';
import {
  consultarLocal,
  contarLocal,
  desktopAtivo,
  gravarLocal,
  type FiltroLocal,
  type OrdemLocal,
} from '@/lib/local/ponte';
import { exigirSessaoLocal } from '@/lib/local/rota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Corpo = {
  tabela?: string;
  op?: 'select' | 'count' | 'insert' | 'update' | 'upsert' | 'delete';
  filtros?: FiltroLocal[];
  ordem?: OrdemLocal[];
  limite?: number;
  offset?: number;
  dados?: Record<string, unknown>;
  id?: string | number | null;
};

/**
 * Porta de dados do renderer para o SQLite.
 *
 * É o mesmo contrato para todas as telas migradas: select/count/insert/
 * update/delete. O processo principal cuida de carimbar `updated_at` e de
 * enfileirar a escrita para a nuvem.
 */
export async function POST(req: Request) {
  const sessao = await exigirSessaoLocal(req);
  if ('resposta' in sessao) return sessao.resposta;

  const corpo = (await req.json().catch(() => ({}))) as Corpo;
  if (!corpo.tabela) {
    return NextResponse.json({ erro: 'Informe a tabela.' }, { status: 400 });
  }

  try {
    switch (corpo.op || 'select') {
      case 'count': {
        const total = await contarLocal(corpo.tabela, corpo.filtros || []);
        return NextResponse.json({ total });
      }
      case 'select': {
        const dados = await consultarLocal(corpo.tabela, {
          filtros: corpo.filtros || [],
          ordem: corpo.ordem || [],
          limite: corpo.limite,
          offset: corpo.offset,
        });
        return NextResponse.json({ dados });
      }
      case 'insert':
      case 'update':
      case 'upsert':
      case 'delete': {
        const linha = await gravarLocal({
          tabela: corpo.tabela,
          op: corpo.op as 'insert' | 'update' | 'upsert' | 'delete',
          dados: corpo.dados || {},
          id: corpo.id,
        });
        return NextResponse.json({ dados: linha });
      }
      default:
        return NextResponse.json({ erro: 'Operação inválida.' }, { status: 400 });
    }
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : 'Falha no banco local.';
    return NextResponse.json({ erro: mensagem }, { status: 500 });
  }
}

export async function GET() {
  if (!desktopAtivo()) {
    return NextResponse.json({ erro: 'Recurso do aplicativo desktop.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, tabelas: 'use POST' });
}
