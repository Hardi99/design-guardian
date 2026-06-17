import type { NodeSnapshot } from './types.js';

// Tolérance géométrique — identique à l'ε du moteur de diff (0,01px).
const EPS = 0.01;

function valuesEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= EPS;
  if ((a !== null && typeof a === 'object') || (b !== null && typeof b === 'object')) {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }
  return a === b;
}

/**
 * Renvoie le sous-ensemble de `candidates` dont la valeur diffère entre l'état
 * courant du nœud (`curr`) et le snapshot cible (`prev`).
 *
 * Restore « live-diff » : on n'applique que les propriétés réellement modifiées,
 * au lieu de tout réécrire. `curr` et `prev` proviennent de la MÊME sérialisation
 * (`extractSnapshot`), donc la comparaison JSON des champs composites
 * (fills/strokes/effects/vectorPaths) est fiable.
 *
 * **Biais conservateur** : si une valeur courante ne peut pas être lue avec
 * certitude (ex. `figma.mixed` → `undefined`), elle est considérée comme changée.
 * Un faux « changé » = écriture no-op inoffensive ; on ne SAUTE jamais un vrai
 * changement (jamais de restore manqué).
 */
export function changedProps(
  curr: NodeSnapshot,
  prev: NodeSnapshot,
  candidates: Iterable<string>,
): Set<string> {
  const c = curr as unknown as Record<string, unknown>;
  const p = prev as unknown as Record<string, unknown>;
  const changed = new Set<string>();
  for (const prop of candidates) {
    if (!valuesEqual(c[prop], p[prop])) changed.add(prop);
  }
  return changed;
}

/**
 * Sélectionne le nœud live correspondant à un nœud du snapshot.
 * Priorité au **`dg_id`** (identité stable, marche cross-branche), repli sur le
 * **`node.id`** Figma (legacy / nœuds pas encore stampés). Logique pure ; les index
 * `byDgId`/`byId` sont construits une seule fois côté appelant (O(n), corrige W5).
 */
export function pickMatch<T>(
  snap: { dg_id?: string; id: string },
  byDgId: Map<string, T>,
  byId: Map<string, T>,
): T | undefined {
  return (snap.dg_id ? byDgId.get(snap.dg_id) : undefined) ?? byId.get(snap.id);
}

export type LayoutSizing = 'FIXED' | 'HUG' | 'FILL';

export interface ResizePlan {
  hSizing?: LayoutSizing;                      // mode de dimensionnement horizontal à poser (auto-layout)
  vSizing?: LayoutSizing;                       // mode de dimensionnement vertical à poser (auto-layout)
  resize?: { width: number; height: number };   // resize absolu à appliquer
}

/**
 * Décide COMMENT redimensionner un nœud au restore (logique pure).
 *
 * - **Hors auto-layout** : resize absolu classique.
 * - **En auto-layout** : la taille d'un enfant est régie par son *mode* (`FIXED`/`HUG`/`FILL`).
 *   On restaure le mode capturé par axe, puis on demande le resize : Figma l'applique aux
 *   axes `FIXED` et l'ignore sur `HUG`/`FILL` (recalculés). Corrige le bug « resize skippé en
 *   auto-layout » (ex. logo figé qui ne revenait pas à sa taille).
 * - **En auto-layout SANS info de sizing** (snapshot legacy) : on ne touche à rien (conservateur,
 *   évite de casser un layout responsive dont on ignore les modes).
 */
export function planResize(
  snap: { width: number; height: number; layoutSizingHorizontal?: LayoutSizing; layoutSizingVertical?: LayoutSizing },
  inAutoLayout: boolean,
): ResizePlan {
  if (!inAutoLayout) return { resize: { width: snap.width, height: snap.height } };
  if (snap.layoutSizingHorizontal === undefined && snap.layoutSizingVertical === undefined) return {};
  const plan: ResizePlan = { resize: { width: snap.width, height: snap.height } };
  if (snap.layoutSizingHorizontal !== undefined) plan.hSizing = snap.layoutSizingHorizontal;
  if (snap.layoutSizingVertical !== undefined) plan.vSizing = snap.layoutSizingVertical;
  return plan;
}
