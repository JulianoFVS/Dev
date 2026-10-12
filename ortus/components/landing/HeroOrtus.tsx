'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ListaPatrocinadores } from './MarcasCarrossel';
import LandingDashboardPreview from './LandingDashboardPreview';
import LandingPreviewScale from './LandingPreviewScale';

const PATH_COUNTS = 13;
const PATH_POINTS = 15;
const STROKE_WIDTH = 2;
const STROKE_COLOR = '#c8f053';
const FILL_COLOR = '#ffffff';
const SPEED = 0.55;
const OFFSET = 7;
const DELAY = 0.9;
const FREQUENCY = [0, -30, 50, -50, -35, 35, 0, -30, 50, -50, -35, 35, -30, 50, -50, -35, 35];

type Point = { x: number; y: number };

function crestPoints(layer: number, width: number, horizon: number, time: number): Point[] {
  const points: Point[] = [];
  const span = width * 0.9;

  for (let s = 0; s < PATH_POINTS; s++) {
    const direction = s % 2 ? -1 : 1;
    const amplitude = FREQUENCY[s] * direction + layer * OFFSET * direction;
    const y = horizon + Math.sin((time + s * DELAY) * SPEED) * amplitude;
    const x = (span / (PATH_POINTS - 1)) * s;
    points.push({ x, y });
  }

  const exitY = points[points.length - 1].y;
  const entryY = points[0].y;
  points[0] = { x: -80, y: entryY };
  points.push({ x: width * 0.95, y: exitY });
  points.push({ x: width + 80, y: exitY });
  return points;
}

function curveThrough(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 2; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }
  const penultimate = points[points.length - 2];
  const last = points[points.length - 1];
  ctx.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y);
}

function drawWaves(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const horizon = height * 0.46;
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = STROKE_COLOR;

  for (let layer = 0; layer < PATH_COUNTS; layer++) {
    const points = crestPoints(layer, width, horizon, time);
    if (layer === 0) {
      curveThrough(ctx, points);
      ctx.lineTo(width + 80, height + 4);
      ctx.lineTo(-80, height + 4);
      ctx.closePath();
      ctx.fillStyle = FILL_COLOR;
      ctx.fill();
    }
    curveThrough(ctx, points);
    ctx.stroke();
  }
}

export default function HeroOrtus() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let frame = 0;

    const paint = (now: number) => {
      const rect = section.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bitmapWidth = Math.max(1, Math.floor(width * dpr));
      const bitmapHeight = Math.max(1, Math.floor(height * dpr));
      if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
        canvas.width = bitmapWidth;
        canvas.height = bitmapHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawWaves(ctx, width, height, reduce ? 1.2 : (now - start) / 1000);
      if (!reduce) frame = requestAnimationFrame(paint);
    };

    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <section className="relative bg-white">
      <div
        ref={sectionRef}
        className="relative h-[100dvh] w-full overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a2219 0%, #4e604c 46%, #dfe5df 100%)' }}
      >
        <h1 className="pointer-events-none absolute left-1/2 top-[42%] z-[1] -translate-x-1/2 -translate-y-[65%] select-none font-poppins text-[30vw] font-bold leading-none tracking-[-0.045em] text-white">
          ortus
        </h1>
        <canvas ref={canvasRef} className="absolute inset-0 z-[2] h-full w-full" aria-hidden />
        <div className="absolute inset-x-0 top-[50%] bottom-[30vh] z-[3] flex items-center justify-center px-5 text-center">
          <div>
            <h2 className="font-poppins text-[18px] font-extrabold leading-[1.12] tracking-[-0.03em] text-neutral-900 md:text-[clamp(20px,2.4vw,32px)] md:leading-[1.08]">
              Gestão inteligente para
              <br />
              <span className="ortus-shine">odontologia</span>
            </h2>
            <Link
              href="/cadastro"
              className="mt-3.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-900 px-3.5 font-poppins text-[12px] font-semibold text-white transition-colors hover:bg-neutral-800 md:mt-4 md:h-9 md:px-5 md:text-[13px]"
            >
              Comece já
              <ArrowRight className="h-[1.05em] w-[1.05em]" strokeWidth={2.4} />
            </Link>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-[100dvh] z-[5] hidden -translate-y-[calc(100%+1.25rem)] px-6 md:flex md:items-end md:justify-between">
        <ListaPatrocinadores align="start" />
        <ListaPatrocinadores align="end" />
      </div>

      <div className="relative z-[4] -mt-[28vh] mx-auto w-full max-w-[640px] px-5 pb-16 md:px-8 md:pb-24">
        <div className="group/preview overflow-hidden rounded-[1.75rem] shadow-[0_18px_50px_rgba(26,34,25,0.12)] md:rounded-[2.25rem]">
          <div className="transition-transform duration-500 ease-out md:group-hover/preview:-translate-y-1">
            <LandingPreviewScale>
              <LandingDashboardPreview />
            </LandingPreviewScale>
          </div>
        </div>
      </div>
    </section>
  );
}
