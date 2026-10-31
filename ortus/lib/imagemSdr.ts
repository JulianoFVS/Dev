'use client';

import { useEffect, useState } from 'react';

const LADO_MAXIMO = 512;
const prontas = new Map<string, string>();
const pendentes = new Map<string, Promise<string>>();

function canvasParaBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao converter a foto.'))), 'image/jpeg', 0.88);
  });
}

async function converter(url: string): Promise<string> {
  const resposta = await fetch(url, { mode: 'cors' });
  if (!resposta.ok) throw new Error('Foto indisponível.');
  const bitmap = await createImageBitmap(await resposta.blob(), { imageOrientation: 'from-image' });
  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return URL.createObjectURL(await canvasParaBlob(canvas));
  } finally {
    bitmap.close();
  }
}

function obter(url: string): Promise<string> {
  const pronta = prontas.get(url);
  if (pronta) return Promise.resolve(pronta);
  let pendente = pendentes.get(url);
  if (!pendente) {
    pendente = converter(url)
      .then((sdr) => {
        prontas.set(url, sdr);
        return sdr;
      })
      .finally(() => pendentes.delete(url));
    pendentes.set(url, pendente);
  }
  return pendente;
}

/**
 * Fotos Ultra HDR tiradas no celular sobem o brilho da tela e escurecem o resto da página.
 * Devolve uma cópia redesenhada em canvas, que sai sempre sem HDR.
 * Enquanto converte, devolve null; se a conversão falhar, devolve a URL original.
 */
export function useImagemSdr(url: string | null | undefined): string | null {
  const [sdr, setSdr] = useState<string | null>(() => (url ? prontas.get(url) ?? null : null));

  useEffect(() => {
    if (!url) {
      setSdr(null);
      return;
    }
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      setSdr(url);
      return;
    }
    let cancelado = false;
    setSdr(prontas.get(url) ?? null);
    obter(url)
      .then((pronta) => { if (!cancelado) setSdr(pronta); })
      .catch(() => { if (!cancelado) setSdr(url); });
    return () => { cancelado = true; };
  }, [url]);

  return sdr;
}
