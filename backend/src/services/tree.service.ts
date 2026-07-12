import type { NodeSnapshot } from '../types/figma.js';

// Arbre du snapshot → maps id→parentId (racine = null) et id→name.
// Utilisé pour la détection des moves dérivés (cascade) dans le diff.
export function buildTreeMaps(root: NodeSnapshot): { parent: Map<string, string | null>; name: Map<string, string> } {
  const parent = new Map<string, string | null>();
  const name = new Map<string, string>();
  const walk = (n: NodeSnapshot, p: string | null): void => {
    parent.set(n.id, p);
    name.set(n.id, n.name);
    for (const c of n.children ?? []) walk(c, n.id);
  };
  walk(root, null);
  return { parent, name };
}
