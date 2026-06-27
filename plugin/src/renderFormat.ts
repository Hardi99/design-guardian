// Décision pure du format d'aperçu. L'export réel (exportAsync) se fait dans main.ts.
// SVG si l'export vectoriel reste léger (zoom sans perte) ; sinon PNG borné (raster/lourd).
export const SVG_MAX_B64 = 800_000;       // ~600 Ko bruts : au-delà, c'est du raster embarqué
export const PNG_MAX_B64 = 1_200_000;     // cible PNG ; on descend l'échelle jusqu'à passer
export const PNG_SCALES = [2, 1, 0.5] as const;

export function chooseFormat(svgB64Len: number, svgMax = SVG_MAX_B64): 'svg' | 'png' {
  return svgB64Len <= svgMax ? 'svg' : 'png';
}
