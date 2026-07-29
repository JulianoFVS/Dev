import { NextResponse } from 'next/server';
import { smsTwilioConfigurado } from '@/lib/sms';
import { resendConfigurado } from '@/lib/email';

/** GET — status das integrações de comunicação (sem expor segredos). */
export async function GET() {
  return NextResponse.json({
    cron_secret: !!process.env.CRON_SECRET,
    twilio: smsTwilioConfigurado(),
    resend: resendConfigurado(),
    cron_path: '/api/lembretes/processar?enviar=true',
    cron_schedule: 'Diariamente às 10h (horário de Brasília) via vercel.json',
  });
}
