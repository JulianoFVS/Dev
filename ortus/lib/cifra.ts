import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Cifra de segredos guardados no banco (credenciais das Integrações,
 * refresh token do Google): AES-256-GCM com a chave ORTUS_CHAVE_CIFRA do
 * servidor. O banco nunca vê o texto aberto, e um dump do banco sozinho não
 * abre nada.
 *
 * Formato: "v1:" + base64(iv 12 bytes | tag 16 bytes | texto cifrado).
 * A chave pode ser qualquer texto longo: vale o SHA-256 dela.
 */
export class SemChaveDeCifra extends Error {
  constructor() {
    super('O servidor está sem ORTUS_CHAVE_CIFRA: defina a variável (ex.: openssl rand -hex 32) e reinicie o site.');
  }
}

function chave(): Buffer {
  const bruta = (process.env.ORTUS_CHAVE_CIFRA || '').trim();
  if (bruta.length < 16) throw new SemChaveDeCifra();
  return createHash('sha256').update(bruta).digest();
}

export function cifraDisponivel(): boolean {
  return (process.env.ORTUS_CHAVE_CIFRA || '').trim().length >= 16;
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(), iv);
  const corpo = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), corpo]).toString('base64')}`;
}

export function decifrar(cifrado: string): string {
  if (!cifrado.startsWith('v1:')) throw new Error('Formato de segredo desconhecido.');
  const tudo = Buffer.from(cifrado.slice(3), 'base64');
  const d = createDecipheriv('aes-256-gcm', chave(), tudo.subarray(0, 12));
  d.setAuthTag(tudo.subarray(12, 28));
  return Buffer.concat([d.update(tudo.subarray(28)), d.final()]).toString('utf8');
}
