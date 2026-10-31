import { supabase } from '@/lib/supabase';

export const BUCKET_ARQUIVOS = 'arquivos_ortus';
export const EVENTO_ARMAZENAMENTO = 'ortus:armazenamento';

export type UsoArmazenamento = { clinicaId: string; nome: string; usado: number; limite: number };

async function cabecalhos() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.access_token || ''}`,
  };
}

/**
 * Envia um arquivo da clínica (pacientes/<id>/... ou clinicas/<id>/...).
 * O envio direto ao bucket é bloqueado: a API confere o limite da clínica e devolve um link assinado.
 */
export async function enviarArquivoClinica(
  caminho: string,
  arquivo: Blob,
  opcoes: { contentType?: string; upsert?: boolean; cacheControl?: string } = {},
): Promise<void> {
  const resposta = await fetch('/api/armazenamento', {
    method: 'POST',
    headers: await cabecalhos(),
    body: JSON.stringify({ caminho, tamanho: arquivo.size, upsert: opcoes.upsert === true }),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível enviar o arquivo.');

  const { error } = await supabase.storage
    .from(BUCKET_ARQUIVOS)
    .uploadToSignedUrl(dados.caminho, dados.token, arquivo, {
      contentType: opcoes.contentType || arquivo.type || 'application/octet-stream',
      cacheControl: opcoes.cacheControl,
      upsert: opcoes.upsert === true,
    });
  if (error) throw new Error(error.message);

  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_ARMAZENAMENTO));
}

export async function apagarArquivosClinica(caminhos: string[]) {
  if (!caminhos.length) return;
  await supabase.storage.from(BUCKET_ARQUIVOS).remove(caminhos);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_ARMAZENAMENTO));
}

export async function carregarUsoArmazenamento(clinicaId?: string | null): Promise<UsoArmazenamento[]> {
  const consulta = clinicaId ? `?clinicaId=${encodeURIComponent(clinicaId)}` : '';
  const resposta = await fetch(`/api/armazenamento${consulta}`, { headers: await cabecalhos(), cache: 'no-store' });
  const dados = await resposta.json().catch(() => []);
  if (!resposta.ok) throw new Error((dados as { erro?: string }).erro || 'Não foi possível medir o armazenamento.');
  return Array.isArray(dados) ? dados : [];
}

export function formatarBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace('.', ',')} GB`;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}
