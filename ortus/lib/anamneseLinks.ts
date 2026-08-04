import { createHash, randomBytes } from 'crypto';

export function gerarTokenAnamnese(): string {
  return randomBytes(32).toString('base64url');
}

export function hashTokenAnamnese(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
