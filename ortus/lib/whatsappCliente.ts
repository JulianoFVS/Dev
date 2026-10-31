import { supabase } from '@/lib/supabase';

/** Liga a aba WhatsApp. Só defina NEXT_PUBLIC_WHATSAPP_ATIVO=1 onde o serviço npm run whatsapp estiver acessível. */
export const WHATSAPP_ATIVO = process.env.NEXT_PUBLIC_WHATSAPP_ATIVO === '1';

const cache = new Map<string, { em: number; conectado: boolean }>();

/** Se o WhatsApp da clínica está conectado ao Ortus (resultado guardado por 30 s). */
export async function whatsappConectado(clinicaId: string | number): Promise<boolean> {
  if (!WHATSAPP_ATIVO) return false;
  const chave = String(clinicaId);
  const salvo = cache.get(chave);
  if (salvo && Date.now() - salvo.em < 30_000) return salvo.conectado;
  let conectado = false;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const resposta = await fetch(`/api/whatsapp?clinicaId=${encodeURIComponent(chave)}`, {
      headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      cache: 'no-store',
    });
    const dados = await resposta.json().catch(() => ({}));
    conectado = resposta.ok && dados?.status === 'conectado';
  } catch {
    conectado = false;
  }
  cache.set(chave, { em: Date.now(), conectado });
  return conectado;
}
