import { supabase } from '@/lib/supabase';
import { carregarConfig, salvarConfig } from '@/lib/configClinica';
import { horarioProfissionalKey } from '@/lib/configKeys';

export type HorarioDia = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom';

export type HorarioAtendimento = {
  inicio: string;
  fim: string;
  intervalo: number;
  limiteSimultaneo: number;
  dias: Record<HorarioDia, boolean>;
  observacoes: string;
};

const DIA_JS_PARA_CHAVE: HorarioDia[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

const LABEL_DIA: Record<HorarioDia, string> = {
  dom: 'domingo', seg: 'segunda', ter: 'terça', qua: 'quarta', qui: 'quinta', sex: 'sexta', sab: 'sábado',
};

function rowParaHorario(row: {
  inicio: string;
  fim: string;
  intervalo_minutos: number;
  limite_simultaneo: number;
  dias_semana: Record<string, boolean>;
  observacoes?: string | null;
}): HorarioAtendimento {
  return {
    inicio: String(row.inicio).slice(0, 5),
    fim: String(row.fim).slice(0, 5),
    intervalo: row.intervalo_minutos,
    limiteSimultaneo: row.limite_simultaneo,
    dias: row.dias_semana as Record<HorarioDia, boolean>,
    observacoes: row.observacoes || '',
  };
}

export async function carregarHorarioProfissional(
  clinicaId: string | number,
  profissionalId: string | number,
): Promise<HorarioAtendimento | null> {
  const { data } = await supabase
    .from('profissionais_horarios')
    .select('inicio, fim, intervalo_minutos, limite_simultaneo, dias_semana, observacoes')
    .eq('clinica_id', Number(clinicaId))
    .eq('profissional_id', Number(profissionalId))
    .maybeSingle();

  if (data) return rowParaHorario(data as any);

  return carregarConfig<HorarioAtendimento | null>(
    clinicaId,
    horarioProfissionalKey(profissionalId),
    undefined,
    null,
  );
}

export async function salvarHorarioProfissional(
  clinicaId: string | number,
  profissionalId: string | number,
  horario: HorarioAtendimento,
): Promise<void> {
  await supabase.from('profissionais_horarios').upsert(
    {
      clinica_id: Number(clinicaId),
      profissional_id: Number(profissionalId),
      inicio: horario.inicio,
      fim: horario.fim,
      intervalo_minutos: horario.intervalo,
      limite_simultaneo: horario.limiteSimultaneo,
      dias_semana: horario.dias,
      observacoes: horario.observacoes || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'profissional_id,clinica_id' },
  );

  await salvarConfig(clinicaId, horarioProfissionalKey(profissionalId), horario);
}

function minutosDesdeMeiaNoite(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function validarHorarioAgendamento(
  horario: HorarioAtendimento | null | undefined,
  date: string,
  time: string,
): string | null {
  if (!horario) return null;

  const ref = new Date(`${date}T12:00:00`);
  if (Number.isNaN(ref.getTime())) return null;

  const diaKey = DIA_JS_PARA_CHAVE[ref.getDay()];
  if (!horario.dias[diaKey]) {
    return `Este profissional não atende às ${LABEL_DIA[diaKey]}-feira.`;
  }

  const mins = minutosDesdeMeiaNoite(time);
  const inicio = minutosDesdeMeiaNoite(horario.inicio);
  const fim = minutosDesdeMeiaNoite(horario.fim);

  if (mins < inicio || mins >= fim) {
    return `Horário fora do expediente (${horario.inicio} – ${horario.fim}).`;
  }

  return null;
}

function validarIntervaloHorario(horario: HorarioAtendimento, time: string): string | null {
  const mins = minutosDesdeMeiaNoite(time);
  const inicio = minutosDesdeMeiaNoite(horario.inicio);
  const offset = mins - inicio;
  if (horario.intervalo > 0 && offset % horario.intervalo !== 0) {
    return `Horário deve respeitar intervalo de ${horario.intervalo} min (a partir de ${horario.inicio}).`;
  }
  return null;
}

async function validarLimiteSimultaneo(
  clinicaId: string | number,
  profissionalId: string | number,
  date: string,
  time: string,
  horario: HorarioAtendimento,
  excludeAgendamentoId?: string | number | null,
): Promise<string | null> {
  const inicioSlot = new Date(`${date}T${time}:00`);
  const fimSlot = new Date(inicioSlot.getTime() + horario.intervalo * 60 * 1000);

  let query = supabase
    .from('agendamentos')
    .select('id', { count: 'exact', head: true })
    .eq('clinica_id', Number(clinicaId))
    .eq('profissional_id', Number(profissionalId))
    .gte('data_hora', inicioSlot.toISOString())
    .lt('data_hora', fimSlot.toISOString())
    .neq('status', 'cancelado');

  if (excludeAgendamentoId) {
    query = query.neq('id', excludeAgendamentoId);
  }

  const { count, error } = await query;
  if (error) return null;

  if ((count ?? 0) >= horario.limiteSimultaneo) {
    return `Limite de ${horario.limiteSimultaneo} atendimento(s) simultâneo(s) neste horário.`;
  }
  return null;
}

export async function validarAgendamentoCompleto(params: {
  clinicaId: string | number;
  profissionalId?: string | number | null;
  date: string;
  time: string;
  excludeAgendamentoId?: string | number | null;
}): Promise<string | null> {
  const { clinicaId, profissionalId, date, time, excludeAgendamentoId } = params;
  if (!profissionalId) return null;

  const horario = await carregarHorarioProfissional(clinicaId, profissionalId);
  const basico = validarHorarioAgendamento(horario, date, time);
  if (basico) return basico;
  if (!horario) return null;

  const intervalo = validarIntervaloHorario(horario, time);
  if (intervalo) return intervalo;

  return validarLimiteSimultaneo(clinicaId, profissionalId, date, time, horario, excludeAgendamentoId);
}
