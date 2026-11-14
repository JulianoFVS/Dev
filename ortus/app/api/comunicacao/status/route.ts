import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { smsTwilioConfigurado } from '@/lib/sms';
import { resendConfigurado } from '@/lib/email';

/**
 * GET — status das integrações de comunicação.
 *
 * Antes era público e revelava quais integrações estão ativas (útil para
 * quem procura um alvo). Agora exige um dono da plataforma autenticado.
 * Nunca expõe segredos: apenas ligado/desligado.
 */
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: caller, error } = await admin.auth.getUser(token);
  if (error || !caller?.user) return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });

  const { data: prof } = await admin
    .from('profissionais')
    .select('is_super_admin')
    .eq('user_id', caller.user.id)
    .maybeSingle();

  if (!prof?.is_super_admin) {
    return NextResponse.json({ error: 'Acesso restrito aos administradores da plataforma.' }, { status: 403 });
  }

  return NextResponse.json({
    cron_secret: Boolean(process.env.CRON_SECRET),
    twilio: smsTwilioConfigurado(),
    resend: resendConfigurado(),
    r2: Boolean(process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY),
    cron_path: '/api/lembretes/processar?enviar=true',
    cron_schedule: 'Diariamente às 10h (horário de Brasília) via vercel.json',
  });
}
