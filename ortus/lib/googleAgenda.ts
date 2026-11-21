import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { cifrar, decifrar } from '@/lib/cifra';
import { registrarFalha } from '@/lib/registro';
import { enderecoDeTeste } from '@/lib/servicosExternos';

/**
 * Google Agenda (servidor).
 *
 * - A equipe da Ortus cola o Client ID e o segredo na tela de Integrações
 *   (plataforma_integracoes, segredo cifrado).
 * - Cada profissional conecta a própria agenda (OAuth, refresh token
 *   cifrado em google_conexoes).
 * - O gatilho em agendamentos enche google_fila; processarFilaGoogle cria,
 *   altera ou cancela o evento na agenda de quem atende. O evento leva só o
 *   primeiro nome do paciente e o tipo da consulta.
 * - lerBloqueiosGoogle lê os compromissos marcados direto no Google e grava
 *   em google_bloqueios (sem título), que a agenda da Ortus respeita.
 * - Se o Google falhar, a consulta já está salva no Ortus: o evento fica
 *   "falha" (a agenda avisa) e a fila tenta de novo, com espera crescente.
 *
 * Ambiente de teste: Client ID começando com "teste-" usa o Google falso
 * (ORTUS_TESTE_URL_GOOGLE, pela regra de lib/servicosExternos.ts: só fora de
 * produção ou com ORTUS_HOMOLOGACAO=1). Credenciais reais usam o Google de
 * verdade em qualquer ambiente.
 */

type Admin = ReturnType<typeof createSupabaseAdmin>;

export const ESCOPOS = 'openid email https://www.googleapis.com/auth/calendar.events';
const MAX_TENTATIVAS = 8;

export type ConfigGoogle = { ativo: boolean; clientId: string; clientSecret: string | null };

type Enderecos = { auth: string; token: string; revoke: string; userinfo: string; api: string };

export class ErroGoogle extends Error {
  constructor(mensagem: string, public status = 0) {
    super(mensagem);
  }
}

export function ehClienteDeTeste(clientId: string) {
  return clientId.startsWith('teste-');
}

export function enderecosGoogle(clientId: string): Enderecos {
  if (ehClienteDeTeste(clientId)) {
    const base = enderecoDeTeste('GOOGLE');
    if (!base) throw new ErroGoogle('Client ID de teste só funciona no ambiente de teste.');
    const publica = enderecoDeTeste('GOOGLE_PUBLICA') || base;
    return {
      auth: `${publica}/o/oauth2/v2/auth`,
      token: `${base}/token`,
      revoke: `${base}/revoke`,
      userinfo: `${base}/userinfo`,
      api: `${base}/calendar/v3`,
    };
  }
  return {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    revoke: 'https://oauth2.googleapis.com/revoke',
    userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
    api: 'https://www.googleapis.com/calendar/v3',
  };
}

export function urlDeRetorno(origem: string) {
  return `${origem.replace(/\/$/, '')}/api/google/retorno`;
}

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

export async function carregarConfigGoogle(admin: Admin): Promise<ConfigGoogle | null> {
  const { data } = await admin.from('plataforma_integracoes').select('ativo, config, segredo_cifrado').eq('chave', 'google').maybeSingle();
  if (!data) return null;
  const clientId = String((data.config as { client_id?: string } | null)?.client_id || '').trim();
  let clientSecret: string | null = null;
  if (data.segredo_cifrado) clientSecret = decifrar(String(data.segredo_cifrado));
  return { ativo: Boolean(data.ativo) && Boolean(clientId), clientId, clientSecret };
}

async function configPronta(admin: Admin): Promise<ConfigGoogle> {
  const cfg = await carregarConfigGoogle(admin);
  if (!cfg?.ativo) throw new ErroGoogle('A integração com o Google Agenda não está ligada. A equipe da Ortus liga em Painel SaaS → Integrações.');
  if (!cfg.clientSecret && !ehClienteDeTeste(cfg.clientId)) throw new ErroGoogle('Falta o Client Secret do Google na tela de Integrações.');
  return cfg;
}

async function postForm(url: string, campos: Record<string, string>) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(campos).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const dados = await r.json().catch(() => ({}));
  return { status: r.status, dados: dados as Record<string, unknown> };
}

// --------------------------------------------------------------------- OAuth

/** Começa a conexão: guarda o "state" (só o hash) e devolve o endereço do consentimento. */
export async function iniciarConexao(admin: Admin, d: { profissionalId: number; usuarioId: string; origem: string; volta?: string }) {
  const cfg = await configPronta(admin);
  const end = enderecosGoogle(cfg.clientId);
  const estado = randomBytes(32).toString('base64url');
  await admin.from('google_oauth_estados').delete().lt('expira_em', new Date().toISOString());
  const { error } = await admin.from('google_oauth_estados').insert({
    estado_hash: sha256(estado),
    profissional_id: d.profissionalId,
    usuario_id: d.usuarioId,
    volta: d.volta || '/perfil',
  });
  if (error) throw new ErroGoogle('Não foi possível começar a conexão.');
  const url = new URL(end.auth);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', urlDeRetorno(d.origem));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', ESCOPOS);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', estado);
  return url.toString();
}

/** Volta do Google: troca o código pelo refresh token (cifrado) e põe as consultas futuras na fila. */
export async function concluirConexao(admin: Admin, d: { estado: string; codigo: string; origem: string }) {
  const { data: est } = await admin.from('google_oauth_estados').select('*').eq('estado_hash', sha256(d.estado)).maybeSingle();
  await admin.from('google_oauth_estados').delete().eq('estado_hash', sha256(d.estado));
  if (!est || new Date(est.expira_em) < new Date()) throw new ErroGoogle('O pedido de conexão expirou. Tente de novo.');
  const cfg = await configPronta(admin);
  const end = enderecosGoogle(cfg.clientId);
  const troca = await postForm(end.token, {
    code: d.codigo,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret || '',
    redirect_uri: urlDeRetorno(d.origem),
    grant_type: 'authorization_code',
  });
  const refresh = String(troca.dados.refresh_token || '');
  const access = String(troca.dados.access_token || '');
  if (troca.status !== 200 || !refresh) throw new ErroGoogle('O Google não liberou o acesso à agenda. Tente de novo.', troca.status);

  let email: string | null = null;
  try {
    const r = await fetch(end.userinfo, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(10_000) });
    if (r.ok) email = String(((await r.json()) as { email?: string }).email || '') || null;
  } catch { /* sem o e-mail a conexão vale do mesmo jeito */ }

  const refreshCifrado = cifrar(refresh);
  const { error } = await admin.from('google_conexoes').upsert({
    profissional_id: est.profissional_id,
    usuario_id: est.usuario_id,
    email_google: email,
    refresh_token_cifrado: refreshCifrado,
    ativo: true,
    sync_token: null,
    ultima_leitura_em: null,
    ultimo_erro: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'profissional_id' });
  if (error) throw new ErroGoogle('Não foi possível guardar a conexão.');
  if (access) cacheAcesso.set(chaveDoCache(refreshCifrado), { token: access, expira: Date.now() + 50 * 60_000 });

  // Consultas de agora em diante desse profissional vão para a agenda dele.
  const { data: futuros } = await admin.from('agendamentos')
    .select('id, clinica_id')
    .eq('profissional_id', est.profissional_id)
    .gte('data_hora', new Date(Date.now() - 86_400_000).toISOString())
    .neq('status', 'cancelado')
    .limit(1000);
  const linhas = (futuros || []).map((a: { id: number; clinica_id: number }) => ({ agendamento_id: a.id, clinica_id: a.clinica_id }));
  for (let i = 0; i < linhas.length; i += 200) await admin.from('google_fila').insert(linhas.slice(i, i + 200));
  return { volta: String(est.volta || '/perfil') };
}

export async function desconectar(admin: Admin, profissionalId: number) {
  const { data: con } = await admin.from('google_conexoes').select('refresh_token_cifrado').eq('profissional_id', profissionalId).maybeSingle();
  if (con) {
    cacheAcesso.delete(chaveDoCache(String(con.refresh_token_cifrado)));
    try {
      const cfg = await carregarConfigGoogle(admin);
      if (cfg?.clientId) await postForm(enderecosGoogle(cfg.clientId).revoke, { token: decifrar(String(con.refresh_token_cifrado)) });
    } catch { /* revogar é cortesia: a conexão some daqui de qualquer jeito */ }
  }
  await admin.from('google_bloqueios').delete().eq('profissional_id', profissionalId);
  await admin.from('google_eventos').update({ estado: 'removido', atualizado_em: new Date().toISOString() }).eq('profissional_id', profissionalId);
  await admin.from('google_conexoes').delete().eq('profissional_id', profissionalId);
}

// -------------------------------------------------------------------- tokens

/**
 * Token de acesso guardado por CONEXÃO (resumo do refresh token cifrado), não
 * por profissional: quem desliga e conecta outra conta do Google não reaproveita
 * o token da conta anterior, nem numa cópia deste módulo que não viu o
 * "desligar" (cada rota pode ter a sua).
 */
const cacheAcesso = new Map<string, { token: string; expira: number }>();
const chaveDoCache = (refreshCifrado: string) => sha256(refreshCifrado);

type Conexao = { profissional_id: number; refresh_token_cifrado: string; calendario_id: string; sync_token: string | null; bloquear_horarios: boolean };

async function tokenDeAcesso(admin: Admin, cfg: ConfigGoogle, con: Conexao, { renovar = false } = {}): Promise<string> {
  const chave = chaveDoCache(con.refresh_token_cifrado);
  const guardado = renovar ? null : cacheAcesso.get(chave);
  if (guardado && guardado.expira > Date.now()) return guardado.token;
  cacheAcesso.delete(chave);
  const r = await postForm(enderecosGoogle(cfg.clientId).token, {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret || '',
    refresh_token: decifrar(con.refresh_token_cifrado),
    grant_type: 'refresh_token',
  });
  if (r.status === 400 && r.dados.error === 'invalid_grant') {
    // Só esta conexão: se o profissional já conectou de novo, a nova fica.
    await admin.from('google_conexoes')
      .update({ ativo: false, ultimo_erro: 'O acesso ao Google Agenda foi retirado. Conecte de novo no seu perfil.' })
      .eq('profissional_id', con.profissional_id)
      .eq('refresh_token_cifrado', con.refresh_token_cifrado);
    throw new ErroGoogle('Acesso ao Google retirado.', 400);
  }
  const token = String(r.dados.access_token || '');
  if (r.status !== 200 || !token) throw new ErroGoogle(`O Google não renovou o acesso (HTTP ${r.status}).`, r.status);
  cacheAcesso.set(chave, { token, expira: Date.now() + (Number(r.dados.expires_in) || 3600) * 1000 - 120_000 });
  return token;
}

/** Chamada à Calendar API em nome da conexão; com 401 (token velho ou revogado), renova uma vez. */
async function apiDaConexao(admin: Admin, cfg: ConfigGoogle, con: Conexao, metodo: string, caminho: string, corpo?: unknown) {
  const r = await api(cfg, await tokenDeAcesso(admin, cfg, con), metodo, caminho, corpo);
  if (r.status !== 401) return r;
  return api(cfg, await tokenDeAcesso(admin, cfg, con, { renovar: true }), metodo, caminho, corpo);
}

async function api(cfg: ConfigGoogle, token: string, metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(`${enderecosGoogle(cfg.clientId).api}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const dados = r.status === 204 ? {} : await r.json().catch(() => ({}));
  return { status: r.status, dados: dados as Record<string, unknown> };
}

// --------------------------------------------------------------------- envio

type Agendamento = {
  id: number;
  clinica_id: number;
  profissional_id: number | null;
  data_hora: string;
  duracao_minutos: number | null;
  procedimento: string | null;
  status: string | null;
  tipo_registro: string | null;
  pacientes: { nome?: string | null } | { nome?: string | null }[] | null;
};

/** O evento: primeiro nome e tipo da consulta, sem dado clínico, valor ou telefone. */
export function montarEvento(ag: Pick<Agendamento, 'id' | 'clinica_id' | 'data_hora' | 'duracao_minutos' | 'procedimento' | 'pacientes'>) {
  const pac = Array.isArray(ag.pacientes) ? ag.pacientes[0] : ag.pacientes;
  const nome = String(pac?.nome || '').trim().split(/\s+/)[0] || 'Paciente';
  const tipo = String(ag.procedimento || '').replace(/^tratamento:\s*/i, '').trim().slice(0, 60) || 'Consulta';
  const inicio = new Date(ag.data_hora);
  const fim = new Date(inicio.getTime() + (Number(ag.duracao_minutos) || 60) * 60_000);
  return {
    summary: `${nome} · ${tipo}`,
    description: 'Consulta marcada no Ortus.',
    start: { dateTime: inicio.toISOString() },
    end: { dateTime: fim.toISOString() },
    extendedProperties: { private: { ortus_agendamento: String(ag.id), ortus_clinica: String(ag.clinica_id) } },
  };
}

const curto = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

export type ResultadoFila = { processados: number; enviados: number; removidos: number; falhas: number; ignorado?: string };

export async function processarFilaGoogle(admin: Admin, opts: { limite?: number; clinicaIds?: number[]; prazoMs?: number } = {}): Promise<ResultadoFila> {
  const r: ResultadoFila = { processados: 0, enviados: 0, removidos: 0, falhas: 0 };
  const cfg = await carregarConfigGoogle(admin).catch(() => null);
  if (!cfg?.ativo) { r.ignorado = 'integração desligada'; return r; }
  const inicio = Date.now();
  const prazo = opts.prazoMs ?? 40_000;

  let q = admin.from('google_fila').select('id, agendamento_id, tentativas').lte('proxima_tentativa_em', new Date().toISOString()).order('id').limit((opts.limite ?? 50) * 3);
  if (opts.clinicaIds?.length) q = q.in('clinica_id', opts.clinicaIds);
  const { data: fila } = await q;
  const porAgendamento = new Map<number, { ids: number[]; tentativas: number }>();
  for (const f of (fila || []) as { id: number; agendamento_id: number; tentativas: number }[]) {
    const atual = porAgendamento.get(f.agendamento_id) || { ids: [], tentativas: 0 };
    atual.ids.push(f.id);
    atual.tentativas = Math.max(atual.tentativas, f.tentativas);
    porAgendamento.set(f.agendamento_id, atual);
  }

  for (const [agendamentoId, item] of Array.from(porAgendamento.entries()).slice(0, opts.limite ?? 50)) {
    if (Date.now() - inicio > prazo) break;
    r.processados += 1;
    try {
      const resultado = await sincronizarAgendamento(admin, cfg, agendamentoId);
      r.enviados += resultado.enviado ? 1 : 0;
      r.removidos += resultado.removidos;
      await admin.from('google_fila').delete().in('id', item.ids);
    } catch (e) {
      r.falhas += 1;
      const tentativas = item.tentativas + 1;
      if (tentativas >= MAX_TENTATIVAS) {
        await admin.from('google_fila').delete().in('id', item.ids);
      } else {
        const espera = Math.min(2 ** tentativas, 60) * 60_000;
        await admin.from('google_fila').update({
          tentativas,
          proxima_tentativa_em: new Date(Date.now() + espera).toISOString(),
          ultimo_erro: curto(e),
        }).in('id', item.ids);
      }
    }
  }
  return r;
}

async function sincronizarAgendamento(admin: Admin, cfg: ConfigGoogle, agendamentoId: number) {
  const { data: ag } = await admin.from('agendamentos')
    .select('id, clinica_id, profissional_id, data_hora, duracao_minutos, procedimento, status, tipo_registro, pacientes(nome)')
    .eq('id', agendamentoId)
    .maybeSingle();
  const agend = ag as Agendamento | null;
  const { data: eventosLidos } = await admin.from('google_eventos').select('*').eq('agendamento_id', agendamentoId);
  const eventos = (eventosLidos || []) as { profissional_id: number; google_event_id: string | null; estado: string; clinica_id: number }[];

  const vale = agend && agend.status !== 'cancelado' && agend.tipo_registro !== 'debito_manual' && agend.profissional_id;
  let conAlvo: Conexao | null = null;
  if (vale) {
    const { data } = await admin.from('google_conexoes').select('profissional_id, refresh_token_cifrado, calendario_id, sync_token, bloquear_horarios').eq('profissional_id', agend!.profissional_id).eq('ativo', true).maybeSingle();
    conAlvo = (data as Conexao | null) ?? null;
  }

  // 1. Tira o evento das agendas que não são mais de quem atende (cancelou, trocou de profissional, apagou).
  let removidos = 0;
  for (const ev of eventos) {
    if (ev.estado === 'removido') continue;
    if (conAlvo && ev.profissional_id === conAlvo.profissional_id) continue;
    const { data: con } = await admin.from('google_conexoes').select('profissional_id, refresh_token_cifrado, calendario_id, sync_token, bloquear_horarios').eq('profissional_id', ev.profissional_id).maybeSingle();
    if (con && ev.google_event_id) {
      const del = await apiDaConexao(admin, cfg, con as Conexao, 'DELETE', `/calendars/${encodeURIComponent((con as Conexao).calendario_id)}/events/${encodeURIComponent(ev.google_event_id)}`);
      if (del.status >= 400 && del.status !== 404 && del.status !== 410) throw new ErroGoogle(`O Google não apagou o evento (HTTP ${del.status}).`, del.status);
    }
    await admin.from('google_eventos').update({ estado: 'removido', ultimo_erro: null, atualizado_em: new Date().toISOString() })
      .eq('agendamento_id', agendamentoId).eq('profissional_id', ev.profissional_id);
    removidos += 1;
  }
  if (!conAlvo || !agend) return { enviado: false, removidos };

  // 2. Cria ou atualiza na agenda de quem atende.
  const corpo = montarEvento(agend);
  const atual = eventos.find((e) => e.profissional_id === conAlvo!.profissional_id && e.estado !== 'removido' && e.google_event_id);
  const cal = encodeURIComponent(conAlvo.calendario_id);
  try {
    const alvo = conAlvo;
    let resp = atual
      ? await apiDaConexao(admin, cfg, alvo, 'PATCH', `/calendars/${cal}/events/${encodeURIComponent(atual.google_event_id!)}`, corpo)
      : await apiDaConexao(admin, cfg, alvo, 'POST', `/calendars/${cal}/events`, corpo);
    if (atual && (resp.status === 404 || resp.status === 410)) resp = await apiDaConexao(admin, cfg, alvo, 'POST', `/calendars/${cal}/events`, corpo);
    if (resp.status >= 300 || !resp.dados.id) throw new ErroGoogle(`O Google recusou o evento (HTTP ${resp.status}).`, resp.status);
    await admin.from('google_eventos').upsert({
      agendamento_id: agend.id,
      profissional_id: conAlvo.profissional_id,
      clinica_id: agend.clinica_id,
      google_event_id: String(resp.dados.id),
      estado: 'enviado',
      ultimo_erro: null,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'agendamento_id,profissional_id' });
    return { enviado: true, removidos };
  } catch (e) {
    await admin.from('google_eventos').upsert({
      agendamento_id: agend.id,
      profissional_id: conAlvo.profissional_id,
      clinica_id: agend.clinica_id,
      google_event_id: atual?.google_event_id ?? null,
      estado: 'falha',
      ultimo_erro: curto(e),
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'agendamento_id,profissional_id' });
    throw e;
  }
}

// ----------------------------------------------------------------- bloqueios

export type ResultadoBloqueios = { conexoes: number; gravados: number; apagados: number; falhas: number };

/** Compromissos marcados direto no Google viram horários ocupados no Ortus (sem título). */
export async function lerBloqueiosGoogle(admin: Admin, opts: { intervaloMin?: number; prazoMs?: number } = {}): Promise<ResultadoBloqueios> {
  const r: ResultadoBloqueios = { conexoes: 0, gravados: 0, apagados: 0, falhas: 0 };
  const cfg = await carregarConfigGoogle(admin).catch(() => null);
  if (!cfg?.ativo) return r;
  const inicio = Date.now();
  const limite = new Date(Date.now() - (opts.intervaloMin ?? 5) * 60_000).toISOString();
  const { data } = await admin.from('google_conexoes')
    .select('profissional_id, refresh_token_cifrado, calendario_id, sync_token, bloquear_horarios')
    .eq('ativo', true).eq('bloquear_horarios', true)
    .or(`ultima_leitura_em.is.null,ultima_leitura_em.lt.${limite}`)
    .limit(50);
  for (const con of (data || []) as Conexao[]) {
    if (Date.now() - inicio > (opts.prazoMs ?? 30_000)) break;
    r.conexoes += 1;
    try {
      const cal = encodeURIComponent(con.calendario_id);
      let completo = !con.sync_token;
      let resp = completo ? null : await apiDaConexao(admin, cfg, con, 'GET', `/calendars/${cal}/events?syncToken=${encodeURIComponent(con.sync_token!)}&maxResults=2500`);
      if (!resp || resp.status === 410) {
        completo = true;
        const de = new Date(Date.now() - 86_400_000).toISOString();
        const ate = new Date(Date.now() + 120 * 86_400_000).toISOString();
        resp = await apiDaConexao(admin, cfg, con, 'GET', `/calendars/${cal}/events?timeMin=${encodeURIComponent(de)}&timeMax=${encodeURIComponent(ate)}&singleEvents=true&maxResults=2500`);
      }
      if (resp.status !== 200) throw new ErroGoogle(`O Google não listou a agenda (HTTP ${resp.status}).`, resp.status);
      const itens = (resp.dados.items || []) as {
        id: string; status?: string; transparency?: string;
        start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
        extendedProperties?: { private?: Record<string, string> };
      }[];
      const vistos = new Set<string>();
      for (const it of itens) {
        const doOrtus = Boolean(it.extendedProperties?.private?.ortus_agendamento);
        const ocupa = it.status !== 'cancelled' && it.transparency !== 'transparent' && it.start?.dateTime && it.end?.dateTime;
        if (doOrtus || !ocupa) {
          const { count } = await admin.from('google_bloqueios').delete({ count: 'exact' }).eq('profissional_id', con.profissional_id).eq('google_event_id', it.id);
          r.apagados += count || 0;
          continue;
        }
        vistos.add(it.id);
        await admin.from('google_bloqueios').upsert({
          profissional_id: con.profissional_id,
          google_event_id: it.id,
          inicio: it.start!.dateTime!,
          fim: it.end!.dateTime!,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: 'profissional_id,google_event_id' });
        r.gravados += 1;
      }
      if (completo) {
        const { data: atuais } = await admin.from('google_bloqueios').select('google_event_id').eq('profissional_id', con.profissional_id);
        const sobrando = ((atuais || []) as { google_event_id: string }[]).map((b) => b.google_event_id).filter((id) => !vistos.has(id));
        if (sobrando.length) {
          await admin.from('google_bloqueios').delete().eq('profissional_id', con.profissional_id).in('google_event_id', sobrando);
          r.apagados += sobrando.length;
        }
      }
      await admin.from('google_conexoes').update({
        sync_token: String(resp.dados.nextSyncToken || '') || null,
        ultima_leitura_em: new Date().toISOString(),
        ultimo_erro: null,
      }).eq('profissional_id', con.profissional_id);
    } catch (e) {
      r.falhas += 1;
      await admin.from('google_conexoes').update({ ultimo_erro: curto(e), ultima_leitura_em: new Date().toISOString() }).eq('profissional_id', con.profissional_id);
      await registrarFalha({ origem: 'google/bloqueios', extra: { profissional: con.profissional_id } }, e);
    }
  }
  return r;
}
