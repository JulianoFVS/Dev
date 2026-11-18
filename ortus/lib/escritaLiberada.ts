import 'server-only';
import { NextResponse } from 'next/server';
import type { createSupabaseAdmin } from '@/lib/supabaseAdmin';
import { registrarFalha } from '@/lib/registro';

type Admin = ReturnType<typeof createSupabaseAdmin>;

/** A mesma frase do gatilho assinatura_barrar_escrita (migration 20261124_assinaturas): a tela recebe um aviso só. */
export const AVISO_MODO_CONSULTA =
  'Assinatura suspensa: o sistema está em modo de consulta. Os dados continuam disponíveis para leitura; para voltar a gravar, regularize o pagamento em Assinatura.';
const AVISO_SEM_CONFERENCIA = 'Não foi possível conferir a assinatura da clínica agora. Tente de novo em instantes.';

/**
 * Modo de consulta para quem grava com a chave de serviço.
 *
 * O gatilho do banco deixa a chave de serviço passar de propósito (rotinas,
 * scripts). Rota que grava com ela a pedido de uma pessoa da clínica chama
 * esta função antes, depois de conferir o acesso. A conta é a do banco
 * (clinica_aceita_escrita), feita na hora.
 *
 * null = a clínica grava. Senão, a resposta pronta: 402 com a frase do
 * gatilho, ou 503 se não deu para conferir (na dúvida não grava).
 * `campo` é onde a tela daquela rota lê o texto do erro.
 */
export async function escritaBarrada(
  admin: Admin,
  clinicaId: number | string,
  campo: 'error' | 'erro' = 'error',
): Promise<NextResponse | null> {
  let aceita: unknown = null;
  let falha: unknown = null;
  try {
    const { data, error } = await admin.rpc('clinica_aceita_escrita', { p_clinica: Number(clinicaId) });
    aceita = data;
    falha = error;
  } catch (err) {
    falha = err;
  }
  if (aceita === true && !falha) return null;
  if (aceita === false && !falha) return NextResponse.json({ [campo]: AVISO_MODO_CONSULTA }, { status: 402 });

  await registrarFalha(
    { origem: 'assinatura/escrita', clinicaId, extra: { etapa: 'clinica_aceita_escrita' } },
    falha ?? new Error('clinica_aceita_escrita sem resposta booleana'),
  );
  return NextResponse.json({ [campo]: AVISO_SEM_CONFERENCIA }, { status: 503 });
}
