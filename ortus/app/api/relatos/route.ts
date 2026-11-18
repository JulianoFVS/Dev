import { NextResponse } from 'next/server';
import { identificarChamador, temAcessoAClinica, type Chamador } from '@/lib/chamadorApi';
import { emailValido, enviarEmail } from '@/lib/email';
import { emailRelato } from '@/lib/emailModelos';
import { origemParaEmail } from '@/lib/origemApp';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';
import { RELATOS_POR_HORA, validarRelato, type RespostaRelato, type TipoRelato } from '@/lib/relatos';

export const runtime = 'nodejs';

const ORIGEM = 'api/relatos';
const JANELA_MS = 60 * 60 * 1000;

type Admin = Chamador['admin'];

type RelatoGravado = {
  id: number;
  tipo: TipoRelato;
  assunto: string;
  descricao: string;
  autor: string;
  clinica: string;
  clinicaId: number | null;
};

async function falhaInterna(etapa: string, erro: unknown, clinicaId: number | null = null) {
  await registrarFalha({ origem: ORIGEM, clinicaId, extra: { etapa } }, erro);
  return NextResponse.json({ error: ERRO_INTERNO }, { status: 500 });
}

function semRepetir(emails: string[]): string[] {
  return Array.from(new Map(emails.map((email) => [email.toLowerCase(), email])).values());
}

/**
 * Quem recebe o aviso: a lista fixa de `ALERTA_EMAILS` (separada por vírgula)
 * ou, sem ela, o e-mail de login de cada dono da plataforma.
 */
async function emailsDosDonos(admin: Admin): Promise<string[]> {
  const fixos = (process.env.ALERTA_EMAILS || '').split(',').map((email) => email.trim()).filter(emailValido);
  if (fixos.length > 0) return semRepetir(fixos);

  const { data } = await admin.from('profissionais').select('user_id').eq('is_super_admin', true);
  const donos = (data || []) as Array<{ user_id: string | null }>;
  const emails = await Promise.all(
    donos.map(async (dono) => {
      if (!dono.user_id) return '';
      const { data: conta } = await admin.auth.admin.getUserById(dono.user_id);
      return conta?.user?.email || '';
    }),
  );
  return semRepetir(emails.filter(emailValido));
}

/** Marca na linha o que aconteceu com o aviso. Melhor-esforço: sem a marca, o relato continua valendo. */
async function anotarEmail(
  admin: Admin,
  relato: RelatoGravado,
  campos: { email_enviado_em: string } | { email_erro: string },
) {
  try {
    const { error } = await admin.from('relatos_suporte').update(campos).eq('id', relato.id);
    if (error) await registrarFalha({ origem: ORIGEM, clinicaId: relato.clinicaId, extra: { etapa: 'anotar_email' } }, error);
  } catch (erro) {
    await registrarFalha({ origem: ORIGEM, clinicaId: relato.clinicaId, extra: { etapa: 'anotar_email' } }, erro);
  }
}

/**
 * Avisa os donos da plataforma e anota o resultado na linha do relato.
 *
 * Nunca lança: o relato já está gravado. Se a falha do aviso virasse erro
 * para quem enviou, a pessoa reenviaria e a fila ficaria com duplicatas.
 */
async function avisarDonos(chamador: Chamador, relato: RelatoGravado): Promise<boolean> {
  let motivo = '';
  let status = 0;
  let causa: unknown = null;
  try {
    const para = await emailsDosDonos(chamador.admin);
    if (para.length === 0) {
      motivo = 'Sem destinatário: defina ALERTA_EMAILS ou um dono da plataforma com e-mail de acesso.';
    } else {
      const pronto = emailRelato({
        tipo: relato.tipo,
        assunto: relato.assunto,
        descricao: relato.descricao,
        autor: relato.autor,
        clinica: relato.clinica,
        origem: origemParaEmail(),
      });
      // Responder ao aviso escreve direto para quem relatou.
      const envio = await enviarEmail({ para, ...pronto, categoria: 'relato', responderPara: chamador.email });
      if (envio.ok) {
        await anotarEmail(chamador.admin, relato, { email_enviado_em: new Date().toISOString() });
        return true;
      }
      motivo = envio.erro;
      status = envio.status ?? 0;
    }
  } catch (erro) {
    motivo = 'Falha inesperada ao preparar o aviso por e-mail.';
    causa = erro;
  }
  await registrarFalha({ origem: ORIGEM, clinicaId: relato.clinicaId, extra: { etapa: 'email', status } }, causa ?? new Error(motivo));
  await anotarEmail(chamador.admin, relato, { email_erro: motivo.slice(0, 300) });
  return false;
}

/**
 * POST { tipo: 'bug' | 'sugestao', assunto, descricao, clinicaId }
 *
 * Grava o relato em `relatos_suporte` (a fila do painel SaaS) e avisa os donos
 * da plataforma por e-mail. O que vale é a gravação: se o e-mail não sair, a
 * resposta continua 200, com `email.enviado: false`, e o motivo fica na linha
 * (`email_erro`) para o painel mostrar.
 *
 * A tabela não tem policy de INSERT. Só esta rota grava, depois de conferir o
 * login e o limite de envios por hora.
 *
 * Respostas: 200 { ok, id, email: { enviado } } · 400 { error } (validação) ·
 * 401 { error } · 429 { error } (limite por hora) · 500 { error }.
 */
export async function POST(req: Request) {
  try {
    const chamador = await identificarChamador(req);
    if (!chamador) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const validacao = validarRelato(await req.json().catch(() => null));
    if (!validacao.ok) return NextResponse.json({ error: validacao.erro }, { status: 400 });
    const { tipo, assunto, descricao, clinicaId: clinicaPedida } = validacao.relato;

    // Os mais antigos da última hora: o primeiro diz quando a pessoa pode enviar de novo.
    const recentes = await chamador.admin
      .from('relatos_suporte')
      .select('criado_em')
      .eq('autor_user_id', chamador.userId)
      .gte('criado_em', new Date(Date.now() - JANELA_MS).toISOString())
      .order('criado_em', { ascending: true })
      .limit(RELATOS_POR_HORA);
    if (recentes.error) return await falhaInterna('contar', recentes.error);
    const enviados = (recentes.data || []) as Array<{ criado_em: string }>;
    if (enviados.length >= RELATOS_POR_HORA) {
      const liberaEm = new Date(enviados[0].criado_em).getTime() + JANELA_MS;
      const minutos = Math.min(60, Math.max(1, Math.ceil((liberaEm - Date.now()) / 60_000)));
      return NextResponse.json(
        { error: `Você já enviou ${RELATOS_POR_HORA} relatos na última hora. Tente de novo em ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.` },
        { status: 429, headers: { 'Retry-After': String(minutos * 60) } },
      );
    }

    // A clínica vem da tela, então só entra se a pessoa trabalha nela. O nome é
    // copiado para a fila continuar legível se a clínica for removida.
    let clinicaId: number | null = null;
    let clinicaNome: string | null = null;
    if (clinicaPedida != null && (await temAcessoAClinica(chamador, clinicaPedida))) {
      const { data: clinica } = await chamador.admin
        .from('clinicas')
        .select('id, nome')
        .eq('id', clinicaPedida)
        .maybeSingle<{ id: number; nome: string | null }>();
      if (clinica) {
        clinicaId = clinicaPedida;
        clinicaNome = (clinica.nome || '').trim() || null;
      }
    }

    const autorNome = (chamador.prof.nome || '').trim() || null;
    const { data: criado, error: erroAoGravar } = await chamador.admin
      .from('relatos_suporte')
      .insert({
        tipo,
        assunto,
        descricao,
        autor_user_id: chamador.userId,
        autor_profissional_id: chamador.prof.id,
        autor_nome: autorNome,
        clinica_id: clinicaId,
        clinica_nome: clinicaNome,
      })
      .select('id')
      .single<{ id: number }>();
    if (erroAoGravar || !criado) return await falhaInterna('gravar', erroAoGravar ?? new Error('O relato não foi gravado.'), clinicaId);

    const id = Number(criado.id);
    const enviado = await avisarDonos(chamador, {
      id,
      tipo,
      assunto,
      descricao,
      autor: autorNome || 'Pessoa sem nome no cadastro',
      clinica: clinicaNome || 'Não informada',
      clinicaId,
    });

    const resposta: RespostaRelato = { ok: true, id, email: { enviado } };
    return NextResponse.json(resposta);
  } catch (erro) {
    return await falhaInterna('inesperado', erro);
  }
}
