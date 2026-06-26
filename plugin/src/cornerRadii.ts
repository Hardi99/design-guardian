// Rayons par-coin [TL, TR, BR, BL] — logique PURE (testable sans Figma).
// Renvoie undefined si les 4 coins sont identiques (le champ scalaire `cornerRadius`
// suffit, comportement historique) OU si une valeur n'est pas lisible (mixed/absent).
export interface CornerInput {
  topLeftRadius?: unknown;
  topRightRadius?: unknown;
  bottomRightRadius?: unknown;
  bottomLeftRadius?: unknown;
}

export function computeCornerRadii(c: CornerInput): number[] | undefined {
  const t = [c.topLeftRadius, c.topRightRadius, c.bottomRightRadius, c.bottomLeftRadius];
  if (t.some(v => typeof v !== 'number')) return undefined;
  const [tl, tr, br, bl] = t as number[];
  if (tl === tr && tr === br && br === bl) return undefined; // uniforme
  return [tl, tr, br, bl];
}
