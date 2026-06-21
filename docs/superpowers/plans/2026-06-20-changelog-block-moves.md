# Détection de « blocs déplacés » — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regrouper la cascade (N nœuds décalés du même Δ) en une seule ligne **« Bloc « X » déplacé · -51px · N éléments »**, le bloc nommé via l'arbre du snapshot.

**Architecture:** Cœur pur côté backend (a l'arbre) : `buildTreeMaps` + `commonAncestor` + `detectBlockMoves` → `BlockMove[]` exposé sur le diff ; le plugin rend les blocs et masque les nœuds de cascade. Non-destructif.

**Tech Stack:** TypeScript strict, HonoJS, Preact, Vitest.

## Global Constraints

- **Nommage par l'arbre** : 1 racine du cluster → nom précis ; >1 → **ancêtre commun** (jamais de nom inventé).
- Regroupement par **Δ arrondi au px** ; groupes **≥ 3** ; **déplacements dérivés seulement** (`scoreChange`=minor, #41).
- Fonctions **pures** ; ne modifie pas le moteur de diff ni le `DeltaJSON` (résumé d'affichage).

---

## File Structure

- **Create** `backend/src/services/block-moves.service.ts` — `BlockMove`, `buildTreeMaps`, `commonAncestor`, `detectBlockMoves`.
- **Create** `backend/src/tests/block-moves.service.test.ts`.
- **Modify** `backend/src/controllers/branches.controller.ts` — expose `block_moves` dans la réponse du diff.
- **Modify** `plugin/src/diffReducer.ts` — type `BlockMove` + `block_moves?` sur `DiffData`.
- **Modify** `plugin/src/ui.tsx` — rend les `block_moves` + masque les cartes de cascade.

---

## Task 1 : `buildTreeMaps` + `commonAncestor` (purs)

**Files:**
- Create: `backend/src/services/block-moves.service.ts`
- Test: `backend/src/tests/block-moves.service.test.ts`

**Interfaces:**
- Produces : `buildTreeMaps(root: NodeSnapshot): { parent: Map<string, string|null>; name: Map<string, string> }` ; `commonAncestor(ids: string[], parent: Map<string, string|null>): string`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Create `backend/src/tests/block-moves.service.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { buildTreeMaps, commonAncestor } from '../services/block-moves.service.js';
import type { NodeSnapshot } from '../types/figma.js';

const node = (id: string, name: string, children: NodeSnapshot[] = []): NodeSnapshot =>
  ({ id, name, type: 'FRAME', x: 0, y: 0, width: 0, height: 0, opacity: 1, fills: [], strokes: [], children } as NodeSnapshot);

// root → [a → [a1, a2], b]
const tree = node('root', 'Root', [
  node('a', 'BlocA', [node('a1', 'A1'), node('a2', 'A2')]),
  node('b', 'BlocB'),
]);

describe('buildTreeMaps', () => {
  it('mappe parent et name', () => {
    const { parent, name } = buildTreeMaps(tree);
    expect(parent.get('root')).toBeNull();
    expect(parent.get('a')).toBe('root');
    expect(parent.get('a1')).toBe('a');
    expect(name.get('a')).toBe('BlocA');
    expect(name.get('a1')).toBe('A1');
  });
});

describe('commonAncestor', () => {
  const { parent } = buildTreeMaps(tree);
  it('deux frères → leur parent', () => {
    expect(commonAncestor(['a1', 'a2'], parent)).toBe('a');
  });
  it('un nœud + son enfant → le nœud (l\'ancêtre)', () => {
    expect(commonAncestor(['a', 'a1'], parent)).toBe('a');
  });
  it('nœuds de branches différentes → la racine commune', () => {
    expect(commonAncestor(['a1', 'b'], parent)).toBe('root');
  });
});
```

- [ ] **Step 2 : Lancer → échec**

Run: `cd backend && npx vitest run src/tests/block-moves.service.test.ts`
Expected: FAIL — import non résolu.

- [ ] **Step 3 : Implémenter**

Create `backend/src/services/block-moves.service.ts` :
```ts
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
```

- [ ] **Step 4 : Lancer → succès**

Run: `cd backend && npx vitest run src/tests/block-moves.service.test.ts`
Expected: PASS.

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/block-moves.service.ts backend/src/tests/block-moves.service.test.ts
git commit -m "feat(backend): buildTreeMaps + commonAncestor (pur, pour le nommage de blocs)"
```

---

## Task 2 : `detectBlockMoves` (pur)

**Files:**
- Modify: `backend/src/services/block-moves.service.ts`
- Test: `backend/src/tests/block-moves.service.test.ts`

**Interfaces:**
- Consumes : `commonAncestor` (Task 1), `scoreChange`/`LayoutContext` (significance.service), `DeltaJSON`/`NodeDelta` (figma.ts).
- Produces : `detectBlockMoves(delta: DeltaJSON, parent: Map<string, string|null>, name: Map<string, string>, minCount: number): BlockMove[]`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Append to `backend/src/tests/block-moves.service.test.ts` :
```ts
import { detectBlockMoves } from '../services/block-moves.service.js';
import type { DeltaJSON, NodeDelta } from '../types/figma.js';

const moved = (id: string, dy: number): NodeDelta => ({
  nodeId: id, nodeName: id, nodeType: 'FRAME',
  changes: [{ property: 'y', oldValue: 0, newValue: dy }],
  layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', layoutPositioning: 'AUTO', // → y minor (dérivé)
});
const delta = (modified: NodeDelta[]): DeltaJSON =>
  ({ modified, added: [], removed: [], totalChanges: modified.length, metadata: { v1CapturedAt: '', v2CapturedAt: '', epsilon: 0.01, processingTimeMs: 0 } });

// arbre : parent P → [c1, c2, c3] ; et un bloc B → [b1, b2]
const maps = buildTreeMaps(node('P', 'Page', [
  node('c1', 'C1'), node('c2', 'C2'), node('c3', 'C3'),
  node('B', 'BlocBas', [node('b1', 'B1'), node('b2', 'B2')]),
]));

describe('detectBlockMoves', () => {
  it('3 frères décalés du même Δ → 1 bloc nommé par leur parent (>1 racine)', () => {
    const r = detectBlockMoves(delta([moved('c1', -51), moved('c2', -51), moved('c3', -51)]), maps.parent, maps.name, 3);
    expect(r).toEqual([{ name: 'Page', dx: 0, dy: -51, count: 3 }]);
  });

  it('un bloc (racine unique) + ses descendants → nommé par le bloc', () => {
    const r = detectBlockMoves(delta([moved('B', -51), moved('b1', -51), moved('b2', -51)]), maps.parent, maps.name, 3);
    expect(r).toEqual([{ name: 'BlocBas', dx: 0, dy: -51, count: 3 }]);
  });

  it('groupe sous le seuil → ignoré', () => {
    expect(detectBlockMoves(delta([moved('c1', -51), moved('c2', -51)]), maps.parent, maps.name, 3)).toEqual([]);
  });

  it('déplacement NON dérivé (authored, hors auto-layout) → non clusterisé', () => {
    const authored: NodeDelta = { nodeId: 'c1', nodeName: 'C1', nodeType: 'FRAME', changes: [{ property: 'y', oldValue: 0, newValue: -51 }] }; // pas de layout → notable
    expect(detectBlockMoves(delta([authored, authored, authored]), maps.parent, maps.name, 3)).toEqual([]);
  });
});
```

- [ ] **Step 2 : Lancer → échec**

Run: `cd backend && npx vitest run src/tests/block-moves.service.test.ts`
Expected: FAIL — `detectBlockMoves` n'existe pas.

- [ ] **Step 3 : Implémenter**

In `backend/src/services/block-moves.service.ts`, ajouter en tête les imports :
```ts
import type { NodeSnapshot, DeltaJSON, NodeDelta } from '../types/figma.js';
import { scoreChange, type LayoutContext } from './significance.service.js';
```
*(remplace l'import `NodeSnapshot` existant par cette ligne groupée.)*
Et en bas du fichier :
```ts
function ctxOf(nd: NodeDelta): LayoutContext {
  return {
    layoutSizingHorizontal: nd.layoutSizingHorizontal,
    layoutSizingVertical: nd.layoutSizingVertical,
    layoutPositioning: nd.layoutPositioning,
  };
}

// (dx, dy) du nœud si c'est un déplacement DÉRIVÉ (x/y mineurs = cascade), sinon null.
function derivedMove(nd: NodeDelta): { dx: number; dy: number } | null {
  const ctx = ctxOf(nd);
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
    const blockId = roots.length === 1 ? roots[0] : commonAncestor(roots, parent);
    const [dx, dy] = key.split(',').map(Number);
    out.push({ name: name.get(blockId) ?? '', dx, dy, count: ids.length });
  }
  return out.sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 4 : Lancer → succès**

Run: `cd backend && npx vitest run src/tests/block-moves.service.test.ts`
Expected: PASS (tous).

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/block-moves.service.ts backend/src/tests/block-moves.service.test.ts
git commit -m "feat(backend): detectBlockMoves — cascade groupée par Δ, nommée via l'arbre (pur)"
```

---

## Task 3 : Exposer `block_moves` sur le diff

**Files:**
- Modify: `backend/src/controllers/branches.controller.ts`

**Interfaces:**
- Consumes : `buildTreeMaps`, `detectBlockMoves` (Tasks 1-2).

- [ ] **Step 1 : Importer + calculer + ajouter à la réponse**

Dans `backend/src/controllers/branches.controller.ts`, ajouter l'import :
```ts
import { buildTreeMaps, detectBlockMoves } from '../services/block-moves.service.js';
```
Juste avant le `return c.json({ version: versionData, ... node_diffs: nodeDiffs })` final, calculer :
```ts
  const blockMoves = (delta && currentSnap)
    ? (() => { const { parent, name } = buildTreeMaps(currentSnap.root); return detectBlockMoves(delta as unknown as DeltaJSON, parent, name, 3); })()
    : [];
```
Et ajouter `block_moves: blockMoves` à l'objet retourné :
```ts
  return c.json({ version: versionData, prev_version: prevVersion, svg_b64: svgB64, prev_svg_b64: prevSvgB64, node_diffs: nodeDiffs, block_moves: blockMoves });
```

- [ ] **Step 2 : Typecheck + suite backend**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.
Run: `cd backend && npx vitest run`
Expected: PASS.

- [ ] **Step 3 : Commit**

```bash
git add backend/src/controllers/branches.controller.ts
git commit -m "feat(backend): expose block_moves (blocs déplacés) sur le diff"
```

---

## Task 4 : Rendu plugin des blocs déplacés

**Files:**
- Modify: `plugin/src/diffReducer.ts`
- Modify: `plugin/src/ui.tsx` (la liste `data.node_diffs.map`, ~l.672)

**Interfaces:**
- Consumes : `block_moves` du backend (Task 3).

- [ ] **Step 1 : Type `BlockMove` + champ `block_moves` (diffReducer)**

Dans `plugin/src/diffReducer.ts`, après le type `ReadableChange` :
```ts
export interface BlockMove { name: string; dx: number; dy: number; count: number }
```
Dans `DiffData`, ajouter :
```ts
  block_moves?: BlockMove[]
```

- [ ] **Step 2 : Rendre les blocs + masquer les cartes de cascade (ui.tsx)**

Dans `plugin/src/ui.tsx`, repérer le rendu de la liste (`{data.node_diffs.map(nd => <NodeDiffCard key={nd.nodeId} nd={nd} />)}`, ~l.672). Le remplacer par : un en-tête « blocs déplacés » + la liste **filtrée** (cartes avec un `readable` non vide, ou ajout/suppression) :
```tsx
                {data.block_moves && data.block_moves.length > 0 && (
                  <div class="flex flex-col gap-1 mb-2">
                    {data.block_moves.map((bm, i) => (
                      <div key={i} class="px-3 py-2 bg-gray-900 border border-gray-800 rounded-lg flex items-center gap-2 text-[11px]">
                        <span class="text-purple-400">⤢</span>
                        <span class="text-gray-200">Bloc {bm.name ? <span class="text-purple-300">« {bm.name} »</span> : ''} déplacé</span>
                        <span class="text-gray-500 font-mono">{bm.dx !== 0 ? `${bm.dx > 0 ? '+' : ''}${bm.dx}px ` : ''}{bm.dy !== 0 ? `${bm.dy > 0 ? '+' : ''}${bm.dy}px` : ''}</span>
                        <span class="text-gray-600 ml-auto">{bm.count} éléments</span>
                      </div>
                    ))}
                  </div>
                )}
                {data.node_diffs
                  .filter(nd => nd.kind !== 'modified' || (nd.readable && nd.readable.length > 0))
                  .map(nd => <NodeDiffCard key={nd.nodeId} nd={nd} />)}
```

- [ ] **Step 3 : Typecheck + suite plugin**

Run: `cd plugin && npx tsc --noEmit`
Expected: exit 0.
Run: `cd plugin && npx vitest run`
Expected: PASS (rendu = glue ; non-régression).

- [ ] **Step 4 : Commit**

```bash
git add plugin/src/diffReducer.ts plugin/src/ui.tsx
git commit -m "feat(plugin): rendu des blocs déplacés + masque les cartes de cascade"
```

---

## Vérification manuelle (post-plan)
Build + reload → diff d'un checkpoint où un gros bloc a été déplacé : au lieu de centaines de cartes muettes, **une ligne** « Bloc « X » déplacé · -51px · N éléments » ; les vraies modifs (couleurs, rotation) restent listées au-dessus/dessous.

## Self-Review (auteur du plan)
- **Couverture spec** : §3.1 buildTreeMaps/commonAncestor → Task 1 ✅ · detectBlockMoves → Task 2 ✅ · §3.2 expose → Task 3 ✅ · §3.3 rendu plugin (ligne nommée + masque cascade) → Task 4 ✅ · §2 nommage racine/ancêtre → detectBlockMoves ✅ · §4 tests purs → Tasks 1-2 ✅.
- **Placeholders** : aucun — code complet.
- **Cohérence types** : `BlockMove` (name/dx/dy/count) identique backend (Task 1) / plugin (Task 4) ; `buildTreeMaps`/`commonAncestor`/`detectBlockMoves` signatures stables ; `block_moves` exposé Task 3 consommé Task 4. ✅
- **Ordre** : Task 1 (maps) → 2 (detect) → 3 (endpoint) → 4 (plugin). ✅
