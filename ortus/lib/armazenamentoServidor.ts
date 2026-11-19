import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import {
  CAMINHO_AVATAR,
  CAMINHO_CLINICA,
  CAMINHO_FOTO_PACIENTE,
  CAMINHO_PACIENTE,
  ehCaminhoClinica,
  ehCaminhoPublico,
  regraDoCaminho,
  tipoSeguroParaServir,
  urlProxyPublica,
} from '@/lib/caminhosArquivo';
import { apagarCopiaAntiga, apagarDoR2, inicioNoR2, lerDoR2, r2Configurado, tamanhoNoR2, urlDeEnvio, urlPublicaR2 } from '@/lib/r2';
import { BYTES_INSPECAO, conteudoConfere, extensaoConfere, tipoLimpo } from '@/lib/assinaturaArquivo';
import { ERRO_INTERNO, registrarFalha } from '@/lib/registro';
import { escritaBarrada } from '@/lib/escritaLiberada';

type Admin = ReturnType<typeof createSupabaseAdmin>;
type Profissional = { id: number; is_super_admin: boolean | null };
export type Sessao = { admin: Admin; prof: Profissional; userId: string };
type Recusa = { erro: string; status: number };

const MB = 1024 * 1024;
/** 9,5 GB decimais. O R2 grátis corta em 10 GB; este teto fica abaixo disso. */
const TETO_PROJETO = 9_500_000_000;
/** Volume que cada pessoa pode enviar: folgado para o dia a dia, curto para abuso. */
export const LIMITE_USUARIO_DIA = 500 * MB;
export const LIMITE_USUARIO_MES = 2 * 1024 * MB;

export async function exigirProfissional(req: Request): Promise<{ negado: NextResponse } | Sessao> {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return { negado: NextResponse.json({ erro: 'Não autenticado.' }, { status: 401 }) };
  const admin = createSupabaseAdmin();
  const { data: caller, error } = await admin.auth.getUser(token);
  if (error || !caller?.user) return { negado: NextResponse.json({ erro: 'Sessão inválida.' }, { status: 401 }) };
  const { data: prof } = await admin
    .from('profissionais')
    .select('id, is_super_admin')
    .eq('user_id', caller.user.id)
    .maybeSingle();
  if (!prof) return { negado: NextResponse.json({ erro: 'Perfil não encontrado.' }, { status: 403 }) };
  return { admin, prof: prof as Profissional, userId: caller.user.id };
}

function negar(recusa: Recusa) {
  return NextResponse.json({ erro: recusa.erro }, { status: recusa.status });
}

/** O detalhe (texto do banco, do R2 ou do Node) vai só para o registro; a tela recebe frase fixa. */
async function falha(err: unknown, etapa: string) {
  await registrarFalha({ origem: 'api/armazenamento', extra: { etapa } }, err);
  return NextResponse.json({ erro: ERRO_INTERNO }, { status: 500 });
}

async function temAcesso(admin: Admin, prof: Profissional, clinicaId: number) {
  if (prof.is_super_admin) return true;
  const { data } = await admin
    .from('profissionais_clinicas')
    .select('clinica_id')
    .eq('profissional_id', prof.id)
    .eq('clinica_id', clinicaId)
    .maybeSingle();
  return !!data;
}

async function clinicaDoCaminho(admin: Admin, caminho: string) {
  const paciente = caminho.match(CAMINHO_PACIENTE);
  const clinica = caminho.match(CAMINHO_CLINICA);
  if (paciente) {
    const { data } = await admin.from('pacientes').select('clinica_id').eq('id', paciente[1]).maybeSingle();
    return data?.clinica_id != null ? Number(data.clinica_id) : null;
  }
  if (clinica) return Number(clinica[1]);
  return null;
}

async function autorizarClinica(sessao: Sessao, caminho: string): Promise<Recusa | { clinicaId: number }> {
  if (!ehCaminhoClinica(caminho)) return { erro: 'Caminho inválido.', status: 400 };
  const clinicaId = await clinicaDoCaminho(sessao.admin, caminho);
  if (clinicaId == null) return { erro: 'Caminho inválido.', status: 400 };
  if (!(await temAcesso(sessao.admin, sessao.prof, clinicaId))) return { erro: 'Sem permissão para esta clínica.', status: 403 };
  return { clinicaId };
}

/** Foto de perfil: só a própria, e só de quem trabalha em alguma clínica. */
async function autorizarAvatar(sessao: Sessao, caminho: string): Promise<Recusa | null> {
  const dono = caminho.match(CAMINHO_AVATAR)?.[1];
  if (!dono || dono.toLowerCase() !== sessao.userId.toLowerCase()) return { erro: 'Sem permissão para esta foto.', status: 403 };
  if (sessao.prof.is_super_admin) return null;
  const { count } = await sessao.admin
    .from('profissionais_clinicas')
    .select('clinica_id', { count: 'exact', head: true })
    .eq('profissional_id', sessao.prof.id);
  if (!count) return { erro: 'Sua conta ainda não está vinculada a uma clínica.', status: 403 };
  return null;
}

async function autorizar(sessao: Sessao, caminho: string): Promise<Recusa | { clinicaId: number | null }> {
  if (CAMINHO_AVATAR.test(caminho)) {
    const recusa = await autorizarAvatar(sessao, caminho);
    return recusa ?? { clinicaId: null };
  }
  return autorizarClinica(sessao, caminho);
}

/**
 * Em modo de consulta o arquivo da clínica não sobe nem é apagado: aqui se grava
 * com a chave de serviço, que passa pelo gatilho do banco. Foto de perfil (sem
 * clínica) segue livre, como o perfil no banco.
 */
async function barradaPelaAssinatura(sessao: Sessao, clinicaId: number | null) {
  if (clinicaId == null) return null;
  return escritaBarrada(sessao.admin, clinicaId, 'erro');
}

async function usoDaClinica(admin: Admin, clinicaId: number) {
  const [{ data: usado, error }, { data: clinica }] = await Promise.all([
    admin.rpc('armazenamento_uso_clinica', { p_clinica: clinicaId }),
    admin.from('clinicas').select('id, nome, limite_armazenamento_mb').eq('id', clinicaId).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  return {
    clinicaId: String(clinicaId),
    nome: clinica?.nome || 'Clínica',
    usado: Number(usado || 0),
    limite: Number(clinica?.limite_armazenamento_mb || 0) * MB,
  };
}

async function usoDoProjeto(admin: Admin) {
  const { data, error } = await admin.rpc('armazenamento_uso_projeto');
  if (error) throw new Error(error.message);
  return Number(data || 0);
}

function formatar(bytes: number) {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(1).replace('.', ',')} GB`;
  return `${Math.max(0, Math.round(bytes / MB))} MB`;
}

function formatarDecimal(bytes: number) {
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(1).replace('.', ',')} GB`;
  return `${Math.max(0, Math.round(bytes / 1_000_000))} MB`;
}

function validarArquivo(caminho: string, tamanho: number, contentType: string): Recusa | null {
  const regra = regraDoCaminho(caminho);
  if (!regra) return { erro: 'Caminho inválido.', status: 400 };
  if (!Number.isInteger(tamanho) || tamanho <= 0) return { erro: 'Arquivo vazio.', status: 400 };
  if (tamanho > regra.maximo) {
    return { erro: `Arquivo grande demais. O limite para este tipo é ${formatar(regra.maximo)}.`, status: 413 };
  }
  if (!regra.tipos.has(contentType)) return { erro: 'Tipo de arquivo não permitido.', status: 415 };
  if (!extensaoConfere(caminho, contentType)) return { erro: 'A extensão do arquivo não corresponde ao tipo.', status: 415 };
  return null;
}

/** Lê o começo do objeto no R2 e confere tipo gravado, extensão e assinatura dos bytes. */
async function conteudoNoR2Confere(caminho: string) {
  const regra = regraDoCaminho(caminho);
  if (!regra) return false;
  const lido = await inicioNoR2(caminho, BYTES_INSPECAO);
  if (!lido) return false;
  const tipo = tipoLimpo(lido.contentType);
  return regra.tipos.has(tipo) && extensaoConfere(caminho, tipo) && conteudoConfere(lido.inicio, tipo);
}

async function descartar(admin: Admin, caminho: string) {
  await apagarDoR2(caminho).catch(() => undefined);
  await admin.from('armazenamento_objetos').delete().eq('caminho', caminho);
}

async function reservar(sessao: Sessao, caminho: string, clinicaId: number | null, tamanho: number): Promise<Recusa | null> {
  const { data, error } = await sessao.admin.rpc('armazenamento_reservar', {
    p_caminho: caminho,
    p_clinica: clinicaId,
    p_bytes: tamanho,
    p_usuario: sessao.userId,
    p_teto: TETO_PROJETO,
    p_registrar: r2Configurado(),
    p_limite_dia: LIMITE_USUARIO_DIA,
    p_limite_mes: LIMITE_USUARIO_MES,
  });
  if (error) throw new Error(error.message);
  if (data === 'ok') return null;
  if (data === 'ritmo') return { erro: 'Muitos envios em pouco tempo. Espere alguns minutos e tente de novo.', status: 429 };
  if (data === 'usuario_dia') {
    return { erro: `Você chegou no limite de envios de hoje (${formatar(LIMITE_USUARIO_DIA)} em 24 horas). Tente de novo amanhã.`, status: 429 };
  }
  if (data === 'usuario_mes') {
    return { erro: `Você chegou no limite de envios do mês (${formatar(LIMITE_USUARIO_MES)} em 30 dias). Fale com o suporte se precisar de mais.`, status: 429 };
  }
  if (data === 'mes') return { erro: 'A conta chegou no limite mensal de envios. Fale com o suporte.', status: 429 };
  if (data === 'clinica' && clinicaId != null) {
    const uso = await usoDaClinica(sessao.admin, clinicaId);
    return {
      erro: `O armazenamento da clínica está cheio (${formatar(uso.usado)} de ${formatar(uso.limite)}). Apague arquivos antigos ou fale com o suporte para aumentar o limite.`,
      status: 413,
    };
  }
  const total = await usoDoProjeto(sessao.admin);
  return {
    erro: `O armazenamento da conta chegou no limite de segurança (${formatarDecimal(total)} de 9,5 GB). Apague arquivos antigos antes de enviar mais.`,
    status: 413,
  };
}

/**
 * Envio que ganhou link e nunca foi confirmado continua contando pela reserva.
 * Depois de 10 min, confere no R2 o que chegou de fato e acerta a conta.
 */
async function assentarPendentes(admin: Admin) {
  const limite = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await admin
    .from('armazenamento_objetos')
    .select('caminho, bytes')
    .eq('confirmado', false)
    .lt('atualizado_em', limite)
    .limit(20);
  for (const item of data || []) {
    const real = await tamanhoNoR2(item.caminho);
    if (real <= 0) {
      await admin.from('armazenamento_objetos').delete().eq('caminho', item.caminho).eq('confirmado', false);
    } else if (real > Number(item.bytes) || !(await conteudoNoR2Confere(item.caminho))) {
      await descartar(admin, item.caminho);
    } else {
      await admin.from('armazenamento_objetos')
        .update({ bytes: real, confirmado: true })
        .eq('caminho', item.caminho)
        .eq('confirmado', false);
    }
  }
}

export async function listarUso(req: Request) {
  const quem = await exigirProfissional(req);
  if ('negado' in quem) return quem.negado;
  const pedida = new URL(req.url).searchParams.get('clinicaId');
  let ids: number[];
  if (pedida && /^\d+$/.test(pedida)) {
    if (!(await temAcesso(quem.admin, quem.prof, Number(pedida)))) {
      return NextResponse.json({ erro: 'Sem permissão para esta clínica.' }, { status: 403 });
    }
    ids = [Number(pedida)];
  } else {
    const { data } = await quem.admin.from('profissionais_clinicas').select('clinica_id').eq('profissional_id', quem.prof.id).limit(20);
    ids = (data || []).map((v) => Number(v.clinica_id));
  }
  try {
    const [clinicas, total, envios] = await Promise.all([
      Promise.all(ids.map((id) => usoDaClinica(quem.admin, id))),
      usoDoProjeto(quem.admin),
      quem.admin.rpc('armazenamento_envios_usuario', { p_usuario: quem.userId }),
    ]);
    if (envios.error) throw new Error(envios.error.message);
    const linha = (Array.isArray(envios.data) ? envios.data[0] : envios.data) as { dia?: number; mes?: number } | null;
    return NextResponse.json({
      clinicas,
      total,
      teto: TETO_PROJETO,
      usuario: {
        dia: Number(linha?.dia || 0),
        mes: Number(linha?.mes || 0),
        limiteDia: LIMITE_USUARIO_DIA,
        limiteMes: LIMITE_USUARIO_MES,
      },
    });
  } catch (err) {
    return falha(err, 'Falha ao medir o armazenamento.');
  }
}

type Corpo = { acao?: string; caminho?: string; caminhos?: string[]; tamanho?: number; upsert?: boolean; contentType?: string };

export async function tratarPost(req: Request) {
  const quem = await exigirProfissional(req);
  if ('negado' in quem) return quem.negado;
  const body = await req.json().catch(() => ({})) as Corpo;
  const acao = body.acao || 'preparar';
  if (acao === 'confirmar') return confirmar(quem, body);
  if (acao === 'apagar') return apagar(quem, body);
  return preparar(quem, body);
}

async function preparar(sessao: Sessao, body: Corpo) {
  const caminho = String(body.caminho || '');
  const tamanho = Number(body.tamanho);
  const contentType = String(body.contentType || '').toLowerCase();

  const invalido = validarArquivo(caminho, tamanho, contentType);
  if (invalido) return negar(invalido);

  const acesso = await autorizar(sessao, caminho);
  if ('erro' in acesso) return negar(acesso);
  const barrada = await barradaPelaAssinatura(sessao, acesso.clinicaId);
  if (barrada) return barrada;

  try {
    if (r2Configurado()) await assentarPendentes(sessao.admin).catch(() => undefined);
    const recusa = await reservar(sessao, caminho, acesso.clinicaId, tamanho);
    if (recusa) return negar(recusa);
  } catch (err) {
    return falha(err, 'Falha ao medir o armazenamento.');
  }

  if (!r2Configurado()) {
    if (CAMINHO_AVATAR.test(caminho)) return NextResponse.json({ modo: 'supabase-avatar', urlPublica: urlProxyPublica(caminho) });
    const { data, error } = await sessao.admin.storage.from('arquivos_ortus').createSignedUploadUrl(caminho, { upsert: body.upsert === true });
    if (error || !data) return falha(error ?? new Error('link de envio vazio'), 'Falha ao liberar o envio.');
    return NextResponse.json({
      modo: 'supabase',
      caminho: data.path,
      token: data.token,
      urlPublica: ehCaminhoPublico(caminho) ? urlProxyPublica(caminho) : null,
    });
  }

  try {
    const url = await urlDeEnvio(caminho, contentType, tamanho);
    return NextResponse.json({ modo: 'r2', url, caminho });
  } catch (err) {
    return falha(err, 'Falha ao liberar o envio.');
  }
}

async function confirmar(sessao: Sessao, body: Corpo) {
  if (!r2Configurado()) return NextResponse.json({ erro: 'Cloudflare R2 não está configurado.' }, { status: 400 });
  const caminho = String(body.caminho || '');
  const regra = regraDoCaminho(caminho);
  if (!regra) return NextResponse.json({ erro: 'Caminho inválido.' }, { status: 400 });

  const acesso = await autorizar(sessao, caminho);
  if ('erro' in acesso) return negar(acesso);
  // O modo de consulta já foi conferido em preparar (o link vale 60 s); recusar aqui não tiraria o arquivo do R2.

  const { data: reserva, error: reservaErr } = await sessao.admin
    .from('armazenamento_objetos')
    .select('bytes, confirmado')
    .eq('caminho', caminho)
    .maybeSingle();
  if (reservaErr) return falha(reservaErr, 'Falha ao conferir o envio.');
  if (!reserva) return NextResponse.json({ erro: 'Envio não encontrado. Tente de novo.' }, { status: 400 });

  let real = 0;
  try {
    real = await tamanhoNoR2(caminho);
  } catch (err) {
    return falha(err, 'Falha ao conferir o arquivo.');
  }
  if (real <= 0) return NextResponse.json({ erro: 'O envio não chegou ao armazenamento.' }, { status: 400 });

  if (real > Number(reserva.bytes) || real > regra.maximo) {
    await descartar(sessao.admin, caminho);
    return NextResponse.json({ erro: 'O arquivo enviado é maior que o permitido.' }, { status: 413 });
  }

  let confere = false;
  try {
    confere = await conteudoNoR2Confere(caminho);
  } catch (err) {
    return falha(err, 'Falha ao conferir o arquivo.');
  }
  if (!confere) {
    await descartar(sessao.admin, caminho);
    return NextResponse.json({ erro: 'O conteúdo do arquivo não corresponde ao tipo informado.' }, { status: 415 });
  }

  const { error } = await sessao.admin
    .from('armazenamento_objetos')
    .update({ bytes: real, confirmado: true, atualizado_em: new Date().toISOString() })
    .eq('caminho', caminho);
  if (error) return falha(error, 'Falha ao registrar o arquivo.');

  // A foto nova já está no privado: a cópia de antes da mudança não fica aberta no bucket público.
  if (CAMINHO_FOTO_PACIENTE.test(caminho)) {
    await apagarCopiaAntiga(caminho).catch((err) => registrarFalha({ origem: 'api/armazenamento', extra: { etapa: 'apagar cópia pública da foto' } }, err));
  }

  return NextResponse.json({ urlPublica: ehCaminhoPublico(caminho) ? urlPublicaR2(caminho) : null });
}

async function apagar(sessao: Sessao, body: Corpo) {
  const caminhos = Array.isArray(body.caminhos) ? body.caminhos.map(String).slice(0, 50) : [];
  if (!caminhos.length) return NextResponse.json({ erro: 'Nenhum arquivo informado.' }, { status: 400 });

  for (const caminho of caminhos) {
    const acesso = await autorizar(sessao, caminho);
    if ('erro' in acesso) return negar(acesso);
    const barrada = await barradaPelaAssinatura(sessao, acesso.clinicaId);
    if (barrada) return barrada;

    if (r2Configurado()) {
      try {
        await apagarDoR2(caminho);
      } catch (err) {
        return falha(err, 'Não foi possível apagar o arquivo.');
      }
    }
    if (caminho.startsWith('avatares/')) {
      await sessao.admin.storage.from('avatars').remove([caminho.slice('avatares/'.length)]);
    } else {
      await sessao.admin.storage.from('arquivos_ortus').remove([caminho]);
    }
    await sessao.admin.from('armazenamento_objetos').delete().eq('caminho', caminho);
  }

  return NextResponse.json({ ok: true });
}

type Lido = { bytes: Uint8Array; contentType: string };

export async function lerArquivoPrivado(sessao: Sessao, caminho: string): Promise<Recusa | Lido> {
  const acesso = await autorizarClinica(sessao, caminho);
  if ('erro' in acesso) return acesso;
  const lido = await lerBytes(sessao.admin, caminho);
  if ('erro' in lido) return lido;
  return { bytes: lido.bytes, contentType: tipoSeguroParaServir(caminho, lido.contentType) || 'application/octet-stream' };
}

export async function lerArquivoPublico(caminho: string): Promise<Recusa | Lido> {
  if (!ehCaminhoPublico(caminho)) return { erro: 'Não encontrado.', status: 404 };
  const lido = await lerBytes(createSupabaseAdmin(), caminho, true);
  if ('erro' in lido) return lido;
  const tipo = tipoSeguroParaServir(caminho, lido.contentType);
  if (!tipo) return { erro: 'Não encontrado.', status: 404 };
  return { bytes: lido.bytes, contentType: tipo };
}

/**
 * Só toca o R2 quando o banco diz que o arquivo está lá: caminho inventado não gera leitura paga.
 * Na rota pública (visitante sem login), sem registro também não há download do Supabase.
 */
async function lerBytes(admin: Admin, caminho: string, publico = false): Promise<Recusa | Lido> {
  if (r2Configurado()) {
    const { data: registro } = await admin
      .from('armazenamento_objetos')
      .select('caminho, confirmado')
      .eq('caminho', caminho)
      .maybeSingle();
    if (registro && !registro.confirmado) return { erro: 'Arquivo indisponível.', status: 404 };
    if (!registro && publico) return { erro: 'Não encontrado.', status: 404 };
    if (registro) {
      try {
        const arquivo = await lerDoR2(caminho);
        if (arquivo) return arquivo;
      } catch (err) {
        await registrarFalha({ origem: 'api/armazenamento/ler', extra: { publico } }, err);
        return { erro: ERRO_INTERNO, status: 500 };
      }
    }
  }

  const bucket = caminho.startsWith('avatares/') ? 'avatars' : 'arquivos_ortus';
  const chave = caminho.startsWith('avatares/') ? caminho.slice('avatares/'.length) : caminho;
  const { data, error } = await admin.storage.from(bucket).download(chave);
  if (error || !data) return { erro: 'Arquivo indisponível.', status: 404 };
  return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type || 'application/octet-stream' };
}
