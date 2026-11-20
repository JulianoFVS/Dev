/**
 * Horários ocupados no Google Agenda do profissional (compromissos marcados
 * direto no Google, lidos pela rotina do servidor). Bloqueiam a marcação na
 * Ortus sem virar paciente. Lido da nuvem; sem internet, não bloqueia.
 */
import { supabase } from '@/lib/supabase';

export type BloqueioGoogle = { inicio: string; fim: string };

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Frase de bloqueio quando [data hora, +minutos) cruza um compromisso do Google; null quando livre. */
export async function bloqueioDoGoogle(
  profissionalId: string | number,
  date: string,
  time: string,
  minutos = 60,
): Promise<string | null> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const inicio = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(inicio.getTime())) return null;
  const fim = new Date(inicio.getTime() + minutos * 60_000);
  try {
    const { data, error } = await supabase.from('google_bloqueios')
      .select('inicio, fim')
      .eq('profissional_id', Number(profissionalId))
      .lt('inicio', fim.toISOString())
      .gt('fim', inicio.toISOString())
      .order('inicio')
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const b = data[0] as BloqueioGoogle;
    return `Este horário está ocupado no Google Agenda do profissional (${hora(b.inicio)}–${hora(b.fim)}). Escolha outro horário.`;
  } catch {
    return null;
  }
}

/** Bloqueios de vários profissionais num período (para desenhar na agenda). */
export async function bloqueiosNoPeriodo(profissionalIds: number[], inicio: Date, fim: Date): Promise<(BloqueioGoogle & { profissional_id: number })[]> {
  if (profissionalIds.length === 0) return [];
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return [];
  const { data } = await supabase.from('google_bloqueios')
    .select('profissional_id, inicio, fim')
    .in('profissional_id', profissionalIds)
    .lt('inicio', fim.toISOString())
    .gt('fim', inicio.toISOString())
    .order('inicio')
    .limit(500);
  return (data || []) as (BloqueioGoogle & { profissional_id: number })[];
}
