'use client';

import Link from 'next/link';
import { ArrowLeft, MousePointerClick, RotateCcw } from 'lucide-react';
import OdontogramaContainer from '@/components/OdontogramaContainer';

export default function Teste3DPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-blue-600 mb-2"
            >
              <ArrowLeft size={14} />
              Voltar
            </Link>
            <h1 className="text-xl font-black text-slate-800">Teste — Arcada 3D</h1>
            <p className="text-sm text-slate-500">Clique nos dentes para selecionar (amarelo). Arraste para rotacionar.</p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
            Dev only
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <OdontogramaContainer />

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-3">
            <MousePointerClick className="text-blue-600 shrink-0" size={20} />
            <div>
              <p className="text-sm font-bold text-slate-800">Seleção</p>
              <p className="text-xs text-slate-500 mt-1">
                Clique em um dente para marcar em amarelo. Clique de novo para desmarcar.
              </p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-3">
            <RotateCcw className="text-blue-600 shrink-0" size={20} />
            <div>
              <p className="text-sm font-bold text-slate-800">Navegação</p>
              <p className="text-xs text-slate-500 mt-1">
                Arraste para girar. Scroll para zoom (3× a 15×).
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center">
          Modelo: <code className="bg-slate-100 px-1 rounded">public/arcada.glb</code>
        </p>
      </main>
    </div>
  );
}
