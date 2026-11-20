/**
 * Conversas da equipe e com o suporte da Ortus (navegador).
 *
 * Tudo vai direto à nuvem (supabase), nunca ao banco local do desktop: chat
 * só faz sentido com internet. Sem conexão, as telas avisam.
 * As regras de quem vê o quê estão no banco (migration 20261201_conversas):
 * aqui só há leitura, gravação e a montagem para a tela.
 */
import { supabase } from '@/lib/supabase';

export type Canal = {
  id: string;
  clinica_id: number;
  nome: string;
  geral: boolean;
  arquivado: boolean;
  created_at: string;
};

export type MensagemEquipe = {
  id: string;
  canal_id: string;
  autor_id: number | null;
  texto: string;
  created_at: string;
  /** Mensagem otimista, ainda não confirmada pelo banco. */
  enviando?: boolean;
};

export type ConversaSuporte = {
  id: string;
  clinica_id: number;
  ultima_mensagem_em: string | null;
  ultima_da_clinica_em: string | null;
  ultima_da_ortus_em: string | null;
  clinica_leu_ate: string | null;
  ortus_leu_ate: string | null;
  clinicas?: { nome?: string | null } | null;
};

export type MensagemSuporte = {
  id: string;
  conversa_id: string;
  lado: 'clinica' | 'ortus';
  autor_nome: string | null;
  autor_user_id: string | null;
  texto: string;
  created_at: string;
  enviando?: boolean;
};

export const TEXTO_MAX = 4000;
const LOTE = 80;

export function semInternet(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function falha(e: { message?: string } | null, padrao: string): Error {
  if (semInternet()) return new Error('Sem internet: as conversas voltam quando a conexão voltar.');
  return new Error(e?.message || padrao);
}

// ------------------------------------------------------------------ equipe

export async function listarCanais(clinicaId: number): Promise<Canal[]> {
  const { data, error } = await supabase.from('conversa_canais')
    .select('id, clinica_id, nome, geral, arquivado, created_at')
    .eq('clinica_id', clinicaId)
    .eq('arquivado', false)
    .order('geral', { ascending: false })
    .order('nome', { ascending: true });
  if (error) throw falha(error, 'Não foi possível carregar os canais.');
  return (data || []) as Canal[];
}

export async function criarCanal(clinicaId: number, nome: string): Promise<Canal> {
  const { data, error } = await supabase.from('conversa_canais')
    .insert({ clinica_id: clinicaId, nome: nome.trim() })
    .select('id, clinica_id, nome, geral, arquivado, created_at')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('Já existe um canal com esse nome.');
    throw falha(error, 'Não foi possível criar o canal.');
  }
  return data as Canal;
}

export async function renomearCanal(id: string, nome: string): Promise<void> {
  const { error } = await supabase.from('conversa_canais').update({ nome: nome.trim() }).eq('id', id);
  if (error) {
    if (error.code === '23505') throw new Error('Já existe um canal com esse nome.');
    throw falha(error, 'Não foi possível renomear o canal.');
  }
}

export async function arquivarCanal(id: string): Promise<void> {
  const { error } = await supabase.from('conversa_canais').update({ arquivado: true }).eq('id', id);
  if (error) throw falha(error, 'Não foi possível arquivar o canal.');
}

/** As últimas mensagens do canal (ordem do mais antigo para o mais novo), ou só as novas desde um instante. */
export async function listarMensagens(canalId: string, desde?: string | null): Promise<MensagemEquipe[]> {
  let q = supabase.from('conversa_mensagens').select('id, canal_id, autor_id, texto, created_at').eq('canal_id', canalId);
  if (desde) q = q.gt('created_at', desde);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(LOTE);
  if (error) throw falha(error, 'Não foi possível carregar as mensagens.');
  return ((data || []) as MensagemEquipe[]).reverse();
}

export async function enviarMensagem(clinicaId: number, canalId: string, texto: string): Promise<MensagemEquipe> {
  const { data, error } = await supabase.from('conversa_mensagens')
    .insert({ clinica_id: clinicaId, canal_id: canalId, texto: texto.trim() })
    .select('id, canal_id, autor_id, texto, created_at')
    .single();
  if (error) throw falha(error, 'Não foi possível enviar a mensagem.');
  return data as MensagemEquipe;
}

export async function apagarMensagem(id: string): Promise<void> {
  const { error } = await supabase.from('conversa_mensagens').delete().eq('id', id);
  if (error) throw falha(error, 'Não foi possível apagar a mensagem.');
}

export async function marcarCanalLido(clinicaId: number, canalId: string, profissionalId: number): Promise<void> {
  await supabase.from('conversa_leituras').upsert(
    { canal_id: canalId, clinica_id: clinicaId, profissional_id: profissionalId, lido_ate: new Date().toISOString() },
    { onConflict: 'canal_id,profissional_id' },
  );
}

/** Não lidas por canal da clínica (as próprias mensagens não contam). */
export async function naoLidasPorCanal(clinicaId: number): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('conversas_nao_lidas', { p_clinica: clinicaId });
  if (error) throw falha(error, 'Não foi possível contar as mensagens novas.');
  return new Map(((data || []) as { canal_id: string; nao_lidas: number }[]).map((r) => [r.canal_id, Number(r.nao_lidas) || 0]));
}

// ----------------------------------------------------------------- suporte

/** Abre (ou devolve) a conversa da clínica com o suporte da Ortus. */
export async function abrirSuporte(clinicaId: number): Promise<string> {
  const { data, error } = await supabase.rpc('suporte_abrir', { p_clinica: clinicaId });
  if (error || !data) throw falha(error, 'Não foi possível abrir a conversa com o suporte.');
  return String(data);
}

export async function listarMensagensSuporte(conversaId: string, desde?: string | null): Promise<MensagemSuporte[]> {
  let q = supabase.from('suporte_mensagens').select('id, conversa_id, lado, autor_nome, autor_user_id, texto, created_at').eq('conversa_id', conversaId);
  if (desde) q = q.gt('created_at', desde);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(LOTE);
  if (error) throw falha(error, 'Não foi possível carregar a conversa.');
  return ((data || []) as MensagemSuporte[]).reverse();
}

/**
 * Envia ao suporte. Do lado da clínica, pede ao servidor para avisar a
 * Ortus (só sai e-mail se ninguém estiver olhando; o servidor decide).
 */
export async function enviarMensagemSuporte(conversaId: string, texto: string, ladoClinica: boolean): Promise<MensagemSuporte> {
  const { data, error } = await supabase.from('suporte_mensagens')
    // Clínica, lado e autor são definidos pelo banco (gatilho), nunca pelo navegador.
    .insert({ conversa_id: conversaId, lado: ladoClinica ? 'clinica' : 'ortus', texto: texto.trim() })
    .select('id, conversa_id, lado, autor_nome, autor_user_id, texto, created_at')
    .single();
  if (error) throw falha(error, 'Não foi possível enviar a mensagem.');
  if (ladoClinica) void pedirAviso(conversaId);
  return data as MensagemSuporte;
}

async function pedirAviso(conversaId: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch('/api/suporte/avisar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ conversaId }),
    });
  } catch {
    // A rotina do servidor avisa depois; a mensagem já está gravada.
  }
}

export async function marcarSuporteLido(conversaId: string): Promise<void> {
  await supabase.rpc('suporte_marcar_lido', { p_conversa: conversaId });
}

/** Lado da Ortus: todas as conversas, da mais recente para a mais antiga. */
export async function listarConversasSuporte(): Promise<ConversaSuporte[]> {
  const { data, error } = await supabase.from('suporte_conversas')
    .select('id, clinica_id, ultima_mensagem_em, ultima_da_clinica_em, ultima_da_ortus_em, clinica_leu_ate, ortus_leu_ate, clinicas(nome)')
    .not('ultima_mensagem_em', 'is', null)
    .order('ultima_mensagem_em', { ascending: false })
    .limit(300);
  if (error) throw falha(error, 'Não foi possível carregar as conversas de suporte.');
  return (data || []) as unknown as ConversaSuporte[];
}

/** Batimento do painel de suporte: avisa ao servidor que alguém da Ortus está olhando. */
export async function baterPresencaSuporte(): Promise<void> {
  await supabase.rpc('suporte_presenca_bater');
}

export function naoLidaPelaOrtus(c: ConversaSuporte): boolean {
  return Boolean(c.ultima_da_clinica_em) && (!c.ortus_leu_ate || c.ultima_da_clinica_em! > c.ortus_leu_ate);
}

export function naoLidaPelaClinica(c: Pick<ConversaSuporte, 'ultima_da_ortus_em' | 'clinica_leu_ate'>): boolean {
  return Boolean(c.ultima_da_ortus_em) && (!c.clinica_leu_ate || c.ultima_da_ortus_em! > c.clinica_leu_ate);
}
