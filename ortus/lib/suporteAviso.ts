/**
 * Aviso ao suporte da Ortus (só no servidor, com o service role).
 *
 * Quando a clínica escreve no chat de suporte e ninguém da Ortus está com o
 * painel aberto, os donos recebem um e-mail. Regras:
 * - "olhando" = algum batimento em suporte_presenca nos últimos 2 minutos;
 * - só avisa se a clínica escreveu depois da última leitura da Ortus e
 *   depois do último aviso;
 * - no máximo um aviso a cada 15 minutos por conversa, reservado antes de
 *   enviar (duas chamadas ao mesmo tempo não mandam dois e-mails); se o
 *   e-mail falhar, a reserva volta e a próxima chamada tenta de novo;
 * - o e-mail não leva o texto da mensagem.
 *
 * Chamado pela rota /api/suporte/avisar (logo depois de a clínica enviar,
 * na web) e pela rotina rápida (mensagens vindas do desktop ou de quando o
 * e-mail falhou).
 */
import type { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { enviarEmail } from '@/lib/email';
import { emailSuporteMensagem } from '@/lib/emailModelos';
import { origemParaEmail } from '@/lib/origemApp';
import { registrarFalha } from '@/lib/registro';
import { emailsDosDonos } from '@/lib/vigia';

type Admin = ReturnType<typeof createSupabaseAdmin>;

export const PRESENCA_MS = 2 * 60 * 1000;
export const INTERVALO_AVISO_MS = 15 * 60 * 1000;

type Conversa = {
  id: string;
  clinica_id: number;
  ultima_da_clinica_em: string | null;
  ortus_leu_ate: string | null;
  avisado_em: string | null;
  clinicas: { nome?: string | null } | { nome?: string | null }[] | null;
};

export type ResultadoAviso = { verificadas: number; avisadas: number; olhando: boolean; falhas: number };

const ms = (v: string | null | undefined) => (v ? new Date(v).getTime() : 0);

/** Conversas com mensagem da clínica que ainda precisa de aviso agora. */
export function precisaAvisar(c: Pick<Conversa, 'ultima_da_clinica_em' | 'ortus_leu_ate' | 'avisado_em'>, agora: number): boolean {
  const escreveu = ms(c.ultima_da_clinica_em);
  if (!escreveu) return false;
  if (escreveu <= ms(c.ortus_leu_ate)) return false;
  if (escreveu <= ms(c.avisado_em)) return false;
  return agora - ms(c.avisado_em) >= INTERVALO_AVISO_MS;
}

export async function avisarSuportePendentes(admin: Admin, opts: { conversaId?: string } = {}): Promise<ResultadoAviso> {
  const agora = Date.now();
  const resultado: ResultadoAviso = { verificadas: 0, avisadas: 0, olhando: false, falhas: 0 };

  const { data: presenca } = await admin
    .from('suporte_presenca')
    .select('visto_em')
    .gte('visto_em', new Date(agora - PRESENCA_MS).toISOString())
    .limit(1);
  if (presenca && presenca.length > 0) {
    resultado.olhando = true;
    return resultado;
  }

  let q = admin
    .from('suporte_conversas')
    .select('id, clinica_id, ultima_da_clinica_em, ortus_leu_ate, avisado_em, clinicas(nome)')
    .not('ultima_da_clinica_em', 'is', null)
    .order('ultima_da_clinica_em', { ascending: false })
    .limit(200);
  if (opts.conversaId) q = q.eq('id', opts.conversaId);
  const { data, error } = await q;
  if (error) {
    await registrarFalha({ origem: 'suporte/aviso', extra: { etapa: 'ler_conversas' } }, error);
    resultado.falhas += 1;
    return resultado;
  }
  const pendentes = ((data || []) as Conversa[]).filter((c) => precisaAvisar(c, agora));
  resultado.verificadas = (data || []).length;
  if (pendentes.length === 0) return resultado;

  const para = await emailsDosDonos(admin);
  if (para.length === 0) {
    await registrarFalha({ origem: 'suporte/aviso', extra: { etapa: 'destinatarios' } }, new Error('Sem destinatário: defina ALERTA_EMAILS ou um dono com e-mail.'));
    resultado.falhas += 1;
    return resultado;
  }

  const origem = origemParaEmail();
  for (const c of pendentes) {
    // Reserva antes de enviar: só quem conseguir trocar o avisado_em manda o e-mail.
    const limite = new Date(agora - INTERVALO_AVISO_MS).toISOString();
    let reserva = admin.from('suporte_conversas').update({ avisado_em: new Date(agora).toISOString() }).eq('id', c.id);
    reserva = c.avisado_em ? reserva.eq('avisado_em', c.avisado_em).lt('avisado_em', limite) : reserva.is('avisado_em', null);
    const { data: reservada } = await reserva.select('id');
    if (!reservada || reservada.length === 0) continue;

    const nome = (Array.isArray(c.clinicas) ? c.clinicas[0]?.nome : c.clinicas?.nome) || `Clínica ${c.clinica_id}`;
    const pronto = emailSuporteMensagem({ clinica: nome, url: origem ? `${origem}/super-admin?aba=suporte&conversa=${c.id}` : '' });
    const envio = await enviarEmail({ para, ...pronto, categoria: 'suporte' });
    if (envio.ok) {
      resultado.avisadas += 1;
    } else {
      resultado.falhas += 1;
      await admin.from('suporte_conversas').update({ avisado_em: c.avisado_em }).eq('id', c.id);
      await registrarFalha({ origem: 'suporte/aviso', clinicaId: c.clinica_id, extra: { etapa: 'email', status: envio.status ?? 0 } }, new Error(envio.erro));
    }
  }
  return resultado;
}
