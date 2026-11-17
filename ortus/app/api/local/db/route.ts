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
  dados?: Record<string, unknown> | Record<string, unknown>[];
  id?: string | number | null;
  chaves?: string[];
};

function idDa(linha: Record<string, unknown> | null | undefined) {
  const id = linha?.id;
  return typeof id === 'string' || typeof id === 'number' ? id : null;
}

/**
 * Uma escrita pode ser uma linha, uma lista, ou todas as linhas que batem
 * com o filtro (update/delete sem id). Cada linha passa pelo gravar, então
 * entra na fila de sincronização.
 */
async function gravarVarias(
  tabela: string,
  op: 'insert' | 'update' | 'upsert' | 'delete',
  dados: Record<string, unknown> | Record<string, unknown>[] | undefined,
  filtros: FiltroLocal[],
  chaves: string[],
  id?: string | number | null,
) {
  if (op === 'delete') {
    if (id != null) return gravarLocal({ tabela, op, id });
    const linhas = await consultarLocal<Record<string, unknown>>(tabela, { filtros });
    const apagadas = [];
    for (const linha of linhas) {
      const linhaId = idDa(linha);
      if (linhaId == null) continue;
      apagadas.push(await gravarLocal({ tabela, op: 'delete', id: linhaId }));
    }
    return apagadas;
  }

  const lista = Array.isArray(dados) ? dados : [dados || {}];

  if (op === 'update' && id == null) {
    const linhas = await consultarLocal<Record<string, unknown>>(tabela, { filtros });
    const atualizadas = [];
    for (const linha of linhas) {
      const linhaId = idDa(linha);
      if (linhaId == null) continue;
      atualizadas.push(await gravarLocal({ tabela, op: 'update', id: linhaId, dados: lista[0] || {} }));
    }
    return atualizadas;
  }

  if (op === 'upsert' && chaves.length) {
    const salvas = [];
    for (const item of lista) {
      const busca = chaves.map((col) => ({ col, op: 'eq' as const, valor: item[col] }));
      const existentes = await consultarLocal<Record<string, unknown>>(tabela, { filtros: busca, limite: 1 });
      const existente = idDa(existentes[0]);
      salvas.push(await gravarLocal({
        tabela,
        op: existente == null ? 'insert' : 'update',
        id: existente,
        dados: item,
      }));
    }
    return Array.isArray(dados) ? salvas : salvas[0] ?? null;
  }

  if (op === 'update' && id != null) {
    return gravarLocal({ tabela, op: 'update', id, dados: lista[0] || {} });
  }

  if (op === 'upsert') {
    const salvas = [];
    for (const item of lista) {
      salvas.push(await gravarLocal({ tabela, op: 'upsert', id: idDa(item), dados: item }));
    }
    return Array.isArray(dados) ? salvas : salvas[0] ?? null;
  }

  const inseridas = [];
  for (const item of lista) {
    inseridas.push(await gravarLocal({ tabela, op: 'insert', dados: item }));
  }
  return Array.isArray(dados) ? inseridas : inseridas[0] ?? null;
}

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
        const dados = await gravarVarias(
          corpo.tabela,
          corpo.op as 'insert' | 'update' | 'upsert' | 'delete',
          corpo.dados,
          corpo.filtros || [],
          corpo.chaves || [],
          corpo.id,
        );
        return NextResponse.json({ dados });
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
