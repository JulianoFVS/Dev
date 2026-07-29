import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  montarLembreteCanal,
  buscarAgendamentosLembrete24h,
  filtrarPendentesLembrete,
  marcarLembreteEnviado,
} from '@/lib/lembretesAgenda';
import { enviarSmsTwilio, smsTwilioConfigurado } from '@/lib/sms';
import { enviarEmailResend, resendConfigurado } from '@/lib/email';

/**
 * GET — processa lembretes 24h.
 * Query params:
 *   marcar=true   — marca como enviado (manual ou após envio automático)
 *   enviar=true   — envia SMS (Twilio) e e-mail (Resend) quando configurados
 *   clinica_id=   — filtra uma clínica
 *
 * Cron Vercel: GET /api/lembretes/processar?enviar=true
 * Header: Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const clinicaId = url.searchParams.get('clinica_id');
  const marcar = url.searchParams.get('marcar') === 'true';
  const enviar = url.searchParams.get('enviar') === 'true';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let clinicaIds: (number | string)[] = [];
  if (clinicaId) {
    clinicaIds = [clinicaId];
  } else {
    const { data: clinicas } = await supabase.from('clinicas').select('id');
    clinicaIds = (clinicas || []).map((c) => c.id);
  }

  const todos = await buscarAgendamentosLembrete24h(clinicaIds);
  const pendentesPorClinica: Record<string, typeof todos> = {};

  for (const cid of clinicaIds) {
    const pendentes = await filtrarPendentesLembrete(cid, todos);
    if (pendentes.length) pendentesPorClinica[String(cid)] = pendentes;
  }

  const resultado = [];
  let enviadosAuto = 0;
  let errosAuto = 0;

  for (const [cid, lista] of Object.entries(pendentesPorClinica)) {
    for (const ag of lista) {
      const wa = await montarLembreteCanal(cid, ag, 'whatsapp');
      const em = await montarLembreteCanal(cid, ag, 'email');
      const sm = await montarLembreteCanal(cid, ag, 'sms');

      const item: Record<string, unknown> = {
        agendamento_id: ag.id,
        clinica_id: cid,
        paciente: ag.paciente_nome,
        telefone: ag.paciente_telefone,
        email: ag.paciente_email,
        mensagem_whatsapp: wa.mensagem,
        mensagem_email: em.mensagem,
        mensagem_sms: sm.mensagem,
        whatsapp_url: ag.paciente_telefone
          ? `https://wa.me/55${ag.paciente_telefone.replace(/\D/g, '')}?text=${encodeURIComponent(wa.mensagem)}`
          : null,
      };

      const canaisEnviados: string[] = [];

      if (enviar) {
        if (smsTwilioConfigurado() && ag.paciente_telefone) {
          const smsRes = await enviarSmsTwilio(ag.paciente_telefone, sm.mensagem);
          item.sms_auto = smsRes;
          if (smsRes.ok) canaisEnviados.push('sms');
          else errosAuto++;
        }
        if (resendConfigurado() && ag.paciente_email) {
          const emailRes = await enviarEmailResend(
            ag.paciente_email,
            em.assunto || `Lembrete de consulta — ${ag.clinica_nome || 'Clínica'}`,
            em.mensagem,
          );
          item.email_auto = emailRes;
          if (emailRes.ok) canaisEnviados.push('email');
          else errosAuto++;
        }
        if (canaisEnviados.length) enviadosAuto += canaisEnviados.length;
        item.canais_enviados = canaisEnviados;
      }

      const deveMarcar = marcar || (enviar && canaisEnviados.length > 0);
      if (deveMarcar) {
        await marcarLembreteEnviado(cid, ag.id);
        item.marcado = true;
      }

      resultado.push(item);
    }
  }

  return NextResponse.json({
    processado_em: new Date().toISOString(),
    total_pendentes: resultado.length,
    enviados_automaticamente: enviadosAuto,
    erros_automaticos: errosAuto,
    twilio_configurado: smsTwilioConfigurado(),
    resend_configurado: resendConfigurado(),
    lembretes: resultado,
  });
}
