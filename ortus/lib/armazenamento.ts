import { supabase } from '@/lib/supabase';
import { extrairCaminhoArquivo, urlProxyPublica } from '@/lib/caminhosArquivo';

export { extrairCaminhoArquivo };
export const BUCKET_ARQUIVOS = 'arquivos_ortus';
export const EVENTO_ARMAZENAMENTO = 'ortus:armazenamento';

export type UsoArmazenamento = { clinicaId: string; nome: string; usado: number; limite: number };
export type ResumoArmazenamento = { clinicas: UsoArmazenamento[]; total: number; teto: number };

async function cabecalhos() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.access_token || ''}`,
  };
}

function disparar() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_ARMAZENAMENTO));
}

function comVersao(url: string) {
  return `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
}

async function pedir(body: unknown) {
  const resposta = await fetch('/api/armazenamento', {
    method: 'POST',
    headers: await cabecalhos(),
    body: JSON.stringify(body),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível enviar o arquivo.');
  return dados as { modo?: string; url?: string; caminho?: string; token?: string; urlPublica?: string | null; erro?: string };
}

async function enviarParaR2(dados: { url?: string }, arquivo: Blob, contentType: string, caminho: string) {
  const envio = await fetch(dados.url || '', {
    method: 'PUT',
    body: arquivo,
    headers: { 'Content-Type': contentType },
  });
  if (!envio.ok) throw new Error('Não foi possível enviar o arquivo.');
  const confirmado = await pedir({ acao: 'confirmar', caminho, tamanho: arquivo.size });
  disparar();
  return confirmado.urlPublica ? comVersao(confirmado.urlPublica) : null;
}

/**
 * Envia um arquivo da clínica (pacientes/<id>/... ou clinicas/<id>/...).
 * Devolve a URL pública quando o arquivo é foto ou logo. Documento devolve null.
 */
export async function enviarArquivoClinica(
  caminho: string,
  arquivo: Blob,
  opcoes: { contentType?: string; upsert?: boolean; cacheControl?: string } = {},
): Promise<string | null> {
  const contentType = (opcoes.contentType || arquivo.type || 'application/octet-stream').toLowerCase();
  const dados = await pedir({ caminho, tamanho: arquivo.size, upsert: opcoes.upsert === true, contentType });
  if (dados.modo === 'r2') return enviarParaR2(dados, arquivo, contentType, caminho);

  const { error } = await supabase.storage.from(BUCKET_ARQUIVOS).uploadToSignedUrl(dados.caminho || caminho, dados.token || '', arquivo, {
    contentType,
    cacheControl: opcoes.cacheControl,
    upsert: opcoes.upsert === true,
  });
  if (error) throw new Error(error.message);
  disparar();
  return dados.urlPublica ? comVersao(dados.urlPublica) : null;
}

/** Foto de perfil da pessoa logada. Não entra na cota da clínica. */
export async function enviarAvatarPerfil(userId: string, arquivo: Blob): Promise<string> {
  const contentType = 'image/jpeg';
  const caminho = `avatares/${userId}/avatar.jpg`;
  const dados = await pedir({ caminho, tamanho: arquivo.size, upsert: true, contentType });
  if (dados.modo === 'r2') {
    const url = await enviarParaR2(dados, arquivo, contentType, caminho);
    if (!url) throw new Error('Não foi possível publicar a foto.');
    return url;
  }
  const { error } = await supabase.storage.from('avatars').upload(`${userId}/avatar.jpg`, arquivo, {
    upsert: true,
    contentType,
  });
  if (error) throw new Error(error.message);
  return comVersao(dados.urlPublica || urlProxyPublica(caminho));
}

export async function apagarArquivosClinica(caminhos: string[]) {
  if (!caminhos.length) return;
  const resposta = await fetch('/api/armazenamento', {
    method: 'POST',
    headers: await cabecalhos(),
    body: JSON.stringify({ acao: 'apagar', caminhos }),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível apagar o arquivo.');
  disparar();
}

export async function baixarArquivoClinica(caminho: string): Promise<Blob> {
  const { Authorization } = await cabecalhos();
  const resposta = await fetch(`/api/armazenamento/arquivo?caminho=${encodeURIComponent(caminho)}`, {
    headers: { Authorization },
  });
  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => ({}));
    throw new Error((dados as { erro?: string }).erro || 'Arquivo indisponível.');
  }
  return resposta.blob();
}

export async function carregarUsoArmazenamento(clinicaId?: string | null): Promise<ResumoArmazenamento> {
  const consulta = clinicaId ? `?clinicaId=${encodeURIComponent(clinicaId)}` : '';
  const resposta = await fetch(`/api/armazenamento${consulta}`, { headers: await cabecalhos(), cache: 'no-store' });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error((dados as { erro?: string }).erro || 'Não foi possível medir o armazenamento.');
  const corpo = dados as { clinicas?: UsoArmazenamento[]; total?: number; teto?: number };
  return {
    clinicas: Array.isArray(corpo.clinicas) ? corpo.clinicas : [],
    total: Number(corpo.total) || 0,
    teto: Number(corpo.teto) || 9_500_000_000,
  };
}

export function formatarBytesDecimais(bytes: number) {
  const gb = bytes / 1_000_000_000;
  if (gb >= 1) return `${gb.toFixed(1).replace('.', ',')} GB`;
  const mb = bytes / 1_000_000;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}

export function formatarBytes(bytes: number) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1).replace('.', ',')} GB`;
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1).replace('.', ',')} MB`;
}
