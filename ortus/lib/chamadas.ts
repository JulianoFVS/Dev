/**
 * Chamada de pacientes na TV (navegador).
 *
 * As chamadas e os links vão direto à nuvem (supabase): a TV lê da nuvem,
 * então chamar precisa de internet, inclusive no desktop. A preferência
 * (nome ou senha) e os locais ficam em configuracoes_clinica (chave
 * chamada_tv), que sincroniza normalmente.
 */
import { supabase } from '@/lib/supabase';
import { carregarConfig, salvarConfig } from '@/lib/configClinica';

export type ConfigChamada = {
  /** O que a TV mostra: primeiro nome + inicial ("Maria S.") ou só a senha. */
  mostrar: 'nome' | 'senha';
  /** Locais de atendimento (consultórios, salas, guichês). */
  locais: string[];
  /** Falar a chamada em voz alta nas TVs que têm voz. */
  voz: boolean;
};

export const CONFIG_CHAMADA_PADRAO: ConfigChamada = { mostrar: 'nome', locais: ['Consultório 1', 'Consultório 2'], voz: true };

export type LinkTv = { id: string; nome: string; ativo: boolean; created_at: string; revogado_em: string | null };

export type ChamadaFeita = { id: string; senha: number | null; nome_exibicao: string | null; local: string | null; created_at: string };

function falha(e: { message?: string } | null, padrao: string): Error {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return new Error('Sem internet: a chamada na TV precisa de conexão.');
  return new Error(e?.message || padrao);
}

export async function carregarConfigChamada(clinicaId: number): Promise<ConfigChamada> {
  const valor = await carregarConfig<Partial<ConfigChamada>>(clinicaId, 'chamada_tv', undefined, CONFIG_CHAMADA_PADRAO);
  return {
    mostrar: valor?.mostrar === 'senha' ? 'senha' : 'nome',
    locais: Array.isArray(valor?.locais) ? valor!.locais.filter((l) => typeof l === 'string' && l.trim()).map((l) => l.trim().slice(0, 60)) : CONFIG_CHAMADA_PADRAO.locais,
    voz: valor?.voz !== false,
  };
}

export async function salvarConfigChamada(clinicaId: number, config: ConfigChamada): Promise<void> {
  await salvarConfig(clinicaId, 'chamada_tv', config);
}

/** Chama o paciente de um agendamento (ou um paciente) num local. O nome que a TV mostra é montado pelo banco. */
export async function chamarPaciente(opts: { clinicaId: number; agendamentoId?: number | null; pacienteId?: string | null; local: string | null }): Promise<ChamadaFeita> {
  const { data, error } = await supabase.from('chamadas')
    .insert({
      clinica_id: opts.clinicaId,
      agendamento_id: opts.agendamentoId ?? null,
      paciente_id: opts.agendamentoId ? null : opts.pacienteId ?? null,
      local: opts.local,
    })
    .select('id, senha, nome_exibicao, local, created_at')
    .single();
  if (error) throw falha(error, 'Não foi possível chamar o paciente.');
  return data as ChamadaFeita;
}

/** Gera a próxima senha do dia e chama no local escolhido. */
export async function chamarSenha(opts: { clinicaId: number; local: string | null; senha?: number | null }): Promise<ChamadaFeita> {
  let senha = opts.senha ?? null;
  if (!senha) {
    const { data, error } = await supabase.rpc('chamada_proxima_senha', { p_clinica: opts.clinicaId });
    if (error || !data) throw falha(error, 'Não foi possível gerar a senha.');
    senha = Number(data);
  }
  const { data, error } = await supabase.from('chamadas')
    .insert({ clinica_id: opts.clinicaId, senha, local: opts.local })
    .select('id, senha, nome_exibicao, local, created_at')
    .single();
  if (error) throw falha(error, 'Não foi possível chamar a senha.');
  return data as ChamadaFeita;
}

export async function listarLinksTv(clinicaId: number): Promise<LinkTv[]> {
  const { data, error } = await supabase.from('chamadas_tv')
    .select('id, nome, ativo, created_at, revogado_em')
    .eq('clinica_id', clinicaId)
    .order('created_at', { ascending: false });
  if (error) throw falha(error, 'Não foi possível carregar os links das TVs.');
  return (data || []) as LinkTv[];
}

async function sha256Hex(texto: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function tokenAleatorio(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Cria o link de uma TV. O token nasce aqui e só o hash vai ao banco: o
 * link completo aparece agora, uma vez. Perdeu o link? Crie outro e revogue
 * o antigo.
 */
export async function criarLinkTv(clinicaId: number, nome: string): Promise<{ link: string; registro: LinkTv }> {
  const token = tokenAleatorio();
  const { data, error } = await supabase.from('chamadas_tv')
    .insert({ clinica_id: clinicaId, nome: nome.trim() || 'TV', token_hash: await sha256Hex(token) })
    .select('id, nome, ativo, created_at, revogado_em')
    .single();
  if (error) throw falha(error, 'Não foi possível criar o link da TV.');
  const origem = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '');
  return { link: `${origem}/tv/${token}`, registro: data as LinkTv };
}

export async function revogarLinkTv(id: string): Promise<void> {
  const { error } = await supabase.from('chamadas_tv').update({ ativo: false }).eq('id', id);
  if (error) throw falha(error, 'Não foi possível revogar o link.');
}

/** Texto que a TV mostra e fala para uma chamada. */
export function textoDaChamada(c: Pick<ChamadaFeita, 'senha' | 'nome_exibicao'>): string {
  if (c.nome_exibicao) return c.nome_exibicao;
  if (c.senha) return `Senha ${String(c.senha).padStart(3, '0')}`;
  return 'Paciente';
}
