'use client';

import { useEffect, useRef, useState } from 'react';
import { renderizarDepois, type MarcacaoPreview, type Referencia } from '@/lib/hofPreview';

type Props = {
  src: string;
  marks: MarcacaoPreview[];
  referencia?: Referencia;
};

function desenharCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, largura: number, altura: number) {
  const escala = Math.max(largura / img.width, altura / img.height);
  const dw = img.width * escala;
  const dh = img.height * escala;
  ctx.drawImage(img, (largura - dw) / 2, (altura - dh) / 2, dw, dh);
}

export default function HofPreviewRosto({ src, marks, referencia = 'feminina' }: Props) {
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
      const escala = Math.min(1, 560 / larguraCss);
      const largura = Math.round(larguraCss * escala);
      const altura = Math.round(alturaCss * escala);
      canvas.width = largura;
      canvas.height = altura;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.clearRect(0, 0, largura, altura);
      desenharCover(ctx, img, largura, altura);
      if (!depois || marksAtuais.length === 0) return;
      ctx.putImageData(renderizarDepois(ctx.getImageData(0, 0, largura, altura), marksAtuais, referencia), 0, 0);
    };
    img.src = src;
    return () => {
      cancelado = true;
    };
  }, [src, chave, depois, referencia]);

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
