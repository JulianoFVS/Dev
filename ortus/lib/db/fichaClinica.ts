import { dados as tabelas } from '@/lib/local/consulta';
import { atualizar, listar, modoDados } from '@/lib/local/cliente';
import type { FichaClinicaJson } from '@/lib/db/types';

const CHAVES_CLINICAS = ['odontograma', 'texto_livre', 'marcacoes_hof', 'hof_fotos'] as const;

/** Extrai só os campos clínicos gráficos do JSON legado. */
export function extrairFichaClinica(ficha: Record<string, unknown> | null | undefined): FichaClinicaJson {
  const fm = ficha || {};
  return {
    odontograma: (fm.odontograma as Record<string, unknown>) || {},
    texto_livre: (fm.texto_livre as string) || '',
    marcacoes_hof: (fm.marcacoes_hof as unknown[]) || [],
    hof_fotos: (fm.hof_fotos as unknown[]) || [],
  };
}

/** Mescla campos clínicos no JSON existente (preserva outras chaves legadas). */
export function mesclarFichaClinica(
  atual: Record<string, unknown> | null | undefined,
  parcial: Partial<FichaClinicaJson>,
): Record<string, unknown> {
  const base = { ...(atual || {}) };
  for (const k of CHAVES_CLINICAS) {
    if (parcial[k] !== undefined) base[k] = parcial[k];
  }
  return base;
}

async function carregarFichaLocal(pacienteId: string): Promise<Record<string, unknown> | null> {
  const linhas = await listar<{ ficha_medica?: Record<string, unknown> | null }>('pacientes', {
    filtros: [{ col: 'id', op: 'eq', valor: pacienteId }],
    limite: 1,
  });
  if (!linhas.length) throw new Error('Paciente não encontrado no banco local.');
  return linhas[0].ficha_medica || null;
}

export async function carregarFichaClinica(pacienteId: string): Promise<FichaClinicaJson> {
  const modo = await modoDados();
  if (modo === 'local') {
    return extrairFichaClinica(await carregarFichaLocal(pacienteId));
  }

  const { data, error } = await tabelas.from('pacientes')
    .select('ficha_medica')
    .eq('id', pacienteId)
    .single();

  if (error) throw error;
  return extrairFichaClinica(data?.ficha_medica as Record<string, unknown>);
}

export async function salvarFichaClinica(
  pacienteId: string,
  parcial: Partial<FichaClinicaJson>,
  atual?: Record<string, unknown> | null,
): Promise<FichaClinicaJson> {
  const modo = await modoDados();
  if (modo === 'local') {
    const base = atual ?? (await carregarFichaLocal(pacienteId));
    const merged = mesclarFichaClinica(base, parcial);
    const salvo = await atualizar('pacientes', pacienteId, { ficha_medica: merged });
    if (!salvo) throw new Error('Paciente não encontrado no banco local.');
    return extrairFichaClinica(merged);
  }

  let base = atual;
  if (!base) {
    const { data } = await tabelas.from('pacientes').select('ficha_medica').eq('id', pacienteId).single();
    base = (data?.ficha_medica as Record<string, unknown>) || {};
  }
  const merged = mesclarFichaClinica(base, parcial);
  const { error } = await tabelas.from('pacientes').update({ ficha_medica: merged }).eq('id', pacienteId);
  if (error) throw error;
  return extrairFichaClinica(merged);
}
