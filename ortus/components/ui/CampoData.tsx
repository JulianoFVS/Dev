'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function isoParaData(iso: string) {
  if (!iso) return null;
  const data = new Date(`${iso}T12:00:00`);
  return Number.isNaN(data.getTime()) ? null : data;
}

function paraIso(data: Date) {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

function rotulo(iso: string) {
  const data = isoParaData(iso);
  if (!data) return '';
  return data.toLocaleDateString('pt-BR');
}

type Props = {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  className?: string;
};

export default function CampoData({ value, onChange, disabled, className = '' }: Props) {
  const [aberto, setAberto] = useState(false);
  const selecionada = isoParaData(value);
  const [cursor, setCursor] = useState(() => selecionada || new Date());
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState<{ top?: number; bottom?: number; left: number; width: number }>({ left: 0, width: 220 });

  useEffect(() => {
    const data = isoParaData(value);
    if (data) setCursor(data);
  }, [value]);

  useLayoutEffect(() => {
    if (!aberto || !botaoRef.current) return;
    const atualizar = () => {
      const rect = botaoRef.current!.getBoundingClientRect();
      const altura = 292;
      const abaixo = window.innerHeight - rect.bottom;
      const abrirCima = abaixo < altura && rect.top > abaixo;
      setPosicao({
        left: Math.min(rect.left, window.innerWidth - 248),
        width: Math.max(rect.width, 232),
        top: abrirCima ? undefined : rect.bottom + 6,
        bottom: abrirCima ? window.innerHeight - rect.top + 6 : undefined,
      });
    };
    atualizar();
    window.addEventListener('resize', atualizar);
    window.addEventListener('scroll', atualizar, true);
    return () => {
      window.removeEventListener('resize', atualizar);
      window.removeEventListener('scroll', atualizar, true);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    function fechar(evento: MouseEvent) {
      const alvo = evento.target as Node;
      if (botaoRef.current?.contains(alvo) || painelRef.current?.contains(alvo)) return;
      setAberto(false);
    }
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [aberto]);

  const ano = cursor.getFullYear();
  const mes = cursor.getMonth();
  const primeiro = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const hoje = paraIso(new Date());
  const celulas: Array<number | null> = [...Array(primeiro).fill(null), ...Array.from({ length: diasNoMes }, (_, i) => i + 1)];

  const painel = (
    <div
      ref={painelRef}
      className="fixed z-[9999] rounded-lg border border-neutral-200 bg-white p-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      style={{ top: posicao.top, bottom: posicao.bottom, left: posicao.left, width: posicao.width }}
    >
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setCursor(new Date(ano, mes - 1, 1))} className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100" aria-label="Mês anterior">
          <ChevronLeft size={16} />
        </button>
        <p className="text-sm font-medium capitalize text-neutral-900">{MESES[mes]} {ano}</p>
        <button type="button" onClick={() => setCursor(new Date(ano, mes + 1, 1))} className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100" aria-label="Próximo mês">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {SEMANA.map((dia, i) => (
          <span key={`${dia}-${i}`} className="py-1 text-[10px] font-medium text-neutral-400">{dia}</span>
        ))}
        {celulas.map((dia, i) => {
          if (!dia) return <span key={`vazio-${i}`} />;
          const iso = paraIso(new Date(ano, mes, dia));
          const ativo = iso === value;
          const ehHoje = iso === hoje;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => { onChange(iso); setAberto(false); }}
              className={`h-8 rounded-md text-xs font-medium ${ativo ? 'bg-neutral-900 text-white' : ehHoje ? 'text-neutral-900 ring-1 ring-neutral-300' : 'text-neutral-700 hover:bg-neutral-100'}`}
            >
              {dia}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between border-t border-neutral-100 pt-2">
        <button type="button" onClick={() => { onChange(''); setAberto(false); }} className="text-xs font-medium text-neutral-500 hover:text-neutral-900">Limpar</button>
        <button type="button" onClick={() => { onChange(hoje); setAberto(false); }} className="text-xs font-medium text-neutral-900">Hoje</button>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setAberto((v) => !v)}
        className={`box-border flex h-10 w-full items-center rounded-md border border-neutral-200 bg-white px-3 text-left text-sm text-neutral-900 outline-none disabled:cursor-default ${className}`}
      >
        <span className={value ? '' : 'text-neutral-400'}>{rotulo(value) || 'dd/mm/aaaa'}</span>
      </button>
      {aberto && typeof document !== 'undefined' && createPortal(painel, document.body)}
    </>
  );
}
