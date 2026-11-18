import 'server-only';
import crypto from 'node:crypto';
import type { createSupabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Proteções das rotas que abrem sem login: compra do plano, link de acesso e
 * "Esqueci a senha".
 *
 * - `recusarPedidoDeFora`: só aceita corpo JSON (pedido de outro site exige
 *   pré-checagem do navegador, que não passa) e, quando o navegador informa a
 *   origem, ela tem de ser a deste site.
 * - `resumoDaOrigem` / `resumoDoEmail`: chaves de limite feitas com hash e
 *   segredo; IP e e-mail não ficam guardados. IPv6 conta pelo bloco /64.
 * - `consumirLimite`: conta e registra a tentativa numa única operação no
 *   banco (`limite_publico_consumir`), então pedidos simultâneos não passam
 *   juntos do limite.
 */

type Admin = ReturnType<typeof createSupabaseAdmin>;

// Sem segredo configurado (só em desenvolvimento), o sal é aleatório por processo:
// nunca um valor fixo, que permitiria desfazer o hash do IP por força bruta.
const SAL = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || crypto.randomBytes(32).toString('hex');

/** Endereço para limite: IPv4 inteiro; IPv6 pelo bloco /64 (quem tem o bloco troca o fim à vontade). */
export function blocoDoEndereco(ip: string): string {
  let a = String(ip || '').trim().toLowerCase();
  if (a.startsWith('[')) a = a.slice(1, a.includes(']') ? a.indexOf(']') : undefined);
  const mapeado = a.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapeado) return mapeado[1];
  if (!a.includes(':')) return a || 'desconhecido';
  a = a.split('%')[0];
  const [cabeca, cauda] = a.split('::');
  const partes = (s?: string) => (s ? s.split(':').filter(Boolean) : []);
  const inicio = partes(cabeca);
  const fim = cauda === undefined ? [] : partes(cauda);
  const zeros = a.includes('::') ? Math.max(0, 8 - inicio.length - fim.length) : 0;
  const grupos = [...inicio, ...Array<string>(zeros).fill('0'), ...fim];
  return `${grupos.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/** Resumo (hash com segredo) de quem pede. Prefere o endereço que o proxy da casa grava (X-Real-IP). */
export function resumoDaOrigem(req: Request): string {
  const ip = (req.headers.get('x-real-ip') || '').trim() || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconhecido';
  return crypto.createHash('sha256').update(`${SAL}|ip|${blocoDoEndereco(ip)}`).digest('hex').slice(0, 32);
}

/** Resumo de um e-mail para chave de limite. */
export function resumoDoEmail(email: string): string {
  return crypto.createHash('sha256').update(`${SAL}|email|${String(email || '').trim().toLowerCase()}`).digest('hex').slice(0, 32);
}

function origensDaCasa(req: Request): Set<string> {
  const origens = new Set<string>();
  const somar = (valor: string | null | undefined) => {
    if (!valor) return;
    try {
      origens.add(new URL(valor).origin);
    } catch {
      /* endereço inválido: ignora */
    }
  };
  somar(req.url);
  somar(process.env.NEXT_PUBLIC_APP_URL);
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (host) {
    const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
    somar(`${proto}://${host}`);
  }
  return origens;
}

/** Devolve a resposta de recusa, ou null quando o pedido pode seguir. */
export function recusarPedidoDeFora(req: Request): Response | null {
  const tipo = (req.headers.get('content-type') || '').toLowerCase();
  if (!tipo.startsWith('application/json')) {
    return Response.json({ error: 'Pedido inválido.' }, { status: 415 });
  }
  const origem = req.headers.get('origin');
  if (origem && !origensDaCasa(req).has(origem)) {
    return Response.json({ error: 'Pedido inválido.' }, { status: 403 });
  }
  return null;
}

/** Conta uma tentativa na chave; false = passou do limite. Erro do banco vira exceção (a rota responde 500). */
export async function consumirLimite(admin: Admin, chave: string, maximo: number, janelaSegundos: number): Promise<boolean> {
  const { data, error } = await admin.rpc('limite_publico_consumir', {
    p_chave: chave.slice(0, 120),
    p_maximo: maximo,
    p_janela_segundos: janelaSegundos,
  });
  if (error) throw new Error(`limite_publico_consumir: ${error.message}`);
  return data === true;
}
