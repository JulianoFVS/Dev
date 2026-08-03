import { supabase } from '@/lib/supabase';

import { carregarConfig, salvarConfig } from '@/lib/configClinica';

import { CONFIG_KEYS } from '@/lib/configKeys';

import { buildDocumentoContexto } from '@/lib/documentVariables';

import { montarMensagemEvento } from '@/lib/comunicacao';



export type LembreteAgendamento = {

  id: number | string;

  data_hora: string;

  procedimento: string;

  paciente_nome: string;

  paciente_telefone?: string | null;

  paciente_email?: string | null;

  clinica_id: number | string;

  clinica_nome?: string;

};



type LembretesEnviadosLegado = Record<string, string>;



export async function lembreteJaEnviado(clinicaId: string | number, agendamentoId: string | number): Promise<boolean> {

  const { count } = await supabase

    .from('lembretes_agenda')

    .select('id', { count: 'exact', head: true })

    .eq('clinica_id', Number(clinicaId))

    .eq('agendamento_id', Number(agendamentoId));



  if ((count ?? 0) > 0) return true;



  const legado = await carregarConfig<LembretesEnviadosLegado>(

    clinicaId,

    CONFIG_KEYS.lembretes_enviados,

    'ortus_lembretes_enviados',

    {},

  );

  return !!legado[String(agendamentoId)];

}



export async function marcarLembreteEnviado(

  clinicaId: string | number,

  agendamentoId: string | number,

  canal: 'whatsapp' | 'email' | 'sms' | 'manual' = 'manual',

) {

  await supabase.from('lembretes_agenda').upsert(

    {

      clinica_id: Number(clinicaId),

      agendamento_id: Number(agendamentoId),

      canal,

      enviado_em: new Date().toISOString(),

    },

    { onConflict: 'agendamento_id,canal' },

  );



  const legado = await carregarConfig<LembretesEnviadosLegado>(

    clinicaId,

    CONFIG_KEYS.lembretes_enviados,

    'ortus_lembretes_enviados',

    {},

  );

  await salvarConfig(clinicaId, CONFIG_KEYS.lembretes_enviados, {

    ...legado,

    [String(agendamentoId)]: new Date().toISOString(),

  });

}



export async function buscarAgendamentosLembrete24h(clinicaIds: (number | string)[]): Promise<LembreteAgendamento[]> {

  if (!clinicaIds.length) return [];



  const amanha = new Date();

  amanha.setDate(amanha.getDate() + 1);

  const inicio = new Date(amanha);

  inicio.setHours(0, 0, 0, 0);

  const fim = new Date(amanha);

  fim.setHours(23, 59, 59, 999);



  const { data } = await supabase

    .from('agendamentos')

    .select('id, data_hora, procedimento, clinica_id, pacientes(nome, telefone, email), clinicas(nome)')

    .in('clinica_id', clinicaIds as number[])

    .gte('data_hora', inicio.toISOString())

    .lte('data_hora', fim.toISOString())

    .in('status', ['agendado']);



  return (data || []).map((r: any) => ({

    id: r.id,

    data_hora: r.data_hora,

    procedimento: r.procedimento,

    clinica_id: r.clinica_id,

    clinica_nome: Array.isArray(r.clinicas) ? r.clinicas[0]?.nome : r.clinicas?.nome,

    paciente_nome: Array.isArray(r.pacientes) ? r.pacientes[0]?.nome : r.pacientes?.nome,

    paciente_telefone: Array.isArray(r.pacientes) ? r.pacientes[0]?.telefone : r.pacientes?.telefone,

    paciente_email: Array.isArray(r.pacientes) ? r.pacientes[0]?.email : r.pacientes?.email,

  }));

}



export function ctxLembreteAgendamento(ag: LembreteAgendamento) {

  const dt = new Date(ag.data_hora);

  return buildDocumentoContexto({

    paciente_nome: ag.paciente_nome?.split(' ')[0],

    paciente_email: ag.paciente_email || undefined,

    paciente_telefone: ag.paciente_telefone || undefined,

    clinica_nome: ag.clinica_nome,

    data_consulta: dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),

    hora_consulta: dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),

  });

}



export async function montarMensagemLembrete24h(clinicaId: string | number, ag: LembreteAgendamento): Promise<string> {

  const ctx = ctxLembreteAgendamento(ag);

  const { mensagem } = await montarMensagemEvento(clinicaId, 'lembrete', 'whatsapp', ctx);

  return mensagem;

}



export async function montarLembreteCanal(

  clinicaId: string | number,

  ag: LembreteAgendamento,

  canal: 'whatsapp' | 'email' | 'sms',

) {

  const ctx = ctxLembreteAgendamento(ag);

  return montarMensagemEvento(clinicaId, 'lembrete', canal, ctx);

}



export function urlWhatsappLembrete(telefone: string | null | undefined, mensagem: string): string | null {

  const numero = telefone?.replace(/\D/g, '');

  if (!numero) return null;

  return `https://wa.me/55${numero}?text=${encodeURIComponent(mensagem)}`;

}



export async function filtrarPendentesLembrete(clinicaId: string | number, agendamentos: LembreteAgendamento[]) {

  const pendentes: LembreteAgendamento[] = [];

  for (const a of agendamentos.filter((x) => String(x.clinica_id) === String(clinicaId))) {

    if (!(await lembreteJaEnviado(clinicaId, a.id))) pendentes.push(a);

  }

  return pendentes;

}


