import { NextResponse } from 'next/server';
import { aplicarPagamento } from '@/lib/assinaturasServidor';
import { provedorDePagamento } from '@/lib/pagamentos';
import { registrarFalha } from '@/lib/registro';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** No máximo um registro de "assinatura inválida" a cada 10 minutos por processo: aviso forjado não enche a tabela de falhas. */
let ultimoRegistroDeRecusa = 0;

/**
 * POST — aviso do provedor de pagamento.
 *
 * 1. Confere a assinatura do aviso. Sem assinatura válida: 401, nada é lido.
 * 2. O corpo só serve para saber QUAL pagamento mudou. O estado e o valor são
 *    relidos na API do provedor, com a credencial do servidor.
 * 3. A transição acontece no banco, numa transação (`pagamento_aplicar`):
 *    a mesma entrega repetida não quita duas vezes nem cria duas contas.
 *
 * Responde 200 quando o aviso foi tratado (inclusive "nada a fazer") e 5xx
 * quando vale a pena o provedor tentar de novo.
 */
export async function POST(req: Request) {
  const provedor = provedorDePagamento();
  if (!provedor) return NextResponse.json({ error: 'Provedor de pagamento não configurado.' }, { status: 503 });

  // Formato antigo (IPN: ?topic=…&id=…). O Mercado Pago avisa que a assinatura desse formato
  // não confere com a chave; responder 401 faria o provedor repetir a cada 15 minutos. Não é
  // processado: o aviso do formato novo e a conferência diária cobrem o mesmo pagamento.
  const endereco = new URL(req.url);
  if (endereco.searchParams.has('topic') && !endereco.searchParams.has('data.id')) {
    return NextResponse.json({ ok: true, tratado: false });
  }

  const bruto = await req.text();
  if (bruto.length > 65_536) return NextResponse.json({ error: 'Corpo grande demais.' }, { status: 413 });
  let corpo: unknown = null;
  try {
    corpo = bruto ? JSON.parse(bruto) : null;
  } catch {
    corpo = null;
  }

  const aviso = provedor.conferirAviso({ url: endereco, cabecalhos: req.headers, corpo });
  if (!aviso.ok) {
    if (Date.now() - ultimoRegistroDeRecusa > 10 * 60_000) {
      ultimoRegistroDeRecusa = Date.now();
      await registrarFalha({ origem: 'api/pagamentos/webhook', extra: { motivo: aviso.motivo } }, 'Aviso de pagamento recusado: assinatura inválida ou ausente.');
    }
    return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
  }
  if (!aviso.pagamentoId) return NextResponse.json({ ok: true, tratado: false });

  const leitura = await provedor.lerPagamento(aviso.pagamentoId);
  if (!leitura.ok) {
    // Pagamento que o provedor não conhece (ex.: simulação do painel dele): nada a fazer. Se for
    // atraso do provedor logo depois de criar o pagamento, a conferência pela referência (página de
    // retorno e rotina diária) acha o pagamento depois.
    if (leitura.status === 404) return NextResponse.json({ ok: true, tratado: false });
    await registrarFalha({ origem: 'api/pagamentos/webhook', extra: { etapa: 'leitura', status: leitura.status ?? null } }, leitura.erro);
    return NextResponse.json({ error: 'Não foi possível consultar o pagamento agora.' }, { status: 503 });
  }

  const resultado = await aplicarPagamento(createSupabaseAdmin(), leitura.pagamento, 'webhook');
  if (resultado.resultado === 'erro') return NextResponse.json({ error: 'Falha ao gravar o pagamento.' }, { status: 500 });
  return NextResponse.json({ ok: true, tratado: true, resultado: resultado.resultado });
}
