import type { OdontoFace, OdontoFaceStatus } from './types';

export const FACE_COLORS: Record<OdontoFaceStatus, string> = {
  higido: '#ffffff',
  carie: '#ef4444',
  restaurado: '#3b82f6',
  tratado: '#10b981',
};

export const FACE_LABELS: Record<OdontoFace, string> = {
  V: 'Vestibular',
  M: 'Mesial',
  D: 'Distal',
  L: 'Lingual/Palatal',
  O: 'Oclusal/Incisal',
};

export const TOOTH_STATUS_COLORS: Record<string, string> = {
  normal: '#f8fafc',
  ausente: '#94a3b8',
  coroa: '#f59e0b',
  implante: '#0ea5e9',
  extracao: '#dc2626',
};

export const ODONTO_TOOLS: {
  key: string;
  label: string;
  color: string;
  tipo: 'face' | 'cond';
}[] = [
  { key: 'higido', label: 'Hígido', color: '#ffffff', tipo: 'face' },
  { key: 'carie', label: 'Cárie', color: '#ef4444', tipo: 'face' },
  { key: 'restaurado', label: 'Restauração', color: '#3b82f6', tipo: 'face' },
  { key: 'tratado', label: 'Tratado', color: '#10b981', tipo: 'face' },
  { key: 'coroa', label: 'Coroa', color: '#f59e0b', tipo: 'cond' },
  { key: 'implante', label: 'Implante', color: '#0ea5e9', tipo: 'cond' },
  { key: 'extracao', label: 'Extração', color: '#dc2626', tipo: 'cond' },
  { key: 'ausente', label: 'Ausente', color: '#94a3b8', tipo: 'cond' },
];
