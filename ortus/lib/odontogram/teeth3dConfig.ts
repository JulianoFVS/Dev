/**
 * Mapeamento autoritativo mesh GLB → FDI (notação permanente ISO).
 * Mandíbula: ordenado por posição X (esquerda da tela = 48…41, direita = 31…38).
 * Maxila: polySurface* = quadrante 1; ZBrushPolyMesh* = quadrante 2.
 *
 * Nota: blinn19/blinn20 no GLB NÃO são FDI 19/20/30 — eram material names
 * mapeados errado no export original.
 */

export interface Tooth3DConfig {
  fdi: number;
  /** Mesh clicável (secundários só sincronizam cor). */
  primary: boolean;
  /** Meshes com transform quebrado no GLB — não renderizar. */
  hidden?: boolean;
}

export const TEETH_3D_CONFIG: Record<string, Tooth3DConfig> = {
  // Mandíbula — esquerda da tela (48 → 41)
  ZBrushPolyMesh3D1_Mandible_ll7_0: { fdi: 48, primary: true },
  ZBrushPolyMesh3D_Mandible_ll8_0: { fdi: 47, primary: true },
  ZBrushPolyMesh3D2_Mandible_blinn10_0: { fdi: 46, primary: true },
  ZBrushPolyMesh3D4_Mandible_ll5_0: { fdi: 45, primary: true },
  ZBrushPolyMesh3D3_Mandible_ll4_0: { fdi: 44, primary: true },
  ZBrushPolyMesh3D5_Mandible_ll3_0: { fdi: 43, primary: true },
  ZBrushPolyMesh3D6_Mandible_l2_0: { fdi: 42, primary: true },
  ZBrushPolyMesh3D7_Mandible_ll1_0: { fdi: 41, primary: true },

  // Mandíbula — direita da tela (31 → 38)
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

  // Maxila Q1 (18–11 no 2D, lado esquerdo)
  polySurface4_blinn14_0: { fdi: 14, primary: true },
  polySurface6_blinn15_0: { fdi: 15, primary: true },
  polySurface9_blinn19_0: { fdi: 16, primary: true },
  polySurface10_blinn19_0: { fdi: 16, primary: true },
  polySurface12_blinn20_0: { fdi: 17, primary: true },
  ZBrushPolyMesh3D4_blinn17_0: { fdi: 17, primary: true },
  polySurface7_blinn18_0: { fdi: 18, primary: true },
  polySurface8_blinn18_0: { fdi: 18, primary: true },
  // Export quebrado — longe da arcada
  ZBrushPolyMesh3D3_blinn16_0: { fdi: 16, primary: false, hidden: true },

  // Maxila Q2 (21–28 no 2D, lado direito)
  ZBrushPolyMesh3D1_blinn14_0: { fdi: 24, primary: true },
  ZBrushPolyMesh3D2_blinn15_0: { fdi: 25, primary: true },
  ZBrushPolyMesh3D7_blinn20_0: { fdi: 27, primary: true },
  ZBrushPolyMesh3D9_blinn17_0: { fdi: 27, primary: true },
  ZBrushPolyMesh3D5_blinn18_0: { fdi: 28, primary: true },
  // Export quebrado — longe da arcada
  ZBrushPolyMesh3D8_blinn16_0: { fdi: 26, primary: false, hidden: true },
};

/** FDI inválidos usados em versões anteriores → FDI correto. */
export const FDI_LEGACY_MIGRATION: Record<number, number> = {
  19: 16,
  20: 17,
  30: 27,
};

/** Dentes no 2D que não existem no GLB. */
export const FDI_MISSING_IN_3D = [12, 13, 22, 23, 26, 29] as const;

export const FDI_IN_3D_MODEL = [
  ...new Set(
    Object.values(TEETH_3D_CONFIG)
      .filter((c) => !c.hidden)
      .map((c) => c.fdi),
  ),
].sort((a, b) => a - b);

export function getTooth3DConfig(meshName: string): Tooth3DConfig | null {
  return TEETH_3D_CONFIG[meshName] ?? null;
}

export function meshNameToFdi(meshName: string): number | null {
  return TEETH_3D_CONFIG[meshName]?.fdi ?? null;
}

export function isPrimaryMesh(meshName: string): boolean {
  const cfg = TEETH_3D_CONFIG[meshName];
  return cfg ? cfg.primary && !cfg.hidden : false;
}

/** Normaliza FDI (corrige números legados inválidos). */
export function normalizeFdi(fdi: number): number {
  return FDI_LEGACY_MIGRATION[fdi] ?? fdi;
}
