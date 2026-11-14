/**
 * Helpers da Agenda para atendimentos com várias partes e cores por profissional.
 *
 * Um atendimento pode ter 1..N partes (linhas em `agendamentos`) compartilhando
 * o mesmo `grupo_id`. Este módulo concentra tipos, formatação e utilidades
 * puramente determinísticas usadas pela página e pelos componentes da agenda.
 */

export const PALETA_PROFISSIONAIS = [
  '#2563eb',
  '#db2777',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#4b5563',
] as const;

export const COR_PROFISSIONAL_PADRAO = '#94a3b8';

export type PacienteEmbed = { nome?: string | null };

export type RegistroAgendamento = {
  id: number | string;
  grupo_id?: string | null;
  parte_indice?: number | null;
  parte_total?: number | null;
  parte_titulo?: string | null;
  duracao_minutos?: number | null;
  data_hora: string;
  procedimento?: string | null;
  cor?: string | null;
  status?: string | null;
  paciente_id?: string | null;
  clinica_id?: number | string | null;
  profissional_id?: number | string | null;
  valor?: number | string | null;
  desconto?: number | string | null;
  observacoes?: string | null;
  tipo_registro?: string | null;
  pacientes?: PacienteEmbed | PacienteEmbed[] | null;
};

export type EventoAgenda = {
  id: number | string;
  title: string;
  start: string;
  end: string;
  extendedProps: RegistroAgendamento;
  backgroundColor: string;
  borderColor: string;
};

export type ParteForm = {
  /** Chave estável apenas para o React (não vai para o banco). */
  key: string;
  /** Id da linha existente, quando a parte já está salva. */
  dbId?: number | string | null;
  /** yyyy-mm-dd no fuso local. */
  data: string;
  /** HH:mm no fuso local. */
  hora: string;
  duracao: number;
  titulo: string;
};

export type ProfissionalAgenda = {
  id: number | string;
  nome: string;
  cor_agenda?: string | null;
  profissionais_clinicas?: Array<{ clinica_id: string | number }>;
};

export type ParteRpc = {
  data_hora: string;
  duracao: number;
  titulo: string;
  cor: string;
  status: string;
};

let contadorChaveParte = 0;

export function chaveParte(): string {
  contadorChaveParte += 1;
  return `parte-${Date.now()}-${contadorChaveParte}`;
}

export function parteVazia(data: string, hora = '08:00', duracao = 60, titulo = ''): ParteForm {
  return { key: chaveParte(), data, hora, duracao, titulo };
}

/** Cor determinística do profissional: usa `cor_agenda` quando existir. */
export function corProfissional(
  profissional?: { id?: unknown; cor_agenda?: string | null } | null,
): string {
  const corSalva = profissional?.cor_agenda?.trim();
  if (corSalva) return corSalva;
  const numero = Number(profissional?.id);
  const indice = Number.isFinite(numero) ? Math.abs(Math.trunc(numero)) % PALETA_PROFISSIONAIS.length : 0;
  return PALETA_PROFISSIONAIS[indice];
}

export function nomePaciente(registro?: { pacientes?: PacienteEmbed | PacienteEmbed[] | null } | null): string | null {
  const embed = registro?.pacientes;
  if (Array.isArray(embed)) return embed[0]?.nome ?? null;
  return embed?.nome ?? null;
}

/** Duração em minutos de uma linha de `agendamentos` (default 60). */
export function duracaoDoRegistro(registro?: { duracao_minutos?: number | null } | null): number {
  const duracao = Number(registro?.duracao_minutos);
  return Number.isFinite(duracao) && duracao > 0 ? Math.round(duracao) : 60;
}

export function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

export function inicioSemana(data: Date): Date {
  const dia = inicioDoDia(data);
  dia.setDate(dia.getDate() - dia.getDay());
  return dia;
}

export function somarDias(data: Date, dias: number): Date {
  const proxima = new Date(data);
  proxima.setDate(proxima.getDate() + dias);
  return proxima;
}

export function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function chaveLocal(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

export function horaLocal(data: Date): string {
  return `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`;
}

export function capitalizar(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

export function formatarDataCurta(dataIso: string): string {
  if (!dataIso) return 'sem data';
  const data = new Date(`${dataIso}T12:00:00`);
  if (Number.isNaN(data.getTime())) return 'sem data';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function isoDeParte(parte: Pick<ParteForm, 'data' | 'hora'>): string {
  return new Date(`${parte.data}T${parte.hora}:00`).toISOString();
}

/** "2 partes · 16/11 09:00 · 21/11 19:00" */
export function resumoPartes(partes: ParteForm[]): string {
  const quantidade = partes.length;
  const rotulo = `${quantidade} ${quantidade === 1 ? 'parte' : 'partes'}`;
  const horarios = partes
    .map((parte) => `${formatarDataCurta(parte.data)} ${parte.hora || '--:--'}`)
    .join(' · ');
  return horarios ? `${rotulo} · ${horarios}` : rotulo;
}

export function partesParaRpc(partes: ParteForm[], cor: string, status: string): ParteRpc[] {
  return partes.map((parte) => ({
    data_hora: isoDeParte(parte),
    duracao: parte.duracao,
    titulo: parte.titulo.trim(),
    cor,
    status,
  }));
}
