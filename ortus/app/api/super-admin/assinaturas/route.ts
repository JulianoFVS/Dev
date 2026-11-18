import { NextResponse } from 'next/server';
import { conferirReferencia, reenviarAcessoPeloDono, reprocessarPedido } from '@/lib/assinaturasServidor';
import { ehSuperAdmin, identificarChamador } from '@/lib/chamadorApi';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Acao = 'reprocessar_pedido' | 'reenviar_acesso' | 'conferir_pedido' | 'conferir_fatura';

/**
 * POST — ações do painel SaaS que precisam do servidor (login, e-mail e
 * provedor de pagamento). Só dono da plataforma; cada ação fica em audit_log.
 *
 *   { acao: 'reprocessar_pedido', pedido }  refaz a criação da conta de compra paga
 *   { acao: 'reenviar_acesso', pedido }     manda de novo o link de criação de senha
 *   { acao: 'conferir_pedido', pedido }     pergunta ao provedor e aplica o que houver
 *   { acao: 'conferir_fatura', fatura }     idem, para uma mensalidade
 */
export async function POST(req: Request) {
  const chamador = await identificarChamador(req);
  if (!chamador) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (!ehSuperAdmin(chamador)) return NextResponse.json({ error: 'Acesso restrito aos donos da plataforma.' }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as { acao?: Acao; pedido?: unknown; fatura?: unknown } | null;
  const acao = corpo?.acao;
  const pedido = typeof corpo?.pedido === 'string' && UUID.test(corpo.pedido) ? corpo.pedido.toLowerCase() : null;
  const fatura = Number(corpo?.fatura);
  const { admin } = chamador;

  const auditar = async (entidadeId: string, detalhes: Record<string, unknown>) => {
    await admin.from('audit_log').insert({
      user_id: chamador.userId,
      profissional_nome: chamador.prof.nome || 'Painel SaaS',
      acao: 'editou',
      entidade: 'assinatura',
      entidade_id: entidadeId,
      detalhes: { origem: 'painel_saas', acao, ...detalhes },
    });
  };

  try {
    if (acao === 'reprocessar_pedido' || acao === 'reenviar_acesso' || acao === 'conferir_pedido') {
      if (!pedido) return NextResponse.json({ error: 'Compra não encontrada.' }, { status: 404 });
      if (acao === 'conferir_pedido') {
        const r = await conferirReferencia(admin, `pedido_${pedido.replace(/-/g, '')}`, 'rotina');
        await auditar(pedido, { consultou: r.consultou, aplicados: r.aplicados });
        if (!r.consultou) return NextResponse.json({ error: 'O provedor de pagamento não respondeu (ou não está configurado).' }, { status: 502 });
        return NextResponse.json({ ok: true, aplicados: r.aplicados });
      }
      const r = acao === 'reprocessar_pedido' ? await reprocessarPedido(admin, pedido) : await reenviarAcessoPeloDono(admin, pedido);
      await auditar(pedido, { status: r.status });
      return NextResponse.json(r.corpo, { status: r.status });
    }

    if (acao === 'conferir_fatura') {
      if (!Number.isSafeInteger(fatura) || fatura <= 0) return NextResponse.json({ error: 'Fatura não encontrada.' }, { status: 404 });
      const { data: existe } = await admin.from('faturas').select('id').eq('id', fatura).maybeSingle();
      if (!existe) return NextResponse.json({ error: 'Fatura não encontrada.' }, { status: 404 });
      const r = await conferirReferencia(admin, `fatura_${fatura}`, 'rotina');
      await auditar(String(fatura), { consultou: r.consultou, aplicados: r.aplicados });
      if (!r.consultou) return NextResponse.json({ error: 'O provedor de pagamento não respondeu (ou não está configurado).' }, { status: 502 });
      return NextResponse.json({ ok: true, aplicados: r.aplicados });
    }

    return NextResponse.json({ error: 'Ação desconhecida.' }, { status: 400 });
  } catch (erro) {
    await registrarFalha({ origem: 'api/super-admin/assinaturas', extra: { acao: String(acao || '') } }, erro);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}
