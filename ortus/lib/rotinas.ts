import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { registrarFalha } from '@/lib/registro';

type Admin = ReturnType<typeof createSupabaseAdmin>;

/** Rotinas agendadas e de quanto em quanto tempo cada uma tem que dar sinal de vida. */
export const ROTINAS = {
  lembretes: { rotulo: 'Lembretes de consulta', toleranciaHoras: 26 },
  assinaturas: { rotulo: 'Assinaturas e cobranças', toleranciaHoras: 26 },
  vigia: { rotulo: 'Vigia da operação', toleranciaHoras: 1 },
} as const;

export type NomeRotina = keyof typeof ROTINAS;

/**
 * Só o agendador chama as rotinas: `Authorization: Bearer $CRON_SECRET`.
 * Sem a variável a rota não abre para ninguém (falha fechada).
 */
export function ehChamadaDoAgendador(req: Request): boolean {
  const segredo = (process.env.CRON_SECRET || '').trim();
  if (!segredo) return false;
  const recebido = req.headers.get('authorization') || '';
  const esperado = `Bearer ${segredo}`;
  if (recebido.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i += 1) diferenca |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diferenca === 0;
}

type Contagens = Record<string, string | number | boolean | null>;

/**
 * Roda uma rotina e grava o batimento (início, fim, se deu certo e as
 * contagens). O resumo nunca recebe nome, telefone ou e-mail de paciente.
 */
export async function executarRotina<T extends Contagens>(
  admin: Admin,
  rotina: NomeRotina,
  fn: () => Promise<{ ok: boolean; resumo: T }>,
): Promise<{ ok: boolean; resumo: T | { erro: string } }> {
  let execucaoId: number | null = null;
  try {
    const { data } = await admin.from('rotinas_execucoes').insert({ rotina }).select('id').single();
    execucaoId = data?.id ?? null;
  } catch {
    /* sem a tabela a rotina roda do mesmo jeito; só não deixa rastro */
  }
  const fechar = async (ok: boolean, resumo: Contagens) => {
    if (execucaoId == null) return;
    try {
      await admin.from('rotinas_execucoes').update({ terminou_em: new Date().toISOString(), ok, resumo }).eq('id', execucaoId);
    } catch {
      /* melhor-esforço */
    }
  };
  try {
    const resultado = await fn();
    await fechar(resultado.ok, resultado.resumo);
    return resultado;
  } catch (erro) {
    await registrarFalha({ origem: `rotina/${rotina}` }, erro);
    await fechar(false, { erro: 'a rotina parou com erro (veja falhas do servidor)' });
    return { ok: false, resumo: { erro: 'A rotina parou com erro.' } };
  }
}
