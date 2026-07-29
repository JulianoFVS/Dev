import { supabase } from '@/lib/supabase';
import { rowToDocumento, type DocumentoPaciente } from '@/lib/db/types';

export type DocumentoMeta = {
  isImg?: boolean;
  dataUrl?: string;
  tamanho?: number;
  [key: string]: unknown;
};

export type DocumentoPacienteUI = DocumentoPaciente & DocumentoMeta & {
  storagePath?: string | null;
};

function rowToDocumentoUI(r: Record<string, unknown>): DocumentoPacienteUI {
  const base = rowToDocumento(r);
  const meta = (r.meta as DocumentoMeta) || {};
  return {
    ...base,
    ...meta,
    storagePath: base.storage_path || (meta.storagePath as string) || null,
    dataUrl: meta.dataUrl as string | undefined,
    isImg: meta.isImg as boolean | undefined,
    tamanho: meta.tamanho as number | undefined,
  };
}

export async function listarDocumentos(pacienteId: string): Promise<DocumentoPacienteUI[]> {
  const { data, error } = await supabase
    .from('paciente_documentos')
    .select('*')
    .eq('paciente_id', pacienteId)
    .order('criado_em', { ascending: false });

  if (error) throw error;
  return (data || []).map(rowToDocumentoUI);
}

export async function criarDocumento(
  pacienteId: string,
  input: {
    nome: string;
    tipo?: string | null;
    storage_path?: string | null;
    meta?: DocumentoMeta;
  },
): Promise<DocumentoPacienteUI> {
  const { data, error } = await supabase
    .from('paciente_documentos')
    .insert({
      paciente_id: pacienteId,
      legacy_id: Date.now().toString(),
      nome: input.nome,
      tipo: input.tipo || null,
      storage_path: input.storage_path || null,
      meta: input.meta || {},
    })
    .select('*')
    .single();

  if (error) throw error;
  return rowToDocumentoUI(data);
}

export async function excluirDocumento(id: string): Promise<{ storage_path: string | null }> {
  const { data, error } = await supabase
    .from('paciente_documentos')
    .delete()
    .eq('id', id)
    .select('storage_path')
    .maybeSingle();

  if (error) throw error;
  return { storage_path: (data?.storage_path as string) || null };
}
