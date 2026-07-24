# Snapshot Precision (per-corner radius) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturer/differ/restaurer les **rayons par-coin** (`topLeft/TopRight/BottomRight/BottomLeftRadius`) pour que le changelog ne soit plus aveugle à un arrondi par-coin hyper précis — avec le minimum de code et **zéro changement downstream** (le delta garde la propriété `cornerRadius`).

**Architecture :** Le snapshot ne capture aujourd'hui que `cornerRadius` uniforme (mixed → `figma.mixed` → droppé). On ajoute UN champ `cornerRadii?: number[]` (4-uplet `[TL,TR,BR,BL]`), peuplé **uniquement quand les coins diffèrent**. Le diff normalise uniforme+par-coin en un 4-uplet et émet une seule `PropertyChange` de propriété **`cornerRadius`** (donc significance/change-format/AI restent inchangés). Le restore (chemin fallback ; le chemin principal clone-restore est déjà lossless) réapplique les 4 coins.

**Tech Stack :** Plugin Figma (TypeScript, `create-figma-plugin`) ↔ Backend HonoJS (TypeScript strict, Vitest). Les deux ont un type `NodeSnapshot` à garder en miroir + le schéma Zod backend.

## Global Constraints

- TypeScript **strict, zéro `any`** (côté backend ; côté plugin, éviter `any`, les casts structurels `as unknown as Record<string, unknown>` déjà présents sont tolérés).
- **Le moins de code possible / pas de surcharge** : ne PAS toucher significance/change-format/openai — la propriété émise reste `cornerRadius`.
- **Comportement uniforme inchangé** : un nœud à coins uniformes produit exactement le même delta qu'avant (mêmes tests verts). Le 4-uplet n'intervient que si au moins un côté est par-coin.
- Règle BDD : tout champ ajouté au snapshot DOIT être ajouté au **schéma Zod** `api.ts` (sinon il est supprimé silencieusement) ET aux DEUX types `NodeSnapshot` (plugin `plugin/src/types.ts` + backend `backend/src/types/figma.ts`).
- Tests : Vitest. Backend depuis `backend/`, plugin depuis `plugin/`. `npm run typecheck` + tests verts avant chaque commit.
- Ne JAMAIS committer `.devcontainer/`. Stager uniquement les fichiers de la tâche.
- Message de commit terminé par : `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

**Backend (Task 1) :**
- `backend/src/types/figma.ts` — +1 champ `cornerRadii?: number[]` sur `NodeSnapshot`.
- `backend/src/types/api.ts` — +1 ligne Zod `cornerRadii`.
- `backend/src/services/diff.service.ts` — remplacer le bloc cornerRadius par une compare 4-uplet normalisée + helper privé `cornerTuple`.
- `backend/src/tests/diff.service.test.ts` — +tests (par-coin détecté ; uniforme inchangé).

**Plugin (Task 2) :**
- `plugin/src/types.ts` — +1 champ `cornerRadii?: number[]`.
- `plugin/src/main.ts` — capture (`extractCornerRadii`) + restore (branche cornerRadius) + ajout `'cornerRadii'` à `RESTORE_PROPS`.
- `plugin/src/cornerRadii.ts` (NOUVEAU, petit module pur testable) — `computeCornerRadii(...)`.
- `plugin/src/cornerRadii.test.ts` (NOUVEAU) — tests purs du module.

---

## Phase 1 — Rayons par-coin (le cœur, minimal)

### Task 1 : Backend — capter `cornerRadii` dans le type/Zod et le diffuser

**Files:**
- Modify: `backend/src/types/figma.ts:62-63`
- Modify: `backend/src/types/api.ts` (schéma `nodeSnapshotSchema`, après `cornerRadius`)
- Modify: `backend/src/services/diff.service.ts` (bloc « Corner radius », ~lignes 123-130, + nouvelle méthode privée)
- Modify: `backend/src/tests/diff.service.test.ts`

**Interfaces:**
- Produces (type) : `NodeSnapshot.cornerRadii?: number[]` (longueur 4 : `[TL, TR, BR, BL]`).
- Le diff émet, pour un changement de coin, une `PropertyChange` avec `property: 'cornerRadius'`, `oldValue`/`newValue` = le **coin le plus modifié** (nombres, pour que significance garde son seuil 1px), `delta` = `"8/8/8/8 → 8/8.5/8/8 px"`.

- [ ] **Step 1 : Test qui échoue**

Ajouter dans `backend/src/tests/diff.service.test.ts` (réutilise `makeRoot`/`makeSnapshot` du haut du fichier ; `new DiffService()`) :

```ts
describe('rayons par-coin (cornerRadii)', () => {
  it('détecte un changement de coin (mixed), propriété cornerRadius, sans add/remove', () => {
    const diff = new DiffService();
    const v1 = makeSnapshot({ id: 'r', type: 'RECTANGLE', cornerRadii: [8, 8, 8, 8] });
    const v2 = makeSnapshot({ id: 'r', type: 'RECTANGLE', cornerRadii: [8, 8.5, 8, 8] });
    const delta = diff.compareSnapshots(v1, v2);
    const node = delta.modified.find(m => m.nodeId === 'r');
    expect(node).toBeDefined();
    const ch = node!.changes.find(c => c.property === 'cornerRadius');
    expect(ch).toBeDefined();
    expect(ch!.delta).toBe('8/8/8/8 → 8/8.5/8/8 px');
  });

  it('coins uniformes : comportement scalaire inchangé (+1.00px)', () => {
    const diff = new DiffService();
    const v1 = makeSnapshot({ id: 'r', type: 'RECTANGLE', cornerRadius: 8 });
    const v2 = makeSnapshot({ id: 'r', type: 'RECTANGLE', cornerRadius: 9 });
    const delta = diff.compareSnapshots(v1, v2);
    const ch = delta.modified.find(m => m.nodeId === 'r')!.changes.find(c => c.property === 'cornerRadius');
    expect(ch!.delta).toBe('+1.00px');
  });

  it('uniforme vs par-coin équivalents : aucun changement', () => {
    const diff = new DiffService();
    const v1 = makeSnapshot({ id: 'r', type: 'RECTANGLE', cornerRadius: 8 });
    const v2 = makeSnapshot({ id: 'r', type: 'RECTANGLE', cornerRadii: [8, 8, 8, 8] });
    const delta = diff.compareSnapshots(v1, v2);
    const node = delta.modified.find(m => m.nodeId === 'r');
    expect(node).toBeUndefined();
  });
});
```

Run: `npm run test:run -- src/tests/diff.service.test.ts`
Expected: FAIL (1er & 3e cas — `cornerRadii` pas géré ; le type ne compile peut-être pas encore).

- [ ] **Step 2 : Ajouter le champ au type backend**

Dans `backend/src/types/figma.ts`, après `cornerRadius?: number;` :

```ts
  cornerRadius?: number;
  cornerRadii?: number[]; // [TL, TR, BR, BL] — présent uniquement si coins par-coin (mixed)
```

- [ ] **Step 3 : Ajouter le champ au schéma Zod**

Dans `backend/src/types/api.ts`, dans `nodeSnapshotSchema`, après `cornerRadius: z.number().optional(),` :

```ts
    cornerRadius: z.number().optional(),
    cornerRadii: z.array(z.number()).length(4).optional(),
```

- [ ] **Step 4 : Implémenter la compare 4-uplet dans le diff**

Dans `backend/src/services/diff.service.ts`, remplacer le bloc existant :

```ts
    // Corner radius
    if (v1.cornerRadius !== undefined && v2.cornerRadius !== undefined) {
      this.compareNumeric(changes, 'cornerRadius', v1.cornerRadius, v2.cornerRadius, 'px');
    }
```

par :

```ts
    // Corner radius — uniforme ET par-coin. Si les deux côtés sont uniformes, on garde
    // EXACTEMENT le comportement scalaire historique (+X.XXpx). Dès qu'un côté est par-coin
    // (cornerRadii), on normalise en 4-uplet [TL,TR,BR,BL] et on compare coin par coin à ε.
    if (!v1.cornerRadii && !v2.cornerRadii) {
      if (v1.cornerRadius !== undefined && v2.cornerRadius !== undefined) {
        this.compareNumeric(changes, 'cornerRadius', v1.cornerRadius, v2.cornerRadius, 'px');
      }
    } else {
      const r1 = this.cornerTuple(v1);
      const r2 = this.cornerTuple(v2);
      if (r1 && r2) {
        // coin le plus modifié → oldValue/newValue numériques (significance garde son seuil 1px)
        let maxI = -1, maxD = 0;
        for (let i = 0; i < 4; i++) {
          const d = Math.abs((r1[i] ?? 0) - (r2[i] ?? 0));
          if (d > maxD) { maxD = d; maxI = i; }
        }
        if (maxD > this.EPSILON && maxI >= 0) {
          const fmt = (t: number[]) => t.map(n => Number(n.toFixed(2))).join('/');
          changes.push({
            property: 'cornerRadius',
            oldValue: r1[maxI],
            newValue: r2[maxI],
            delta: `${fmt(r1)} → ${fmt(r2)} px`,
          });
        }
      }
    }
```

Et ajouter cette méthode privée à la classe `DiffService` (à côté de `colorToHex`, par ex.) :

```ts
  // 4-uplet de rayons [TL,TR,BR,BL] : par-coin si présent, sinon uniforme étalé, sinon null.
  private cornerTuple(n: NodeSnapshot): number[] | null {
    if (n.cornerRadii && n.cornerRadii.length === 4) return n.cornerRadii;
    if (n.cornerRadius !== undefined) return [n.cornerRadius, n.cornerRadius, n.cornerRadius, n.cornerRadius];
    return null;
  }
```

- [ ] **Step 5 : Vérifier rouge → vert + suite + typecheck**

Run: `npm run test:run -- src/tests/diff.service.test.ts`
Expected: PASS (3 nouveaux + anciens cornerRadius inchangés).

Run: `npm run typecheck && npm run test:run`
Expected: PASS (toute la suite verte ; significance/change-format inchangés car la propriété reste `cornerRadius`).

- [ ] **Step 6 : Commit**

```bash
git add backend/src/types/figma.ts backend/src/types/api.ts backend/src/services/diff.service.ts backend/src/tests/diff.service.test.ts
git commit -m "feat(diff): track per-corner radius (cornerRadii) — uniform behavior unchanged"
```

---

### Task 2 : Plugin — capter `cornerRadii` et le restaurer

**Files:**
- Create: `plugin/src/cornerRadii.ts`
- Create: `plugin/src/cornerRadii.test.ts`
- Modify: `plugin/src/types.ts:38` (après `cornerRadius?: number;`)
- Modify: `plugin/src/main.ts` (extractSnapshot ~561, applyDeltaProps ~157-158, RESTORE_PROPS ~228)

**Interfaces:**
- Consumes : le type backend `NodeSnapshot.cornerRadii?: number[]` (miroir).
- Produces : `computeCornerRadii(corners): number[] | undefined` — pur, testable sans Figma.

- [ ] **Step 1 : Test qui échoue (logique pure)**

Create `plugin/src/cornerRadii.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { computeCornerRadii } from './cornerRadii.js';

describe('computeCornerRadii', () => {
  it('coins uniformes → undefined (le scalaire cornerRadius suffit)', () => {
    expect(computeCornerRadii({ topLeftRadius: 8, topRightRadius: 8, bottomRightRadius: 8, bottomLeftRadius: 8 })).toBeUndefined();
  });
  it('coins mixtes → 4-uplet [TL,TR,BR,BL]', () => {
    expect(computeCornerRadii({ topLeftRadius: 8, topRightRadius: 8.5, bottomRightRadius: 8, bottomLeftRadius: 0 })).toEqual([8, 8.5, 8, 0]);
  });
  it('valeur non-numérique (mixed/symbol/absent) → undefined', () => {
    expect(computeCornerRadii({ topLeftRadius: 8, topRightRadius: 8, bottomRightRadius: 8 })).toBeUndefined();
  });
});
```

Run (depuis `plugin/`): `npm run test:run -- src/cornerRadii.test.ts` (ou `npx vitest run src/cornerRadii.test.ts` selon les scripts du plugin)
Expected: FAIL (module absent).

> Vérifier le script de test du plugin dans `plugin/package.json` (probablement `vitest`). Utiliser la commande équivalente à celle du backend.

- [ ] **Step 2 : Implémenter le module pur**

Create `plugin/src/cornerRadii.ts` :

```ts
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
```

- [ ] **Step 3 : Ajouter le champ au type plugin**

Dans `plugin/src/types.ts`, après `strokeWeight?: number; cornerRadius?: number;` :

```ts
  strokeWeight?: number; cornerRadius?: number;
  cornerRadii?: number[]; // [TL, TR, BR, BL] — présent uniquement si coins mixtes
```

- [ ] **Step 4 : Capter dans extractSnapshot**

Dans `plugin/src/main.ts`, importer en tête :

```ts
import { computeCornerRadii } from './cornerRadii.js';
```

Dans `extractSnapshot`, juste après la ligne `cornerRadius: safeNum(...)` :

```ts
    cornerRadius: safeNum('cornerRadius' in node ? (node as { cornerRadius: number | symbol }).cornerRadius : undefined),
    cornerRadii: computeCornerRadii(node as unknown as import('./cornerRadii.js').CornerInput),
```

- [ ] **Step 5 : Restaurer les coins par-coin (fallback)**

Dans `plugin/src/main.ts`, ajouter `'cornerRadii'` à la liste `RESTORE_PROPS` :

```ts
const RESTORE_PROPS = ['opacity', 'visible', 'rotation', 'cornerRadius', 'cornerRadii', 'strokeWeight', 'fills', 'strokes', 'effects', 'fontFamily', 'fontWeight', 'fontStyle', 'characters', 'fontSize', 'vectorPaths'];
```

Et remplacer la ligne unique du restore cornerRadius :

```ts
  if (props.has('cornerRadius') && 'cornerRadius' in node && snap.cornerRadius !== undefined)
    (node as CornerMixin).cornerRadius = snap.cornerRadius;
```

par :

```ts
  if ((props.has('cornerRadius') || props.has('cornerRadii')) && 'cornerRadius' in node) {
    if (snap.cornerRadii && snap.cornerRadii.length === 4) {
      const n = node as unknown as Record<string, number>;
      try {
        n.topLeftRadius = snap.cornerRadii[0]; n.topRightRadius = snap.cornerRadii[1];
        n.bottomRightRadius = snap.cornerRadii[2]; n.bottomLeftRadius = snap.cornerRadii[3];
      } catch { /* non assignable sur ce type de nœud */ }
    } else if (snap.cornerRadius !== undefined) {
      (node as CornerMixin).cornerRadius = snap.cornerRadius;
    }
  }
```

- [ ] **Step 6 : Vert + typecheck + suite plugin**

Run (depuis `plugin/`): `npm run test:run -- src/cornerRadii.test.ts`
Expected: PASS.

Run (depuis `plugin/`): `npm run typecheck && npm run test:run` (adapter aux scripts du plugin ; s'il n'y a pas de `typecheck`, utiliser `npx tsc --noEmit`)
Expected: PASS (aucune régression).

- [ ] **Step 7 : Commit**

```bash
git add plugin/src/cornerRadii.ts plugin/src/cornerRadii.test.ts plugin/src/types.ts plugin/src/main.ts
git commit -m "feat(plugin): capture + restore per-corner radius (cornerRadii)"
```

---

## Phase 2 — Micro-typo (OPTIONNEL — même patron, scalaire, encore plus léger)

> **Cuttable.** À ne faire QUE si tu veux la précision typographique (interlettrage/interligne). Même structure que Phase 1 mais en plus simple (valeurs scalaires → `compareNumeric` direct, pas de 4-uplet). Si tu t'arrêtes après la Phase 1, le plan est complet pour l'arrondi.

### Task 3 : `letterSpacing` + `lineHeight` (scalaires) bout-en-bout

**Files:**
- Modify: `backend/src/types/figma.ts`, `backend/src/types/api.ts`, `backend/src/services/diff.service.ts`, `backend/src/services/significance.service.ts`, `backend/src/tests/diff.service.test.ts`
- Modify: `plugin/src/types.ts`, `plugin/src/main.ts`

**Interfaces:**
- Produces (types, plugin + backend) : `letterSpacing?: number`, `lineHeight?: number` (en px ; Figma expose des unions `{value, unit}` — on stocke la valeur résolue en px, `undefined` si `AUTO`/mixed).

- [ ] **Step 1 : Test qui échoue (diff)**

Ajouter dans `backend/src/tests/diff.service.test.ts` :

```ts
describe('micro-typo (letterSpacing / lineHeight)', () => {
  it('détecte un changement d\'interlettrage', () => {
    const diff = new DiffService();
    const v1 = makeSnapshot({ id: 't', type: 'TEXT', letterSpacing: 0 });
    const v2 = makeSnapshot({ id: 't', type: 'TEXT', letterSpacing: 1.5 });
    const ch = diff.compareSnapshots(v1, v2).modified.find(m => m.nodeId === 't')!.changes.find(c => c.property === 'letterSpacing');
    expect(ch!.delta).toBe('+1.50px');
  });
  it('détecte un changement d\'interligne', () => {
    const diff = new DiffService();
    const v1 = makeSnapshot({ id: 't', type: 'TEXT', lineHeight: 20 });
    const v2 = makeSnapshot({ id: 't', type: 'TEXT', lineHeight: 24 });
    const ch = diff.compareSnapshots(v1, v2).modified.find(m => m.nodeId === 't')!.changes.find(c => c.property === 'lineHeight');
    expect(ch!.delta).toBe('+4.00px');
  });
});
```

Run: `npm run test:run -- src/tests/diff.service.test.ts` → FAIL.

- [ ] **Step 2 : Types backend + Zod**

`backend/src/types/figma.ts`, après `fontStyleName?: string;` :

```ts
  fontStyleName?: string;
  letterSpacing?: number; // px (résolu) ; undefined si AUTO/mixed
  lineHeight?: number;    // px (résolu) ; undefined si AUTO/mixed
```

`backend/src/types/api.ts`, dans `nodeSnapshotSchema` après `fontStyleName: z.string().optional(),` :

```ts
    letterSpacing: z.number().optional(),
    lineHeight: z.number().optional(),
```

- [ ] **Step 3 : Diff + significance**

Dans `backend/src/services/diff.service.ts`, après le bloc `fontStyle` (avant le bloc `effects`) :

```ts
    if (v1.letterSpacing !== undefined && v2.letterSpacing !== undefined) {
      this.compareNumeric(changes, 'letterSpacing', v1.letterSpacing, v2.letterSpacing, 'px');
    }
    if (v1.lineHeight !== undefined && v2.lineHeight !== undefined) {
      this.compareNumeric(changes, 'lineHeight', v1.lineHeight, v2.lineHeight, 'px');
    }
```

Dans `backend/src/services/significance.service.ts`, dans `SIGNIFICANCE_THRESHOLDS` :

```ts
  fontSize: 1,
  letterSpacing: 0.1,   // px — sensible (l'interlettrage joue en dixièmes)
  lineHeight: 1,        // px
```

- [ ] **Step 4 : Vert backend + commit partiel**

Run: `npm run typecheck && npm run test:run` → PASS.

```bash
git add backend/src/types/figma.ts backend/src/types/api.ts backend/src/services/diff.service.ts backend/src/services/significance.service.ts backend/src/tests/diff.service.test.ts
git commit -m "feat(diff): track letterSpacing + lineHeight"
```

- [ ] **Step 5 : Plugin — capture + restore + types**

`plugin/src/types.ts`, après `fontStyleName?: string;` : ajouter `letterSpacing?: number; lineHeight?: number;`.

Dans `plugin/src/main.ts` `extractSnapshot`, pour les nœuds TEXT, ajouter (en résolvant l'unité Figma en px ; `AUTO`/`PERCENT`/mixed → undefined) :

```ts
    letterSpacing: node.type === 'TEXT' ? (() => {
      const ls = (node as unknown as TextNode).letterSpacing;
      return typeof ls === 'object' && ls !== null && (ls as { unit: string }).unit === 'PIXELS' ? (ls as { value: number }).value : undefined;
    })() : undefined,
    lineHeight: node.type === 'TEXT' ? (() => {
      const lh = (node as unknown as TextNode).lineHeight;
      return typeof lh === 'object' && lh !== null && (lh as { unit: string }).unit === 'PIXELS' ? (lh as { value: number }).value : undefined;
    })() : undefined,
```

Dans `applyDeltaProps` (chemin TEXT, après le bloc `fontSize`), ajouter le restore (charger la police est déjà fait plus haut) :

```ts
  if (props.has('letterSpacing') && node.type === 'TEXT' && snap.letterSpacing !== undefined) {
    (node as TextNode).letterSpacing = { value: snap.letterSpacing, unit: 'PIXELS' };
  }
  if (props.has('lineHeight') && node.type === 'TEXT' && snap.lineHeight !== undefined) {
    (node as TextNode).lineHeight = { value: snap.lineHeight, unit: 'PIXELS' };
  }
```

Ajouter `'letterSpacing'`, `'lineHeight'` à `RESTORE_PROPS`.

- [ ] **Step 6 : Vert plugin + commit**

Run (depuis `plugin/`): `npm run typecheck && npm run test:run` → PASS.

```bash
git add plugin/src/types.ts plugin/src/main.ts
git commit -m "feat(plugin): capture + restore letterSpacing + lineHeight"
```

---

## Self-Review

**1. Couverture du spec :**
- Arrondi par-coin invisible au diff → Task 1 (backend détection) + Task 2 (capture/restore). ✅
- Zéro changement downstream → la propriété émise reste `cornerRadius` (significance/change-format/openai intacts). ✅
- Comportement uniforme préservé → branche `if (!v1.cornerRadii && !v2.cornerRadii)` garde `compareNumeric` scalaire ; test dédié. ✅
- Règle Zod/2 types miroir → champs ajoutés aux 3 endroits (Task 1 steps 2-3, Task 2 step 3). ✅
- Micro-typo → Phase 2 optionnelle. ✅

**2. Placeholders :** aucun TODO/“à compléter” ; code complet à chaque step.

**3. Cohérence des types :** `cornerRadii?: number[]` identique dans `plugin/src/types.ts`, `backend/src/types/figma.ts`, et `z.array(z.number()).length(4)` dans `api.ts`. `computeCornerRadii` renvoie `number[] | undefined`. Le diff lit `n.cornerRadii` (longueur 4) — cohérent.

**Note restore (important, pas un manque) :** le restore **principal** (clone `dg_history`, `main.ts:292`) est déjà pixel-perfect pour TOUT (y compris coins mixtes) — ce plan ne le touche pas. Les modifs restore de Task 2/3 ne concernent QUE le **fallback** `applyDeltaProps` (quand aucun clone n'existe), pour qu'il dégrade le moins possible.

**Hors périmètre assumé (YAGNI) :** rich-text par-plage, blend modes, stroke align/dash, constraints, layout padding/gap — non couverts (gros lift, faible fréquence ; le clone-restore les préserve déjà, seul le changelog reste aveugle).
