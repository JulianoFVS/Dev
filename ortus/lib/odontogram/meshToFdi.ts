export {
  TEETH_3D_CONFIG,
  FDI_IN_3D_MODEL,
  FDI_MISSING_IN_3D,
  getTooth3DConfig,
  meshNameToFdi,
  isPrimaryMesh,
} from './teeth3dConfig';

import { TEETH_3D_CONFIG } from './teeth3dConfig';

/** Mapa mesh → FDI (compatibilidade). */
export const MESH_TO_FDI: Record<string, number> = Object.fromEntries(
  Object.entries(TEETH_3D_CONFIG).map(([name, cfg]) => [name, cfg.fdi]),
);
