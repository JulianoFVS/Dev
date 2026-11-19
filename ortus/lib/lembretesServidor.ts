import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { TEMPLATES_COMUNICACAO_PADRAO, type TemplateComunicacao } from '@/lib/configDefaults';
import { aplicarVariaveisDocumento, type DocumentoContexto } from '@/lib/documentVariables';
import { emailValido, enviarEmail, resendConfigurado } from '@/lib/email';
import { emailLivre } from '@/lib/emailModelos';
import { enviarSmsTwilio, smsTwilioConfigurado } from '@/lib/sms';
import { registrarFalha } from '@/lib/registro';
import { instanteLocal, partesLocais, fusoValido } from '@/lib/fuso';

/**
 * Lembrete de consulta de 24 h — versão do servidor.
 *
 * A rotina antiga reaproveitava a camada de dados do navegador: no servidor
 * ela consultava com a chave anônima, sem sessão, a RLS devolvia zero linhas
 * e nenhum lembrete saía. Aqui tudo usa o cliente de serviço recebido da rota.
 *
 * Garantias:
 *  - "amanhã" é o dia seguinte no fuso da clínica, não no do servidor;
 *  - um lembrete por agendamento e por canal: a linha em `lembretes_agenda`
 *    é reservada ANTES do envio (a chave única barra a segunda tentativa,
 *    mesmo com dois agendadores rodando ao mesmo tempo) e é desfeita se o
 *    provedor recusar, para o próximo ciclo tentar de novo;
 *  - canal não configurado nunca conta como enviado;
 *  - o retorno e os logs só carregam ids e contagens.
 */

type Admin = ReturnType<typeof createSupabaseAdmin>;
type Canal = 'email' | 'sms';
export type EstadoCanal = 'enviado' | 'ja_enviado' | 'sem_destino' | 'canal_nao_configurado' | 'erro' | 'pendente';

export type OpcoesLembretes = {
  /** false = só conta o que sairia, sem enviar nem reservar. */
  enviar: boolean;
  clinicaId?: string | null;
  agendamentoId?: string | null;
  agora?: Date;
  /** Tempo máximo da execução, para caber no limite de uma função serverless. */
  orcamentoMs?: number;
};

export type ItemLembrete = { agendamento_id: number; clinica_id: number; email: EstadoCanal; sms: EstadoCanal };

export type ResumoLembretes = {
  clinicas: number;
  agendamentos_amanha: number;
  enviados_email: number;
  enviados_sms: number;
  ja_enviados: number;
  sem_destino: number;
  /** Clínicas puladas porque a assinatura está em modo de consulta (fatura vencida, suspensa ou cancelada). */
  clinicas_em_modo_consulta: number;
  erros: number;
  pendentes: number;
  resend_configurado: boolean;
  twilio_configurado: boolean;
  cota_de_email_esgotada: boolean;
  interrompido_por_tempo: boolean;
  modo: 'envio' | 'simulacao';
};

const ID_TEMPLATE: Record<Canal, string> = { email: 'email_lembrete', sms: 'sms_lembrete' };
const TEXTO_PADRAO = 'Olá {{paciente_nome}}, lembrete da sua consulta em {{data_consulta}} às {{hora_consulta}}. {{clinica_nome}}';

function templateDoCanal(templates: TemplateComunicacao[], canal: Canal): TemplateComunicacao | null {
  const ativos = templates.filter((t) => t.ativo && t.canal === canal);
  return ativos.find((t) => t.id === ID_TEMPLATE[canal]) || ativos[0] || null;
}

/** Janela [00:00, 24:00) de amanhã no fuso da clínica, em instantes UTC. */
function janelaDeAmanha(agora: Date, fuso: string) {
  const hoje = partesLocais(agora, fuso);
  const inicio = instanteLocal(hoje.ano, hoje.mes, hoje.dia + 1, 0, 0, fuso);
  const fim = instanteLocal(hoje.ano, hoje.mes, hoje.dia + 2, 0, 0, fuso);
  return { inicio, fim };
}

const pausa = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Agendamento = {
  id: number;
  data_hora: string;
  clinica_id: number;
  tipo_registro: string | null;
  observacoes: string | null;
  pacientes: { nome: string | null; telefone: string | null; email: string | null; clinica_id?: number | string | null } | null;
};

export async function processarLembretes24h(admin: Admin, opcoes: OpcoesLembretes): Promise<{ ok: boolean; resumo: ResumoLembretes; itens: ItemLembrete[] }> {
  const agora = opcoes.agora ?? new Date();
  const comecou = Date.now();
  const orcamento = opcoes.orcamentoMs ?? 50_000;
  const temEmail = resendConfigurado();
  const temSms = smsTwilioConfigurado();

  const resumo: ResumoLembretes = {
    clinicas: 0, agendamentos_amanha: 0, enviados_email: 0, enviados_sms: 0, ja_enviados: 0, sem_destino: 0,
    clinicas_em_modo_consulta: 0, erros: 0, pendentes: 0, resend_configurado: temEmail, twilio_configurado: temSms,
    cota_de_email_esgotada: false, interrompido_por_tempo: false, modo: opcoes.enviar ? 'envio' : 'simulacao',
  };
  const itens: ItemLembrete[] = [];

  let consultaClinicas = admin.from('clinicas').select('id, nome, fuso_horario, email, telefone, rede_id');
  if (opcoes.clinicaId && /^\d{1,12}$/.test(opcoes.clinicaId)) consultaClinicas = consultaClinicas.eq('id', Number(opcoes.clinicaId));
  const { data: clinicasBrutas, error: erroClinicas } = await consultaClinicas;
  if (erroClinicas) throw erroClinicas;
  const clinicas = new Map<number, { nome: string; fuso: string; email: string | null; telefone: string | null; inicio: Date; fim: Date }>();
  // Clínica em modo de consulta (assinatura vencida, suspensa ou cancelada) não recebe lembrete:
  // o envio é um serviço da assinatura. A regra é a mesma que barra a gravação (clinica_aceita_escrita).
  const bloqueadas = new Set<number>();
  for (const c of clinicasBrutas || []) {
    if (!c.rede_id) continue;
    const { data: aceita, error: erroAceita } = await admin.rpc('clinica_aceita_escrita', { p_clinica: Number(c.id) });
    if (!erroAceita && aceita === false) bloqueadas.add(Number(c.id));
  }
  resumo.clinicas_em_modo_consulta = bloqueadas.size;
  const redeDaClinica = new Map<number, string | null>();
  for (const c of clinicasBrutas || []) {
    redeDaClinica.set(Number(c.id), c.rede_id ? String(c.rede_id) : null);
    if (bloqueadas.has(Number(c.id))) continue;
    const fuso = fusoValido(c.fuso_horario);
    clinicas.set(Number(c.id), { nome: c.nome || 'Clínica', fuso, email: c.email, telefone: c.telefone, ...janelaDeAmanha(agora, fuso) });
  }
  resumo.clinicas = clinicas.size;
  if (clinicas.size === 0) return { ok: true, resumo, itens };

  const ids = [...clinicas.keys()];
  const menorInicio = new Date(Math.min(...[...clinicas.values()].map((c) => c.inicio.getTime())));
  const maiorFim = new Date(Math.max(...[...clinicas.values()].map((c) => c.fim.getTime())));

  // Agendamentos de amanhã, em páginas (o PostgREST corta em 1000 linhas).
  const agendamentos: Agendamento[] = [];
  for (let pagina = 0; pagina < 20; pagina += 1) {
    let consulta = admin
      .from('agendamentos')
      .select('id, data_hora, clinica_id, tipo_registro, observacoes, pacientes(nome, telefone, email, clinica_id)')
      .in('clinica_id', ids)
      .eq('status', 'agendado')
      .gte('data_hora', menorInicio.toISOString())
      .lt('data_hora', maiorFim.toISOString())
      .order('id')
      .range(pagina * 1000, pagina * 1000 + 999);
    if (opcoes.agendamentoId && /^\d{1,15}$/.test(opcoes.agendamentoId)) consulta = consulta.eq('id', Number(opcoes.agendamentoId));
    const { data, error } = await consulta;
    if (error) throw error;
    for (const bruto of (data || []) as unknown as Array<Agendamento & { pacientes: Agendamento['pacientes'] | Agendamento['pacientes'][] }>) {
      const paciente = Array.isArray(bruto.pacientes) ? bruto.pacientes[0] ?? null : bruto.pacientes;
      agendamentos.push({ ...bruto, id: Number(bruto.id), clinica_id: Number(bruto.clinica_id), pacientes: paciente });
    }
    if (!data || data.length < 1000) break;
  }

  const deAmanha = agendamentos.filter((a) => {
    const clinica = clinicas.get(a.clinica_id);
    if (!clinica) return false;
    // Paciente de outra rede num agendamento (gravado antes da trava do banco): não recebe o texto desta clínica.
    const clinicaDoPaciente = a.pacientes?.clinica_id != null ? Number(a.pacientes.clinica_id) : null;
    if (clinicaDoPaciente != null && clinicaDoPaciente !== a.clinica_id) {
      const redeAg = redeDaClinica.get(a.clinica_id);
      if (!redeAg || redeAg !== redeDaClinica.get(clinicaDoPaciente)) return false;
    }
    // Lançamento financeiro avulso mora na mesma tabela e não é consulta.
    if (a.tipo_registro === 'debito_manual' || a.observacoes === 'Débito manual') return false;
    const quando = new Date(a.data_hora).getTime();
    return quando >= clinica.inicio.getTime() && quando < clinica.fim.getTime();
  });
  resumo.agendamentos_amanha = deAmanha.length;
  if (deAmanha.length === 0) return { ok: true, resumo, itens };

  // Modelos de mensagem de cada clínica (configuração opcional).
  const modelos = new Map<number, TemplateComunicacao[]>();
  const { data: configs } = await admin
    .from('configuracoes_clinica')
    .select('clinica_id, valor')
    .eq('chave', 'templates_comunicacao')
    .in('clinica_id', [...new Set(deAmanha.map((a) => a.clinica_id))]);
  for (const linha of configs || []) {
    if (Array.isArray(linha.valor) && linha.valor.length) modelos.set(Number(linha.clinica_id), linha.valor as TemplateComunicacao[]);
  }

  // O que já saiu, para a simulação contar certo.
  const jaSaiu = new Set<string>();
  const idsAgendamentos = deAmanha.map((a) => a.id);
  for (let i = 0; i < idsAgendamentos.length; i += 500) {
    const { data } = await admin.from('lembretes_agenda').select('agendamento_id, canal').in('agendamento_id', idsAgendamentos.slice(i, i + 500));
    for (const l of data || []) jaSaiu.add(`${l.agendamento_id}:${l.canal}`);
  }

  async function reservar(a: Agendamento, canal: Canal): Promise<'reservado' | 'ja_enviado' | 'erro'> {
    const { error } = await admin.from('lembretes_agenda').insert({ clinica_id: a.clinica_id, agendamento_id: a.id, canal });
    if (!error) return 'reservado';
    if (error.code === '23505') return 'ja_enviado';
    await registrarFalha({ origem: 'rotina/lembretes', clinicaId: a.clinica_id, extra: { etapa: 'reserva', canal } }, error);
    return 'erro';
  }
  const desfazer = (a: Agendamento, canal: Canal) => admin.from('lembretes_agenda').delete().eq('agendamento_id', a.id).eq('canal', canal);

  for (const a of deAmanha) {
    const clinica = clinicas.get(a.clinica_id)!;
    const item: ItemLembrete = { agendamento_id: a.id, clinica_id: a.clinica_id, email: 'canal_nao_configurado', sms: 'canal_nao_configurado' };
    itens.push(item);

    if (Date.now() - comecou > orcamento) {
      resumo.interrompido_por_tempo = true;
      item.email = temEmail ? 'pendente' : item.email;
      item.sms = temSms ? 'pendente' : item.sms;
      resumo.pendentes += 1;
      continue;
    }

    const quando = new Date(a.data_hora);
    const local = partesLocais(quando, clinica.fuso);
    const ctx: DocumentoContexto = {
      paciente_nome: (a.pacientes?.nome || '').trim().split(/\s+/)[0] || 'paciente',
      clinica_nome: clinica.nome,
      clinica_telefone: clinica.telefone || '',
      data_consulta: `${String(local.dia).padStart(2, '0')}/${String(local.mes).padStart(2, '0')}`,
      hora_consulta: `${String(local.hora).padStart(2, '0')}:${String(local.minuto).padStart(2, '0')}`,
    };
    const dosModelos = modelos.get(a.clinica_id) || TEMPLATES_COMUNICACAO_PADRAO;

    // ---------------- e-mail ----------------
    if (temEmail) {
      const destino = (a.pacientes?.email || '').trim();
      if (!emailValido(destino)) { item.email = 'sem_destino'; resumo.sem_destino += 1; }
      else if (jaSaiu.has(`${a.id}:email`)) { item.email = 'ja_enviado'; resumo.ja_enviados += 1; }
      else if (!opcoes.enviar || resumo.cota_de_email_esgotada) { item.email = 'pendente'; resumo.pendentes += 1; }
      else {
        const reserva = await reservar(a, 'email');
        if (reserva === 'ja_enviado') { item.email = 'ja_enviado'; resumo.ja_enviados += 1; }
        else if (reserva === 'erro') { item.email = 'erro'; resumo.erros += 1; }
        else {
          const modelo = templateDoCanal(dosModelos, 'email');
          const corpo = aplicarVariaveisDocumento(modelo?.corpo || TEXTO_PADRAO, ctx);
          const assunto = aplicarVariaveisDocumento(modelo?.assunto || 'Lembrete de consulta — {{clinica_nome}}', ctx);
          const pronto = emailLivre({ assunto, titulo: `Lembrete de consulta — ${clinica.nome}`, texto: corpo });
          const envio = await enviarEmail({ para: destino, ...pronto, responderPara: clinica.email, categoria: 'lembrete' });
          if (envio.ok) { item.email = 'enviado'; resumo.enviados_email += 1; }
          else {
            await desfazer(a, 'email');
            item.email = 'erro';
            resumo.erros += 1;
            if (envio.status === 429) resumo.cota_de_email_esgotada = true;
            await registrarFalha({ origem: 'rotina/lembretes', clinicaId: a.clinica_id, extra: { etapa: 'envio', canal: 'email', status: envio.status ?? 0 } }, new Error(envio.erro));
          }
          await pausa(550); // a Resend aceita 2 requisições por segundo
        }
      }
    }

    // ---------------- SMS ----------------
    if (temSms) {
      const destino = (a.pacientes?.telefone || '').replace(/\D/g, '');
      if (destino.length < 10) { item.sms = 'sem_destino'; resumo.sem_destino += 1; }
      else if (jaSaiu.has(`${a.id}:sms`)) { item.sms = 'ja_enviado'; resumo.ja_enviados += 1; }
      else if (!opcoes.enviar) { item.sms = 'pendente'; resumo.pendentes += 1; }
      else {
        const reserva = await reservar(a, 'sms');
        if (reserva === 'ja_enviado') { item.sms = 'ja_enviado'; resumo.ja_enviados += 1; }
        else if (reserva === 'erro') { item.sms = 'erro'; resumo.erros += 1; }
        else {
          const modelo = templateDoCanal(dosModelos, 'sms');
          const envio = await enviarSmsTwilio(destino, aplicarVariaveisDocumento(modelo?.corpo || TEXTO_PADRAO, ctx));
          if (envio.ok) { item.sms = 'enviado'; resumo.enviados_sms += 1; }
          else {
            await desfazer(a, 'sms');
            item.sms = 'erro';
            resumo.erros += 1;
            await registrarFalha({ origem: 'rotina/lembretes', clinicaId: a.clinica_id, extra: { etapa: 'envio', canal: 'sms' } }, new Error(envio.erro || 'Twilio recusou o envio'));
          }
        }
      }
    }
  }

  return { ok: resumo.erros === 0, resumo, itens };
}
