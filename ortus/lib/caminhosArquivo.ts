import { conteudoConfere } from '@/lib/assinaturaArquivo';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// Sem a flag i: a chave no R2 diferencia maiúsculas, e 'Avatar.JPG' viraria outro objeto, fora da cota.
export const CAMINHO_PACIENTE = new RegExp(`^pacientes/(${UUID})/(avatar\\.jpg|hof/[\\w.\\-]{1,140}\\.jpg|documentos/[\\w.\\-]{1,160})$`);
export const CAMINHO_CLINICA = /^clinicas\/(\d{1,12})\/logo-\d{1,16}\.(png|jpe?g|webp)$/;
export const CAMINHO_AVATAR = new RegExp(`^avatares/(${UUID})/avatar\\.jpg$`);
/** Foto de perfil do tempo do bucket `avatars`. Só leitura: nenhum envio, cota ou exclusão aceita este formato. */
const CAMINHO_AVATAR_ANTIGO = /^avatares\/[\w.\-]{1,120}\.(png|jpe?g|webp)$/i;
export const CAMINHO_FOTO_PACIENTE = new RegExp(`^pacientes/${UUID}/avatar\\.jpg$`);

const MB = 1024 * 1024;

const IMAGENS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCUMENTOS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

export function caminhoSeguro(caminho: string) {
  if (!caminho || caminho.length > 300 || caminho.includes('\\') || caminho.includes('\0')) return false;
  return caminho.split('/').every((parte) => parte !== '' && parte !== '.' && parte !== '..');
}

/**
 * Só foto de perfil do profissional e logo da clínica abrem sem login.
 * Foto de paciente, documento e foto de HOF ficam no bucket privado e passam pela rota autenticada.
 */
export function ehCaminhoPublico(caminho: string) {
  if (!caminhoSeguro(caminho)) return false;
  return CAMINHO_AVATAR.test(caminho)
    || CAMINHO_AVATAR_ANTIGO.test(caminho)
    || CAMINHO_CLINICA.test(caminho);
}

/** Caminho da foto de perfil do paciente, ou null se o id não for um UUID. */
export function caminhoFotoPaciente(pacienteId: string) {
  const caminho = `pacientes/${pacienteId}/avatar.jpg`;
  return CAMINHO_FOTO_PACIENTE.test(caminho) ? caminho : null;
}

export function ehCaminhoClinica(caminho: string) {
  return caminhoSeguro(caminho) && (CAMINHO_PACIENTE.test(caminho) || CAMINHO_CLINICA.test(caminho));
}

/** Tipo aceito e tamanho máximo de cada tipo de arquivo. null = caminho não aceito. */
export function regraDoCaminho(caminho: string): { tipos: Set<string>; maximo: number } | null {
  if (!caminhoSeguro(caminho)) return null;
  if (CAMINHO_AVATAR.test(caminho) || CAMINHO_FOTO_PACIENTE.test(caminho)) return { tipos: new Set(['image/jpeg']), maximo: 1 * MB };
  if (CAMINHO_CLINICA.test(caminho)) return { tipos: IMAGENS, maximo: 2 * MB };
  const paciente = caminho.match(CAMINHO_PACIENTE);
  if (!paciente) return null;
  if (paciente[2].startsWith('hof/')) return { tipos: new Set(['image/jpeg']), maximo: 5 * MB };
  return { tipos: DOCUMENTOS, maximo: 10 * MB };
}

/** Só devolve ao navegador tipos que não executam script na origem do Ortus. */
export function tipoSeguroParaServir(caminho: string, tipo: string) {
  const limpo = (tipo || '').split(';')[0].trim().toLowerCase();
  if (ehCaminhoPublico(caminho)) return IMAGENS.has(limpo) ? limpo : null;
  return DOCUMENTOS.has(limpo) ? limpo : 'application/octet-stream';
}

/** Tira o caminho interno de uma URL antiga do Supabase, do proxy ou do R2. */
export function extrairCaminhoArquivo(url?: string | null, storagePath?: string | null): string | null {
  if (storagePath && !storagePath.startsWith('http') && !storagePath.startsWith('blob:') && !storagePath.startsWith('/api/')) {
    return storagePath.split('?')[0];
  }
  const alvo = storagePath && (storagePath.startsWith('http') || storagePath.startsWith('/api/')) ? storagePath : url;
  if (!alvo || alvo.startsWith('blob:')) return null;
  const marcas = ['/object/public/arquivos_ortus/', '/arquivos_ortus/', '/object/public/avatars/', '/avatars/', '/api/public/midia/'];
  for (const marca of marcas) {
    const i = alvo.indexOf(marca);
    if (i < 0) continue;
    const resto = decodeURIComponent(alvo.slice(i + marca.length).split('?')[0]);
    if (marca.includes('avatars')) return `avatares/${resto}`;
    return resto;
  }
  if (alvo.startsWith('pacientes/') || alvo.startsWith('clinicas/') || alvo.startsWith('avatares/')) {
    return alvo.split('?')[0];
  }
  return null;
}

export function urlProxyPublica(caminho: string) {
  return `/api/public/midia/${caminho.split('/').map(encodeURIComponent).join('/')}`;
}

export type VistaDocumento = 'imagem' | 'pdf' | 'baixar';

/**
 * Como a ficha mostra um arquivo, pelo tipo que o próprio Ortus deu ao Blob
 * (nunca pelo `tipo`, `isPdf` ou `isImg` da linha do banco). Só PDF vai para
 * iframe; imagem vai para <img>; o resto só baixa.
 */
export function vistaDoDocumento(tipo: string): VistaDocumento {
  const limpo = (tipo || '').split(';')[0].trim().toLowerCase();
  if (limpo === 'application/pdf') return 'pdf';
  if (IMAGENS.has(limpo) || limpo === 'image/gif') return 'imagem';
  return 'baixar';
}

const DATA_URL_IMAGEM = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
/** Base64 de 10 MB, o limite de documento. */
const MAXIMO_DATA_URL = 14_000_000;

export type ImagemLegada = { bytes: Uint8Array<ArrayBuffer>; tipo: string };

/**
 * Documento antigo guardado como data URL. Vale só JPEG, PNG ou WebP cujos
 * bytes confirmam o tipo, e o tipo sai daqui: um data:text/html virando Blob
 * e aberto em iframe rodaria script na origem do Ortus.
 */
export function imagemDeDataUrlLegado(valor: unknown): ImagemLegada | null {
  if (typeof valor !== 'string' || valor.length > MAXIMO_DATA_URL) return null;
  const partes = valor.match(DATA_URL_IMAGEM);
  if (!partes) return null;
  let binario = '';
  try {
    binario = atob(partes[2]);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  const tipo = `image/${partes[1]}`;
  return conteudoConfere(bytes, tipo) ? { bytes, tipo } : null;
}

/**
 * De onde sai o arquivo de um documento da ficha. A linha é gravada por
 * qualquer membro da clínica, então só valem o caminho interno (a rota
 * autenticada confere a clínica e devolve tipo seguro) e o data URL antigo de
 * imagem. URL externa, blob: e data: de outro tipo não abrem.
 */
export function origemDoDocumento(
  d: { storagePath?: unknown; storage_path?: unknown; dataUrl?: unknown } | null | undefined,
): { caminho: string } | { imagem: ImagemLegada } | null {
  const bruto = [d?.storagePath, d?.storage_path].find((valor): valor is string => typeof valor === 'string' && valor !== '');
  const caminho = bruto ? extrairCaminhoArquivo(null, bruto) : null;
  if (caminho && ehCaminhoClinica(caminho)) return { caminho };
  const imagem = imagemDeDataUrlLegado(d?.dataUrl);
  return imagem ? { imagem } : null;
}
