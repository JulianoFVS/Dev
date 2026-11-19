import 'server-only';
import crypto from 'node:crypto';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { emailValido, enviarEmail, pendenciaDoEmail } from '@/lib/email';
import {
  emailAcessoBloqueado,
  emailAcessoReaberto,
  emailAssinaturaAtiva,
  emailFaturaAtrasada,
  emailFaturaGerada,
  emailLinkDeAcesso,
  type EmailPronto,
} from '@/lib/emailModelos';
import { origemParaEmail } from '@/lib/origemApp';
import { pendenciaDoPagamento, provedorDePagamento } from '@/lib/pagamentos';
import { aceitaPagamentoDeTeste } from '@/lib/pagamentos/mercadopago';
import type { PagamentoLido } from '@/lib/pagamentos/tipos';
import { limparTexto, registrarFalha } from '@/lib/registro';
import { consumirLimite } from '@/lib/rotaPublica';
import { diasEntre, mesDaCompetencia, type PlanoPublico, type StatusPedido } from '@/lib/assinaturas';

/**
 * Assinatura — tudo o que o servidor faz.
 *
 * Três portas levam ao mesmo lugar (`aplicarPagamento`): o webhook assinado,
 * a volta da pessoa do checkout e a conferência diária. As três releem o
 * pagamento no provedor; nenhuma acredita no que veio escrito na requisição.
 * A transição em si acontece no banco (`pagamento_aplicar`), numa transação.
 */

type Admin = ReturnType<typeof createSupabaseAdmin>;

const VALIDADE_DO_LINK_HORAS = 72;
const PEDIDO_EXPIRA_EM_DIAS = 4;
const MAX_TENTATIVAS_CONTA = 8;
const MAX_ENVIOS_ACESSO = 8;
const ESPERA_ENTRE_EMAILS_MS = 550;

const pausa = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function mascararEmail(email: string): string {
  const [usuario, dominio] = email.split('@');
  if (!usuario || !dominio) return '***';
  return `${usuario.slice(0, 1)}***@${dominio}`;
}

const referenciaDoPedido = (id: string) => `pedido_${id.replace(/-/g, '')}`;
const referenciaDaFatura = (id: number) => `fatura_${id}`;

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------
export async function listarPlanosPublicos(admin: Admin): Promise<PlanoPublico[]> {
  const { data, error } = await admin
    .from('planos_saas')
    .select('codigo, nome, descricao, valor_centavos, recursos, destaque')
    .eq('ativo', true)
    .eq('publico', true)
    .gt('valor_centavos', 0)
    .order('ordem', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((p) => ({
    codigo: String(p.codigo),
    nome: String(p.nome),
    descricao: p.descricao ? String(p.descricao) : null,
    valor_centavos: Number(p.valor_centavos),
    recursos: Array.isArray(p.recursos) ? p.recursos.map(String).slice(0, 12) : [],
    destaque: Boolean(p.destaque),
  }));
}

// ---------------------------------------------------------------------------
// Compra pela página pública
// ---------------------------------------------------------------------------
export type EntradaDoPedido = {
  plano?: unknown;
  clinica?: unknown;
  responsavel?: unknown;
  email?: unknown;
  telefone?: unknown;
  aceite?: unknown;
};

export type RespostaDoPedido =
  | { ok: true; pedido: string; url: string | null; pago: boolean }
  | { ok: false; status: number; erro: string; campo?: string };

const texto = (valor: unknown, limite: number) => (typeof valor === 'string' ? valor.replace(/\s+/g, ' ').trim().slice(0, limite) : '');

export async function criarPedido(admin: Admin, entrada: EntradaDoPedido, origemHash: string): Promise<RespostaDoPedido> {
  const pendencia = pendenciaDoPagamento();
  const provedor = provedorDePagamento();
  if (pendencia || !provedor) {
    return { ok: false, status: 503, erro: 'A assinatura pela internet está indisponível no momento. Fale com o suporte do Ortus.' };
  }
  const origem = origemParaEmail();

  const clinica = texto(entrada.clinica, 120);
  const responsavel = texto(entrada.responsavel, 120);
  const email = texto(entrada.email, 254).toLowerCase();
  const telefone = texto(entrada.telefone, 40).replace(/\D/g, '');
  const codigo = texto(entrada.plano, 40).toLowerCase();

  if (clinica.length < 2) return { ok: false, status: 400, erro: 'Informe o nome da clínica.', campo: 'clinica' };
  if (responsavel.length < 2) return { ok: false, status: 400, erro: 'Informe o nome de quem vai administrar a conta.', campo: 'responsavel' };
  if (!emailValido(email)) return { ok: false, status: 400, erro: 'Informe um e-mail válido.', campo: 'email' };
  if (telefone && (telefone.length < 10 || telefone.length > 13)) {
    return { ok: false, status: 400, erro: 'Informe o telefone com DDD.', campo: 'telefone' };
  }
  if (entrada.aceite !== true) return { ok: false, status: 400, erro: 'É preciso aceitar os Termos de Uso e a Política de Privacidade.', campo: 'aceite' };

  // O preço sai do catálogo. O que o navegador mandou de valor, se mandou, não é lido.
  const { data: plano } = await admin
    .from('planos_saas')
    .select('codigo, nome, valor_centavos')
    .eq('codigo', codigo)
    .eq('ativo', true)
    .eq('publico', true)
    .gt('valor_centavos', 0)
    .maybeSingle();
  if (!plano) return { ok: false, status: 400, erro: 'Plano indisponível. Escolha um dos planos da página.', campo: 'plano' };

  // Limites antes de qualquer consulta por e-mail: 8 tentativas por hora por endereço (contando
  // também as recusadas por e-mail já cadastrado, para a página não servir de consulta de quem
  // tem conta) e um teto geral por hora, que avisa o dono quando é atingido.
  if (!(await consumirLimite(admin, `compra:ip:${origemHash}`, 8, 3600))) {
    return { ok: false, status: 429, erro: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.' };
  }
  if (!(await consumirLimite(admin, 'compra:geral', 300, 3600))) {
    await registrarFalha({ origem: 'assinatura/checkout', extra: { etapa: 'teto_geral' } }, 'Teto geral de compras por hora atingido.');
    return { ok: false, status: 429, erro: 'Muitas compras sendo abertas agora. Tente de novo em alguns minutos.' };
  }

  const { data: jaTemConta } = await admin.rpc('assinatura_usuario_por_email', { p_email: email });
  if (jaTemConta) {
    return {
      ok: false,
      status: 409,
      erro: 'Este e-mail já tem cadastro no Ortus. Entre com a sua conta ou use outro e-mail para a nova clínica.',
      campo: 'email',
    };
  }

  // Compra já paga para este e-mail (a conta está sendo criada): não nasce outra cobrança.
  // O identificador dessa compra nunca volta para quem só informou o e-mail.
  const { count: pagas } = await admin
    .from('assinatura_pedidos')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .in('status', ['pago', 'provisionado']);
  if ((pagas ?? 0) > 0) {
    return {
      ok: false,
      status: 409,
      erro: 'Este e-mail já tem uma assinatura paga. O link de acesso vai para ele: confira a caixa de entrada.',
      campo: 'email',
    };
  }

  // Cada envio do formulário é uma compra nova. Uma compra anterior do mesmo e-mail não é
  // reaproveitada, alterada nem cancelada daqui: saber o e-mail de alguém não dá acesso à
  // compra dele. Quando uma for paga, o banco encerra as outras (pagamento_aplicar).
  const { data: novo, error: erroNovo } = await admin
    .from('assinatura_pedidos')
    .insert({
      plano: plano.codigo,
      plano_nome: plano.nome,
      valor_centavos: plano.valor_centavos,
      clinica_nome: clinica,
      responsavel_nome: responsavel,
      email,
      telefone: telefone || null,
      aceite_termos_em: new Date().toISOString(),
      origem_hash: origemHash,
    })
    .select('id')
    .single();
  if (erroNovo || !novo) {
    await registrarFalha({ origem: 'assinatura/checkout' }, erroNovo);
    return { ok: false, status: 500, erro: 'Não foi possível iniciar a compra agora. Tente de novo em instantes.' };
  }

  const cobranca = await provedor.criarCobranca({
    referencia: referenciaDoPedido(novo.id),
    titulo: `Ortus — plano ${plano.nome} (mensalidade)`,
    valorCentavos: plano.valor_centavos,
    pagador: { email, nome: responsavel },
    urlRetorno: `${origem}/checkout/retorno?pedido=${novo.id}`,
    urlAviso: `${origem}/api/pagamentos/webhook`,
    validadeHoras: VALIDADE_DO_LINK_HORAS,
    chaveIdempotencia: `pedido-${novo.id}`,
  });
  if (!cobranca.ok) {
    // Nenhum pagamento pode existir para uma cobrança que não nasceu: a compra some.
    await admin.from('assinatura_pedidos').delete().eq('id', novo.id).eq('status', 'aguardando_pagamento');
    await registrarFalha({ origem: 'assinatura/checkout', extra: { etapa: 'cobranca', status: cobranca.status ?? null } }, cobranca.erro);
    return { ok: false, status: 502, erro: 'O provedor de pagamento não abriu a cobrança agora. Tente de novo em alguns minutos.' };
  }

  await admin
    .from('assinatura_pedidos')
    .update({
      provedor: provedor.nome,
      provedor_ref: cobranca.cobranca.ref,
      link_pagamento: cobranca.cobranca.url,
      link_expira_em: cobranca.cobranca.expiraEm,
    })
    .eq('id', novo.id);

  return { ok: true, pedido: novo.id, url: cobranca.cobranca.url, pago: false };
}

// ---------------------------------------------------------------------------
// Aplicar um pagamento (webhook, volta do checkout e conferência)
// ---------------------------------------------------------------------------
export type ResultadoDoPagamento = {
  resultado: 'aplicado' | 'ignorado' | 'revisar' | 'erro';
  motivo: string | null;
  alvo: 'pedido' | 'fatura' | 'desconhecido';
  pedidoId: string | null;
  faturaId: number | null;
  redeId: string | null;
  contaCriada: boolean;
};

export async function aplicarPagamento(admin: Admin, pagamento: PagamentoLido, origem: 'webhook' | 'retorno' | 'rotina' | 'painel'): Promise<ResultadoDoPagamento> {
  // Pagamento de teste (credencial ou comprador de teste) em produção não libera nada: fica na
  // trilha para o dono conferir. Em homologação, MERCADOPAGO_ACEITAR_TESTE=1 aceita.
  if (pagamento.teste && !aceitaPagamentoDeTeste()) {
    const { error: erroTrilha } = await admin.from('pagamento_eventos').insert({
      origem,
      provedor: provedorDePagamento()?.nome || 'mercadopago',
      pagamento_ref: pagamento.id,
      referencia: (pagamento.referencia || '').slice(0, 120),
      estado: pagamento.estado,
      estado_provedor: pagamento.estadoProvedor,
      detalhe: `teste:${pagamento.detalhe || ''}`.slice(0, 80),
      valor_centavos: pagamento.valorCentavos,
      moeda: pagamento.moeda || null,
      meio: pagamento.meio,
      alvo: 'desconhecido',
      resultado: 'revisar',
      motivo: 'pagamento_de_teste',
    });
    if (erroTrilha && erroTrilha.code !== '23505') {
      await registrarFalha({ origem: 'assinatura/pagamento', extra: { porta: origem, etapa: 'teste' } }, erroTrilha);
    }
    return { resultado: 'revisar', motivo: 'pagamento_de_teste', alvo: 'desconhecido', pedidoId: null, faturaId: null, redeId: null, contaCriada: false };
  }

  const { data, error } = await admin.rpc('pagamento_aplicar', {
    p_provedor: provedorDePagamento()?.nome || 'mercadopago',
    p_pagamento_ref: pagamento.id,
    p_referencia: pagamento.referencia || '',
    p_estado: pagamento.estado,
    p_estado_provedor: pagamento.estadoProvedor,
    p_detalhe: pagamento.detalhe || '',
    p_valor_centavos: pagamento.valorCentavos,
    p_moeda: pagamento.moeda || '',
    p_quando: pagamento.quando,
    p_meio: pagamento.meio,
    p_origem: origem,
  });
  if (error || !data) {
    await registrarFalha({ origem: 'assinatura/pagamento', extra: { porta: origem, estado: pagamento.estado } }, error || 'pagamento_aplicar sem resposta');
    return { resultado: 'erro', motivo: 'falha_ao_gravar', alvo: 'desconhecido', pedidoId: null, faturaId: null, redeId: null, contaCriada: false };
  }
  const r = data as {
    resultado: 'aplicado' | 'ignorado' | 'revisar';
    motivo: string | null;
    alvo: 'pedido' | 'fatura' | 'desconhecido';
    pedido_id: string | null;
    fatura_id: number | null;
    rede_id: string | null;
    provisionar: boolean;
  };

  let contaCriada = false;
  if (r.provisionar && r.pedido_id) {
    contaCriada = (await criarContaDoPedido(admin, r.pedido_id)).feito;
  }
  // Pagou uma fatura: o aviso de reabertura (se houver) sai agora, sem esperar a rotina.
  if (r.resultado === 'aplicado' && r.rede_id) {
    await despacharAvisos(admin, { redeId: r.rede_id, limite: 5 }).catch(() => undefined);
  }
  return {
    resultado: r.resultado,
    motivo: r.motivo,
    alvo: r.alvo,
    pedidoId: r.pedido_id,
    faturaId: r.fatura_id,
    redeId: r.rede_id,
    contaCriada,
  };
}

/** Pergunta ao provedor o que existe para uma referência e aplica, do mais antigo ao mais novo. */
export async function conferirReferencia(admin: Admin, referencia: string, origem: 'retorno' | 'rotina'): Promise<{ consultou: boolean; aplicados: number }> {
  const provedor = provedorDePagamento();
  if (!provedor || provedor.pendencia()) return { consultou: false, aplicados: 0 };
  const busca = await provedor.buscarPorReferencia(referencia);
  if (!busca.ok) return { consultou: false, aplicados: 0 };
  let aplicados = 0;
  for (const pagamento of [...busca.pagamentos].reverse()) {
    const r = await aplicarPagamento(admin, pagamento, origem);
    if (r.resultado === 'aplicado') aplicados += 1;
  }
  return { consultou: true, aplicados };
}

// ---------------------------------------------------------------------------
// Conta de quem pagou
// ---------------------------------------------------------------------------
type Pedido = {
  id: string;
  status: StatusPedido;
  plano: string;
  plano_nome: string;
  valor_centavos: number;
  clinica_nome: string;
  responsavel_nome: string;
  email: string;
  telefone: string | null;
  rede_id: string | null;
  clinica_id: number | null;
  user_id: string | null;
  provisionamento_tentativas: number;
  email_acesso_em: string | null;
  email_acesso_erro: string | null;
  email_acesso_envios: number;
  email_acesso_tentado_em: string | null;
  pagamento_status: string | null;
  pagamento_detalhe: string | null;
  link_pagamento: string | null;
  link_expira_em: string | null;
  provedor_ref: string | null;
  conciliado_em: string | null;
  criado_em: string;
};

const CAMPOS_DO_PEDIDO =
  'id, status, plano, plano_nome, valor_centavos, clinica_nome, responsavel_nome, email, telefone, rede_id, clinica_id, user_id, ' +
  'provisionamento_tentativas, email_acesso_em, email_acesso_erro, email_acesso_envios, email_acesso_tentado_em, ' +
  'pagamento_status, pagamento_detalhe, link_pagamento, link_expira_em, provedor_ref, conciliado_em, criado_em';

async function lerPedido(admin: Admin, id: string): Promise<Pedido | null> {
  const { data } = await admin.from('assinatura_pedidos').select(CAMPOS_DO_PEDIDO).eq('id', id).maybeSingle();
  return (data as unknown as Pedido | null) || null;
}

/**
 * Cria a conta de um pedido pago: usuário do Auth, depois rede + clínica +
 * administrador + vínculo + primeira fatura (numa transação no banco) e, por
 * fim, o e-mail com o link para criar a senha.
 */
export async function criarContaDoPedido(admin: Admin, pedidoId: string): Promise<{ feito: boolean; motivo?: string }> {
  const { data: reservado } = await admin.rpc('assinatura_pedido_reservar', { p_pedido: pedidoId });
  if (!reservado) return { feito: false, motivo: 'sem_reserva' };
  const pedido = reservado as unknown as Pedido;

  const falhar = async (motivo: string, erro: unknown) => {
    await admin
      .from('assinatura_pedidos')
      .update({ provisionamento_erro: limparTexto(motivo, 200), atualizado_em: new Date().toISOString() })
      .eq('id', pedidoId);
    await registrarFalha({ origem: 'assinatura/conta', extra: { motivo: limparTexto(motivo, 80) } }, erro);
    return { feito: false, motivo };
  };

  try {
    // 1. Usuário do Auth. A senha de nascimento é aleatória e ninguém a vê:
    //    o único caminho de entrada é o link enviado para o e-mail.
    let userId: string | null = null;
    let criadoAgora = false;
    const { data: existente } = await admin.rpc('assinatura_usuario_por_email', { p_email: pedido.email });
    if (existente) {
      const { data: achado } = await admin.auth.admin.getUserById(String(existente));
      const dono = (achado?.user?.app_metadata as { pedido_assinatura?: string } | undefined)?.pedido_assinatura;
      if (dono !== pedidoId) return await falhar('email_em_uso', 'O e-mail do pedido ganhou uma conta antes do pagamento.');
      userId = String(existente);
    } else {
      const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
        email: pedido.email,
        password: crypto.randomBytes(24).toString('base64url'),
        email_confirm: true,
        user_metadata: { nome: pedido.responsavel_nome },
        app_metadata: { pedido_assinatura: pedidoId },
      });
      if (erroAuth || !criado?.user) return await falhar('falha_no_login', erroAuth || 'createUser sem usuário');
      userId = criado.user.id;
      criadoAgora = true;
    }

    // 2. Rede, clínica, administrador, vínculo e primeira fatura.
    const { error: erroConta } = await admin.rpc('assinatura_provisionar', { p_pedido: pedidoId, p_user: userId });
    if (erroConta) {
      if (criadoAgora && userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
      return await falhar(erroConta.code === '23505' ? 'email_em_uso' : 'falha_ao_criar_clinica', erroConta);
    }

    // 3. E-mail de confirmação com o link de acesso. Se não sair, a conta
    //    continua criada e o motivo fica gravado (painel e página de retorno).
    await enviarAcesso(admin, pedidoId, 'primeiro');
    return { feito: true };
  } catch (erro) {
    return falhar('erro_inesperado', erro);
  }
}

/** Gera um link novo de acesso e envia. `primeiro` = e-mail de pagamento confirmado; `reenvio` = só o link. */
async function enviarAcesso(admin: Admin, pedidoId: string, tipo: 'primeiro' | 'reenvio'): Promise<{ ok: boolean; erro?: string }> {
  const pedido = await lerPedido(admin, pedidoId);
  if (!pedido || !pedido.user_id) return { ok: false, erro: 'Conta ainda não criada.' };

  const registrar = async (erro: string | null) => {
    await admin
      .from('assinatura_pedidos')
      .update({
        email_acesso_em: erro ? pedido.email_acesso_em : new Date().toISOString(),
        email_acesso_erro: erro ? limparTexto(erro, 240) : null,
        email_acesso_envios: pedido.email_acesso_envios + 1,
        email_acesso_tentado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', pedidoId);
    return erro ? { ok: false, erro } : { ok: true };
  };

  const origem = origemParaEmail();
  if (!origem) return registrar('NEXT_PUBLIC_APP_URL não configurada: sem endereço para o link de acesso.');
  const faltaEmail = pendenciaDoEmail();
  if (faltaEmail) return registrar(`E-mail não configurado (${faltaEmail}).`);

  const { data: link, error: erroLink } = await admin.auth.admin.generateLink({ type: 'recovery', email: pedido.email });
  const token = link?.properties?.hashed_token;
  if (erroLink || !token) {
    await registrarFalha({ origem: 'assinatura/acesso' }, erroLink || 'generateLink sem token');
    return registrar('O serviço de login não gerou o link de acesso.');
  }
  const linkAcesso = `${origem}/acesso?token=${encodeURIComponent(token)}&pedido=${pedidoId}`;

  let proximoVencimento: string | null = null;
  if (tipo === 'primeiro' && pedido.rede_id) {
    const { data: rede } = await admin.from('redes').select('dia_vencimento, assinatura_inicio').eq('id', pedido.rede_id).maybeSingle();
    if (rede?.assinatura_inicio && rede.dia_vencimento) {
      const [ano, mes] = String(rede.assinatura_inicio).split('-').map(Number);
      const seguinte = new Date(Date.UTC(ano, mes, Math.min(Number(rede.dia_vencimento), 28)));
      proximoVencimento = seguinte.toISOString().slice(0, 10);
    }
  }

  const mensagem: EmailPronto =
    tipo === 'primeiro'
      ? emailAssinaturaAtiva({
          nome: pedido.responsavel_nome,
          clinica: pedido.clinica_nome,
          plano: pedido.plano_nome,
          valorCentavos: pedido.valor_centavos,
          proximoVencimento,
          linkAcesso,
        })
      : emailLinkDeAcesso({ nome: pedido.responsavel_nome, clinica: pedido.clinica_nome, linkAcesso });

  const envio = await enviarEmail({ para: pedido.email, assunto: mensagem.assunto, texto: mensagem.texto, html: mensagem.html, categoria: 'assinatura' });
  return registrar(envio.ok ? null : envio.erro);
}

/**
 * A conta ainda não tem senha escolhida? Decide pelo perfil (precisa_trocar_senha), não pelo
 * último login: quem tocou "Continuar" no link e não terminou a troca de senha continua podendo
 * pedir outro link (a senha de nascimento é aleatória e ninguém a conhece).
 */
async function contaAindaSemSenha(admin: Admin, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('profissionais')
    .select('precisa_trocar_senha')
    .eq('user_id', userId)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.precisa_trocar_senha === true;
}

/**
 * Reserva o envio numa única operação: no máximo `maximo` envios e um a cada `esperaMs`.
 * Dois pedidos ao mesmo tempo não mandam dois e-mails (cada um invalidaria o link do outro).
 */
async function reservarEnvioDeAcesso(admin: Admin, pedidoId: string, maximo: number, esperaMs: number): Promise<boolean> {
  const antes = new Date(Date.now() - esperaMs).toISOString();
  let consulta = admin
    .from('assinatura_pedidos')
    .update({ email_acesso_tentado_em: new Date().toISOString() })
    .eq('id', pedidoId)
    .lt('email_acesso_envios', maximo);
  if (esperaMs > 0) consulta = consulta.or(`email_acesso_tentado_em.is.null,email_acesso_tentado_em.lt.${antes}`);
  const { data } = await consulta.select('id');
  return Boolean(data?.length);
}

/** Pedido de novo link, feito na página de retorno ou na tela de acesso (rota pública). */
export async function reenviarAcesso(admin: Admin, pedidoId: string): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const pedido = await lerPedido(admin, pedidoId);
  if (!pedido || pedido.status !== 'provisionado' || !pedido.user_id) {
    return { status: 404, corpo: { error: 'Compra não encontrada ou conta ainda não criada.' } };
  }
  if (!(await contaAindaSemSenha(admin, pedido.user_id))) {
    return {
      status: 409,
      corpo: { error: 'Esta conta já tem senha. Entre com o seu e-mail e a sua senha, ou use "Esqueci a senha" na tela de login.', ja_acessou: true },
    };
  }
  if (!(await reservarEnvioDeAcesso(admin, pedidoId, MAX_ENVIOS_ACESSO, 2 * 60_000))) {
    const agora = await lerPedido(admin, pedidoId);
    return (agora?.email_acesso_envios ?? 0) >= MAX_ENVIOS_ACESSO
      ? { status: 429, corpo: { error: 'Limite de envios atingido. Fale com o suporte do Ortus.' } }
      : { status: 429, corpo: { error: 'Acabamos de enviar um link. Aguarde dois minutos antes de pedir outro.' } };
  }
  const envio = await enviarAcesso(admin, pedidoId, 'reenvio');
  if (!envio.ok) {
    // O motivo (recusa da Resend, configuração faltando) fica gravado na compra e aparece no painel
    // do dono; a página pública diz que o e-mail não saiu, sem detalhe de configuração.
    return {
      status: 502,
      corpo: { enviado: false, error: 'O e-mail não saiu agora. Tente de novo em alguns minutos ou fale com o suporte do Ortus.', email: mascararEmail(pedido.email) },
    };
  }
  return { status: 200, corpo: { enviado: true, email: mascararEmail(pedido.email) } };
}

/** Painel SaaS: refaz a criação da conta de uma compra paga que parou no caminho. */
export async function reprocessarPedido(admin: Admin, pedidoId: string): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const pedido = await lerPedido(admin, pedidoId);
  if (!pedido) return { status: 404, corpo: { error: 'Compra não encontrada.' } };
  if (pedido.status === 'provisionado') return { status: 409, corpo: { error: 'A conta desta compra já foi criada.' } };
  if (pedido.status !== 'pago') return { status: 409, corpo: { error: 'Só compra com pagamento confirmado gera conta.' } };
  await admin
    .from('assinatura_pedidos')
    .update({ provisionamento_tentativas: 0, provisionando_em: null, atualizado_em: new Date().toISOString() })
    .eq('id', pedidoId)
    .eq('status', 'pago');
  const r = await criarContaDoPedido(admin, pedidoId);
  const depois = await lerPedido(admin, pedidoId);
  return r.feito
    ? { status: 200, corpo: { feito: true } }
    : { status: 502, corpo: { feito: false, error: depois?.email_acesso_erro || 'A conta não foi criada. Veja o motivo na compra.', motivo: r.motivo ?? null } };
}

/** Painel SaaS: manda de novo o link de criação de senha (respeita o limite de envios; não serve para conta já acessada). */
export async function reenviarAcessoPeloDono(admin: Admin, pedidoId: string): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const pedido = await lerPedido(admin, pedidoId);
  if (!pedido || pedido.status !== 'provisionado' || !pedido.user_id) {
    return { status: 404, corpo: { error: 'Compra não encontrada ou conta ainda não criada.' } };
  }
  if (!(await contaAindaSemSenha(admin, pedido.user_id))) {
    return { status: 409, corpo: { error: 'Esta conta já tem senha. Para trocar, a pessoa usa "Esqueci a senha" na tela de login.' } };
  }
  if (!(await reservarEnvioDeAcesso(admin, pedidoId, MAX_ENVIOS_ACESSO * 2, 0))) {
    return { status: 429, corpo: { error: 'Limite de envios atingido para esta compra.' } };
  }
  const envio = await enviarAcesso(admin, pedidoId, 'reenvio');
  return envio.ok
    ? { status: 200, corpo: { enviado: true, email: mascararEmail(pedido.email) } }
    : { status: 502, corpo: { enviado: false, error: `O e-mail não saiu: ${envio.erro}` } };
}

// ---------------------------------------------------------------------------
// Página de retorno do checkout
// ---------------------------------------------------------------------------
export type SituacaoDoPedido = {
  pedido: string;
  status: StatusPedido;
  plano: string;
  valor_centavos: number;
  clinica: string;
  email: string;
  pagamento_status: string | null;
  pagamento_detalhe: string | null;
  link_pagamento: string | null;
  conta_criada: boolean;
  email_acesso: 'enviado' | 'falhou' | 'pendente';
  /** Pago, mas a conta não pôde ser criada depois de todas as tentativas: o suporte resolve. */
  conta_com_problema: boolean;
  /** Esta compra foi encerrada porque outra compra do mesmo e-mail foi paga. */
  outra_compra_paga: boolean;
};

/**
 * Estado da compra para quem tem o identificador dela (um UUID, que só a
 * pessoa e o provedor conhecem). Devolve o mínimo: nada de dado da clínica.
 * Enquanto o pagamento não aparece, pergunta ao provedor — assim a conta
 * nasce mesmo que o webhook se perca.
 */
export async function situacaoDoPedido(admin: Admin, pedidoId: string): Promise<SituacaoDoPedido | null> {
  let pedido = await lerPedido(admin, pedidoId);
  if (!pedido) return null;

  // Também confere compra encerrada que tem cobrança aberta no provedor: o Pix ou o link antigo
  // pode ter sido pago depois (quem pagou é atendido; se já há conta, vai para conferência).
  const encerradaComCobranca = (pedido.status === 'cancelado' || pedido.status === 'expirado')
    && Boolean(pedido.provedor_ref) && pedido.pagamento_status !== 'aprovado'
    && Date.now() - new Date(pedido.criado_em).getTime() < 10 * 86_400_000;
  if (pedido.status === 'aguardando_pagamento' || encerradaComCobranca) {
    const ultima = pedido.conciliado_em ? new Date(pedido.conciliado_em).getTime() : 0;
    if (Date.now() - ultima > 15_000) {
      await admin.from('assinatura_pedidos').update({ conciliado_em: new Date().toISOString() }).eq('id', pedidoId);
      await conferirReferencia(admin, referenciaDoPedido(pedidoId), 'retorno');
      pedido = (await lerPedido(admin, pedidoId)) || pedido;
    }
  }
  if (pedido.status === 'pago' && pedido.provisionamento_tentativas < MAX_TENTATIVAS_CONTA) {
    await criarContaDoPedido(admin, pedidoId);
    pedido = (await lerPedido(admin, pedidoId)) || pedido;
  }

  const linkValido = pedido.status === 'aguardando_pagamento' && pedido.link_pagamento && pedido.link_expira_em
    && new Date(pedido.link_expira_em).getTime() > Date.now();
  let outraCompraPaga = false;
  if (pedido.status === 'cancelado' || pedido.status === 'expirado') {
    const { count } = await admin
      .from('assinatura_pedidos')
      .select('id', { count: 'exact', head: true })
      .eq('email', pedido.email)
      .neq('id', pedido.id)
      .in('status', ['pago', 'provisionado']);
    outraCompraPaga = (count ?? 0) > 0;
  }
  return {
    pedido: pedido.id,
    status: pedido.status,
    plano: pedido.plano_nome,
    valor_centavos: pedido.valor_centavos,
    clinica: pedido.clinica_nome,
    email: mascararEmail(pedido.email),
    pagamento_status: pedido.pagamento_status,
    pagamento_detalhe: pedido.pagamento_detalhe,
    link_pagamento: linkValido ? pedido.link_pagamento : null,
    conta_criada: pedido.status === 'provisionado',
    email_acesso: pedido.email_acesso_em ? 'enviado' : pedido.email_acesso_erro ? 'falhou' : 'pendente',
    conta_com_problema: pedido.status === 'pago' && pedido.provisionamento_tentativas >= MAX_TENTATIVAS_CONTA,
    outra_compra_paga: outraCompraPaga,
  };
}

// ---------------------------------------------------------------------------
// Mensalidade: link de pagamento da fatura
// ---------------------------------------------------------------------------
export async function linkDePagamentoDaFatura(
  admin: Admin,
  faturaId: number,
  redesPermitidas: Set<string>,
  pagador: { email: string; nome?: string | null },
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const { data: fatura } = await admin
    .from('faturas')
    .select('id, rede_id, competencia, valor_centavos, status, link_pagamento, link_expira_em, link_valor_centavos, provedor')
    .eq('id', faturaId)
    .maybeSingle();
  // Fatura de outra rede responde igual a fatura inexistente.
  if (!fatura || !redesPermitidas.has(String(fatura.rede_id))) return { status: 404, corpo: { error: 'Fatura não encontrada.' } };
  if (!['aberta', 'estornada', 'contestada'].includes(String(fatura.status))) {
    return { status: 409, corpo: { error: fatura.status === 'paga' ? 'Esta fatura já está paga.' : 'Esta fatura não está em aberto.' } };
  }
  if (Number(fatura.valor_centavos) <= 0) return { status: 409, corpo: { error: 'Fatura sem valor. Fale com o suporte do Ortus.' } };

  const provedor = provedorDePagamento();
  if (!provedor || pendenciaDoPagamento()) {
    return { status: 503, corpo: { error: 'O pagamento pela internet está indisponível no momento. Fale com o suporte do Ortus.' } };
  }
  // O link aberto só é reaproveitado se ainda vale e é do mesmo valor: fatura corrigida pelo
  // dono depois do link gera cobrança nova (pagar o link antigo deixaria a fatura em aberto).
  if (fatura.provedor === provedor.nome && fatura.link_pagamento && fatura.link_expira_em
    && Number(fatura.link_valor_centavos) === Number(fatura.valor_centavos)
    && new Date(fatura.link_expira_em).getTime() > Date.now() + 15 * 60_000) {
    return { status: 200, corpo: { url: fatura.link_pagamento } };
  }

  const origem = origemParaEmail();
  const { data: rede } = await admin.from('redes').select('nome').eq('id', fatura.rede_id).maybeSingle();
  const hoje = new Date().toISOString().slice(0, 10);
  const cobranca = await provedor.criarCobranca({
    referencia: referenciaDaFatura(Number(fatura.id)),
    titulo: `Ortus — mensalidade de ${mesDaCompetencia(String(fatura.competencia))}${rede?.nome ? ` (${rede.nome})` : ''}`,
    valorCentavos: Number(fatura.valor_centavos),
    pagador,
    urlRetorno: `${origem}/assinatura?fatura=${fatura.id}`,
    urlAviso: `${origem}/api/pagamentos/webhook`,
    validadeHoras: VALIDADE_DO_LINK_HORAS,
    // Valor entra na chave: se a fatura for corrigida, nasce outra cobrança.
    chaveIdempotencia: `fatura-${fatura.id}-${fatura.valor_centavos}-${hoje}`,
  });
  if (!cobranca.ok) {
    await registrarFalha({ origem: 'assinatura/pagar', extra: { status: cobranca.status ?? null } }, cobranca.erro);
    return { status: 502, corpo: { error: 'O provedor de pagamento não abriu a cobrança agora. Tente de novo em alguns minutos.' } };
  }
  await admin
    .from('faturas')
    .update({
      provedor: provedor.nome,
      provedor_ref: cobranca.cobranca.ref,
      link_pagamento: cobranca.cobranca.url,
      link_expira_em: cobranca.cobranca.expiraEm,
      link_valor_centavos: Number(fatura.valor_centavos),
    })
    .eq('id', fatura.id);
  return { status: 200, corpo: { url: cobranca.cobranca.url } };
}

/** Volta do checkout da mensalidade: confere na hora, sem esperar o webhook. */
export async function conferirFatura(admin: Admin, faturaId: number, redesPermitidas: Set<string>): Promise<boolean> {
  const { data: fatura } = await admin.from('faturas').select('id, rede_id, status, provedor_ref, conciliado_em').eq('id', faturaId).maybeSingle();
  if (!fatura || !redesPermitidas.has(String(fatura.rede_id)) || !fatura.provedor_ref) return false;
  if (!['aberta', 'estornada', 'contestada'].includes(String(fatura.status))) return false;
  const ultima = fatura.conciliado_em ? new Date(fatura.conciliado_em).getTime() : 0;
  if (Date.now() - ultima < 15_000) return false;
  await admin.from('faturas').update({ conciliado_em: new Date().toISOString() }).eq('id', faturaId);
  const r = await conferirReferencia(admin, referenciaDaFatura(faturaId), 'retorno');
  return r.aplicados > 0;
}

// ---------------------------------------------------------------------------
// Avisos de cobrança (caixa de saída)
// ---------------------------------------------------------------------------
type Aviso = { id: number; rede_id: string; fatura_id: number | null; tipo: 'fatura_gerada' | 'fatura_atrasada' | 'acesso_bloqueado' | 'acesso_reaberto'; tentativas: number };

export async function despacharAvisos(
  admin: Admin,
  opcoes: { redeId?: string; limite?: number } = {},
): Promise<{ enviados: number; falhos: number; dispensados: number; pendentes: number }> {
  const saida = { enviados: 0, falhos: 0, dispensados: 0, pendentes: 0 };
  let consulta = admin
    .from('assinatura_avisos')
    .select('id, rede_id, fatura_id, tipo, tentativas')
    .is('enviado_em', null)
    .lt('tentativas', 6)
    .order('id', { ascending: true })
    .limit(opcoes.limite ?? 40);
  if (opcoes.redeId) consulta = consulta.eq('rede_id', opcoes.redeId);
  const { data: avisos } = await consulta;
  if (!avisos?.length) return saida;

  const falta = pendenciaDoEmail();
  if (falta) {
    // Sem e-mail configurado nada é marcado como enviado: os avisos esperam.
    saida.pendentes = avisos.length;
    return saida;
  }
  const origem = origemParaEmail();
  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

  for (const aviso of avisos as Aviso[]) {
    // Reserva antes de enviar: o webhook e a rotina podem chegar ao mesmo aviso juntos. Reserva
    // presa (processo que caiu no meio) vence em 5 minutos.
    const reservaVencida = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: reservado } = await admin
      .from('assinatura_avisos')
      .update({ reservado_em: new Date().toISOString() })
      .eq('id', aviso.id)
      .is('enviado_em', null)
      .or(`reservado_em.is.null,reservado_em.lt.${reservaVencida}`)
      .select('id');
    if (!reservado?.length) continue;

    const fechar = async (campos: Record<string, unknown>) => {
      await admin.from('assinatura_avisos').update({ tentado_em: new Date().toISOString(), reservado_em: null, ...campos }).eq('id', aviso.id);
    };
    try {
      const { data: rede } = await admin
        .from('redes')
        .select('nome, valor_mensal_centavos, divida_desde, bloqueio_suspenso_ate, contato_nome')
        .eq('id', aviso.rede_id)
        .maybeSingle();
      const { data: fatura } = aviso.fatura_id
        ? await admin.from('faturas').select('competencia, vencimento, valor_centavos, status').eq('id', aviso.fatura_id).maybeSingle()
        : { data: null };
      if (!rede) {
        await fechar({ enviado_em: new Date().toISOString(), destinatarios: 0, erro: 'dispensado: a rede não existe mais' });
        saida.dispensados += 1;
        continue;
      }
      const emDivida = fatura && ['aberta', 'estornada', 'contestada'].includes(String(fatura.status));
      if ((aviso.tipo === 'fatura_gerada' || aviso.tipo === 'fatura_atrasada') && !emDivida) {
        await fechar({ enviado_em: new Date().toISOString(), destinatarios: 0, erro: 'dispensado: a fatura já foi paga ou cancelada' });
        saida.dispensados += 1;
        continue;
      }

      const { data: pessoas } = await admin.rpc('assinatura_destinatarios', { p_rede: aviso.rede_id });
      const para = ((pessoas || []) as { email: string }[]).map((p) => p.email).filter(emailValido).slice(0, 20);
      if (!para.length) {
        await fechar({ tentativas: aviso.tentativas + 1, erro: 'sem destinatário: a rede não tem e-mail de contato nem administrador com login' });
        saida.falhos += 1;
        continue;
      }

      let mensagem: EmailPronto;
      if (aviso.tipo === 'fatura_gerada' && fatura) {
        mensagem = emailFaturaGerada({
          nome: rede.contato_nome,
          rede: rede.nome,
          competencia: mesDaCompetencia(String(fatura.competencia)),
          valorCentavos: Number(fatura.valor_centavos),
          vencimento: String(fatura.vencimento),
          origem,
        });
      } else if (aviso.tipo === 'fatura_atrasada' && fatura) {
        const desde = rede.divida_desde ? String(rede.divida_desde) : String(fatura.vencimento);
        const bloqueio = new Date(`${desde}T12:00:00Z`);
        bloqueio.setUTCDate(bloqueio.getUTCDate() + 8);
        let bloqueioEm = bloqueio.toISOString().slice(0, 10);
        if (rede.bloqueio_suspenso_ate && String(rede.bloqueio_suspenso_ate) >= bloqueioEm) {
          const adiado = new Date(`${rede.bloqueio_suspenso_ate}T12:00:00Z`);
          adiado.setUTCDate(adiado.getUTCDate() + 1);
          bloqueioEm = adiado.toISOString().slice(0, 10);
        }
        mensagem = emailFaturaAtrasada({
          rede: rede.nome,
          competencia: mesDaCompetencia(String(fatura.competencia)),
          valorCentavos: Number(fatura.valor_centavos),
          diasAtraso: Math.max(0, diasEntre(desde, hoje)),
          bloqueioEm,
          origem,
        });
      } else if (aviso.tipo === 'acesso_bloqueado') {
        mensagem = emailAcessoBloqueado({ rede: rede.nome, valorCentavos: fatura ? Number(fatura.valor_centavos) : 0, origem });
      } else {
        mensagem = emailAcessoReaberto({ rede: rede.nome, origem });
      }

      const envio = await enviarEmail({ para, assunto: mensagem.assunto, texto: mensagem.texto, html: mensagem.html, categoria: 'cobranca' });
      if (envio.ok) {
        await fechar({ enviado_em: new Date().toISOString(), destinatarios: para.length, tentativas: aviso.tentativas + 1, erro: null });
        saida.enviados += 1;
      } else {
        await fechar({ tentativas: aviso.tentativas + 1, erro: limparTexto(envio.erro, 240) });
        saida.falhos += 1;
        if (envio.status === 429) break; // limite da Resend: o resto fica para a próxima rodada
      }
      await pausa(ESPERA_ENTRE_EMAILS_MS);
    } catch (erro) {
      await fechar({ tentativas: aviso.tentativas + 1, erro: 'falha ao montar ou enviar o aviso' });
      await registrarFalha({ origem: 'assinatura/avisos' }, erro);
      saida.falhos += 1;
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Rotina diária
// ---------------------------------------------------------------------------
export type ResumoAssinaturas = {
  simulacao: boolean;
  redes_com_cobranca: number;
  mudancas_de_estado: number;
  faturas_geradas: number;
  cobrancas_conferidas: number;
  pagamentos_aplicados: number;
  compras_expiradas: number;
  contas_criadas: number;
  acessos_reenviados: number;
  avisos_enviados: number;
  avisos_falhos: number;
  avisos_pendentes: number;
  provedor_configurado: boolean;
  resend_configurado: boolean;
};

/**
 * 1. Passagem dos dias: em dia → em atraso → modo de consulta (e a volta).
 * 2. Fatura do mês, 5 dias antes do vencimento, uma por competência.
 * 3. Conferência com o provedor do que tem cobrança aberta (pega webhook perdido).
 * 4. Compra paga sem conta: tenta de novo. Compra antiga sem pagamento: expira.
 * 5. E-mails de cobrança que estão na caixa de saída.
 */
export async function processarAssinaturas(admin: Admin, opcoes: { simular?: boolean; orcamentoMs?: number } = {}): Promise<{ ok: boolean; resumo: ResumoAssinaturas }> {
  const inicio = Date.now();
  const orcamento = opcoes.orcamentoMs ?? 45_000;
  const provedor = provedorDePagamento();
  const provedorPronto = Boolean(provedor && !provedor.pendencia());
  const resumo: ResumoAssinaturas = {
    simulacao: Boolean(opcoes.simular),
    redes_com_cobranca: 0,
    mudancas_de_estado: 0,
    faturas_geradas: 0,
    cobrancas_conferidas: 0,
    pagamentos_aplicados: 0,
    compras_expiradas: 0,
    contas_criadas: 0,
    acessos_reenviados: 0,
    avisos_enviados: 0,
    avisos_falhos: 0,
    avisos_pendentes: 0,
    provedor_configurado: provedorPronto,
    resend_configurado: pendenciaDoEmail() === null,
  };
  const temTempo = () => Date.now() - inicio < orcamento;

  if (opcoes.simular) {
    const { count: redes } = await admin.from('redes').select('id', { count: 'exact', head: true }).eq('cobranca_automatica', true);
    const { count: avisos } = await admin.from('assinatura_avisos').select('id', { count: 'exact', head: true }).is('enviado_em', null).lt('tentativas', 6);
    resumo.redes_com_cobranca = redes ?? 0;
    resumo.avisos_pendentes = avisos ?? 0;
    return { ok: true, resumo };
  }

  const { data: recalculo, error: erroRecalculo } = await admin.rpc('assinatura_recalcular_todas', { p_hoje: null });
  if (erroRecalculo) throw new Error(erroRecalculo.message);
  resumo.redes_com_cobranca = Number((recalculo as { redes?: number })?.redes ?? 0);
  resumo.mudancas_de_estado = ((recalculo as { mudancas?: unknown[] })?.mudancas || []).length;

  const { data: geradas, error: erroGerar } = await admin.rpc('assinatura_gerar_competencias', { p_hoje: null, p_rede: null });
  if (erroGerar) throw new Error(erroGerar.message);
  resumo.faturas_geradas = ((geradas as { criadas?: unknown[] })?.criadas || []).length;

  if (provedorPronto) {
    const seisHoras = new Date(Date.now() - 6 * 3_600_000).toISOString();
    const { data: faturas } = await admin
      .from('faturas')
      .select('id')
      .in('status', ['aberta', 'contestada', 'estornada'])
      .not('provedor_ref', 'is', null)
      .or(`conciliado_em.is.null,conciliado_em.lt.${seisHoras}`)
      .order('conciliado_em', { ascending: true, nullsFirst: true })
      .limit(25);
    for (const fatura of faturas || []) {
      if (!temTempo()) break;
      await admin.from('faturas').update({ conciliado_em: new Date().toISOString() }).eq('id', fatura.id);
      const r = await conferirReferencia(admin, referenciaDaFatura(Number(fatura.id)), 'rotina');
      if (r.consultou) resumo.cobrancas_conferidas += 1;
      resumo.pagamentos_aplicados += r.aplicados;
    }

    // Compras com cobrança no provedor: as que esperam pagamento e, por 10 dias, as encerradas
    // (o Pix ou o link antigo ainda pode ser pago). Vai das menos conferidas para as mais: uma
    // compra com Pix abandonado não toma a vez das novas.
    const dezDias = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const { data: pedidos } = await admin
      .from('assinatura_pedidos')
      .select('id, status, criado_em, pagamento_status')
      .in('status', ['aguardando_pagamento', 'cancelado', 'expirado'])
      .not('provedor_ref', 'is', null)
      .gte('criado_em', dezDias)
      .or(`conciliado_em.is.null,conciliado_em.lt.${seisHoras}`)
      .order('conciliado_em', { ascending: true, nullsFirst: true })
      .limit(25);
    const limiteDeIdade = Date.now() - PEDIDO_EXPIRA_EM_DIAS * 86_400_000;
    for (const pedido of pedidos || []) {
      if (!temTempo()) break;
      if (pedido.status !== 'aguardando_pagamento' && pedido.pagamento_status === 'aprovado') continue;
      await admin.from('assinatura_pedidos').update({ conciliado_em: new Date().toISOString() }).eq('id', pedido.id);
      const r = await conferirReferencia(admin, referenciaDoPedido(String(pedido.id)), 'rotina');
      if (r.consultou) resumo.cobrancas_conferidas += 1;
      resumo.pagamentos_aplicados += r.aplicados;
      // Só expira o que foi conferido agora e continua sem pagamento em andamento.
      if (pedido.status === 'aguardando_pagamento' && r.consultou && new Date(String(pedido.criado_em)).getTime() < limiteDeIdade) {
        const { data: expirado } = await admin
          .from('assinatura_pedidos')
          .update({ status: 'expirado', atualizado_em: new Date().toISOString() })
          .eq('id', pedido.id)
          .eq('status', 'aguardando_pagamento')
          .or('pagamento_status.is.null,pagamento_status.in.(recusado,cancelado)')
          .select('id');
        resumo.compras_expiradas += expirado?.length ?? 0;
      }
    }

    // Compra parada há mais de 10 dias (ex.: Pix gerado e abandonado que o provedor não cancelou)
    // expira de vez. Se ainda for paga, o pagamento é atendido do mesmo jeito (pagamento_aplicar).
    const { data: paradas } = await admin
      .from('assinatura_pedidos')
      .update({ status: 'expirado', atualizado_em: new Date().toISOString() })
      .eq('status', 'aguardando_pagamento')
      .lt('criado_em', dezDias)
      .select('id');
    resumo.compras_expiradas += paradas?.length ?? 0;
  }

  const { data: pagos } = await admin
    .from('assinatura_pedidos')
    .select('id')
    .eq('status', 'pago')
    .lt('provisionamento_tentativas', MAX_TENTATIVAS_CONTA)
    .order('criado_em', { ascending: true })
    .limit(10);
  for (const pedido of pagos || []) {
    if (!temTempo()) break;
    if ((await criarContaDoPedido(admin, String(pedido.id))).feito) resumo.contas_criadas += 1;
  }

  const { data: semEmail } = await admin
    .from('assinatura_pedidos')
    .select('id')
    .eq('status', 'provisionado')
    .is('email_acesso_em', null)
    .lt('email_acesso_envios', 4)
    .order('criado_em', { ascending: true })
    .limit(10);
  for (const pedido of semEmail || []) {
    if (!temTempo()) break;
    if ((await enviarAcesso(admin, String(pedido.id), 'primeiro')).ok) resumo.acessos_reenviados += 1;
  }

  if (temTempo()) {
    const avisos = await despacharAvisos(admin, { limite: 40 });
    resumo.avisos_enviados = avisos.enviados;
    resumo.avisos_falhos = avisos.falhos;
    resumo.avisos_pendentes = avisos.pendentes;
  }

  return { ok: true, resumo };
}
