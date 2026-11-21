import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { concluirConexao, ErroGoogle } from '@/lib/googleAgenda';
import { origemDoApp } from '@/lib/origemApp';
import { registrarFalha } from '@/lib/registro';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/google/retorno?code&state — a volta do consentimento do Google.
 *
 * Sem sessão de propósito: no aplicativo de computador o consentimento abre
 * no navegador do sistema, onde a pessoa pode não estar logada. Quem vale é
 * o "state", guardado só em hash por 10 minutos e usado uma vez.
 * Volta para o perfil com ?google=conectado | recusado | erro.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origem = origemDoApp(req);
  const voltar = (estado: string, caminho = '/perfil') => NextResponse.redirect(`${origem}${caminho}?google=${estado}`, 303);
  const estado = url.searchParams.get('state') || '';
  const codigo = url.searchParams.get('code') || '';
  if (url.searchParams.get('error')) return voltar('recusado');
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(estado) || !codigo || codigo.length > 2000) return voltar('erro');
  try {
    const { volta } = await concluirConexao(createSupabaseAdmin(), { estado, codigo, origem });
    return voltar('conectado', volta.startsWith('/') && !volta.startsWith('//') ? volta : '/perfil');
  } catch (erro) {
    if (!(erro instanceof ErroGoogle)) await registrarFalha({ origem: 'api/google/retorno' }, erro);
    return voltar('erro');
  }
}
