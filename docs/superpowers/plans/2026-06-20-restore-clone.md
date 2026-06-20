# Restore lossless par `node.clone()` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restaurer un checkpoint **sans perte** en re-clonant un clone du nœud stocké dans le fichier (page `dg/_history`), avec repli sur le restore actuel si aucun clone n'existe.

**Architecture:** Deux représentations — JSON snapshot (cloud, diff/changelog, inchangé) + **clone in-file** (restore lossless). À la capture, on clone le nœud sur `dg/_history` (taggé) ; au restore, on re-clone ce clone et on remplace le nœud live. Le cœur de sélection (`pickHistoryClone`, `framesToPrune`) est **pur** (TDD) ; le clonage Figma est de la glue (typecheck + vérif manuelle).

**Tech Stack:** TypeScript strict (zéro `any`), `create-figma-plugin`, Preact, Vitest. Plugin `plugin/src/`.

## Global Constraints

- **Clone = primaire, restore actuel = FALLBACK** : si aucun clone d'historique pour le checkpoint → `handleRestoreToFigma` existant (propriétés/SVG). **Zéro régression.**
- **Élagage : N derniers par asset**, `HISTORY_KEEP_N = 5`.
- **Stockage** : une page `dg/_history` ; un frame-clone par checkpoint, **locké**.
- `figma.*` **uniquement** dans le main thread ; appels HTTP **uniquement** dans le UI thread.
- `setPluginData`/clone peuvent throw (viewer read-only) → try/catch.
- Ne JAMAIS changer `figma.currentPage` à la capture (ne pas perturber l'utilisateur).

---

## File Structure

- **Create** `plugin/src/restoreClone.ts` — `HistoryFrameInfo`, `pickHistoryClone`, `framesToPrune` (purs).
- **Create** `plugin/src/restoreClone.test.ts` — tests purs.
- **Modify** `plugin/src/types.ts` — `STORE_HISTORY_CLONE` (UIToMain) + `versionId?` sur `RESTORE_TO_FIGMA`.
- **Modify** `plugin/src/main.ts` — page `dg/_history`, capture phase 1 (clone pending), handler phase 2 (finalise + élague), restore-par-clone.
- **Modify** `plugin/src/ui.tsx` — envoie `STORE_HISTORY_CLONE` après POST checkpoint ; passe `versionId` au `RESTORE_TO_FIGMA`.

**Clés `pluginData` (sur chaque frame-clone de `dg/_history`) :**
- `dg_history_pending` : id du nœud original (phase 1 ; vidé une fois finalisé)
- `dg_history_version` : version id (phase 2)
- `dg_history_asset` : dg_id de l'asset (groupage pour l'élagage)
- `dg_history_vnum` : numéro de version (tri d'élagage)

---

## Task 1 : Helpers purs `restoreClone.ts`

**Files:**
- Create: `plugin/src/restoreClone.ts`
- Test: `plugin/src/restoreClone.test.ts`

**Interfaces:**
- Produces : `interface HistoryFrameInfo { id: string; versionId?: string; assetId?: string; versionNumber?: number }` ; `pickHistoryClone(frames: HistoryFrameInfo[], versionId: string): string | undefined` ; `framesToPrune(frames: HistoryFrameInfo[], assetId: string, keepN: number): string[]`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Create `plugin/src/restoreClone.test.ts` :
```ts
import { describe, it, expect } from 'vitest';
import { pickHistoryClone, framesToPrune, type HistoryFrameInfo } from './restoreClone.js';

const f = (over: Partial<HistoryFrameInfo>): HistoryFrameInfo =>
  ({ id: 'x', versionId: undefined, assetId: 'A', versionNumber: undefined, ...over });

describe('pickHistoryClone', () => {
  it('renvoie l\'id du frame dont versionId correspond', () => {
    const frames = [f({ id: 'c1', versionId: 'v1' }), f({ id: 'c2', versionId: 'v2' })];
    expect(pickHistoryClone(frames, 'v2')).toBe('c2');
  });
  it('undefined si aucun match', () => {
    expect(pickHistoryClone([f({ id: 'c1', versionId: 'v1' })], 'vX')).toBeUndefined();
  });
});

describe('framesToPrune', () => {
  it('garde les N plus récents (vnum décroissant), renvoie les plus vieux à supprimer', () => {
    const frames = [
      f({ id: 'a', assetId: 'A', versionNumber: 1 }),
      f({ id: 'b', assetId: 'A', versionNumber: 2 }),
      f({ id: 'c', assetId: 'A', versionNumber: 3 }),
    ];
    expect(framesToPrune(frames, 'A', 2).sort()).toEqual(['a']); // garde v3,v2 → supprime v1
  });
  it('ne touche pas les autres assets', () => {
    const frames = [
      f({ id: 'a', assetId: 'A', versionNumber: 1 }),
      f({ id: 'z', assetId: 'B', versionNumber: 1 }),
    ];
    expect(framesToPrune(frames, 'A', 5)).toEqual([]); // 1 seul pour A, sous la limite
  });
  it('ignore les frames non finalisées (versionNumber undefined)', () => {
    const frames = [f({ id: 'p', assetId: 'A', versionNumber: undefined }), f({ id: 'a', assetId: 'A', versionNumber: 1 })];
    expect(framesToPrune(frames, 'A', 1)).toEqual([]); // 1 finalisée seulement → rien à élaguer
  });
});
```

- [ ] **Step 2 : Lancer → échec**

Run: `cd plugin && npx vitest run src/restoreClone.test.ts`
Expected: FAIL — `Failed to resolve import './restoreClone.js'`.

- [ ] **Step 3 : Implémenter**

Create `plugin/src/restoreClone.ts` :
```ts
// Logique PURE de sélection des clones d'historique (testable sans Figma).

export interface HistoryFrameInfo {
  id: string;             // id Figma du frame-clone
  versionId?: string;     // dg_history_version
  assetId?: string;       // dg_history_asset (groupage)
  versionNumber?: number; // dg_history_vnum (tri d'élagage)
}

/** id du clone correspondant au checkpoint `versionId`, ou undefined. */
export function pickHistoryClone(frames: HistoryFrameInfo[], versionId: string): string | undefined {
  return frames.find(f => f.versionId === versionId)?.id;
}

/**
 * Ids des clones à SUPPRIMER : ceux de `assetId` au-delà des `keepN` plus récents.
 * Ne considère que les frames FINALISÉES (versionNumber défini) ; tri vnum décroissant.
 */
export function framesToPrune(frames: HistoryFrameInfo[], assetId: string, keepN: number): string[] {
  return frames
    .filter(f => f.assetId === assetId && f.versionNumber !== undefined)
    .sort((a, b) => (b.versionNumber! - a.versionNumber!))
    .slice(keepN)
    .map(f => f.id);
}
```

- [ ] **Step 4 : Lancer → succès**

Run: `cd plugin && npx vitest run src/restoreClone.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5 : Commit**

```bash
git add plugin/src/restoreClone.ts plugin/src/restoreClone.test.ts
git commit -m "feat(plugin): restoreClone — helpers purs pickHistoryClone/framesToPrune (TDD)"
```

---

## Task 2 : Types de messages

**Files:**
- Modify: `plugin/src/types.ts`

**Interfaces:**
- Produces : `UIToMain` gagne `{ type: 'STORE_HISTORY_CLONE'; nodeId: string; versionId: string; versionNumber: number }` ; `RESTORE_TO_FIGMA` gagne `versionId?: string`.

- [ ] **Step 1 : Étendre `UIToMain` (plugin `types.ts`)**

Remplacer la ligne `RESTORE_TO_FIGMA` et ajouter le nouveau message :
```ts
  | { type: 'SWITCH_BRANCH'; branchName: string }
  | { type: 'STORE_HISTORY_CLONE'; nodeId: string; versionId: string; versionNumber: number }
  | { type: 'RESTORE_TO_FIGMA'; versionId?: string; snapshot: FigmaSnapshot; render_svg_b64?: string; delta?: RestorationDelta };
```

- [ ] **Step 2 : Typecheck**

Run: `cd plugin && npx tsc --noEmit`
Expected: erreurs **attendues** dans `main.ts` (switch non exhaustif : `STORE_HISTORY_CLONE` non géré) et/ou `handleRestoreToFigma` — elles seront résolues aux Tasks 4 et 5. Si tu exécutes en isolation, noter l'erreur ; sinon committer après Task 5. *(Pas de commit séparé pour cette task — voir Task 4/5.)*

---

## Task 3 : Capture phase 1 — clone "pending" sur `dg/_history`

**Files:**
- Modify: `plugin/src/main.ts`

**Interfaces:**
- Consumes : `readDgId` (déjà importé de `figmaIdentity.js`).
- Produces : `getOrCreateHistoryPage(): PageNode`, `HISTORY_PAGE='dg/_history'`, `HISTORY_KEEP_N=5`, et l'appel à `storeHistoryClonePending(node)` dans `handleSnapshot`.

- [ ] **Step 1 : Ajouter les constantes + helpers (avant `handleSnapshot`)**

Dans `plugin/src/main.ts`, ajouter (par ex. juste avant `async function handleSnapshot`) :
```ts
const HISTORY_PAGE = 'dg/_history';
const HISTORY_KEEP_N = 5;

function getOrCreateHistoryPage(): PageNode {
  const existing = figma.root.children.find(p => p.name === HISTORY_PAGE) as PageNode | undefined;
  if (existing) return existing;
  const page = figma.createPage();      // ne change PAS figma.currentPage
  page.name = HISTORY_PAGE;
  return page;
}

// Phase 1 : fige l'état exact du nœud capturé en le clonant sur dg/_history,
// taggé "pending". Finalisé (version id) seulement quand le checkpoint est sauvé.
function storeHistoryClonePending(node: SceneNode): void {
  if (!('clone' in node)) return;
  try {
    const page = getOrCreateHistoryPage();
    // Nettoyer un pending orphelin du même nœud (capture précédente non sauvée).
    for (const c of [...page.children]) {
      if (c.getPluginData('dg_history_pending') === node.id) c.remove();
    }
    const clone = (node as SceneNode & { clone(): SceneNode }).clone();
    page.appendChild(clone);
    clone.setPluginData('dg_history_pending', node.id);
    clone.setPluginData('dg_history_asset', readDgId(node) || node.id);
    clone.locked = true;
  } catch (e) {
    console.log('[DG] history clone (pending) échec', e);
  }
}
```

- [ ] **Step 2 : Appeler dans `handleSnapshot`**

Dans `handleSnapshot`, juste après la construction de `figmaSnapshot` (après la l. `root: extractSnapshot(node),` + `};`) et avant le bloc SVG :
```ts
  storeHistoryClonePending(node);
```

- [ ] **Step 3 : Typecheck + suite plugin**

Run: `cd plugin && npx tsc --noEmit` (les erreurs `STORE_HISTORY_CLONE`/`versionId` des Tasks 4/5 peuvent subsister si exécuté seul — sinon 0).
Run: `cd plugin && npx vitest run`
Expected: PASS (capture = glue, pas de test unitaire ; non-régression).

- [ ] **Step 4 : Vérif manuelle**

Build + reload → sélectionner un nœud → Capture. Une page `dg/_history` apparaît avec un clone locké ; son `pluginData.dg_history_pending` = id du nœud. *(Inspectable via la console plugin si besoin.)*

- [ ] **Step 5 : Commit**

```bash
git add plugin/src/main.ts
git commit -m "feat(plugin): capture — clone pending du nœud sur dg/_history (phase 1)"
```

---

## Task 4 : Capture phase 2 — finaliser + élaguer (`STORE_HISTORY_CLONE`)

**Files:**
- Modify: `plugin/src/main.ts`
- Modify: `plugin/src/ui.tsx`

**Interfaces:**
- Consumes : `pickHistoryClone`/`framesToPrune` (Task 1), `HISTORY_PAGE`/`HISTORY_KEEP_N` (Task 3), message `STORE_HISTORY_CLONE` (Task 2).

- [ ] **Step 1 : Importer les helpers + lecteur de frames (`main.ts`)**

En tête de `plugin/src/main.ts`, étendre l'import existant :
```ts
import { framesToPrune, type HistoryFrameInfo } from './restoreClone.js';
```
Ajouter un lecteur (près de `getOrCreateHistoryPage`) :
```ts
function readHistoryFrames(page: PageNode): HistoryFrameInfo[] {
  return page.children.map(c => {
    const vnum = c.getPluginData('dg_history_vnum');
    return {
      id: c.id,
      versionId: c.getPluginData('dg_history_version') || undefined,
      assetId: c.getPluginData('dg_history_asset') || undefined,
      versionNumber: vnum ? Number(vnum) : undefined,
    };
  });
}
```

- [ ] **Step 2 : Handler de finalisation**

Ajouter dans `plugin/src/main.ts` :
```ts
// Phase 2 : le checkpoint est sauvé → finaliser le clone pending (version id + vnum),
// puis élaguer aux N derniers de l'asset.
function handleStoreHistoryClone(nodeId: string, versionId: string, versionNumber: number): void {
  const page = figma.root.children.find(p => p.name === HISTORY_PAGE) as PageNode | undefined;
  if (!page) return;
  const pending = page.children.find(c => c.getPluginData('dg_history_pending') === nodeId);
  if (!pending) return;
  try {
    pending.setPluginData('dg_history_version', versionId);
    pending.setPluginData('dg_history_vnum', String(versionNumber));
    pending.setPluginData('dg_history_pending', ''); // finalisé
    const assetId = pending.getPluginData('dg_history_asset');
    for (const id of framesToPrune(readHistoryFrames(page), assetId, HISTORY_KEEP_N)) {
      const f = page.children.find(c => c.id === id);
      if (f) f.remove();
    }
  } catch (e) {
    console.log('[DG] history clone (finalize) échec', e);
  }
}
```

- [ ] **Step 3 : Brancher dans le switch `figma.ui.onmessage`**

Dans `plugin/src/main.ts`, ajouter un case (avant `RESTORE_TO_FIGMA`) :
```ts
    case 'STORE_HISTORY_CLONE': handleStoreHistoryClone(msg.nodeId, msg.versionId, msg.versionNumber); break;
```

- [ ] **Step 4 : UI — envoyer après POST checkpoint réussi (`ui.tsx`)**

Dans `plugin/src/ui.tsx`, le POST (`/api/checkpoints`) destructure `data.version`. Étendre pour récupérer `version_number` et envoyer le message. Remplacer la récupération (vers l.383-396) :
```ts
      const data = await api<{ version: { id: string; version_number: number }; ai_summary: string | null; analysis: { totalChanges?: number } | null }>(
        apiKey, '/api/checkpoints', {
          method: 'POST',
          body: JSON.stringify({
            asset_id:        asset.id,
            branch_name:     branchName.trim() || 'main',
            snapshot_json:   snapshot,
            figma_node_id:   snapshot.figmaNodeId,
            render_svg_b64:  renderSvgB64,
            author,
          }),
        });
      send({ type: 'STORE_HISTORY_CLONE', nodeId: snapshot.figmaNodeId, versionId: data.version.id, versionNumber: data.version.version_number });
      setSaved({ summary: data.ai_summary, changes: data.analysis?.totalChanges ?? 0, versionId: data.version.id });
```
*(Adapter aux noms exacts si le corps du POST diffère — conserver la structure existante, n'ajouter que `version_number` au type et la ligne `send(...)`.)*

- [ ] **Step 5 : Typecheck + build + vérif manuelle**

Run: `cd plugin && npx tsc --noEmit`
Expected: exit 0.
Run: `cd plugin && npx vitest run`
Expected: PASS.
Manuel : capturer ≥ 6 fois le même asset → `dg/_history` ne garde que **5** clones (le plus vieux élagué) ; chaque clone a `dg_history_version` rempli.

- [ ] **Step 6 : Commit**

```bash
git add plugin/src/main.ts plugin/src/ui.tsx plugin/src/types.ts
git commit -m "feat(plugin): capture phase 2 — finalise le clone d'historique + élagage N derniers"
```

---

## Task 5 : Restore par clone (+ repli)

**Files:**
- Modify: `plugin/src/main.ts`
- Modify: `plugin/src/ui.tsx`

**Interfaces:**
- Consumes : `pickHistoryClone` (Task 1), `readHistoryFrames`/`HISTORY_PAGE` (Task 4), `findByDgId`/`propagateIdentity`/`BranchNode` (déjà importés), `versionId` sur `RESTORE_TO_FIGMA` (Task 2).

- [ ] **Step 1 : Importer `pickHistoryClone` + écrire `tryRestoreFromClone`**

Étendre l'import (Task 4) :
```ts
import { framesToPrune, pickHistoryClone, type HistoryFrameInfo } from './restoreClone.js';
```
Ajouter dans `plugin/src/main.ts` :
```ts
// Restore LOSSLESS : re-clone le clone d'historique du checkpoint et remplace le nœud live.
// Renvoie true si effectué, false si aucun clone (→ l'appelant fait le repli).
function tryRestoreFromClone(versionId: string): boolean {
  const page = figma.root.children.find(p => p.name === HISTORY_PAGE) as PageNode | undefined;
  if (!page) return false;
  const cloneId = pickHistoryClone(readHistoryFrames(page), versionId);
  if (!cloneId) return false;
  const stored = page.children.find(c => c.id === cloneId);
  if (!stored || !('clone' in stored)) return false;
  try {
    const assetDgId = stored.getPluginData('dg_history_asset');
    const liveRoots = figma.currentPage.children as unknown as BranchNode[];
    const live = (assetDgId ? findByDgId(liveRoots, assetDgId) : undefined) as unknown as SceneNode | undefined;
    const fresh = (stored as SceneNode & { clone(): SceneNode }).clone();
    fresh.locked = false;
    // nettoyer les tags d'historique sur la copie restaurée
    for (const k of ['dg_history_pending', 'dg_history_version', 'dg_history_asset', 'dg_history_vnum']) fresh.setPluginData(k, '');
    if (live && live.parent) {
      live.parent.appendChild(fresh);
      (fresh as SceneNode & { x: number; y: number }).x = (live as SceneNode & { x: number }).x;
      (fresh as SceneNode & { x: number; y: number }).y = (live as SceneNode & { y: number }).y;
      propagateIdentity(live as unknown as BranchNode, fresh as unknown as BranchNode); // continuité dg_id
      live.remove();
    } else {
      figma.currentPage.appendChild(fresh);
    }
    figma.currentPage.selection = [fresh];
    figma.viewport.scrollAndZoomIntoView([fresh]);
    return true;
  } catch (e) {
    console.log('[DG] restore par clone échec → repli', e);
    return false;
  }
}
```

- [ ] **Step 2 : Brancher dans `handleRestoreToFigma` (clone d'abord, repli ensuite)**

Modifier la signature + le début de `handleRestoreToFigma` :
```ts
async function handleRestoreToFigma(versionId: string | undefined, snapshot: FigmaSnapshot, renderSvgB64?: string): Promise<void> {
  if (versionId && tryRestoreFromClone(versionId)) {
    send({ type: 'RESTORE_COMPLETE', applied: 1, skipped: 0 });
    return;
  }
  // … (logique existante de restore par propriétés/SVG, inchangée) …
```
Et le dispatch du switch :
```ts
    case 'RESTORE_TO_FIGMA':  await handleRestoreToFigma(msg.versionId, msg.snapshot, msg.render_svg_b64); break;
```

- [ ] **Step 3 : UI — passer `versionId` au message restore (`ui.tsx`)**

Dans `plugin/src/ui.tsx` (l.530), le hook a déjà `versionId` en scope. Remplacer :
```ts
      send({ type: 'RESTORE_TO_FIGMA', versionId, snapshot, render_svg_b64: svgB64 ?? undefined, delta: delta ?? undefined });
```

- [ ] **Step 4 : Typecheck + suite complète**

Run: `cd plugin && npx tsc --noEmit`
Expected: exit 0.
Run: `cd plugin && npx vitest run`
Expected: PASS (tous).

- [ ] **Step 5 : Commit**

```bash
git add plugin/src/main.ts plugin/src/ui.tsx
git commit -m "feat(plugin): restore lossless par clone d'historique (repli sur restore actuel)"
```

---

## Vérification manuelle (post-plan) — le test décisif
1. Capturer v1 du brief Gynger (avec logo/photo/auto-layout).
2. Modifier fortement (resize logo, rotation photo…), capturer v2.
3. **Restaurer v1** → le design doit revenir **à l'identique** (logo, photo, auto-layout, polygones) — **lossless**, sans les bugs précédents.
4. Vérifier qu'un checkpoint **ancien (pré-clone)** restaure encore via le **repli** (pas de crash).

## Self-Review (auteur du plan)
- **Couverture spec** : §2.1 helpers purs → Task 1 ✅ · §2.2 history store → Task 3+4 ✅ · §2.3 restore → Task 5 ✅ · §3 flux (clone capture / tag save / prune) → Task 3+4 ✅ · §4 fallback → Task 5 (repli) ✅ · §1 décisions (N=5, dg/_history, clone primaire) → Global Constraints + code ✅ · §5 tests purs → Task 1 ✅.
- **Placeholders** : aucun — code complet (la seule note d'adaptation, Task 4 Step 4, concerne le corps POST existant à préserver tel quel).
- **Cohérence types/clés** : `HistoryFrameInfo`, `pickHistoryClone`, `framesToPrune`, clés `dg_history_*`, `HISTORY_PAGE`/`HISTORY_KEEP_N`, `STORE_HISTORY_CLONE`, `versionId` — identiques entre Tasks 1→5.
- **Ordre** : Task 2 (types) avant 3/4/5 ; Task 1 (helpers) avant 4/5 ; Task 3 (page/pending) avant 4 (finalize) avant 5 (restore). ✅
- **Risque connu** : `propagateIdentity` apparie par index → si l'arbre live a divergé, l'identité fine peut ne pas se reposer parfaitement (le dg_id racine, lui, est repris). Best-effort, documenté (spec §4).
