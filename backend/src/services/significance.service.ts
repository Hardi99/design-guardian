import type { PropertyChange, DeltaJSON, NodeDelta } from '../types/figma.js';

export type Significance = 'notable' | 'minor';

// Propriétés qualitatives : tout changement est notable (couleur, texte, structure…).
const QUALITATIVE = new Set<string>([
  'fills', 'strokes', 'characters', 'visible', 'vectorPaths', 'effects',
  'imageHash', 'scaleMode', 'fontFamily', 'fontStyle', 'fontStyleName', 'fontWeight',
]);

// Propriétés numériques : notable seulement au-delà du seuil (sinon = bruit sous-perceptuel).
// Seuils calibrables — point d'ajustement unique (les beta affineront).
export const SIGNIFICANCE_THRESHOLDS: Record<string, number> = {
  x: 1, y: 1, width: 1, height: 1,   // px
  fontSize: 1,                       // px
  cornerRadius: 1, strokeWeight: 1,  // px
  opacity: 0.05,                     // 0..1
  rotation: 1,                       // degrés
};

function magnitude(c: PropertyChange): number | null {
  if (typeof c.oldValue === 'number' && typeof c.newValue === 'number') {
    return Math.abs(c.newValue - c.oldValue);
  }
  return null;
}

/**
 * Classe un changement de propriété en 'notable' ou 'minor'.
 * Biais CONSERVATEUR : propriété inconnue ou valeurs illisibles → 'notable'
 * (dans le doute, on montre — on ne masque jamais un vrai changement).
 */
export function scoreChange(change: PropertyChange): Significance {
  if (QUALITATIVE.has(change.property)) return 'notable';
  const threshold = SIGNIFICANCE_THRESHOLDS[change.property];
  if (threshold === undefined) return 'notable';
  const mag = magnitude(change);
  if (mag === null) return 'notable';
  return mag >= threshold ? 'notable' : 'minor';
}

export interface RankedDelta {
  notableModified: NodeDelta[]; // nœuds modifiés avec ≥1 changement notable
  minorModified: NodeDelta[];   // nœuds modifiés uniquement mineurs
  added: NodeDelta[];           // toujours notables (pass-through)
  removed: NodeDelta[];         // toujours notables (pass-through)
  minorCount: number;           // = minorModified.length
}

/**
 * Partitionne un DeltaJSON pour l'affichage hiérarchisé. NON-DESTRUCTIF :
 * lit le delta sans le muter (le diff 0.01px reste intact ailleurs).
 */
export function rankDelta(delta: DeltaJSON): RankedDelta {
  const notableModified: NodeDelta[] = [];
  const minorModified: NodeDelta[] = [];
  for (const n of delta.modified) {
    const hasNotable = n.changes.some(c => scoreChange(c) === 'notable');
    (hasNotable ? notableModified : minorModified).push(n);
  }
  return {
    notableModified,
    minorModified,
    added: delta.added,
    removed: delta.removed,
    minorCount: minorModified.length,
  };
}
