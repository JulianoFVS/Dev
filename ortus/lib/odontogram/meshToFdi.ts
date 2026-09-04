/** Mapeamento mesh do GLB → número FDI (permanente). */
export const MESH_TO_FDI: Record<string, number> = {
  // Mandíbula Q4 (41–48) — meshes seam (única geometria disponível neste quadrante)
  LL1seam_2ZBrushPolyMesh3D_Mandible_ll1_0: 41,
  LL2seam_2ZBrushPolyMesh3D_Mandible_l2_0: 42,
  LL3seam_2ZBrushPolyMesh3D_Mandible_ll3_0: 43,
  LL4seam_2ZBrushPolyMesh3D_Mandible_ll4_0: 44,
  LL5seam_3ZBrushPolyMesh3D_Mandible_ll5_0: 45,
  LL6seam_2ZBrushPolyMesh3D_Mandible_blinn10_0: 46,
  LL7seam_2ZBrushPolyMesh3D_Mandible_ll7_0: 47,
  LL8seam_2ZBrushPolyMesh3D_Mandible_ll8_0: 48,
  // Mandíbula Q3 (31–38)
  ZBrushPolyMesh3D7_Mandible_ll1_0: 31,
  ZBrushPolyMesh3D6_Mandible_l2_0: 32,
  ZBrushPolyMesh3D5_Mandible_ll3_0: 33,
  ZBrushPolyMesh3D3_Mandible_ll4_0: 34,
  ZBrushPolyMesh3D4_Mandible_ll5_0: 35,
  ZBrushPolyMesh3D2_Mandible_blinn10_0: 36,
  ZBrushPolyMesh3D1_Mandible_ll7_0: 37,
  ZBrushPolyMesh3D_Mandible_ll8_0: 38,
  // Maxila — incisivos centrais distintos (11 e 21)
  polySurface1_UL1_0: 11,
  polySurface2_UL1_0: 21,
  polySurface4_blinn14_0: 14,
  ZBrushPolyMesh3D1_blinn14_0: 24,
  polySurface6_blinn15_0: 15,
  ZBrushPolyMesh3D2_blinn15_0: 25,
  polySurface7_blinn18_0: 18,
  polySurface9_blinn19_0: 19,
  polySurface12_blinn20_0: 20,
  ZBrushPolyMesh3D5_blinn18_0: 28,
  ZBrushPolyMesh3D7_blinn20_0: 30,
  ZBrushPolyMesh3D4_blinn17_0: 17,
  ZBrushPolyMesh3D9_blinn17_0: 27,
};

/** Meshes extras que geram artefatos — não renderizar. */
export const HIDDEN_MESHES = new Set([
  'polySurface8_blinn18_0',
  'polySurface10_blinn19_0',
  'ZBrushPolyMesh3D3_blinn16_0',
  'ZBrushPolyMesh3D8_blinn16_0',
]);

/** Meshes seam: overlay fino que causa z-fighting — renderizar sem depthWrite. */
export const SEAM_MESHES = new Set([
  'LL1seam_2ZBrushPolyMesh3D_Mandible_ll1_0',
  'LL2seam_2ZBrushPolyMesh3D_Mandible_l2_0',
  'LL3seam_2ZBrushPolyMesh3D_Mandible_ll3_0',
  'LL4seam_2ZBrushPolyMesh3D_Mandible_ll4_0',
  'LL5seam_3ZBrushPolyMesh3D_Mandible_ll5_0',
  'LL6seam_2ZBrushPolyMesh3D_Mandible_blinn10_0',
  'LL7seam_2ZBrushPolyMesh3D_Mandible_ll7_0',
  'LL8seam_2ZBrushPolyMesh3D_Mandible_ll8_0',
]);

export function meshNameToFdi(meshName: string): number | null {
  return MESH_TO_FDI[meshName] ?? null;
}
