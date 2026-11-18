/**
 * Confere os primeiros bytes do arquivo contra o tipo declarado.
 * O navegador declara o tipo que quiser; os bytes não mentem.
 */

export const BYTES_INSPECAO = 4096;

function comeca(bytes: Uint8Array, assinatura: number[], deslocamento = 0) {
  if (bytes.length < deslocamento + assinatura.length) return false;
  return assinatura.every((byte, i) => bytes[deslocamento + i] === byte);
}

function ascii(bytes: Uint8Array, texto: string, deslocamento = 0) {
  return comeca(bytes, Array.from(texto, (c) => c.charCodeAt(0)), deslocamento);
}

function ehPdf(bytes: Uint8Array) {
  const limite = Math.min(bytes.length, 1024);
  for (let i = 0; i + 5 <= limite; i += 1) {
    if (ascii(bytes, '%PDF-', i)) return true;
  }
  return false;
}

function ehTextoSeguro(bytes: Uint8Array) {
  if (bytes.includes(0)) return false;
  let texto = '';
  try {
    texto = new TextDecoder('utf-8', { fatal: false }).decode(bytes).toLowerCase();
  } catch {
    return false;
  }
  const inicio = texto.replace(/^\ufeff/, '').trimStart();
  if (/^<(!doctype|html|svg|script|\?xml)/.test(inicio)) return false;
  return !/<script|javascript:|<iframe|onerror\s*=|onload\s*=/.test(texto);
}

const VERIFICADORES: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/jpeg': (b) => comeca(b, [0xff, 0xd8, 0xff]),
  'image/png': (b) => comeca(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': (b) => ascii(b, 'RIFF') && ascii(b, 'WEBP', 8),
  'image/gif': (b) => ascii(b, 'GIF87a') || ascii(b, 'GIF89a'),
  'application/pdf': ehPdf,
  'application/msword': (b) => comeca(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  'application/vnd.ms-excel': (b) => comeca(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (b) => comeca(b, [0x50, 0x4b, 0x03, 0x04]),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (b) => comeca(b, [0x50, 0x4b, 0x03, 0x04]),
  'text/plain': ehTextoSeguro,
  'audio/ogg': (b) => ascii(b, 'OggS'),
  'audio/mpeg': (b) => ascii(b, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  'audio/mp4': (b) => ascii(b, 'ftyp', 4),
  'audio/aac': (b) => b[0] === 0xff && (b[1] & 0xf6) === 0xf0,
  'audio/wav': (b) => ascii(b, 'RIFF') && ascii(b, 'WAVE', 8),
  'audio/webm': (b) => comeca(b, [0x1a, 0x45, 0xdf, 0xa3]),
  'audio/amr': (b) => ascii(b, '#!AMR'),
  'video/mp4': (b) => ascii(b, 'ftyp', 4),
  'video/3gpp': (b) => ascii(b, 'ftyp', 4),
  'video/quicktime': (b) => ascii(b, 'ftyp', 4) || ascii(b, 'moov', 4),
  'video/webm': (b) => comeca(b, [0x1a, 0x45, 0xdf, 0xa3]),
};

const APELIDOS: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/opus': 'audio/ogg',
  'audio/x-aac': 'audio/aac',
};

export function tipoLimpo(tipo: string) {
  const limpo = (tipo || '').split(';')[0].trim().toLowerCase();
  return APELIDOS[limpo] || limpo;
}

export function tipoVerificavel(tipo: string) {
  return tipoLimpo(tipo) in VERIFICADORES;
}

/** true só quando o tipo é conhecido e os bytes batem com ele. */
export function conteudoConfere(bytes: Uint8Array, tipo: string) {
  const verificar = VERIFICADORES[tipoLimpo(tipo)];
  if (!verificar || bytes.length === 0) return false;
  return verificar(bytes.subarray(0, BYTES_INSPECAO));
}

const EXTENSOES: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'text/plain': ['txt'],
};

/** A extensão gravada no caminho precisa ser a do tipo declarado. */
export function extensaoConfere(caminho: string, tipo: string) {
  const permitidas = EXTENSOES[tipoLimpo(tipo)];
  if (!permitidas) return false;
  const ext = caminho.split('.').pop()?.toLowerCase() || '';
  return permitidas.includes(ext);
}

export function tipoPorExtensao(nome: string) {
  const ext = nome.split('.').pop()?.toLowerCase() || '';
  for (const [tipo, lista] of Object.entries(EXTENSOES)) {
    if (lista.includes(ext)) return tipo;
  }
  return '';
}

/** Decodifica só o começo de um base64 (o suficiente para conferir a assinatura). */
export function inicioDoBase64(data: string) {
  const limpo = data.replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  const trecho = limpo.slice(0, Math.ceil(BYTES_INSPECAO / 3) * 4);
  try {
    return new Uint8Array(Buffer.from(trecho, 'base64'));
  } catch {
    return new Uint8Array();
  }
}
