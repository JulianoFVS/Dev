const TIPOS_ACEITOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const LIMITE_ORIGINAL_BYTES = 8 * 1024 * 1024;
const LADO_MAXIMO = 512;
const ALVO_BYTES = 160 * 1024;
const TETO_BYTES = 400 * 1024;

function canvasParaJpeg(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao comprimir a foto.'))),
      'image/jpeg',
      qualidade,
    );
  });
}

/** Recorta o centro, reduz para no máximo 512px e entrega um JPEG leve, sem EXIF. */
export async function prepararFotoPaciente(file: File): Promise<Blob> {
  if (!TIPOS_ACEITOS.has(file.type)) {
    throw new Error('Use uma foto JPG, PNG ou WebP.');
  }
  if (file.size <= 0) throw new Error('O arquivo da foto está vazio.');
  if (file.size > LIMITE_ORIGINAL_BYTES) throw new Error('A foto original passa de 8 MB.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Não foi possível ler essa foto.');
  }

  try {
    const lado = Math.min(bitmap.width, bitmap.height);
    if (lado < 32) throw new Error('A foto é pequena demais.');
    const origemX = Math.floor((bitmap.width - lado) / 2);
    const origemY = Math.floor((bitmap.height - lado) / 2);
    const saida = Math.min(LADO_MAXIMO, lado);

    const canvas = document.createElement('canvas');
    canvas.width = saida;
    canvas.height = saida;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível processar a foto.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, origemX, origemY, lado, lado, 0, 0, saida, saida);

    let qualidade = 0.82;
    let blob = await canvasParaJpeg(canvas, qualidade);
    while (blob.size > ALVO_BYTES && qualidade > 0.55) {
      qualidade = Math.round((qualidade - 0.08) * 100) / 100;
      blob = await canvasParaJpeg(canvas, qualidade);
    }
    if (blob.size > TETO_BYTES) throw new Error('Não foi possível comprimir a foto o suficiente.');
    return blob;
  } finally {
    bitmap.close();
  }
}
