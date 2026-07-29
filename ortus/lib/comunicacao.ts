import { carregarConfig } from '@/lib/configClinica';
import { TEMPLATES_COMUNICACAO_PADRAO, type TemplateComunicacao } from '@/lib/configDefaults';
import { aplicarVariaveisDocumento, type DocumentoContexto } from '@/lib/documentVariables';
import { abrirSmsCliente } from '@/lib/sms';

export type EventoComunicacao = 'confirmacao' | 'lembrete' | 'pos_consulta' | 'aniversario' | 'generico';

const MAPA_EVENTO_TEMPLATE: Record<EventoComunicacao, { whatsapp?: string; email?: string; sms?: string }> = {
  confirmacao: { whatsapp: 'wa_confirmacao', email: 'email_confirmacao', sms: 'sms_confirmacao' },
  lembrete: { whatsapp: 'wa_lembrete', email: 'email_lembrete', sms: 'sms_lembrete' },
  pos_consulta: { whatsapp: 'wa_pos_consulta', email: 'email_padrao', sms: 'sms_padrao' },
  aniversario: { whatsapp: 'wa_aniversario', email: 'email_padrao', sms: 'sms_padrao' },
  generico: { email: 'email_padrao', sms: 'sms_padrao' },
};

export async function carregarTemplatesComunicacao(clinicaId: string | number): Promise<TemplateComunicacao[]> {
  const raw = await carregarConfig<TemplateComunicacao[]>(
    clinicaId,
    'templates_comunicacao',
    'ortus_templates_comunicacao',
    TEMPLATES_COMUNICACAO_PADRAO,
  );
  const lista = Array.isArray(raw) && raw.length ? raw : TEMPLATES_COMUNICACAO_PADRAO;
  return lista.filter((t) => t.ativo);
}

export function montarMensagemTemplate(template: TemplateComunicacao, ctx: Partial<DocumentoContexto>): string {
  return aplicarVariaveisDocumento(template.corpo, ctx as DocumentoContexto);
}

export function montarAssuntoTemplate(template: TemplateComunicacao, ctx: Partial<DocumentoContexto>): string {
  const base = template.assunto || `Mensagem de ${ctx.clinica_nome || 'Clínica'}`;
  return aplicarVariaveisDocumento(base, ctx as DocumentoContexto);
}

export function buscarTemplatePorId(templates: TemplateComunicacao[], id: string): TemplateComunicacao | undefined {
  return templates.find((t) => t.id === id);
}

export function resolverTemplate(
  templates: TemplateComunicacao[],
  evento: EventoComunicacao,
  canal: TemplateComunicacao['canal'],
): TemplateComunicacao | undefined {
  const ids = MAPA_EVENTO_TEMPLATE[evento];
  const preferido = ids?.[canal === 'whatsapp' ? 'whatsapp' : canal === 'email' ? 'email' : 'sms'];
  if (preferido) {
    const tpl = buscarTemplatePorId(templates, preferido);
    if (tpl && tpl.canal === canal) return tpl;
  }
  return templates.find((t) => t.canal === canal);
}

export async function montarMensagemEvento(
  clinicaId: string | number,
  evento: EventoComunicacao,
  canal: TemplateComunicacao['canal'],
  ctx: Partial<DocumentoContexto>,
): Promise<{ mensagem: string; assunto?: string; template?: TemplateComunicacao }> {
  const templates = await carregarTemplatesComunicacao(clinicaId);
  const tpl = resolverTemplate(templates, evento, canal);
  if (tpl) {
    return {
      mensagem: montarMensagemTemplate(tpl, ctx),
      assunto: canal === 'email' ? montarAssuntoTemplate(tpl, ctx) : undefined,
      template: tpl,
    };
  }

  const fallbacks: Record<EventoComunicacao, string> = {
    confirmacao: `Olá ${ctx.paciente_nome || ''}! Confirmamos sua consulta em ${ctx.data_consulta || ''} às ${ctx.hora_consulta || ''}.`,
    lembrete: `Oi ${ctx.paciente_nome || ''}, lembrete da sua consulta amanhã (${ctx.data_consulta || ''}) às ${ctx.hora_consulta || ''}.`,
    pos_consulta: `Olá ${ctx.paciente_nome || ''}! Obrigado por comparecer à ${ctx.clinica_nome || 'clínica'}.`,
    aniversario: `Feliz aniversário, ${ctx.paciente_nome || ''}!`,
    generico: `Olá ${ctx.paciente_nome || ''}!`,
  };
  return { mensagem: fallbacks[evento] };
}

export function abrirWhatsappComMensagem(telefone: string | null | undefined, mensagem: string): boolean {
  const numero = telefone?.replace(/\D/g, '');
  if (!numero) return false;
  window.open(`https://wa.me/55${numero}?text=${encodeURIComponent(mensagem)}`, '_blank');
  return true;
}

export function abrirEmailComMensagem(
  email: string | null | undefined,
  assunto: string,
  corpo: string,
): boolean {
  if (!email?.trim()) return false;
  window.open(
    `mailto:${email.trim()}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`,
    '_blank',
  );
  return true;
}

export function abrirEmailTemplate(template: TemplateComunicacao, email: string, ctx: Partial<DocumentoContexto>): boolean {
  const corpo = montarMensagemTemplate(template, ctx);
  const assunto = montarAssuntoTemplate(template, ctx);
  return abrirEmailComMensagem(email, assunto, corpo);
}

export async function abrirComunicacaoCliente(
  canal: 'whatsapp' | 'email' | 'sms',
  destino: { telefone?: string | null; email?: string | null },
  clinicaId: string | number,
  evento: EventoComunicacao,
  ctx: Partial<DocumentoContexto>,
): Promise<boolean> {
  const { mensagem, assunto } = await montarMensagemEvento(clinicaId, evento, canal, ctx);
  if (canal === 'whatsapp') return abrirWhatsappComMensagem(destino.telefone, mensagem);
  if (canal === 'email') return abrirEmailComMensagem(destino.email, assunto || `Mensagem de ${ctx.clinica_nome || 'Clínica'}`, mensagem);
  return abrirSmsCliente(destino.telefone, mensagem);
}

export async function montarWhatsappConfirmacaoConsulta(
  clinicaId: string | number,
  ctx: Partial<DocumentoContexto> & { data_consulta?: string; hora_consulta?: string },
): Promise<string> {
  const { mensagem } = await montarMensagemEvento(clinicaId, 'confirmacao', 'whatsapp', ctx);
  return mensagem;
}
