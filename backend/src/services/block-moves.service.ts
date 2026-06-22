import type { NodeSnapshot, DeltaJSON, NodeDelta } from '../types/figma.js';
import { scoreChange, layoutContextOf } from './significance.service.js';

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
  const first = chains[0];
  if (!first) return '';
  for (const cand of first) {
    if (chains.every(ch => ch.includes(cand))) return cand;
  }
  return '';
}

// (dx, dy) du nœud si c'est un déplacement DÉRIVÉ (x/y mineurs = cascade), sinon null.
function derivedMove(nd: NodeDelta): { dx: number; dy: number } | null {
  const ctx = layoutContextOf(nd);
  let dx = 0, dy = 0, derived = false;
  for (const c of nd.changes) {
    if ((c.property === 'x' || c.property === 'y') && typeof c.newValue === 'number' && typeof c.oldValue === 'number') {
      if (scoreChange(c, ctx) !== 'minor') return null; // un x/y notable → pas une cascade
      if (c.property === 'x') dx = c.newValue - c.oldValue; else dy = c.newValue - c.oldValue;
      derived = true;
    }
  }
  return derived ? { dx, dy } : null;
}

export function detectBlockMoves(
  delta: DeltaJSON,
  parent: Map<string, string | null>,
  name: Map<string, string>,
  minCount: number,
): BlockMove[] {
  const groups = new Map<string, string[]>();
  for (const nd of delta.modified) {
    const m = derivedMove(nd);
    if (!m) continue;
    const dx = Math.round(m.dx), dy = Math.round(m.dy);
    if (dx === 0 && dy === 0) continue;
    const key = `${dx},${dy}`;
    const arr = groups.get(key) ?? [];
    arr.push(nd.nodeId);
    groups.set(key, arr);
  }
  const out: BlockMove[] = [];
  for (const [key, ids] of groups) {
    if (ids.length < minCount) continue;
    const idSet = new Set(ids);
    const roots = ids.filter(id => { const p = parent.get(id); return !p || !idSet.has(p); });
    const blockId = roots.length === 1 ? roots[0]! : commonAncestor(roots, parent);
    const parts = key.split(',');
    out.push({ name: name.get(blockId) ?? '', dx: Number(parts[0] ?? '0'), dy: Number(parts[1] ?? '0'), count: ids.length });
  }
  return out.sort((a, b) => b.count - a.count);
}
