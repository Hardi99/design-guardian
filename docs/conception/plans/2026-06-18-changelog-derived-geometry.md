# Changelog — géométrie dérivée = mineure (brique A2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Démote en `minor` les changements de géométrie recalculés par l'auto-layout (x/y d'enfants de flux, width/height sur axes FILL/HUG) pour que les changements *authored* ressortent dans le changelog.

**Architecture:** Cœur pur côté backend (`scoreChange(change, ctx?)` + `rankDelta`), contexte layout optionnel (rétro-compatible). On capture `layoutPositioning` (plugin), on le fait transiter via `NodeSnapshot` → `NodeDelta` (passthrough dans `diff.service`), et la significativité l'utilise. Non-destructif : on ne change que le *rang*, jamais le `DeltaJSON`.

**Tech Stack:** TypeScript strict (zéro `any`), HonoJS, Vitest. Backend `backend/src/`, plugin `plugin/src/`.

## Global Constraints

- **NON-DESTRUCTIF** : ne pas modifier le moteur de diff, le `DeltaJSON`, ni le restore. On classe (rang), on ne supprime rien.
- **Rétro-compatible** : `scoreChange` sans `ctx` = comportement actuel → les 12 tests significativité existants restent verts **inchangés**.
- Tout champ ajouté à un snapshot DOIT être dans le **schéma Zod** (`api.ts`) sinon supprimé silencieusement.
- Fonctions de scoring **pures** (pas d'I/O, pas de mutation de l'entrée).

---

## File Structure

- **Modify** `backend/src/services/significance.service.ts` — `LayoutContext`, `isFlowChild`, `scoreChange(change, ctx?)`, `rankDelta` passe le ctx.
- **Modify** `backend/src/tests/significance.service.test.ts` — tests purs.
- **Modify** `backend/src/types/figma.ts` — `NodeSnapshot` (+ `layoutSizing*`, `layoutPositioning`) et `NodeDelta` (+ les 3 champs).
- **Modify** `backend/src/types/api.ts` — `nodeSnapshotSchema` (+ `layoutPositioning` ; `layoutSizing*` déjà présents).
- **Modify** `backend/src/services/diff.service.ts:47` — passthrough des 3 champs depuis `v2Node` sur `modified`.
- **Modify** `plugin/src/main.ts` — `extractSnapshot` capte `layoutPositioning`.
- **Modify** `plugin/src/types.ts` — `NodeSnapshot` (+ `layoutPositioning`).

---

## Task 1 : `scoreChange` avec contexte layout (pur)

**Files:**
- Modify: `backend/src/services/significance.service.ts`
- Test: `backend/src/tests/significance.service.test.ts`

**Interfaces:**
- Produces : `interface LayoutContext { layoutSizingHorizontal?: 'FIXED'|'HUG'|'FILL'; layoutSizingVertical?: 'FIXED'|'HUG'|'FILL'; layoutPositioning?: 'AUTO'|'ABSOLUTE' }` ; `scoreChange(change: PropertyChange, ctx?: LayoutContext): Significance`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Append to `backend/src/tests/significance.service.test.ts` (le fichier importe déjà `scoreChange`, `PropertyChange`) :

```ts
import type { LayoutContext } from '../services/significance.service.js';

describe('scoreChange — géométrie dérivée (contexte auto-layout)', () => {
  const flowChild: LayoutContext = { layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', layoutPositioning: 'AUTO' };

  it('x/y d\'un enfant de flux → minor (position recalculée)', () => {
    expect(scoreChange(ch({ property: 'x', oldValue: 0, newValue: 80 }), flowChild)).toBe('minor');
    expect(scoreChange(ch({ property: 'y', oldValue: 0, newValue: 80 }), flowChild)).toBe('minor');
  });

  it('width sur axe FILL/HUG → minor ; FIXED → notable (authored)', () => {
    expect(scoreChange(ch({ property: 'width', oldValue: 100, newValue: 300 }), { layoutSizingHorizontal: 'FILL' })).toBe('minor');
    expect(scoreChange(ch({ property: 'width', oldValue: 100, newValue: 300 }), { layoutSizingHorizontal: 'HUG' })).toBe('minor');
    expect(scoreChange(ch({ property: 'width', oldValue: 100, newValue: 300 }), { layoutSizingHorizontal: 'FIXED' })).toBe('notable');
  });

  it('height via layoutSizingVertical (idem)', () => {
    expect(scoreChange(ch({ property: 'height', oldValue: 100, newValue: 300 }), { layoutSizingVertical: 'FILL' })).toBe('minor');
    expect(scoreChange(ch({ property: 'height', oldValue: 100, newValue: 300 }), { layoutSizingVertical: 'FIXED' })).toBe('notable');
  });

  it('enfant ABSOLU → x/y notable (position authored, pas dérivée)', () => {
    const abs: LayoutContext = { layoutSizingHorizontal: 'FIXED', layoutPositioning: 'ABSOLUTE' };
    expect(scoreChange(ch({ property: 'x', oldValue: 0, newValue: 80 }), abs)).toBe('notable');
  });

  it('sans contexte → comportement actuel (non-régression)', () => {
    expect(scoreChange(ch({ property: 'x', oldValue: 0, newValue: 80 }))).toBe('notable'); // ≥1px
    expect(scoreChange(ch({ property: 'x', oldValue: 0, newValue: 0.2 }))).toBe('minor');  // <1px
  });
});
```

- [ ] **Step 2 : Lancer → échec**

Run: `cd backend && npx vitest run src/tests/significance.service.test.ts`
Expected: FAIL — `LayoutContext` introuvable / `scoreChange` ignore le 2e argument.

- [ ] **Step 3 : Implémenter**

In `backend/src/services/significance.service.ts`, ajouter après le type `Significance` :

```ts
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
```

Puis remplacer la signature + le début de `scoreChange` :

```ts
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
```

- [ ] **Step 4 : Lancer → succès**

Run: `cd backend && npx vitest run src/tests/significance.service.test.ts`
Expected: PASS (12 existants + 5 nouveaux).

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/significance.service.ts backend/src/tests/significance.service.test.ts
git commit -m "feat(backend): scoreChange — géométrie dérivée auto-layout = minor (contexte optionnel)"
```

---

## Task 2 : Types — `NodeSnapshot`, `NodeDelta`, Zod

**Files:**
- Modify: `backend/src/types/figma.ts`
- Modify: `backend/src/types/api.ts`

**Interfaces:**
- Produces : `NodeSnapshot` et `NodeDelta` portent `layoutSizingHorizontal?: 'FIXED'|'HUG'|'FILL'`, `layoutSizingVertical?: 'FIXED'|'HUG'|'FILL'`, `layoutPositioning?: 'AUTO'|'ABSOLUTE'`.

- [ ] **Step 1 : Étendre `NodeSnapshot` (backend `figma.ts`)**

Dans `backend/src/types/figma.ts`, après `cornerRadius?: number;` (l.62) :
```ts
  // Auto-layout (pour la significativité : distinguer géométrie authored vs dérivée)
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  layoutPositioning?: 'AUTO' | 'ABSOLUTE';
```

- [ ] **Step 2 : Étendre `NodeDelta` (backend `figma.ts`)**

Remplacer l'interface `NodeDelta` :
```ts
// Changes for a single node
export interface NodeDelta {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  changes: PropertyChange[];
  // Contexte layout (recopié du snapshot v2) — pour la significativité géométrie dérivée
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  layoutPositioning?: 'AUTO' | 'ABSOLUTE';
}
```

- [ ] **Step 3 : Étendre le Zod (backend `api.ts`)**

Dans `backend/src/types/api.ts`, le `nodeSnapshotSchema` a déjà `layoutSizingHorizontal`/`Vertical`. Ajouter juste après eux (après la l. `layoutSizingVertical: …`) :
```ts
    layoutPositioning: z.enum(['AUTO', 'ABSOLUTE']).optional(),
```

- [ ] **Step 4 : Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5 : Commit**

```bash
git add backend/src/types/figma.ts backend/src/types/api.ts
git commit -m "feat(backend): types — layoutPositioning + layout context sur NodeSnapshot/NodeDelta"
```

---

## Task 3 : `rankDelta` passe le contexte layout (pur)

**Files:**
- Modify: `backend/src/services/significance.service.ts`
- Test: `backend/src/tests/significance.service.test.ts`

**Interfaces:**
- Consumes : `scoreChange(change, ctx)` (Task 1), `NodeDelta` avec champs layout (Task 2).

- [ ] **Step 1 : Écrire le test qui échoue**

Append to `backend/src/tests/significance.service.test.ts` (le fichier importe déjà `rankDelta`, `NodeDelta`, et a le helper `node()` + `delta()`) :

```ts
describe('rankDelta — utilise le contexte layout du NodeDelta', () => {
  it('un nœud dont tous les changements sont dérivés (enfant de flux) → minorModified', () => {
    const n: NodeDelta = {
      nodeId: 'Box', nodeName: 'Box', nodeType: 'FRAME',
      changes: [{ property: 'y', oldValue: 0, newValue: 63 }, { property: 'x', oldValue: 0, newValue: 12 }],
      layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', layoutPositioning: 'AUTO',
    };
    const r = rankDelta(delta({ modified: [n] }));
    expect(r.minorModified.map(x => x.nodeName)).toEqual(['Box']);
    expect(r.notableModified).toHaveLength(0);
  });

  it('un resize FIXED reste notable malgré le contexte auto-layout', () => {
    const n: NodeDelta = {
      nodeId: 'Logo', nodeName: 'Logo', nodeType: 'RECTANGLE',
      changes: [{ property: 'width', oldValue: 100, newValue: 300 }],
      layoutSizingHorizontal: 'FIXED', layoutSizingVertical: 'FIXED', layoutPositioning: 'AUTO',
    };
    const r = rankDelta(delta({ modified: [n] }));
    expect(r.notableModified.map(x => x.nodeName)).toEqual(['Logo']);
  });
});
```

- [ ] **Step 2 : Lancer → échec**

Run: `cd backend && npx vitest run src/tests/significance.service.test.ts`
Expected: FAIL — le premier nœud part en `notableModified` (rankDelta ignore encore le ctx).

- [ ] **Step 3 : Implémenter**

In `backend/src/services/significance.service.ts`, dans `rankDelta`, remplacer la boucle :
```ts
  for (const n of delta.modified) {
    const ctx: LayoutContext = {
      layoutSizingHorizontal: n.layoutSizingHorizontal,
      layoutSizingVertical: n.layoutSizingVertical,
      layoutPositioning: n.layoutPositioning,
    };
    const hasNotable = n.changes.some(c => scoreChange(c, ctx) === 'notable');
    (hasNotable ? notableModified : minorModified).push(n);
  }
```

- [ ] **Step 4 : Lancer → succès + non-régression**

Run: `cd backend && npx vitest run src/tests/significance.service.test.ts`
Expected: PASS (tous).

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/significance.service.ts backend/src/tests/significance.service.test.ts
git commit -m "feat(backend): rankDelta — passe le contexte layout à scoreChange"
```

---

## Task 4 : Passthrough du contexte dans `diff.service`

**Files:**
- Modify: `backend/src/services/diff.service.ts:47`

**Interfaces:**
- Consumes : `NodeSnapshot` avec champs layout (Task 2), `NodeDelta` avec champs layout (Task 2).

- [ ] **Step 1 : Recopier les champs layout du snapshot v2 sur `modified`**

Dans `backend/src/services/diff.service.ts`, remplacer la ligne 47 :
```ts
        modified.push({ nodeId: id, nodeName: v2Node.name, nodeType: v2Node.type, changes });
```
par :
```ts
        modified.push({
          nodeId: id, nodeName: v2Node.name, nodeType: v2Node.type, changes,
          layoutSizingHorizontal: v2Node.layoutSizingHorizontal,
          layoutSizingVertical: v2Node.layoutSizingVertical,
          layoutPositioning: v2Node.layoutPositioning,
        });
```
*(Les nœuds `added`/`removed` n'ont pas besoin du contexte : ils sont toujours `notable`/pass-through dans `rankDelta`.)*

- [ ] **Step 2 : Typecheck + suite diff**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0.
Run: `cd backend && npx vitest run`
Expected: PASS (tous — le diff existant n'est pas affecté, les nouveaux champs sont optionnels).

- [ ] **Step 3 : Commit**

```bash
git add backend/src/services/diff.service.ts
git commit -m "feat(backend): diff.service — passthrough du contexte layout sur NodeDelta modified"
```

---

## Task 5 : Capture `layoutPositioning` (plugin)

**Files:**
- Modify: `plugin/src/main.ts`
- Modify: `plugin/src/types.ts`

**Interfaces:**
- Produces : le snapshot plugin inclut `layoutPositioning` quand disponible.

- [ ] **Step 1 : Étendre `NodeSnapshot` (plugin `types.ts`)**

Dans `plugin/src/types.ts`, après les lignes `layoutSizingHorizontal?`/`layoutSizingVertical?` :
```ts
  layoutPositioning?: 'AUTO' | 'ABSOLUTE';
```

- [ ] **Step 2 : Helper de lecture guardée (plugin `main.ts`)**

Dans `plugin/src/main.ts`, juste après la fonction `extractLayoutSizing`, ajouter :
```ts
// Lecture guardée du positionnement auto-layout ('AUTO' = dans le flux, 'ABSOLUTE' = libre).
// Le getter peut throw hors auto-layout → try/catch.
function extractLayoutPositioning(node: SceneNode): 'AUTO' | 'ABSOLUTE' | undefined {
  try {
    const v = (node as unknown as Record<string, unknown>).layoutPositioning;
    return v === 'AUTO' || v === 'ABSOLUTE' ? v : undefined;
  } catch {
    return undefined;
  }
}
```

- [ ] **Step 3 : L'appeler dans `extractSnapshot`**

Dans `plugin/src/main.ts`, dans l'objet retourné par `extractSnapshot`, juste après les lignes `layoutSizingHorizontal: …` / `layoutSizingVertical: …` :
```ts
    layoutPositioning: extractLayoutPositioning(node),
```

- [ ] **Step 4 : Typecheck + suite plugin**

Run: `cd plugin && npx tsc --noEmit`
Expected: exit 0.
Run: `cd plugin && npx vitest run`
Expected: PASS (tous — capture = glue, pas de test unitaire ; non-régression).

- [ ] **Step 5 : Commit**

```bash
git add plugin/src/main.ts plugin/src/types.ts
git commit -m "feat(plugin): capture layoutPositioning (contexte significativité géométrie dérivée)"
```

---

## Vérification manuelle (post-plan)
Capturer v1 → agrandir un élément FIXED dans un frame auto-layout (provoque le reflow des voisins) → capturer v2. Le résumé IA doit **mener avec le resize** (authored) et **grouper les décalages des voisins** en « + N ajustements mineurs », au lieu de les lister.

## Self-Review (auteur du plan)
- **Couverture spec** : §3 règle → Task 1 (scoreChange) ✅ · §4.1 capture → Task 5 ✅ · §4.2 types/Zod → Task 2 (+ plugin type Task 5) ✅ · §4.3 NodeDelta → Task 2 ✅ · §4.4 diff passthrough → Task 4 ✅ · §4.5 significance → Task 1+3 ✅ · §6 tests purs → Task 1+3 ✅. Non-destructif (Global Constraints) ✅.
- **Placeholders** : aucun — code complet à chaque étape.
- **Cohérence types** : `LayoutContext` (h/v/positioning), `isFlowChild`, `scoreChange(change, ctx?)`, `NodeDelta`+3 champs, `extractLayoutPositioning` — noms/types identiques entre Tasks 1→5.
- **Ordre** : Task 2 (types) avant Task 3 (rankDelta lit `NodeDelta.layout*`) et Task 4 (diff lit `NodeSnapshot.layout*`). ✅
