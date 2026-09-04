/**
 * Mapeamento autoritativo mesh GLB → FDI.
 * Mandíbula: ordenado por posição X no modelo (esquerda da tela = 48…41, direita = 31…38).
 * Maxila: polySurface* ≈ quadrante 1 (11–20); ZBrushPolyMesh* ≈ quadrante 2 (21–30).
 */

export interface Tooth3DConfig {
  fdi: number;
  /** Apenas o mesh primário recebe clique; secundários só sincronizam cor. */
  primary: boolean;
}

export const TEETH_3D_CONFIG: Record<string, Tooth3DConfig> = {
  // Mandíbula — lado esquerdo da tela (48 → 41), meshes ZBrush (ordenados por X)
  ZBrushPolyMesh3D1_Mandible_ll7_0: { fdi: 48, primary: true },
  ZBrushPolyMesh3D_Mandible_ll8_0: { fdi: 47, primary: true },
  ZBrushPolyMesh3D2_Mandible_blinn10_0: { fdi: 46, primary: true },
  ZBrushPolyMesh3D4_Mandible_ll5_0: { fdi: 45, primary: true },
  ZBrushPolyMesh3D3_Mandible_ll4_0: { fdi: 44, primary: true },
  ZBrushPolyMesh3D5_Mandible_ll3_0: { fdi: 43, primary: true },
  ZBrushPolyMesh3D6_Mandible_l2_0: { fdi: 42, primary: true },
  ZBrushPolyMesh3D7_Mandible_ll1_0: { fdi: 41, primary: true },

  // Mandíbula — lado direito da tela (31 → 38), meshes seam (ordenados por X)
  LL2seam_2ZBrushPolyMesh3D_Mandible_l2_0: { fdi: 31, primary: true },
  LL5seam_3ZBrushPolyMesh3D_Mandible_ll5_0: { fdi: 32, primary: true },
  LL1seam_2ZBrushPolyMesh3D_Mandible_ll1_0: { fdi: 33, primary: true },
  LL3seam_2ZBrushPolyMesh3D_Mandible_ll3_0: { fdi: 34, primary: true },
  LL6seam_2ZBrushPolyMesh3D_Mandible_blinn10_0: { fdi: 35, primary: true },
  LL4seam_2ZBrushPolyMesh3D_Mandible_ll4_0: { fdi: 36, primary: true },
  LL8seam_2ZBrushPolyMesh3D_Mandible_ll8_0: { fdi: 37, primary: true },
  LL7seam_2ZBrushPolyMesh3D_Mandible_ll7_0: { fdi: 38, primary: true },

  // Maxila — incisivos centrais
  polySurface1_UL1_0: { fdi: 11, primary: true },
  polySurface2_UL1_0: { fdi: 21, primary: true },

  // Maxila — quadrante 1 (lado esquerdo da tela no 2D: 18–11)
  polySurface4_blinn14_0: { fdi: 14, primary: true },
  polySurface6_blinn15_0: { fdi: 15, primary: true },
  ZBrushPolyMesh3D3_blinn16_0: { fdi: 16, primary: true },
  ZBrushPolyMesh3D4_blinn17_0: { fdi: 17, primary: true },
  polySurface7_blinn18_0: { fdi: 18, primary: true },
  polySurface8_blinn18_0: { fdi: 18, primary: false },
  polySurface9_blinn19_0: { fdi: 19, primary: true },
  polySurface10_blinn19_0: { fdi: 19, primary: false },
  polySurface12_blinn20_0: { fdi: 20, primary: true },

  // Maxila — quadrante 2 (lado direito da tela no 2D: 21–28)
  ZBrushPolyMesh3D1_blinn14_0: { fdi: 24, primary: true },
  ZBrushPolyMesh3D2_blinn15_0: { fdi: 25, primary: true },
  ZBrushPolyMesh3D8_blinn16_0: { fdi: 26, primary: true },
  ZBrushPolyMesh3D9_blinn17_0: { fdi: 27, primary: true },
  ZBrushPolyMesh3D5_blinn18_0: { fdi: 28, primary: true },
  ZBrushPolyMesh3D7_blinn20_0: { fdi: 30, primary: true },
};

/** FDI presentes no modelo 3D (para referência / UI). */
export const FDI_IN_3D_MODEL = [...new Set(Object.values(TEETH_3D_CONFIG).map((c) => c.fdi))].sort(
  (a, b) => a - b,
);

/** FDI do odontograma 2D que ainda não existem no GLB. */
export const FDI_MISSING_IN_3D = [12, 13, 22, 23, 29];

export function getTooth3DConfig(meshName: string): Tooth3DConfig | null {
  return TEETH_3D_CONFIG[meshName] ?? null;
}

export function meshNameToFdi(meshName: string): number | null {
  return TEETH_3D_CONFIG[meshName]?.fdi ?? null;
}

export function isPrimaryMesh(meshName: string): boolean {
  return TEETH_3D_CONFIG[meshName]?.primary ?? false;
}
