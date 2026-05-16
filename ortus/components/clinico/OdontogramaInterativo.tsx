'use client';

/**
 * OdontogramaInterativo
 * ----------------------------------------------------------------------------
 * Componente React de odontograma com renderização SVG nativa usando paths
 * anatômicos extraídos da biblioteca react-odontogram (MIT License).
 *
 * Cada um dos 32 dentes adultos (numeração FDI) é renderizado com sua silhueta
 * anatômica real, dividido em 5 faces clicáveis: oclusal, mesial, distal,
 * vestibular e lingual/palatina.
 *
 * O mapeamento das faces respeita:
 *   - arcada (maxila × mandíbula) → vestibular fica de fora (cima ou baixo)
 *   - quadrante                   → mesial fica do lado da linha média
 *
 * Ao clicar numa face, abre um popover (Tailwind puro, sem Radix) ancorado
 * embaixo do dente para escolher a patologia. As patologias "implante" e
 * "ausente" afetam o dente inteiro; as demais pintam apenas a face escolhida.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

// ============================================================================
// Tipos
// ============================================================================

export type FaceDente = 'oclusal' | 'mesial' | 'distal' | 'vestibular' | 'lingual';

export type Patologia =
    | 'saudavel'
    | 'carie'
    | 'restauracao'
    | 'canal'
    | 'implante'
    | 'ausente';

export interface DenteEstado {
    /** Patologias por face (apenas faces marcadas; ausência = saudável). */
    faces: Partial<Record<FaceDente, Patologia>>;
    /** Quando o dente inteiro tem um estado que sobrepõe as faces. */
    full?: 'implante' | 'ausente';
}

export type EstadoOdontograma = Record<number, DenteEstado>;

interface Props {
    initialEstado?: EstadoOdontograma;
    onChange?: (estado: EstadoOdontograma) => void;
    /** Modo somente leitura — desativa cliques e popover. */
    readOnly?: boolean;
}

// ============================================================================
// Constantes — paleta, patologias, numeração FDI
// ============================================================================

const CORES: Record<Patologia, string> = {
    saudavel: '#fafafa',
    carie: '#ef4444',
    restauracao: '#3b82f6',
    canal: '#8b5cf6',
    implante: '#475569',
    ausente: '#fef2f2',
};

const PATOLOGIAS: { value: Patologia; label: string; full?: boolean }[] = [
    { value: 'saudavel', label: 'Saudável (limpar)' },
    { value: 'carie', label: 'Cárie' },
    { value: 'restauracao', label: 'Restauração' },
    { value: 'canal', label: 'Canal' },
    { value: 'implante', label: 'Implante', full: true },
    { value: 'ausente', label: 'Ausente', full: true },
];

const FACE_LABEL: Record<FaceDente, string> = {
    oclusal: 'Oclusal/Incisal',
    mesial: 'Mesial',
    distal: 'Distal',
    vestibular: 'Vestibular',
    lingual: 'Lingual/Palatina',
};

// Numeração FDI — ordem visual da esquerda para direita, conforme print padrão.
const Q1 = [18, 17, 16, 15, 14, 13, 12, 11]; // sup. direito (lado esquerdo da tela)
const Q2 = [21, 22, 23, 24, 25, 26, 27, 28]; // sup. esquerdo
const Q4 = [48, 47, 46, 45, 44, 43, 42, 41]; // inf. direito
const Q3 = [31, 32, 33, 34, 35, 36, 37, 38]; // inf. esquerdo

// ============================================================================
// Helpers — PNG path e quadrado 2D clássico de 5 faces
// ============================================================================

/** Dimensions */
const IMG_W = 48;
const IMG_H = 80;
const SQ = 28;       // lado do quadrado 2D de faces

/** Returns the PNG src path for a given FDI tooth number. */
function toothImageSrc(num: number): string {
    const decade = Math.floor(num / 10);
    const arch = decade === 1 || decade === 2 ? 'sup' : 'inf';
    return `/assets/dentes/dentadura-${arch}-${num}.png`;
}

/** Lado do dente (em coordenadas de tela) onde fica a face mesial. */
function ladoMesial(num: number): 'left' | 'right' {
    const q = Math.floor(num / 10);
    return q === 1 || q === 4 ? 'right' : 'left';
}

/**
 * Gera os 5 polígonos do quadrado 2D clássico (cruz com quadrado central).
 * Layout: quadrado externo dividido em 4 triângulos pelas diagonais, com
 * um quadrado interno no centro (face oclusal).
 */
function gerarSquareFaces(s: number): {
    top: string;
    right: string;
    bottom: string;
    left: string;
    center: string;
} {
    // Outer corners
    const o = 0;
    const e = s;
    // Inner square (oclusal) — centered, ~38% of side
    const inset = s * 0.31;
    const i1 = inset;
    const i2 = s - inset;

    const top    = `M${o},${o} L${e},${o} L${i2},${i1} L${i1},${i1} Z`;
    const right  = `M${e},${o} L${e},${e} L${i2},${i2} L${i2},${i1} Z`;
    const bottom = `M${o},${e} L${e},${e} L${i2},${i2} L${i1},${i2} Z`;
    const left   = `M${o},${o} L${o},${e} L${i1},${i2} L${i1},${i1} Z`;
    const center = `M${i1},${i1} L${i2},${i1} L${i2},${i2} L${i1},${i2} Z`;

    return { top, right, bottom, left, center };
}

// ============================================================================
// Subcomponente: um único dente (PNG 3D + Quadrado 2D clássico)
// ============================================================================

interface DenteProps {
    numero: number;
    estado: DenteEstado;
    isMaxila: boolean;
    readOnly: boolean;
    onFaceClick: (numero: number, face: FaceDente, anchor: SVGSVGElement) => void;
    highlight: { numero: number; face: FaceDente } | null;
}

function Dente({ numero, estado, isMaxila, readOnly, onFaceClick, highlight }: DenteProps) {
    const lado = ladoMesial(numero);

    // Face mapping for the 2D square:
    // Top = Vestibular, Bottom = Lingual/Palatina, Center = Oclusal/Incisal
    // Left/Right = Mesial/Distal (depends on quadrant)
    const topFace: FaceDente    = 'vestibular';
    const bottomFace: FaceDente = 'lingual';
    const leftFace: FaceDente   = lado === 'left' ? 'mesial' : 'distal';
    const rightFace: FaceDente  = lado === 'left' ? 'distal' : 'mesial';

    const isAusente = estado.full === 'ausente';
    const isImplante = estado.full === 'implante';
    const hasCanal = Object.values(estado.faces).some(p => p === 'canal');

    const faces = useMemo(() => gerarSquareFaces(SQ), []);

    const fillFace = (f: FaceDente): string => {
        if (isAusente) return '#f1f5f9';
        if (isImplante) return CORES.implante;
        const p = estado.faces[f];
        if (!p || p === 'saudavel') return '#ffffff';
        return CORES[p];
    };

    const sqRef = useRef<SVGSVGElement>(null);

    const handle = (face: FaceDente) => (e: React.MouseEvent<SVGElement>) => {
        if (readOnly) return;
        e.stopPropagation();
        if (sqRef.current) onFaceClick(numero, face, sqRef.current);
    };

    const isHL = (f: FaceDente) => highlight?.numero === numero && highlight?.face === f;

    const faceRegion = (path: string, face: FaceDente) => {
        const fill = fillFace(face);
        const active = fill !== '#ffffff' && fill !== '#f1f5f9';
        return (
            <path
                key={face}
                d={path}
                fill={fill}
                stroke="#94a3b8"
                strokeWidth={0.5}
                opacity={active ? 0.85 : 1}
                onClick={handle(face)}
                className={readOnly ? '' : 'cursor-pointer hover:brightness-95 transition-all duration-100'}
                style={isHL(face) ? { stroke: '#0ea5e9', strokeWidth: 1.5 } : undefined}
            />
        );
    };

    const imgSrc = toothImageSrc(numero);

    // ---- PNG image element (3D tooth) ----
    const toothImage = (
        <div className="relative flex items-center justify-center" style={{ width: IMG_W, height: IMG_H }}>
            <img
                src={imgSrc}
                alt={`Dente ${numero}`}
                draggable={false}
                className="w-full h-full object-contain pointer-events-none select-none mix-blend-multiply"
                style={{
                    opacity: isAusente ? 0.2 : 1,
                    filter: isImplante ? 'grayscale(0.7) brightness(0.8)' : undefined,
                }}
            />
            {/* Canal: purple tint over root area on the image */}
            {!isAusente && hasCanal && (
                <div
                    className="absolute left-0 right-0 pointer-events-none rounded-sm"
                    style={{
                        top: isMaxila ? 0 : '55%',
                        bottom: isMaxila ? '55%' : 0,
                        background: CORES.canal,
                        opacity: 0.35,
                    }}
                />
            )}
            {/* Ausente: X marks */}
            {isAusente && (
                <svg className="absolute inset-0" width={IMG_W} height={IMG_H} viewBox={`0 0 ${IMG_W} ${IMG_H}`}>
                    <g stroke="#94a3b8" strokeWidth={1} strokeDasharray="4 3" pointerEvents="none">
                        <line x1={8} y1={8} x2={IMG_W - 8} y2={IMG_H - 8} />
                        <line x1={IMG_W - 8} y1={8} x2={8} y2={IMG_H - 8} />
                    </g>
                </svg>
            )}
            {/* Implante: metallic screw overlay */}
            {isImplante && !isAusente && (
                <svg className="absolute inset-0" width={IMG_W} height={IMG_H} viewBox={`0 0 ${IMG_W} ${IMG_H}`}>
                    <g pointerEvents="none">
                        <rect
                            x={IMG_W / 2 - 4}
                            y={IMG_H * 0.15}
                            width={8}
                            height={IMG_H * 0.7}
                            rx={2.5}
                            fill="url(#odo-grad-metal)"
                        />
                        {[0, 1, 2, 3, 4].map((i) => (
                            <line
                                key={i}
                                x1={IMG_W / 2 - 4}
                                y1={IMG_H * 0.2 + i * (IMG_H * 0.12)}
                                x2={IMG_W / 2 + 4}
                                y2={IMG_H * 0.2 + i * (IMG_H * 0.12)}
                                stroke="#1e293b"
                                strokeWidth={0.5}
                                opacity={0.6}
                            />
                        ))}
                    </g>
                </svg>
            )}
        </div>
    );

    // ---- 2D square with 5 clickable faces ----
    const faceSquare = (
        <svg
            ref={sqRef}
            width={SQ}
            height={SQ}
            viewBox={`0 0 ${SQ} ${SQ}`}
            className="border border-slate-300 rounded-[3px] overflow-hidden"
            style={{ minWidth: SQ, minHeight: SQ }}
        >
            {faceRegion(faces.top, topFace)}
            {faceRegion(faces.right, rightFace)}
            {faceRegion(faces.bottom, bottomFace)}
            {faceRegion(faces.left, leftFace)}
            {faceRegion(faces.center, 'oclusal')}
            {/* Cross lines — visible grid */}
            <line x1={0} y1={0} x2={SQ * 0.31} y2={SQ * 0.31} stroke="#94a3b8" strokeWidth={0.5} pointerEvents="none" />
            <line x1={SQ} y1={0} x2={SQ * 0.69} y2={SQ * 0.31} stroke="#94a3b8" strokeWidth={0.5} pointerEvents="none" />
            <line x1={0} y1={SQ} x2={SQ * 0.31} y2={SQ * 0.69} stroke="#94a3b8" strokeWidth={0.5} pointerEvents="none" />
            <line x1={SQ} y1={SQ} x2={SQ * 0.69} y2={SQ * 0.69} stroke="#94a3b8" strokeWidth={0.5} pointerEvents="none" />
        </svg>
    );

    return (
        <div className="flex flex-col items-center select-none gap-0.5" data-numero={numero}>
            {/* Superior: imagem em cima, quadrado embaixo */}
            {isMaxila ? (
                <>
                    {toothImage}
                    {faceSquare}
                </>
            ) : (
                <>
                    {faceSquare}
                    {toothImage}
                </>
            )}
            <span
                className={`text-[10px] font-bold transition-colors ${
                    highlight?.numero === numero ? 'text-blue-600' : 'text-slate-400'
                }`}
            >
                {numero}
            </span>
        </div>
    );
}

// ============================================================================
// Componente principal
// ============================================================================

export default function OdontogramaInterativo({ initialEstado, onChange, readOnly = false }: Props) {
    const [estados, setEstados] = useState<EstadoOdontograma>(initialEstado || {});
    const [popover, setPopover] = useState<{
        numero: number;
        face: FaceDente;
        x: number;
        y: number;
    } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        onChange?.(estados);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [estados]);

    // Fecha popover ao clicar fora
    useEffect(() => {
        if (!popover) return;
        const close = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('[data-odo-popover]') || target.closest('[data-numero]')) return;
            setPopover(null);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [popover]);

    const handleFaceClick = (numero: number, face: FaceDente, anchor: SVGSVGElement) => {
        const rect = anchor.getBoundingClientRect();
        const cont = containerRef.current?.getBoundingClientRect();
        if (!cont) return;
        setPopover({
            numero,
            face,
            x: rect.left + rect.width / 2 - cont.left,
            y: rect.bottom - cont.top + 6,
        });
    };

    const aplicar = (p: typeof PATOLOGIAS[number]) => {
        if (!popover) return;
        setEstados((prev) => {
            const atual: DenteEstado = prev[popover.numero] || { faces: {} };
            const next: DenteEstado = { ...atual, faces: { ...atual.faces } };
            if (p.full) {
                next.full = p.value as 'implante' | 'ausente';
                next.faces = {};
            } else {
                next.full = undefined;
                if (p.value === 'saudavel') {
                    delete next.faces[popover.face];
                } else {
                    next.faces[popover.face] = p.value;
                }
            }
            return { ...prev, [popover.numero]: next };
        });
        setPopover(null);
    };

    const limparTudo = () => setEstados({});

    return (
        <div
            ref={containerRef}
            className="relative bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-2xl p-6 shadow-sm"
        >
            {/* Defs globais (gradientes reutilizados por todos os dentes) */}
            <svg width={0} height={0} className="absolute pointer-events-none" aria-hidden>
                <defs>
                    {/* Pino de implante — cinza polido. */}
                    <linearGradient id="odo-grad-metal" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#475569" />
                        <stop offset="35%" stopColor="#cbd5e1" />
                        <stop offset="55%" stopColor="#f1f5f9" />
                        <stop offset="75%" stopColor="#94a3b8" />
                        <stop offset="100%" stopColor="#334155" />
                    </linearGradient>
                </defs>
            </svg>

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div>
                    <h3 className="font-bold text-slate-800 text-lg">Odontograma</h3>
                    <p className="text-xs text-slate-400 font-medium">
                        Clique em uma face para registrar a patologia
                    </p>
                </div>
                {!readOnly && (
                    <button
                        onClick={limparTudo}
                        className="text-xs font-bold text-slate-400 hover:text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    >
                        Limpar tudo
                    </button>
                )}
            </div>

            {/* Maxila (superior) */}
            <div className="flex flex-col items-center">
                <div className="flex items-end">
                    {Q1.map((n) => (
                        <Dente
                            key={n}
                            numero={n}
                            estado={estados[n] || { faces: {} }}
                            isMaxila
                            readOnly={readOnly}
                            onFaceClick={handleFaceClick}
                            highlight={popover}
                        />
                    ))}
                    <div className="w-px self-stretch bg-gradient-to-b from-transparent via-slate-300 to-transparent mx-0.5" />
                    {Q2.map((n) => (
                        <Dente
                            key={n}
                            numero={n}
                            estado={estados[n] || { faces: {} }}
                            isMaxila
                            readOnly={readOnly}
                            onFaceClick={handleFaceClick}
                            highlight={popover}
                        />
                    ))}
                </div>
            </div>

            {/* Plano oclusal — biting line between arches */}
            <div className="my-2 flex items-center gap-3">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Plano Oclusal
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent" />
            </div>

            {/* Mandíbula (inferior) */}
            <div className="flex flex-col items-center">
                <div className="flex items-start">
                    {Q4.map((n) => (
                        <Dente
                            key={n}
                            numero={n}
                            estado={estados[n] || { faces: {} }}
                            isMaxila={false}
                            readOnly={readOnly}
                            onFaceClick={handleFaceClick}
                            highlight={popover}
                        />
                    ))}
                    <div className="w-px self-stretch bg-gradient-to-b from-transparent via-slate-300 to-transparent mx-0.5" />
                    {Q3.map((n) => (
                        <Dente
                            key={n}
                            numero={n}
                            estado={estados[n] || { faces: {} }}
                            isMaxila={false}
                            readOnly={readOnly}
                            onFaceClick={handleFaceClick}
                            highlight={popover}
                        />
                    ))}
                </div>
            </div>

            {/* Legenda */}
            <div className="mt-6 flex flex-wrap gap-3 text-xs justify-center pt-4 border-t border-slate-100">
                {PATOLOGIAS.filter((p) => p.value !== 'saudavel').map((p) => (
                    <div key={p.value} className="flex items-center gap-1.5">
                        <div
                            className="w-3.5 h-3.5 rounded-sm border border-slate-300"
                            style={{ background: CORES[p.value] }}
                        />
                        <span className="font-bold text-slate-500">{p.label}</span>
                    </div>
                ))}
            </div>

            {/* Popover de patologias */}
            {popover && !readOnly && (
                <div
                    data-odo-popover
                    className="absolute z-50 bg-white border border-slate-200 rounded-xl shadow-2xl p-2 min-w-[220px] animate-in fade-in zoom-in-95 duration-150"
                    style={{
                        left: Math.max(16, Math.min(popover.x, (containerRef.current?.clientWidth || 800) - 16)),
                        top: popover.y,
                        transform: 'translateX(-50%)',
                    }}
                >
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 pb-1.5 mb-1.5 border-b border-slate-100">
                        Dente {popover.numero} <span className="text-blue-500">·</span>{' '}
                        <span className="text-slate-600">{FACE_LABEL[popover.face]}</span>
                    </div>
                    <div className="grid gap-0.5">
                        {PATOLOGIAS.map((p) => (
                            <button
                                key={p.value}
                                onClick={() => aplicar(p)}
                                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 active:bg-slate-100 text-left text-xs font-bold text-slate-700"
                            >
                                <div
                                    className="w-3.5 h-3.5 rounded-sm border border-slate-300 flex-shrink-0"
                                    style={{ background: CORES[p.value] }}
                                />
                                <span>{p.label}</span>
                                {p.full && (
                                    <span className="ml-auto text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                        DENTE INTEIRO
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
