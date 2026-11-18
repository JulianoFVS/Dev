import { dados as tabelas } from '@/lib/local/consulta';

import { carregarConfig, salvarConfig } from '@/lib/configClinica';

import { CONFIG_KEYS } from '@/lib/configKeys';

import { buildDocumentoContexto } from '@/lib/documentVariables';

import { montarMensagemEvento } from '@/lib/comunicacao';

import type { FiltroLocal } from '@/lib/local/cliente';



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



type AgendamentoLocalLembrete = {

  id: number;

  data_hora: string;

  procedimento: string;

  clinica_id: number;

  paciente_id: string | null;

  status: string;

};



type PacienteLocalLembrete = {

  id: string;

  nome: string;

  telefone: string | null;

  email: string | null;

};



function chaveLembrete(agendamentoId: string | number): string {

  return `lembrete:${agendamentoId}`;

}



/** No servidor (cron/rotas) o caminho é sempre a nuvem. */

async function modoDadosSeguro(): Promise<'local' | 'nuvem'> {

  if (typeof window === 'undefined') return 'nuvem';

  const { modoDados } = await import('@/lib/local/cliente');

  return modoDados();

}



export async function lembreteJaEnviado(clinicaId: string | number, agendamentoId: string | number): Promise<boolean> {

  const modo = await modoDadosSeguro();

  if (modo === 'local') {

    try {

      const { contar } = await import('@/lib/local/cliente');

      const total = await contar('whatsapp_envios', [

        { col: 'clinica_id', op: 'eq', valor: Number(clinicaId) },

        { col: 'chave', op: 'eq', valor: chaveLembrete(agendamentoId) },

      ]);

      return total > 0;

    } catch {

      return false;

    }

  }

  const { count } = await tabelas.from('lembretes_agenda')

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

  const modo = await modoDadosSeguro();

  if (modo === 'local') {

    // Marcação offline: a linha em `whatsapp_envios` funciona como flag

    // (`chave = lembrete:<id>`); a tabela `lembretes_agenda` não é local.

    try {

      const { contar, inserir } = await import('@/lib/local/cliente');

      const total = await contar('whatsapp_envios', [

        { col: 'clinica_id', op: 'eq', valor: Number(clinicaId) },

        { col: 'chave', op: 'eq', valor: chaveLembrete(agendamentoId) },

      ]);

      if (total === 0) {

        await inserir('whatsapp_envios', {

          clinica_id: Number(clinicaId),

          chave: chaveLembrete(agendamentoId),

          tipo: 'lembrete',

          status: 'enviada',

        });

      }

    } catch {

      /* melhor-esforço: o lembrete já foi aberto no canal escolhido */

    }

    return;

  }

  await tabelas.from('lembretes_agenda').upsert(

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

  // Cópia legada em configuração (só o administrador grava): falhar aqui não desfaz o lembrete registrado acima.
  await salvarConfig(clinicaId, CONFIG_KEYS.lembretes_enviados, {
    ...legado,
    [String(agendamentoId)]: new Date().toISOString(),
  }).catch(() => undefined);

}



export async function buscarAgendamentosLembrete24h(clinicaIds: (number | string)[]): Promise<LembreteAgendamento[]> {

  if (!clinicaIds.length) return [];



  const amanha = new Date();

  amanha.setDate(amanha.getDate() + 1);

  const inicio = new Date(amanha);

  inicio.setHours(0, 0, 0, 0);

  const fim = new Date(amanha);

  fim.setHours(23, 59, 59, 999);



  const modo = await modoDadosSeguro();

  if (modo === 'local') {

    const { lerSessaoCacheUI, listar } = await import('@/lib/local/cliente');

    const filtros: FiltroLocal[] = [

      { col: 'clinica_id', op: 'in', valor: clinicaIds },

      { col: 'data_hora', op: 'gte', valor: inicio.toISOString() },

      { col: 'data_hora', op: 'lte', valor: fim.toISOString() },

      { col: 'status', op: 'in', valor: ['agendado'] },

    ];

    const agendamentos = await listar<AgendamentoLocalLembrete>('agendamentos', {

      filtros,

      ordem: [{ col: 'data_hora', asc: true }],

    });

    const idsPacientes = Array.from(new Set(

      agendamentos

        .map((a) => a.paciente_id)

        .filter((id): id is string => typeof id === 'string' && id.length > 0),

    ));

    const pacientes = idsPacientes.length > 0

      ? await listar<PacienteLocalLembrete>('pacientes', {

          filtros: [{ col: 'id', op: 'in', valor: idsPacientes }],

        })

      : [];

    const mapaPacientes = new Map(pacientes.map((p) => [String(p.id), p]));

    const sessao = await lerSessaoCacheUI();

    const mapaClinicas = new Map((sessao?.clinicas || []).map((c) => [String(c.id), c.nome]));

    return agendamentos.map((a) => {

      const paciente = mapaPacientes.get(String(a.paciente_id));

      return {

        id: a.id,

        data_hora: a.data_hora,

        procedimento: a.procedimento,

        clinica_id: a.clinica_id,

        clinica_nome: mapaClinicas.get(String(a.clinica_id)),

        paciente_nome: paciente?.nome ?? '',

        paciente_telefone: paciente?.telefone ?? null,

        paciente_email: paciente?.email ?? null,

      };

    });

  }

  const { data } = await tabelas.from('agendamentos')

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





export async function montarLembreteCanal(

  clinicaId: string | number,

  ag: LembreteAgendamento,

  canal: 'whatsapp' | 'email' | 'sms',

) {

  const ctx = ctxLembreteAgendamento(ag);

  return montarMensagemEvento(clinicaId, 'lembrete', canal, ctx);

}





export async function filtrarPendentesLembrete(clinicaId: string | number, agendamentos: LembreteAgendamento[]) {

  const pendentes: LembreteAgendamento[] = [];

  for (const a of agendamentos.filter((x) => String(x.clinica_id) === String(clinicaId))) {

    if (!(await lembreteJaEnviado(clinicaId, a.id))) pendentes.push(a);

  }

  return pendentes;

}


