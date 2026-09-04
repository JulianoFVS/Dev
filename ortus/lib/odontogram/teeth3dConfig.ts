/**
 * Mapeamento mesh GLB → FDI para `public/arcada4k.glb`.
 *
 * Derivado das posições reais dos meshes no arquivo (centro do bounding box em
 * coordenadas de mundo), não dos nomes: dentro de cada quadrante os dentes
 * aparecem em ordem monotônica de Z (incisivo central = Z maior, terceiro molar
 * = Z menor), e o sinal de X separa os lados.
 *
 * Convenção de lados (vista frontal, câmera em +Z):
 *   X negativo = esquerda da tela = lado direito do paciente = quadrantes 1 e 4
 *   X positivo = direita da tela  = lado esquerdo do paciente = quadrantes 2 e 3
 *
 * São 33 meshes para 32 dentes: `polySurface7_blinn18_0` é uma segunda peça do
 * dente 26 e por isso compartilha o mesmo FDI.
 */

export interface Tooth3DConfig {
  fdi: number;
  /** Mesh principal do dente. Peças extras entram como `false`. */
  primary: boolean;
}

export const TEETH_3D_CONFIG: Record<string, Tooth3DConfig> = {
  // ---------- Maxila, quadrante 1 (X negativo): 11 → 18 ----------
  polySurface2_UL1_0: { fdi: 11, primary: true },
  polySurface4_blinn14_0: { fdi: 12, primary: true },
  polySurface6_blinn15_0: { fdi: 13, primary: true },
  ZBrushPolyMesh3D8_blinn16_0: { fdi: 14, primary: true },
  ZBrushPolyMesh3D9_blinn17_0: { fdi: 15, primary: true },
  polySurface8_blinn18_0: { fdi: 16, primary: true },
  polySurface10_blinn19_0: { fdi: 17, primary: true },
  polySurface12_blinn20_0: { fdi: 18, primary: true },

  // ---------- Maxila, quadrante 2 (X positivo): 21 → 28 ----------
  polySurface1_UL1_0: { fdi: 21, primary: true },
  ZBrushPolyMesh3D1_blinn14_0: { fdi: 22, primary: true },
  ZBrushPolyMesh3D2_blinn15_0: { fdi: 23, primary: true },
  ZBrushPolyMesh3D3_blinn16_0: { fdi: 24, primary: true },
  ZBrushPolyMesh3D4_blinn17_0: { fdi: 25, primary: true },
  ZBrushPolyMesh3D5_blinn18_0: { fdi: 26, primary: true },
  polySurface7_blinn18_0: { fdi: 26, primary: false },
  polySurface9_blinn19_0: { fdi: 27, primary: true },
  ZBrushPolyMesh3D7_blinn20_0: { fdi: 28, primary: true },

  // ---------- Mandíbula, quadrante 4 (X negativo): 41 → 48 ----------
  ZBrushPolyMesh3D7_Mandible_ll1_0: { fdi: 41, primary: true },
  ZBrushPolyMesh3D6_Mandible_l2_0: { fdi: 42, primary: true },
  ZBrushPolyMesh3D5_Mandible_ll3_0: { fdi: 43, primary: true },
  ZBrushPolyMesh3D3_Mandible_ll4_0: { fdi: 44, primary: true },
  ZBrushPolyMesh3D4_Mandible_ll5_0: { fdi: 45, primary: true },
  ZBrushPolyMesh3D2_Mandible_blinn10_0: { fdi: 46, primary: true },
  ZBrushPolyMesh3D1_Mandible_ll7_0: { fdi: 47, primary: true },
  ZBrushPolyMesh3D_Mandible_ll8_0: { fdi: 48, primary: true },

  // ---------- Mandíbula, quadrante 3 (X positivo): 31 → 38 ----------
  LL1seam_2ZBrushPolyMesh3D_Mandible_ll1_0: { fdi: 31, primary: true },
  LL2seam_2ZBrushPolyMesh3D_Mandible_l2_0: { fdi: 32, primary: true },
  LL3seam_2ZBrushPolyMesh3D_Mandible_ll3_0: { fdi: 33, primary: true },
  LL4seam_2ZBrushPolyMesh3D_Mandible_ll4_0: { fdi: 34, primary: true },
  LL5seam_3ZBrushPolyMesh3D_Mandible_ll5_0: { fdi: 35, primary: true },
  LL6seam_2ZBrushPolyMesh3D_Mandible_blinn10_0: { fdi: 36, primary: true },
  LL7seam_2ZBrushPolyMesh3D_Mandible_ll7_0: { fdi: 37, primary: true },
  LL8seam_2ZBrushPolyMesh3D_Mandible_ll8_0: { fdi: 38, primary: true },
};

/** FDI inválidos gravados por versões anteriores do mapeamento → FDI correto. */
export const FDI_LEGACY_MIGRATION: Record<number, number> = {
  19: 16,
  20: 17,
  29: 26,
  30: 27,
};

export const FDI_IN_3D_MODEL = [
  ...new Set(Object.values(TEETH_3D_CONFIG).map((c) => c.fdi)),
].sort((a, b) => a - b);

/** Todos os 32 dentes permanentes têm mesh no modelo. */
export const FDI_MISSING_IN_3D: readonly number[] = [];

export function getTooth3DConfig(meshName: string): Tooth3DConfig | null {
  return TEETH_3D_CONFIG[meshName] ?? null;
}

export function meshNameToFdi(meshName: string): number | null {
  return TEETH_3D_CONFIG[meshName]?.fdi ?? null;
}

export function isPrimaryMesh(meshName: string): boolean {
  return TEETH_3D_CONFIG[meshName]?.primary ?? false;
}

export function normalizeFdi(fdi: number): number {
  return FDI_LEGACY_MIGRATION[fdi] ?? fdi;
}
