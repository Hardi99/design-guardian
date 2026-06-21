import type { NodeSnapshot } from '../types/figma.js';

export interface BlockMove { name: string; dx: number; dy: number; count: number }

// Arbre du snapshot → maps id→parentId (racine = null) et id→name.
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

// Chaîne d'ancêtres [id, parent, …, racine].
function ancestors(id: string, parent: Map<string, string | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let cur: string | null = id;
  while (cur && !seen.has(cur)) { out.push(cur); seen.add(cur); cur = parent.get(cur) ?? null; }
  return out;
}

// Ancêtre commun le plus proche d'un ensemble d'ids ('' si aucun).
export function commonAncestor(ids: string[], parent: Map<string, string | null>): string {
  if (ids.length === 0) return '';
  const chains = ids.map(id => ancestors(id, parent));
  for (const cand of chains[0]) {
    if (chains.every(ch => ch.includes(cand))) return cand;
  }
  return '';
}
