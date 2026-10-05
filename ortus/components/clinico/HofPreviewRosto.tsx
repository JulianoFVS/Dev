'use client';

import { useEffect, useRef, useState } from 'react';
import { amostraDepois, prepararEfeitos, type MarcacaoPreview } from '@/lib/hofPreview';

type Props = {
  src: string;
  marks: MarcacaoPreview[];
};

function lerPixel(dados: Uint8ClampedArray, largura: number, altura: number, x: number, y: number) {
  const x0 = Math.max(0, Math.min(largura - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(altura - 1, Math.floor(y)));
  const x1 = Math.min(largura - 1, x0 + 1);
  const y1 = Math.min(altura - 1, y0 + 1);
  const fx = limitar01(x - x0);
  const fy = limitar01(y - y0);
  const i00 = (y0 * largura + x0) * 4;
  const i10 = (y0 * largura + x1) * 4;
  const i01 = (y1 * largura + x0) * 4;
  const i11 = (y1 * largura + x1) * 4;
  const pixel = [0, 0, 0, 255];
  for (let c = 0; c < 3; c++) {
    const a = dados[i00 + c] * (1 - fx) + dados[i10 + c] * fx;
    const b = dados[i01 + c] * (1 - fx) + dados[i11 + c] * fx;
    pixel[c] = a * (1 - fy) + b * fy;
  }
  return pixel;
}

function limitar01(valor: number) {
  return Math.min(1, Math.max(0, valor));
}

function desenharCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, largura: number, altura: number) {
  const escala = Math.max(largura / img.width, altura / img.height);
  const dw = img.width * escala;
  const dh = img.height * escala;
  ctx.drawImage(img, (largura - dw) / 2, (altura - dh) / 2, dw, dh);
}

export default function HofPreviewRosto({ src, marks }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const [depois, setDepois] = useState(true);
  const chave = marks.map((m) => `${m.x.toFixed(2)}:${m.y.toFixed(2)}:${m.tipo}:${m.dosagem || ''}`).join('|');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const marksAtuais = marksRef.current;
    let cancelado = false;
    const img = new Image();
    if (src.startsWith('http')) img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelado) return;
      const caixa = canvas.getBoundingClientRect();
      const larguraCss = Math.max(2, Math.round(caixa.width || canvas.clientWidth || 360));
      const alturaCss = Math.max(2, Math.round(caixa.height || canvas.clientHeight || Math.round(larguraCss * 4 / 3)));
      const escala = Math.min(1, 520 / larguraCss);
      const largura = Math.round(larguraCss * escala);
      const altura = Math.round(alturaCss * escala);
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.clearRect(0, 0, largura, altura);
      desenharCover(ctx, img, largura, altura);
      if (!depois || marksAtuais.length === 0) return;

      const origem = ctx.getImageData(0, 0, largura, altura);
      const saida = ctx.createImageData(largura, altura);
      const efeitos = prepararEfeitos(marksAtuais, largura, altura);
      const dados = origem.data;
      const destino = saida.data;

      for (let y = 0; y < altura; y++) {
        for (let x = 0; x < largura; x++) {
          const amostra = amostraDepois(x, y, efeitos, largura, altura);
          const i = (y * largura + x) * 4;
          if (amostra.suave > 0.08) {
            const espalha = 0.8 + amostra.suave * 2.4;
            const taps = [[0, 0, 1], [espalha, 0, 0.45], [-espalha, 0, 0.45], [0, espalha, 0.45], [0, -espalha, 0.45]];
            let peso = 0;
            let r = 0;
            let g = 0;
            let b = 0;
            for (const [dx, dy, p] of taps) {
              const pixel = lerPixel(dados, largura, altura, amostra.x + dx, amostra.y + dy);
              r += pixel[0] * p;
              g += pixel[1] * p;
              b += pixel[2] * p;
              peso += p;
            }
            destino[i] = r / peso;
            destino[i + 1] = g / peso;
            destino[i + 2] = b / peso;
          } else {
            const pixel = lerPixel(dados, largura, altura, amostra.x, amostra.y);
            destino[i] = pixel[0];
            destino[i + 1] = pixel[1];
            destino[i + 2] = pixel[2];
          }
          destino[i + 3] = 255;
        }
      }
      ctx.putImageData(saida, 0, 0);
    };
    img.src = src;
    return () => {
      cancelado = true;
    };
  }, [src, chave, depois]);

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="absolute left-2 top-2 flex overflow-hidden rounded-md border border-neutral-200 bg-white">
        <button type="button" onClick={() => setDepois(false)} className={`h-7 px-2.5 text-[11px] font-medium ${depois ? 'text-neutral-600' : 'bg-neutral-900 text-white'}`}>Antes</button>
        <button type="button" onClick={() => setDepois(true)} className={`h-7 border-l border-neutral-200 px-2.5 text-[11px] font-medium ${depois ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>Depois</button>
      </div>
      <p className="pointer-events-none absolute inset-x-2 bottom-2 text-center text-[10px] font-medium text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.75)' }}>
        {marks.length === 0 ? 'Marque um procedimento no mapa para ilustrar.' : 'Ilustração. Não é o resultado clínico.'}
      </p>
    </div>
  );
}
