import type { OdontoTooth } from './types';
import { FACE_COLORS, TOOTH_STATUS_COLORS } from './constants';

/** Cor de exibição do dente no modelo 3D com base no estado do store. */
export function getToothDisplayColor(
  tooth: OdontoTooth | undefined,
  fallback: string,
): string {
  if (!tooth) return fallback;

  if (tooth.status !== 'normal') {
    return TOOTH_STATUS_COLORS[tooth.status] ?? fallback;
  }

  const faceValues = Object.values(tooth.faces);
  if (faceValues.includes('carie')) return FACE_COLORS.carie;
  if (faceValues.includes('restaurado')) return FACE_COLORS.restaurado;
  if (faceValues.includes('tratado')) return FACE_COLORS.tratado;

  return fallback;
}
