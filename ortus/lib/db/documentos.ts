import { dados as tabelas } from '@/lib/local/consulta';
import { rowToDocumento, type DocumentoPaciente } from '@/lib/db/types';
import { inserir, listar, modoDados, remover } from '@/lib/local/cliente';

export type DocumentoMeta = {
  isImg?: boolean;
  isPdf?: boolean;
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
    // O meta é gravado por qualquer pessoa da clínica: só os campos abaixo entram na tela, um a um.
    storagePath: base.storage_path || (meta.storagePath as string) || null,
    dataUrl: meta.dataUrl as string | undefined,
    isImg: meta.isImg as boolean | undefined,
    isPdf: (meta.isPdf as boolean | undefined) ?? (Boolean(base.nome?.toLowerCase().endsWith('.pdf')) || base.tipo === 'application/pdf'),
    tamanho: meta.tamanho as number | undefined,
  };
}

export async function listarDocumentos(pacienteId: string): Promise<DocumentoPacienteUI[]> {
  const modo = await modoDados();
  if (modo === 'local') {
    const linhas = await listar<Record<string, unknown>>('paciente_documentos', {
      filtros: [{ col: 'paciente_id', op: 'eq', valor: pacienteId }],
      ordem: [{ col: 'criado_em', asc: false }],
    });
    return linhas.map(rowToDocumentoUI);
  }

  const { data, error } = await tabelas.from('paciente_documentos')
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
  const payload = {
    paciente_id: pacienteId,
    legacy_id: Date.now().toString(),
    nome: input.nome,
    tipo: input.tipo || null,
    storage_path: input.storage_path || null,
    meta: input.meta || {},
  };

  const modo = await modoDados();
  if (modo === 'local') {
    const salvo = await inserir<Record<string, unknown>>('paciente_documentos', payload);
    return rowToDocumentoUI(salvo);
  }

  const { data, error } = await tabelas.from('paciente_documentos')
    .insert(payload)
    .select('*')
    .single();

  if (error) throw error;
  return rowToDocumentoUI(data);
}

export async function excluirDocumento(id: string): Promise<{ storage_path: string | null }> {
  const modo = await modoDados();
  if (modo === 'local') {
    const linhas = await listar<Record<string, unknown>>('paciente_documentos', {
      filtros: [{ col: 'id', op: 'eq', valor: id }],
      limite: 1,
    });
    await remover('paciente_documentos', id);
    return { storage_path: (linhas[0]?.storage_path as string) || null };
  }

  const { data, error } = await tabelas.from('paciente_documentos')
    .delete()
    .eq('id', id)
    .select('storage_path')
    .maybeSingle();

  if (error) throw error;
  return { storage_path: (data?.storage_path as string) || null };
}
