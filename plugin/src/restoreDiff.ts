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
