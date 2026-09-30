# Page-centric — Plan d'implémentation (Phase 3 : frame → historique → diff)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** dans le plugin, une page affiche la liste de ses frames (comme le panneau des calques de Figma) ; un clic sur une frame ouvre **son** historique (les checkpoints où elle a changé), un clic sur une version ouvre **son** diff (rendu de cette frame, surlignages, détail).

**Architecture :** une frame garde la même identité d'une version à l'autre grâce à sa **clé** (`dg_id`, repli id Figma). Chaque version de page stocke dans son `analysis_json` un **résumé par frame suivie** (`frames[]` : clé, nom, dimensions, statut, nombre de changements) — y compris la v1. `/api/versions/tree` renvoie ce résumé (extrait JSON, pas le delta entier) : l'historique d'une frame se calcule côté plugin, sans nouvel endpoint. Les rendus sont **par frame** : le serveur dit quelles frames rendre, le plugin les exporte et les envoie une par une ; le diff d'une frame est servi par `GET /versions/:id?frame=<clé>`.

**Tech Stack :** TypeScript strict, Vitest, Preact + zustand (plugin Figma), HonoJS + Zod, Supabase (PostgreSQL + Storage).

**Spec :** `docs/conception/specs/2026-09-20-page-centric-design.md` (§5 rendus, §6 données, §7 viewer). **Écart assumé** avec le §7 : la navigation part de **la frame** (liste → historique de la frame → diff), pas du checkpoint (checkpoint → frames touchées). Même donnée, lue dans l'autre sens. Le §7 est mis à jour à la tâche 8.

**Prérequis :** Phases 1 et 2 fusionnées (#72, #75) ; correctifs identité/diff/séparation fusionnés (#77, #78).

## Global Constraints

- TypeScript strict, **zéro `any`**. Séparation Service / Controller.
- `figma.*` **uniquement** dans le main thread (`main.ts`) ; appels HTTP **uniquement** dans le UI thread (`ui.tsx`).
- **Clé de frame** : `frameKey(top) = top.dg_id || top.id`. C'est l'identité d'une frame d'une version à l'autre (survit au couper-coller, qui change l'id Figma).
- **Plafond de rendus** : `MAX_FRAME_RENDERS = 20` par capture (spec §5).
- **Aucune migration de base** : `frames[]` vit dans `versions.analysis_json` ; `/tree` en lit un extrait JSON.
- Tout champ ajouté au corps d'une requête DOIT être ajouté au schéma Zod correspondant (sinon Zod le supprime **en silence** — cause historique de pertes de données, cf. CLAUDE.md).
- **Compat** : les assets en mode frame (`scope='frame'`, lecture seule) et les versions sans `frames` gardent l'affichage actuel (timeline à plat, rendu `_render.{png|svg}`).
- **Baseline : 269 tests backend + 169 plugin** — aucune régression tolérée.

## Review Focus

1. **Frame coupée-collée entre deux versions** (nouvel id Figma, même `dg_id`) → son historique reste continu et son diff montre ses nœuds supprimés (clé, pas id). → testé tâche 1 (`removed` rattaché à la clé) et tâche 5.
2. **Frame décochée puis recochée** → la version de retour la marque `initial` (pas `modified` par rapport à une version où elle n'était pas suivie). → testé tâche 1.
3. **v1 avec plus de 20 frames suivies** → 20 rendus, les autres affichent « Rendu indisponible. » sans casser la liste. → testé tâche 2.
4. **Upload d'un rendu qui échoue** → la version reste valide ; le diff de la frame affiche « Rendu indisponible. » au lieu d'une image d'une autre frame. → testé tâche 3 (pas de repli sur le rendu d'une autre frame).
5. **Asset en mode frame / version sans `frames`** → la timeline actuelle s'affiche telle quelle. → testé tâche 5 (`hasFrameNav`).

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `backend/src/services/frames.service.ts` | Clé de frame, résumé par frame, frames à rendre — **pur** | Créer |
| `backend/src/tests/frames.service.test.ts` | Tests du service | Créer |
| `backend/src/services/geometry.service.ts` | `enrichDeltaGeometry` : `nd.viewport` = clé, `frames[]` | Modifier |
| `backend/src/types/figma.ts` | `FrameSummary`, `DeltaJSON.frames` | Modifier |
| `backend/src/controllers/checkpoints.controller.ts` | v1 de page : delta de base avec `frames` ; réponse `render_frames` ; upload par frame | Modifier |
| `backend/src/services/versioning.service.ts` | `renderPathFor(…, frameKey?)` | Modifier |
| `backend/src/types/api.ts` | `uploadRenderSchema.frame_key` | Modifier |
| `backend/src/controllers/versions.controller.ts` | `/tree` : `frames` ; `GET /versions/:id?frame=` : rendu + node_diffs + cadres de la frame | Modifier |
| `plugin/src/frameNav.ts` | Historique d'une frame, stats, disponibilité de la navigation — **pur** | Créer |
| `plugin/src/frameNav.test.ts` | Tests | Créer |
| `plugin/src/trackedFrames.ts` | `FrameEntry.key` | Modifier |
| `plugin/src/main.ts` | Export d'une liste de frames (`RENDER_FRAMES`) ; plus de rendu provisoire à la capture | Modifier |
| `plugin/src/types.ts`, `plugin/src/store.ts` | Messages, écran `frameHistory`, frame courante | Modifier |
| `plugin/src/ui.tsx` | Liste des frames, écran historique, diff par frame, upload des rendus | Modifier |

---

## Task 1 : Service `frames` — clé, résumé par frame, frames à rendre

**Files :**
- Create : `backend/src/services/frames.service.ts`, `backend/src/tests/frames.service.test.ts`
- Modify : `backend/src/types/figma.ts`, `backend/src/services/geometry.service.ts`

**Interfaces :**
- Produces :
  - `type FrameStatus = 'initial' | 'modified' | 'unchanged'`
  - `interface FrameSummary { key: string; id: string; name: string; frame: { w: number; h: number }; status: FrameStatus; changes: number }`
  - `frameKey(top: NodeSnapshot): string`
  - `summarizeFrames(changesByKey: ReadonlyMap<string, number>, current: FigmaSnapshot, prev: FigmaSnapshot | null): FrameSummary[] | undefined` — `undefined` hors page.
  - `framesToRender(frames: readonly FrameSummary[], cap?: number): Array<{ key: string; id: string }>`
  - `MAX_FRAME_RENDERS = 20`
  - `DeltaJSON.frames?: FrameSummary[]` ; `NodeDelta.viewport` = **clé** de frame.

- [ ] **Step 1 : tests qui échouent**

```ts
// backend/src/tests/frames.service.test.ts
import { describe, it, expect } from 'vitest';
import { frameKey, summarizeFrames, framesToRender, MAX_FRAME_RENDERS } from '../services/frames.service.js';
import type { FigmaSnapshot, NodeSnapshot } from '../types/figma.js';

const top = (id: string, dg: string | undefined, name = id): NodeSnapshot => ({
  id, ...(dg ? { dg_id: dg } : {}), name, type: 'FRAME', x: 0, y: 0, width: 100, height: 50,
  opacity: 1, fills: [], strokes: [], children: [],
});
const page = (...frames: NodeSnapshot[]): FigmaSnapshot => ({
  figmaNodeId: 'p', figmaNodeName: 'P', capturedAt: '2026-09-30T00:00:00Z',
  root: { id: 'p', name: 'P', type: 'PAGE', x: 0, y: 0, width: 0, height: 0, opacity: 1, fills: [], strokes: [], children: frames },
});

describe('frameKey', () => {
  it('dg_id si présent (survit au couper-coller), sinon id Figma', () => {
    expect(frameKey(top('1:2', 'DG-A'))).toBe('DG-A');
    expect(frameKey(top('1:2', undefined))).toBe('1:2');
  });
});

describe('summarizeFrames', () => {
  it('v1 (pas de précédente) → toutes initial', () => {
    const out = summarizeFrames(new Map(), page(top('1:1', 'A'), top('1:2', 'B')), null);
    expect(out?.map(f => [f.key, f.status])).toEqual([['A', 'initial'], ['B', 'initial']]);
  });

  it('modified si changements, unchanged sinon — apparié par clé malgré un nouvel id Figma', () => {
    const prev = page(top('1:1', 'A'), top('1:2', 'B'));
    const cur  = page(top('9:9', 'A'), top('1:2', 'B')); // A coupée-collée
    const out = summarizeFrames(new Map([['A', 3]]), cur, prev);
    expect(out).toEqual([
      { key: 'A', id: '9:9', name: '9:9', frame: { w: 100, h: 50 }, status: 'modified', changes: 3 },
      { key: 'B', id: '1:2', name: '1:2', frame: { w: 100, h: 50 }, status: 'unchanged', changes: 0 },
    ]);
  });

  it('frame décochée puis recochée → initial (pas comparée à une version où elle n\'était pas suivie)', () => {
    const out = summarizeFrames(new Map([['B', 2]]), page(top('1:1', 'A'), top('1:2', 'B')), page(top('1:1', 'A')));
    expect(out?.find(f => f.key === 'B')?.status).toBe('initial');
  });

  it('hors page (mode frame) → undefined', () => {
    const frameSnap = { ...page(), root: { ...top('f', 'F'), children: [] } };
    expect(summarizeFrames(new Map(), frameSnap, null)).toBeUndefined();
  });
});

describe('framesToRender', () => {
  const f = (key: string, status: 'initial' | 'modified' | 'unchanged') =>
    ({ key, id: `id-${key}`, name: key, frame: { w: 1, h: 1 }, status, changes: status === 'modified' ? 1 : 0 });

  it('rend les frames initial et modified, jamais unchanged', () => {
    expect(framesToRender([f('A', 'modified'), f('B', 'unchanged'), f('C', 'initial')]))
      .toEqual([{ key: 'A', id: 'id-A' }, { key: 'C', id: 'id-C' }]);
  });

  it('plafonné à MAX_FRAME_RENDERS', () => {
    const many = Array.from({ length: 30 }, (_, i) => f(`K${i}`, 'initial'));
    expect(framesToRender(many)).toHaveLength(MAX_FRAME_RENDERS);
  });
});
```

- [ ] **Step 2 :** `cd backend && npx vitest run src/tests/frames.service.test.ts` → FAIL (module introuvable).

- [ ] **Step 3 : implémentation**

```ts
// backend/src/types/figma.ts — ajouter
export type FrameStatus = 'initial' | 'modified' | 'unchanged';
// Page-centric : résumé d'UNE frame suivie à cette version. `key` = identité stable (dg_id,
// repli id Figma) — c'est elle qui relie les versions d'une même frame.
export interface FrameSummary {
  key: string; id: string; name: string;
  frame: { w: number; h: number };
  status: FrameStatus;
  changes: number; // groupes (cf. #71), 0 si unchanged/initial
}
// …et dans DeltaJSON :
  frames?: FrameSummary[];
```

```ts
// backend/src/services/frames.service.ts
// Page-centric : identité et résumé des frames suivies, pour naviguer frame → historique → diff.
// Logique pure, testable sans base ni Storage.
import type { FigmaSnapshot, FrameSummary, NodeSnapshot } from '../types/figma.js';

export const MAX_FRAME_RENDERS = 20; // spec page-centric §5

/** Identité d'une frame d'une version à l'autre : dg_id (survit au couper-coller), sinon id Figma. */
export function frameKey(top: NodeSnapshot): string {
  return top.dg_id || top.id;
}

/**
 * Une entrée par frame suivie de `current`. `changesByKey` : groupes modifiés par clé de frame.
 * initial = pas de version précédente, ou frame absente de la précédente (nouvellement suivie).
 */
export function summarizeFrames(
  changesByKey: ReadonlyMap<string, number>,
  current: FigmaSnapshot,
  prev: FigmaSnapshot | null,
): FrameSummary[] | undefined {
  if (current.root.type !== 'PAGE') return undefined;
  const prevKeys = new Set((prev?.root.children ?? []).map(frameKey));
  return (current.root.children ?? []).map(top => {
    const key = frameKey(top);
    const changes = changesByKey.get(key) ?? 0;
    const status = !prevKeys.has(key) ? 'initial' : changes > 0 ? 'modified' : 'unchanged';
    const ab = top.aabb;
    return {
      key, id: top.id, name: top.name,
      frame: { w: ab ? ab.w : top.width, h: ab ? ab.h : top.height },
      status, changes: status === 'modified' ? changes : 0,
    };
  });
}

/** Frames dont le plugin doit exporter un rendu : nouvelles et modifiées, dans la limite du plafond. */
export function framesToRender(frames: readonly FrameSummary[], cap = MAX_FRAME_RENDERS): Array<{ key: string; id: string }> {
  return frames.filter(f => f.status !== 'unchanged').slice(0, cap).map(({ key, id }) => ({ key, id }));
}
```

Dans `geometry.service.ts`, `enrichDeltaGeometry` :
1. le `viewport` d'un nœud devient la **clé** de sa frame : remplacer `viewport: viewport?.id,` par `viewport: viewport ? viewportKey.get(viewport.id) : undefined,` où `viewportKey` est calculé par snapshot :

```ts
  // Clé de frame (dg_id, repli id Figma) par id Figma de frame, pour chaque snapshot.
  const keysOf = (s: FigmaSnapshot | null) =>
    new Map((s?.root.type === 'PAGE' ? s.root.children ?? [] : []).map(t => [t.id, frameKey(t)]));
```

   et passer `keysOf(currentSnap)` / `keysOf(prevSnap)` à `put` (paramètre supplémentaire `keys: Map<string, string>`), `viewport: viewport ? keys.get(viewport.id) : undefined`. `origin` reste `viewport?.id` (l'id Figma sert à mesurer dans CE snapshot).
2. `buildViewports` groupe par `nd.viewport` (désormais une clé) : faire correspondre `top` par `frameKey(top)` au lieu de `top.id`, et ajouter `key: frameKey(top)` à chaque entrée (`DeltaJSON.viewports` : ajouter `key: string` au type).
3. ajouter au retour : `frames: summarizeFrames(changesByKey, currentSnap, prevSnap)`, avec `changesByKey = new Map((viewports ?? []).map(v => [v.key, v.changes]))`.

Ajouter dans `frames.service.test.ts` :

```ts
import { enrichDeltaGeometry } from '../services/geometry.service.js';
import type { DeltaJSON } from '../types/figma.js';

describe('enrichDeltaGeometry — clés de frame', () => {
  it('un nœud supprimé d\'une frame coupée-collée est rattaché à la clé de la frame, pas à son ancien id', () => {
    const child = { ...top('1:5', 'N'), width: 10, height: 10 };
    const prev = page({ ...top('1:1', 'A'), children: [child] });
    const cur  = page(top('9:9', 'A'));
    const delta = { modified: [], added: [], removed: [{ nodeId: '1:5', nodeName: 'N', nodeType: 'FRAME', changes: [] }],
      totalChanges: 1, metadata: { v1CapturedAt: '', v2CapturedAt: '', epsilon: 0.01, processingTimeMs: 0 } } as DeltaJSON;
    const out = enrichDeltaGeometry(delta, cur, prev);
    expect(out.removed[0].viewport).toBe('A');
    expect(out.frames).toEqual([{ key: 'A', id: '9:9', name: '9:9', frame: { w: 100, h: 50 }, status: 'modified', changes: 1 }]);
  });
});
```

- [ ] **Step 4 :** `cd backend && npx vitest run` → tout vert (les tests existants de `viewports` peuvent devoir recevoir `key` dans leurs attendus : mettre à jour les attendus, pas le comportement). `npx tsc --noEmit` OK.
- [ ] **Step 5 : commit** — `feat(page-centric): clé de frame stable et résumé par frame (frames[])`.

---

## Task 2 : Capture — résumé dès la v1, et liste des frames à rendre

**Files :**
- Modify : `backend/src/controllers/checkpoints.controller.ts` (computeMeta + réponse), `backend/src/types/api.ts` (`CheckpointResponse`)
- Test : `backend/src/tests/checkpoints.controller.test.ts`

**Interfaces :**
- Consumes : `enrichDeltaGeometry` (tâche 1), `framesToRender` (tâche 1).
- Produces : `CheckpointResponse.render_frames: Array<{ key: string; id: string }>` (vide hors page).

- [ ] **Step 1 : tests qui échouent** — dans `checkpoints.controller.test.ts`, en réutilisant le mock existant du fichier, ajouter un cas « première version d'une page à 2 frames » :

```ts
it('v1 de page : analysis_json porte frames (initial) et la réponse liste les frames à rendre', async () => {
  // snapshot_json : racine PAGE avec deux frames { id:'1:1', dg_id:'A' } et { id:'1:2', dg_id:'B' }
  // aucune version précédente (mock prev = null)
  const res = await postCheckpoint(pageSnapshotWithTwoFrames);
  const body = await res.json() as { analysis: { frames?: Array<{ key: string; status: string }> } | null; render_frames: Array<{ key: string; id: string }> };
  expect(body.analysis?.frames?.map(f => [f.key, f.status])).toEqual([['A', 'initial'], ['B', 'initial']]);
  expect(body.render_frames).toEqual([{ key: 'A', id: '1:1' }, { key: 'B', id: '1:2' }]);
});
```

(`postCheckpoint` et `pageSnapshotWithTwoFrames` : helpers à écrire en tête du bloc, sur le modèle des appels `app.request('/api/checkpoints', …)` déjà présents dans le fichier.)

- [ ] **Step 2 :** lancer ce test → FAIL (`frames` absent, `render_frames` absent).
- [ ] **Step 3 : implémentation** — dans `computeMeta` :

```ts
      const snap = body.snapshot_json as FigmaSnapshot;
      if (!prev?.storage_path) {
        // v1 d'une page : pas de diff, mais un résumé des frames (toutes « initial ») — sans lui,
        // l'historique d'une frame ne connaîtrait pas son point de départ.
        if (snap.root.type !== 'PAGE') return { analysisJson: null, aiSummary: null };
        const base: DeltaJSON = { modified: [], added: [], removed: [], totalChanges: 0,
          metadata: { v1CapturedAt: snap.capturedAt, v2CapturedAt: snap.capturedAt, epsilon: 0.01, processingTimeMs: 0 } };
        return { analysisJson: enrichDeltaGeometry(base, snap, null), aiSummary: null };
      }
```

   et dans la réponse : `render_frames: framesToRender(analysisJson?.frames ?? [])`. Ajouter `render_frames` à `CheckpointResponse` et au schéma OpenAPI (`services/openapi.ts`, réponse de `POST /api/checkpoints`).
- [ ] **Step 4 :** `npx vitest run` + `npx tsc --noEmit` → vert.
- [ ] **Step 5 : commit** — `feat(page-centric): résumé des frames dès la v1 et frames à rendre`.

---

## Task 3 : Rendus par frame (stockage, upload, lecture)

**Files :**
- Modify : `backend/src/services/versioning.service.ts`, `backend/src/types/api.ts`, `backend/src/controllers/checkpoints.controller.ts` (`POST /:id/render`), `backend/src/controllers/versions.controller.ts` (`GET /versions/:id`)
- Test : `backend/src/tests/versioning.render.test.ts`, `backend/src/tests/versions.controller.test.ts`, `backend/src/tests/api.schema.test.ts`

**Interfaces :**
- Produces :
  - `renderPathFor(storagePath, kind, frameKey?: string)` → `…/vN_render_<safeKey>.{png|svg}` si `frameKey`, sinon `…/vN_render.{kind}` (inchangé).
  - `uploadRenderSchema.frame_key?: string` (`/^[A-Za-z0-9:;_-]{1,64}$/`).
  - `GET /api/versions/versions/:id?thumbs=1&frame=<clé>` : `render_url`/`prev_render_url` = rendus **de cette frame** ; `node_diffs` filtrés sur `viewport === clé` ; `current_frame`/`prev_frame` = dimensions de la frame lues dans `frames[]` de la version et de sa parente.

- [ ] **Step 1 : tests qui échouent**

```ts
// versioning.render.test.ts
it('chemin de rendu par frame (clé nettoyée)', () => {
  expect(renderPathFor('a/main/v3.json', 'png', 'DG-1:2')).toBe('a/main/v3_render_DG-1_2.png');
  expect(renderPathFor('a/main/v3.json', 'png')).toBe('a/main/v3_render.png'); // compat mode frame
});

// api.schema.test.ts
it('uploadRenderSchema conserve frame_key et refuse une clé exotique', () => {
  expect(uploadRenderSchema.parse({ render_svg_b64: 'x', render_kind: 'png', frame_key: 'DG-A' }).frame_key).toBe('DG-A');
  expect(() => uploadRenderSchema.parse({ render_svg_b64: 'x', frame_key: '../../etc' })).toThrow();
});
```

Et dans `versions.controller.test.ts`, un cas `?thumbs=1&frame=A` sur une version dont `analysis_json` contient deux frames (`A` modifiée, `B` intacte) et des `node_diffs` dans les deux : la réponse ne contient que les nœuds de `A`, `current_frame` = dimensions de `A`, et **`render_url` est `null` si le rendu de `A` est absent** (jamais le rendu d'une autre frame ni la reconstruction SVG — spec D6, « dégradation honnête »).

- [ ] **Step 2 :** lancer → FAIL.
- [ ] **Step 3 : implémentation**

```ts
// versioning.service.ts
export function renderPathFor(storagePath: string, kind: 'svg' | 'png', frameKey?: string): string {
  const suffix = frameKey ? `_render_${frameKey.replace(/[^A-Za-z0-9_-]/g, '_')}` : '_render';
  return storagePath.replace('.json', `${suffix}.${kind}`);
}
// uploadRender(storage, storagePath, b64, kind, frameKey?) → passe frameKey à renderPathFor.
```

`POST /api/checkpoints/:id/render` passe `frame_key` à `uploadRender`. Dans `GET /versions/:id` : si `frame` est fourni, `resolveRenderUrl` ne cherche **que** `renderPathFor(path, kind, frame)` (png puis svg) et renvoie `null` sinon ; `node_diffs` est filtré sur `nd.viewport === frame` ; `current_frame` = `delta.frames?.find(f => f.key === frame)?.frame ?? null`, `prev_frame` idem sur l'`analysis_json` de la parente, et `prev_render_url` = rendu de la même clé dans la parente.
- [ ] **Step 4 :** `npx vitest run` + `npx tsc --noEmit` → vert.
- [ ] **Step 5 : commit** — `feat(page-centric): rendus par frame (stockage, upload, diff filtré)`.

---

## Task 4 : `/tree` renvoie le résumé des frames

**Files :**
- Modify : `backend/src/controllers/versions.controller.ts` (`GET /tree`), `backend/src/types/database.ts` (`Version.frames?`)
- Test : `backend/src/tests/versions.controller.test.ts`

**Interfaces :**
- Produces : chaque version de `/tree` porte `frames: FrameSummary[] | null` (extrait `analysis_json->frames`, pas le delta entier).

- [ ] **Step 1 : test qui échoue** — le mock renvoie une ligne avec `frames` ; vérifier que le `select` demande `frames:analysis_json->frames` (espionner l'argument de `select`) et que la réponse transmet `frames`.
- [ ] **Step 2 :** FAIL.
- [ ] **Step 3 :** ajouter `, frames:analysis_json->frames` à la liste du `select` de `/tree` ; `frames?: FrameSummary[] | null` dans `Version`.
- [ ] **Step 4 :** vert. **Step 5 : commit** — `feat(page-centric): /tree expose le résumé des frames`.

---

## Task 5 : Plugin — navigation pure (`frameNav`)

**Files :**
- Create : `plugin/src/frameNav.ts`, `plugin/src/frameNav.test.ts`
- Modify : `plugin/src/store.ts` (`Version.frames?`)

**Interfaces :**
- Produces :
  - `interface FrameSummary { key: string; id: string; name: string; frame: { w: number; h: number }; status: 'initial' | 'modified' | 'unchanged'; changes: number }` (miroir backend)
  - `frameHistory(versions: readonly Version[], key: string): Version[]` — versions où la frame est `initial` ou `modified`, ordre chronologique.
  - `frameStats(versions: readonly Version[], key: string): { versions: number; lastAt: string | null }`
  - `hasFrameNav(versions: readonly Version[]): boolean` — au moins une version porte `frames`.

- [ ] **Step 1 : tests qui échouent**

```ts
// plugin/src/frameNav.test.ts
import { describe, it, expect } from 'vitest';
import { frameHistory, frameStats, hasFrameNav } from './frameNav.js';
import type { Version } from './store.js';

const v = (id: string, at: string, frames?: Array<[string, 'initial' | 'modified' | 'unchanged']>): Version => ({
  id, version_number: 1, branch_name: 'main', parent_id: null, status: 'draft', ai_summary: null,
  created_at: at, author_name: null, author_avatar_url: null,
  ...(frames ? { frames: frames.map(([key, status]) => ({ key, id: key, name: key, frame: { w: 1, h: 1 }, status, changes: status === 'modified' ? 1 : 0 })) } : {}),
});

describe('frameHistory', () => {
  const versions = [
    v('v1', '2026-09-01', [['A', 'initial'], ['B', 'initial']]),
    v('v2', '2026-09-02', [['A', 'unchanged'], ['B', 'modified']]),
    v('v3', '2026-09-03', [['A', 'modified'], ['B', 'unchanged']]),
  ];

  it('ne garde que les versions où la frame est apparue ou a changé', () => {
    expect(frameHistory(versions, 'A').map(x => x.id)).toEqual(['v1', 'v3']);
    expect(frameHistory(versions, 'B').map(x => x.id)).toEqual(['v1', 'v2']);
  });

  it('frame inconnue → historique vide', () => {
    expect(frameHistory(versions, 'Z')).toEqual([]);
  });

  it('stats : nombre de versions et date du dernier changement', () => {
    expect(frameStats(versions, 'A')).toEqual({ versions: 2, lastAt: '2026-09-03' });
    expect(frameStats(versions, 'Z')).toEqual({ versions: 0, lastAt: null });
  });
});

describe('hasFrameNav', () => {
  it('vrai dès qu\'une version porte un résumé de frames ; faux pour un asset en mode frame', () => {
    expect(hasFrameNav([v('v1', '2026-09-01', [['A', 'initial']])])).toBe(true);
    expect(hasFrameNav([v('v1', '2026-09-01')])).toBe(false);
  });
});
```

- [ ] **Step 2 :** `cd plugin && npx vitest run src/frameNav.test.ts` → FAIL.
- [ ] **Step 3 : implémentation**

```ts
// plugin/src/frameNav.ts
// Navigation page-centric : liste des frames → historique d'une frame → diff. Pur, testable.
import type { Version } from './store.js';

export interface FrameSummary {
  key: string; id: string; name: string;
  frame: { w: number; h: number };
  status: 'initial' | 'modified' | 'unchanged';
  changes: number;
}

/** Versions où la frame est apparue (initial) ou a changé (modified), en ordre chronologique. */
export function frameHistory(versions: readonly Version[], key: string): Version[] {
  return versions
    .filter(v => v.frames?.some(f => f.key === key && f.status !== 'unchanged'))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function frameStats(versions: readonly Version[], key: string): { versions: number; lastAt: string | null } {
  const h = frameHistory(versions, key);
  return { versions: h.length, lastAt: h.length > 0 ? h[h.length - 1].created_at : null };
}

/** La navigation par frame n'a de sens que si au moins une version porte un résumé de frames. */
export function hasFrameNav(versions: readonly Version[]): boolean {
  return versions.some(v => (v.frames?.length ?? 0) > 0);
}
```

`store.ts` : `Version` gagne `frames?: FrameSummary[] | null` (import de type depuis `frameNav.js`).
- [ ] **Step 4 :** vert + `npx tsc --noEmit`. **Step 5 : commit** — `feat(plugin): navigation par frame (historique, stats)`.

---

## Task 6 : Plugin (main) — clé des frames listées et export d'une liste de frames

**Files :**
- Modify : `plugin/src/trackedFrames.ts` (+ test), `plugin/src/main.ts`, `plugin/src/types.ts`

**Interfaces :**
- Produces :
  - `FrameEntry.key: string` — `readDgId(frame) || frame.id` (lecture seule : lister ne stampe rien).
  - UI → main : `{ type: 'RENDER_FRAMES'; versionId: string; frames: Array<{ key: string; id: string }> }`
  - main → UI : `{ type: 'FRAME_RENDERED'; versionId: string; key: string; b64: string; kind: 'svg' | 'png' }` (un message par frame ; frame introuvable ou export raté → aucun message pour elle).
  - `handleSnapshot` n'exporte plus de rendu : `SNAPSHOT_READY` sans `render_svg_b64`.

- [ ] **Step 1 : test qui échoue** (`trackedFrames.test.ts`) : `listFrames` renvoie `key = el_uid` si la frame en porte un, sinon son `id`, **sans appeler `setPluginData`** (espion sur le faux nœud).
- [ ] **Step 2 :** FAIL.
- [ ] **Step 3 :** dans `listFrames`, `key: n.getPluginData(IDENTITY_KEY) || n.id`. Dans `main.ts`, extraire le bloc d'export de `handleSnapshot` (SVG si léger via `chooseFormat`, sinon PNG dégressif `PNG_SCALES`/`PNG_MAX_B64`) dans une fonction `exportRender(node: SceneNode): Promise<{ b64: string; kind: 'svg' | 'png' } | null>`, la retirer de `handleSnapshot`, et ajouter :

```ts
    case 'RENDER_FRAMES': {
      // Rendus par frame, demandés APRÈS le POST (le serveur sait lesquelles ont changé).
      for (const f of msg.frames) {
        const node = await figma.getNodeByIdAsync(f.id).catch(() => null);
        if (!node || !('exportAsync' in node)) continue;
        const r = await exportRender(node as SceneNode);
        if (r) send({ type: 'FRAME_RENDERED', versionId: msg.versionId, key: f.key, b64: r.b64, kind: r.kind });
      }
      break;
    }
```

   Le clone d'historique (`storeHistoryClonePending(tracked[0])`) reste inchangé : c'est la Phase 4.
- [ ] **Step 4 :** vert + `npx tsc --noEmit`. **Step 5 : commit** — `feat(plugin): export des rendus par frame à la demande`.

---

## Task 7 : Plugin (UI) — liste des frames, historique d'une frame, diff par frame

**Files :**
- Modify : `plugin/src/ui.tsx`, `plugin/src/store.ts`, `plugin/src/types.ts`
- Test : `plugin/src/store.test.ts` (nouveaux champs), vérification manuelle dans Figma (étape 5)

**Interfaces :**
- Consumes : `frameHistory`, `frameStats`, `hasFrameNav` (tâche 5) ; `FRAME_RENDERED` (tâche 6) ; `render_frames` (tâche 2) ; `?frame=` (tâche 3) ; `FrameEntry.key` (tâche 6).
- Produces : `Screen` gagne `'frameHistory'` ; store : `frame: { key: string; name: string } | null` + `setFrame`.

- [ ] **Step 1 : test qui échoue** (`store.test.ts`) : `setFrame({ key: 'A', name: 'Accueil' })` puis `setAsset(autre)` remet `frame` à `null` (changer d'asset ne doit pas garder la frame d'un autre asset).
- [ ] **Step 2 :** FAIL. **Step 3 : implémentation**
  1. **Store** : `frame` + `setFrame` ; `setAsset` remet `frame: null`.
  2. **Upload des rendus** (`CheckpointScreen`, après le POST) : `send({ type: 'RENDER_FRAMES', versionId: data.version.id, frames: data.render_frames })` ; un écouteur `FRAME_RENDERED` (filtré sur `versionId`) poste chaque rendu vers `/api/checkpoints/:id/render` avec `frame_key`. Best-effort, comme l'upload actuel.
  3. **Accueil (`HomeScreen`)** : si `hasFrameNav(versions)`, la liste principale devient la liste des frames de la page (`FramesPanel` refondu) : une ligne par frame (`FrameEntry`) avec la case « suivie », le nom, et `frameStats(versions, entry.key)` (« 3 versions · il y a 2 h ») ; clic sur une frame qui a un historique → `setFrame` + `setScreen('frameHistory')` ; une frame sans historique n'est pas cliquable (spec D6). Un onglet « Toutes les versions » garde la timeline actuelle (branches comprises). Sinon (mode frame), l'écran reste inchangé.
  4. **`FrameHistoryScreen`** : titre = nom de la frame, liste `frameHistory(versions, frame.key)` avec `VersionRow` ; clic → `setSiblings(historique)` + `setDiffVersion(v)` + `setScreen('diff')` ; retour → accueil.
  5. **Diff** : `useDiffLoader` ajoute `&frame=${encodeURIComponent(frame.key)}` quand `frame` est défini ; le bouton retour ramène à `frameHistory` si une frame est sélectionnée. La navigation ◀▶ parcourt l'historique de la frame (siblings).
- [ ] **Step 4 :** `npx vitest run` + `npx tsc --noEmit` → vert. Puis **vérification manuelle dans Figma** (backend local, `VITE_API_BASE=http://localhost:3001 npm run build`) : suivre 3 frames, capturer (v1 : 3 rendus), modifier une frame, capturer (v2 : 1 rendu) ; la liste montre 2 versions pour la frame modifiée et 1 pour les autres ; clic → historique → diff avec le bon rendu et les surlignages de cette frame seulement ; couper-coller une frame puis capturer → son historique continue.
- [ ] **Step 5 : commit** — `feat(plugin): liste des frames, historique par frame, diff par frame`.

---

## Task 8 : Vérification finale et documentation

**Files :** `docs/conception/specs/2026-09-20-page-centric-design.md` (§7 et §14), `CHANGELOG.md`

- [ ] **Step 1 :** backend `npx vitest run` + `npx tsc --noEmit` ; plugin `npx vitest run` + `npx tsc --noEmit` → vert, au-dessus de la baseline (269 / 169).
- [ ] **Step 2 :** spec §7 : remplacer le schéma « checkpoint → frames » par la navigation retenue (liste des frames → historique de la frame → diff), en gardant D6 (cliquable ⟺ historique) ; §14 : Phase 3 « fait ». CHANGELOG `[Unreleased]` : entrée Phase 3.
- [ ] **Step 3 : commit** — `docs(page-centric): Phase 3 — navigation par frame`.

---

## Hors périmètre (explicite)

- **Restore par frame et clones bornés** — Phase 4 (spec §8). Les boutons de restauration du diff restent tels quels.
- **Note IA par frame** (« 3 frames modifiées : … ») — lot séparé.
- **Éléments flottants dans le rendu** : l'export d'une frame par Figma ne les inclut pas ; ils restent visibles dans la liste des changements. Solution prévue : rendu exact via l'API REST Figma (lot séparé, avec repli sur l'export plugin).
- **Rendu exact de l'état passé** via `figma.saveVersionHistoryAsync` + `GET /v1/images?version=` — même lot API Figma.

**Contrainte pour cette Phase 3 :** ne pas renforcer la dépendance à `dg/_history`. La tâche 6 laisse le clone d'historique tel quel (`storeHistoryClonePending`) ; aucune nouvelle fonctionnalité ne doit s'appuyer dessus tant que la décision ci-dessous n'est pas prise.

---

## Chantier à part — Restauration et historique (À DÉCIDER, ne pas lancer)

> Issu d'une discussion à part. **Rien n'est à implémenter sans décision** : cohérent avec la « roadmap parkée ». Livrable attendu : une **spec comparative** dans `docs/conception/specs/`, rédigée **après** les deux tests Figma ci-dessous.

### Constat à vérifier en priorité : le clone n'est probablement pas figé

Un clone rangé sur `dg/_history` garde vraisemblablement ses liens : ses **instances** restent liées à leur composant principal, et il référence les **styles et variables partagés**. Si le design system change après la capture, restaurer une ancienne version redonnerait sa structure, mais **avec les composants et les tokens actuels** — pas l'état capturé.

### Autres limites de `dg/_history`

- La page est **visible et modifiable** par tous les collaborateurs du fichier (`locked` n'est pas une protection).
- Elle **alourdit le `.fig`** et oblige à charger toutes les pages (`loadAllPagesAsync`).
- Elle **ne passe pas à l'échelle** en mode page : toutes les frames suivies clonées 5 fois.
- Au-delà des 5 derniers clones (`HISTORY_KEEP_N`), la restauration **se dégrade** (reconstruction par propriétés).

### Piste à évaluer

1. À chaque checkpoint, créer aussi une **version native Figma** nommée : `figma.saveVersionHistoryAsync(titre, description)`. *Existence confirmée dans `@figma/plugin-typings` (renvoie `{ id }`, la doc signale un délai possible avant que les dernières modifications soient incluses) ; comportement réel à confirmer par un essai dans le plugin de dev.*
2. Lire n'importe quelle version ancienne **à l'identique** via l'API REST (`GET /v1/files/:key?version=` et `GET /v1/images/:key?ids=…&version=`). Coûts : OAuth par utilisateur, limites de débit, et l'utilisateur doit coller l'URL de son fichier — *confirmé : `figma.fileKey` n'est disponible qu'aux plugins privés (`enablePrivatePluginApi`)*. La clé de fichier serait gardée côté serveur, **jamais utilisée comme identifiant** (cf. correctif #77). À vérifier aussi : durée de conservation de l'historique selon le plan Figma de l'utilisateur.
3. Garder le clone **seulement pour restaurer un élément précis, et seulement à la demande** (« épingler ce point de restauration »), plus à chaque capture.
4. Garder le **JSON dans Supabase comme source de vérité du diff** (inchangé).

### Préalables à la décision (tests manuels dans Figma)

- [ ] **Test 1 — clone figé ?** Capturer une frame qui contient une **instance** ; modifier son **composant principal** (et un style / une variable qu'elle utilise) ; regarder le clone sur `dg/_history` : a-t-il suivi la modification ?
- [ ] **Test 2 — version native.** Dans le plugin de dev, appeler `figma.saveVersionHistoryAsync('DG checkpoint test', '…')` après une capture ; vérifier la version dans l'historique Figma, puis modifier le composant principal et ouvrir cette version : l'état capturé est-il intact ?
- [ ] **Décision** : spec comparative (clone systématique / version native + API REST / clone épinglé à la demande), avec coûts et limites de chacune.
