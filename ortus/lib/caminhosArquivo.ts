const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export const CAMINHO_PACIENTE = new RegExp(`^pacientes/(${UUID})/(avatar\\.jpg|hof/[\\w.\\-]{1,140}\\.jpg|documentos/[\\w.\\-]{1,160})$`, 'i');
export const CAMINHO_CLINICA = /^clinicas\/(\d{1,12})\/logo-\d{1,16}\.(png|jpe?g|webp)$/i;
export const CAMINHO_AVATAR = new RegExp(`^avatares/(${UUID})/avatar\\.jpg$`, 'i');
const CAMINHO_AVATAR_ANTIGO = /^avatares\/[\w.\-]{1,120}\.(png|jpe?g|webp)$/i;
const CAMINHO_FOTO_PACIENTE = new RegExp(`^pacientes/${UUID}/avatar\\.jpg$`, 'i');

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
  'application/octet-stream',
]);

export function caminhoSeguro(caminho: string) {
  if (!caminho || caminho.length > 300 || caminho.includes('\\') || caminho.includes('\0')) return false;
  return caminho.split('/').every((parte) => parte !== '' && parte !== '.' && parte !== '..');
}

/** Foto de perfil, logo e foto de paciente podem aparecer em <img>. Documento e foto de HOF não. */
export function ehCaminhoPublico(caminho: string) {
  if (!caminhoSeguro(caminho)) return false;
  return CAMINHO_AVATAR.test(caminho)
    || CAMINHO_AVATAR_ANTIGO.test(caminho)
    || CAMINHO_CLINICA.test(caminho)
    || CAMINHO_FOTO_PACIENTE.test(caminho);
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
