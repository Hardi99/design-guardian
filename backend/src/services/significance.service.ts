import type { PropertyChange, DeltaJSON, NodeDelta } from '../types/figma.js';

export type Significance = 'notable' | 'minor';

export interface LayoutContext {
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  layoutPositioning?: 'AUTO' | 'ABSOLUTE';
}

// Un nœud est enfant de FLUX auto-layout (position recalculée par le moteur) ssi
// il a un mode de sizing (Figma ne le renseigne que pour les enfants d'auto-layout)
// ET n'est pas en position absolue (un enfant absolu garde une position authored).
function isFlowChild(ctx: LayoutContext): boolean {
  const hasSizing = ctx.layoutSizingHorizontal !== undefined || ctx.layoutSizingVertical !== undefined;
  return hasSizing && ctx.layoutPositioning !== 'ABSOLUTE';
}

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
export function scoreChange(change: PropertyChange, ctx?: LayoutContext): Significance {
  // Géométrie DÉRIVÉE (recalculée par l'auto-layout) → minor. Les changements authored
  // (resize FIXED, enfant absolu) tombent dans la logique normale plus bas.
  if (ctx) {
    const p = change.property;
    if ((p === 'x' || p === 'y') && isFlowChild(ctx)) return 'minor';
    if (p === 'width'  && (ctx.layoutSizingHorizontal === 'FILL' || ctx.layoutSizingHorizontal === 'HUG')) return 'minor';
    if (p === 'height' && (ctx.layoutSizingVertical   === 'FILL' || ctx.layoutSizingVertical   === 'HUG')) return 'minor';
  }
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
