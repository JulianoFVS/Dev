import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ehCaminhoPublico, urlProxyPublica } from '@/lib/caminhosArquivo';

export function r2Configurado() {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

export function bucketPublico() {
  return process.env.R2_BUCKET_PUBLICO || 'ortus-publico';
}

export function bucketPrivado() {
  return process.env.R2_BUCKET_PRIVADO || 'ortus-privado';
}

export function bucketDe(caminho: string) {
  return ehCaminhoPublico(caminho) ? bucketPublico() : bucketPrivado();
}

let cliente: S3Client | null = null;

export function clienteR2() {
  if (!r2Configurado()) throw new Error('Cloudflare R2 não está configurado.');
  if (!cliente) {
    cliente = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
  return cliente;
}

export function urlPublicaR2(caminho: string) {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');
  if (!base) return urlProxyPublica(caminho);
  return `${base}/${caminho.split('/').map(encodeURIComponent).join('/')}`;
}

export function objetoAusente(err: unknown) {
  const nome = (err as { name?: string })?.name;
  return nome === 'NotFound' || nome === 'NoSuchKey';
}

/**
 * Link de envio de 60 s amarrado ao tamanho e ao tipo declarados:
 * o R2 recusa o PUT se o arquivo enviado tiver outro tamanho ou tipo.
 */
export async function urlDeEnvio(caminho: string, contentType: string, tamanho: number) {
  return getSignedUrl(clienteR2(), new PutObjectCommand({
    Bucket: bucketDe(caminho),
    Key: caminho,
    ContentType: contentType,
    ContentLength: tamanho,
  }), {
    expiresIn: 60,
    signableHeaders: new Set(['content-type', 'content-length']),
  });
}

export async function tamanhoNoR2(caminho: string) {
  try {
    const head = await clienteR2().send(new HeadObjectCommand({ Bucket: bucketDe(caminho), Key: caminho }));
    return Number(head.ContentLength || 0);
  } catch (err) {
    if (objetoAusente(err)) return 0;
    throw err;
  }
}

export async function lerDoR2(caminho: string) {
  try {
    const obj = await clienteR2().send(new GetObjectCommand({ Bucket: bucketDe(caminho), Key: caminho }));
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) return null;
    return { bytes, contentType: obj.ContentType || 'application/octet-stream' };
  } catch (err) {
    if (objetoAusente(err)) return null;
    throw err;
  }
}

export async function apagarDoR2(caminho: string) {
  try {
    await clienteR2().send(new DeleteObjectCommand({ Bucket: bucketDe(caminho), Key: caminho }));
  } catch (err) {
    if (!objetoAusente(err)) throw err;
  }
}
