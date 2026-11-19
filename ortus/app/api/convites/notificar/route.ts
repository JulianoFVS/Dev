import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { clinicasQueAdministra, ehSuperAdmin, identificarChamador } from '@/lib/chamadorApi';
import { enviarEmail } from '@/lib/email';
import { emailConviteAceito, emailConviteClinica } from '@/lib/emailModelos';
import { origemParaEmail } from '@/lib/origemApp';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';

export const runtime = 'nodejs';

/** Reenvio do mesmo convite: no máximo um e-mail a cada 10 minutos. */
const INTERVALO_REENVIO_MS = 10 * 60 * 1000;

type Convite = {
  id: number;
  status: string;
  clinica_ids: Array<number | string> | null;
  convidado_user_id: string | null;
  convidado_email: string;
  convidado_nome: string | null;
  convidante_profissional_id: number | string | null;
  convidante_nome: string | null;
  cargo: string | null;
  mensagem: string | null;
  email_convite_em: string | null;
  email_aceite_em: string | null;
};

/**
 * POST { conviteId, evento: 'convite' | 'aceito' }
 *
 * O convite em si é gravado pela função `equipe_convidar` do banco. Esta rota
 * só manda o e-mail correspondente — e diz a verdade sobre o resultado:
 * `enviado: false` com o motivo quando a Resend recusa ou não está
 * configurada. O convite continua valendo em Mensagens de qualquer jeito.
 *
 *  - 'convite': quem convidou (ou um administrador das clínicas do convite)
 *    avisa o convidado.
 *  - 'aceito': o próprio convidado, depois de aceitar, avisa quem convidou.
 *
 * O destinatário nunca vem do corpo da requisição: sai do convite no banco.
 */
export async function POST(req: Request) {
  try {
    const chamador = await identificarChamador(req);
    if (!chamador) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const conviteId = Number(body?.conviteId);
    const evento = body?.evento === 'aceito' ? 'aceito' : 'convite';
    if (!Number.isInteger(conviteId) || conviteId <= 0) {
      return NextResponse.json({ error: 'Convite inválido.' }, { status: 400 });
    }

    const { data: convite } = await chamador.admin
      .from('convites_equipe')
      .select('id, status, clinica_ids, convidado_user_id, convidado_email, convidado_nome, convidante_profissional_id, convidante_nome, cargo, mensagem, email_convite_em, email_aceite_em')
      .eq('id', conviteId)
      .maybeSingle<Convite>();
    if (!convite) return NextResponse.json({ error: 'Convite não encontrado.' }, { status: 404 });

    const clinicaIds = (convite.clinica_ids || []).map(String);
    const { data: clinicas } = await chamador.admin.from('clinicas').select('id, nome').in('id', clinicaIds.map(Number));
    const nomesClinicas = (clinicas || []).map((c) => String(c.nome || '')).filter(Boolean);
    const origem = origemParaEmail();

    if (evento === 'convite') {
      const souQuemConvidou = String(convite.convidante_profissional_id ?? '') === String(chamador.prof.id);
      let autorizado = souQuemConvidou || ehSuperAdmin(chamador);
      if (!autorizado) {
        const administradas = await clinicasQueAdministra(chamador);
        autorizado = clinicaIds.length > 0 && clinicaIds.every((id) => administradas.has(id));
      }
      // Mesma resposta para "não existe" e "não é seu": não confirma ids alheios.
      if (!autorizado) return NextResponse.json({ error: 'Convite não encontrado.' }, { status: 404 });
      if (convite.status !== 'pendente') {
        return NextResponse.json({ enviado: false, erro: 'Este convite já foi respondido.' }, { status: 409 });
      }
      if (convite.email_convite_em && Date.now() - new Date(convite.email_convite_em).getTime() < INTERVALO_REENVIO_MS) {
        return NextResponse.json({ enviado: true, repetido: true });
      }

      // A chave vai só no e-mail: é ela que prova, no aceite, que quem aceita
      // lê a caixa de entrada do convidado. No banco fica o resumo (SHA-256).
      if (!origem) {
        return NextResponse.json({ enviado: false, erro: 'NEXT_PUBLIC_APP_URL não configurada: o e-mail do convite precisa do endereço do Ortus para o link.' });
      }
      const chave = crypto.randomBytes(24).toString('base64url');
      const pronto = emailConviteClinica({
        convidadoNome: convite.convidado_nome,
        convidanteNome: convite.convidante_nome || chamador.prof.nome || 'Um administrador',
        clinicas: nomesClinicas,
        cargo: convite.cargo,
        mensagem: convite.mensagem,
        linkConvite: `${origem}/convite?id=${convite.id}&chave=${chave}`,
      });
      const envio = await enviarEmail({ para: convite.convidado_email, ...pronto, categoria: 'convite' });
      if (!envio.ok) {
        await registrarFalha({ origem: 'api/convites/notificar', extra: { evento, status: envio.status ?? 0 } }, new Error(envio.erro));
        return NextResponse.json({ enviado: false, erro: envio.erro });
      }
      await chamador.admin
        .from('convites_equipe')
        .update({
          email_convite_em: new Date().toISOString(),
          aceite_hash: crypto.createHash('sha256').update(chave, 'utf8').digest('hex'),
          // e-mail novo, chave nova: uma confirmação feita com o link anterior não vale mais
          email_confirmado_em: null,
          email_confirmado_por: null,
        })
        .eq('id', convite.id)
        .eq('status', 'pendente');
      return NextResponse.json({ enviado: true });
    }

    // ---- 'aceito': o convidado avisa quem convidou ----
    const souOConvidado = convite.convidado_user_id === chamador.userId
      || (chamador.email != null && convite.convidado_email.toLowerCase() === chamador.email.toLowerCase());
    if (!souOConvidado) return NextResponse.json({ error: 'Convite não encontrado.' }, { status: 404 });
    if (convite.status !== 'aceito') return NextResponse.json({ enviado: false, erro: 'O convite ainda não foi aceito.' }, { status: 409 });
    if (convite.email_aceite_em) return NextResponse.json({ enviado: true, repetido: true });
    if (convite.convidante_profissional_id == null) return NextResponse.json({ enviado: false, erro: 'Quem convidou não está mais no sistema.' });

    const { data: convidante } = await chamador.admin
      .from('profissionais')
      .select('nome, user_id')
      .eq('id', convite.convidante_profissional_id)
      .maybeSingle();
    let destino = '';
    if (convidante?.user_id) {
      const { data } = await chamador.admin.auth.admin.getUserById(convidante.user_id);
      destino = data?.user?.email || '';
    }
    if (!destino) return NextResponse.json({ enviado: false, erro: 'Quem convidou não tem e-mail de acesso.' });

    const pronto = emailConviteAceito({
      convidanteNome: convidante?.nome,
      convidadoNome: convite.convidado_nome || chamador.prof.nome || 'A pessoa convidada',
      clinicas: nomesClinicas,
      origem,
    });
    const envio = await enviarEmail({ para: destino, ...pronto, categoria: 'convite_aceito' });
    if (!envio.ok) {
      await registrarFalha({ origem: 'api/convites/notificar', extra: { evento, status: envio.status ?? 0 } }, new Error(envio.erro));
      return NextResponse.json({ enviado: false, erro: envio.erro });
    }
    await chamador.admin.from('convites_equipe').update({ email_aceite_em: new Date().toISOString() }).eq('id', convite.id);
    return NextResponse.json({ enviado: true });
  } catch (err) {
    await registrarFalha({ origem: 'api/convites/notificar' }, err);
    return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
  }
}
