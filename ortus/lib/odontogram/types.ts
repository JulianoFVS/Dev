export type OdontoFace = 'V' | 'M' | 'D' | 'L' | 'O';

export type OdontoFaceStatus = 'higido' | 'carie' | 'restaurado' | 'tratado';

/** Condição do dente inteiro (campo `cond` no formato legado). */
export type OdontoToothStatus = 'normal' | 'ausente' | 'coroa' | 'implante' | 'extracao';

export interface OdontoTooth {
  status: OdontoToothStatus;
  faces: Partial<Record<OdontoFace, OdontoFaceStatus>>;
}

/** Formato persistido na ficha clínica. */
export interface LegacyToothState {
  faces: Partial<Record<OdontoFace, OdontoFaceStatus>>;
  cond: OdontoToothStatus;
}

export const ODONTO_FACES: OdontoFace[] = ['V', 'M', 'D', 'L', 'O'];
