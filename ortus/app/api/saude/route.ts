import { NextResponse } from 'next/server';
import { saudePublica } from '@/lib/vigia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET — saúde do servidor, para o monitor externo. Pública (o proxy libera
 * `/api/saude`).
 *
 * Corpo: { ok, banco, configuracao, agendador, versao, verificado_em }.
 * Nunca traz dado de clínica, e-mail, contagem nem nome ou valor de variável.
 *
 *   200  o banco respondeu e o vigia está em dia. `ok: false` no corpo quando
 *        falta configuração obrigatória ou o vigia ainda não rodou nenhuma vez.
 *   503  o banco não respondeu, ou o vigia parou de dar sinal (ou falhou).
 *
 * O que fazer com cada resposta: docs/OPERACAO.md.
 */
export async function GET() {
  const { status, corpo } = await saudePublica();
  return NextResponse.json(corpo, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
