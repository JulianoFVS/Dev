import { NextResponse } from 'next/server';
import { emailValido, enviarEmail, pendenciaDoEmail } from '@/lib/email';
import { emailRedefinirSenha } from '@/lib/emailModelos';
import { origemParaEmail } from '@/lib/origemApp';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';
import { consumirLimite, recusarPedidoDeFora, resumoDaOrigem, resumoDoEmail } from '@/lib/rotaPublica';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ORIGEM = 'api/public/recuperar-senha';

// A mesma resposta para e-mail com e sem conta: a rota não serve para descobrir quem tem cadastro.
const RESPOSTA_PADRAO = {
  enviado: true,
  mensagem: 'Se houver uma conta com este e-mail, enviamos um link para criar uma nova senha.',
};
const ERRO_ENVIO = 'O e-mail não saiu agora. Tente de novo em alguns minutos.';

/**
 * POST { email } — "Esqueci a senha": manda para o e-mail da conta um link de
 * uso único que abre /acesso?tipo=senha.
 *
 * Ordem: pedido de fora (415/403), limites (10 por hora por endereço; por
 * e-mail, 1 a cada 2 minutos e 3 por hora), configuração do e-mail (503) e só
 * então a busca da conta. Assim a resposta não depende de o e-mail existir,
 * fora a recusa da Resend (502), que só pode acontecer quando há envio.
 * O registro de falhas nunca leva e-mail, token nem link.
 */
export async function POST(req: Request) {
  const recusa = recusarPedidoDeFora(req);
  if (recusa) return recusa;

  const corpo = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof corpo?.email === 'string' ? corpo.email.trim().toLowerCase() : '';

  try {
    const admin = createSupabaseAdmin();
    if (!(await consumirLimite(admin, `senha:ip:${resumoDaOrigem(req)}`, 10, 3600))) {
      return NextResponse.json({ error: 'Muitos pedidos em pouco tempo. Tente de novo mais tarde.' }, { status: 429 });
    }
    if (!emailValido(email)) return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });

    const chaveEmail = resumoDoEmail(email);
    // O de 2 minutos vem antes: um clique repetido não gasta um dos 3 envios da hora.
    if (!(await consumirLimite(admin, `senha:email2m:${chaveEmail}`, 1, 120))) {
      return NextResponse.json({ error: 'Aguarde dois minutos antes de pedir outro link.' }, { status: 429 });
    }
    if (!(await consumirLimite(admin, `senha:email:${chaveEmail}`, 3, 3600))) {
      return NextResponse.json({ error: 'Muitos pedidos para este e-mail. Tente de novo mais tarde.' }, { status: 429 });
    }

    // Configuração conferida antes de procurar a conta: sem ela, a resposta é igual para qualquer e-mail.
    const origem = origemParaEmail();
    const pendencia = pendenciaDoEmail() || (origem ? null : 'NEXT_PUBLIC_APP_URL não configurada');
    if (pendencia) {
      await registrarFalha({ origem: ORIGEM, extra: { etapa: 'configuracao' } }, `Recuperação de senha sem configuração: ${pendencia}.`);
      return NextResponse.json(
        { error: 'A recuperação de senha está indisponível no momento. Fale com o suporte do Ortus.' },
        { status: 503 },
      );
    }

    const { data: usuario, error: erroBusca } = await admin.rpc('assinatura_usuario_por_email', { p_email: email });
    if (erroBusca) {
      await registrarFalha({ origem: ORIGEM, extra: { etapa: 'busca' } }, erroBusca);
      return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
    }
    if (!usuario) return NextResponse.json(RESPOSTA_PADRAO);

    const { data: link, error: erroLink } = await admin.auth.admin.generateLink({ type: 'recovery', email });
    const token = link?.properties?.hashed_token;
    if (erroLink || !token) {
      await registrarFalha({ origem: ORIGEM, extra: { etapa: 'link' } }, erroLink || 'generateLink sem token');
      return NextResponse.json({ error: ERRO_ENVIO }, { status: 502 });
    }

    const nome = link.user?.user_metadata?.nome;
    const mensagem = emailRedefinirSenha({
      nome: typeof nome === 'string' ? nome : null,
      linkAcesso: `${origem}/acesso?token=${encodeURIComponent(token)}&tipo=senha`,
    });
    const envio = await enviarEmail({
      para: email,
      assunto: mensagem.assunto,
      texto: mensagem.texto,
      html: mensagem.html,
      categoria: 'recuperar_senha',
    });
    if (!envio.ok) {
      // O motivo da Resend vai só para o registro (já sem e-mail); a pessoa recebe a frase fixa.
      await registrarFalha({ origem: ORIGEM, extra: { etapa: 'envio', status: envio.status ?? null } }, envio.erro);
      return NextResponse.json({ error: ERRO_ENVIO }, { status: 502 });
    }
    return NextResponse.json(RESPOSTA_PADRAO);
  } catch (erro) {
    await registrarFalha({ origem: ORIGEM }, erro);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}
