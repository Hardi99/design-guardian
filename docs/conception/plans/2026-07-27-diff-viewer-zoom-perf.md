# Diff Viewer — Zoom/Pan + Accélération chargement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restaurer le zoom/pan de la frame-héros et retirer les téléchargements de snapshot du chemin de chargement du diff (cache + prefetch nav, `loadAllPagesAsync` différé).

**Architecture:** (1) Zoom/pan = couche `transform` dans `HighlightCanvas` pilotée par une fonction pure `clampView`. (2) Perf = à la capture, on enrichit `analysis_json` avec les `bbox` par-nœud + les dims de frame ; le GET diff les lit au lieu de télécharger les snapshots (repli legacy conservé). (3) Cache client + prefetch ◀▶. (4) `loadAllPagesAsync` différé.

**Tech Stack:** Preact + TypeScript (plugin), HonoJS + Vitest (backend), Supabase Storage.

## Global Constraints

- **Baseline tests = 300 (181 backend + 119 plugin)** — ne pas régresser ; chaque tâche laisse `npm run typecheck` + tests au vert.
- **TypeScript strict, zéro `any`.**
- **Côte-à-côte (Split) et Overlay : HORS périmètre.**
- **Rétro-compat obligatoire** : les versions existantes (sans bbox/frame dans `analysis_json`) doivent continuer à s'afficher via le repli snapshot.
- `figma.*` uniquement dans `plugin/src/main.ts` ; HTTP uniquement dans `plugin/src/ui.tsx`.
- Commits : message court + trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Ne jamais stager `.devcontainer/` ni `presentation/`.

---

## File Structure

- **Create** `plugin/src/canvasView.ts` — fonction pure `clampView` (zoom/pan bornés).
- **Create** `plugin/src/canvasView.test.ts` — tests de `clampView`.
- **Modify** `plugin/src/ui.tsx` — `HighlightCanvas` (zoom/pan), cache + prefetch dans `useDiffLoader`.
- **Create** `backend/src/services/geometry.service.ts` — `nodeBboxRelative` + `enrichDeltaGeometry`.
- **Create** `backend/src/tests/geometry.service.test.ts` — tests.
- **Modify** `backend/src/controllers/checkpoints.controller.ts` — enrichir le delta à la capture.
- **Modify** `backend/src/controllers/branches.controller.ts` — enrichir à la capture (branche) + GET lit bbox/frame depuis `analysis_json` (repli snapshot).
- **Modify** `backend/src/types/figma.ts` — champs optionnels `bbox` sur `NodeDelta`, `frame` sur `DeltaJSON`.
- **Modify** `plugin/src/main.ts` — `ensurePagesLoaded()` + retrait de l'appel au démarrage.

---

## Task 1: `clampView` — fonction pure zoom/pan

**Files:**
- Create: `plugin/src/canvasView.ts`
- Test: `plugin/src/canvasView.test.ts`

**Interfaces:**
- Produces: `interface View { scale: number; tx: number; ty: number }` ; `clampView(view: View, minScale: number, maxScale: number): View`.

- [ ] **Step 1: Écrire le test**

```ts
import { describe, it, expect } from 'vitest';
import { clampView } from './canvasView.js';

describe('clampView', () => {
  it('borne le scale au minimum (fit)', () => {
    expect(clampView({ scale: 0.2, tx: 0, ty: 0 }, 0.5, 8).scale).toBe(0.5);
  });
  it('borne le scale au maximum', () => {
    expect(clampView({ scale: 20, tx: 0, ty: 0 }, 0.5, 8).scale).toBe(8);
  });
  it('laisse un scale valide inchangé', () => {
    expect(clampView({ scale: 2, tx: 10, ty: -5 }, 0.5, 8)).toEqual({ scale: 2, tx: 10, ty: -5 });
  });
});
```

- [ ] **Step 2: Lancer → échoue**

Run (depuis `plugin/`): `npm test -- canvasView`
Expected: FAIL (`clampView` non défini).

- [ ] **Step 3: Implémenter**

```ts
// plugin/src/canvasView.ts
export interface View { scale: number; tx: number; ty: number }

/** Borne le facteur de zoom entre minScale (fit) et maxScale. Le pan reste libre. */
export function clampView(view: View, minScale: number, maxScale: number): View {
  const scale = Math.min(maxScale, Math.max(minScale, view.scale));
  return { scale, tx: view.tx, ty: view.ty };
}
```

- [ ] **Step 4: Lancer → passe**

Run: `npm test -- canvasView`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugin/src/canvasView.ts plugin/src/canvasView.test.ts
git commit -m "feat(diff): clampView pur pour zoom/pan

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Zoom + pan dans `HighlightCanvas`

**Files:**
- Modify: `plugin/src/ui.tsx` (`HighlightCanvas`, ~866-894)

**Interfaces:**
- Consumes: `clampView`, `View` de `plugin/src/canvasView.ts`.

- [ ] **Step 1: Remplacer le corps de `HighlightCanvas`**

Le fit devient le `scale` **initial et minimum**. On enveloppe `FrameImage` + surlignages dans une couche `transform` unique. Molette = zoom curseur ; glisser = pan ; clic sans déplacement = déselection ; double-clic = reset.

```tsx
import { clampView, type View } from './canvasView.js';
// ... dans HighlightCanvas :
function HighlightCanvas({ url, kind, frame, highlights, selectedId, onSelect }: {
  url: string; kind: 'svg' | 'png'; frame: { w: number; h: number };
  highlights: Highlight[]; selectedId: string | null; onSelect: (id: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const fit = box.w > 0 && frame.w > 0 && frame.h > 0 ? Math.min(box.w / frame.w, box.h / frame.h) : 0;
  const [view, setView] = useState<View>({ scale: 0, tx: 0, ty: 0 });
  // (re)cadre au fit quand le conteneur/frame change tant qu'on n'a pas zoomé
  const fitView = (): View => ({ scale: fit, tx: (box.w - frame.w * fit) / 2, ty: (box.h - frame.h * fit) / 2 });
  useEffect(() => { setView(fitView()); }, [fit, frame.w, frame.h, box.w, box.h]);

  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = ref.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const next = clampView({ scale: view.scale * factor, tx: 0, ty: 0 }, fit, fit * 8);
    const k = next.scale / view.scale;
    // zoom centré sur le curseur : conserve le point sous le curseur
    setView({ scale: next.scale, tx: cx - (cx - view.tx) * k, ty: cy - (cy - view.ty) * k });
  };
  const onPointerDown = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    setView(v => ({ scale: v.scale, tx: d.tx + dx, ty: d.ty + dy }));
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (d && !d.moved) onSelect(null); // clic net = déselection (comportement conservé)
  };

  return (
    <div ref={ref} class="relative flex-1 min-h-0 overflow-hidden cursor-grab active:cursor-grabbing"
      onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onDblClick={() => setView(fitView())}>
      <div class="absolute top-0 left-0 origin-top-left"
        style={{ width: `${frame.w}px`, height: `${frame.h}px`, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}>
        <div class="absolute inset-0"><FrameImage url={url} kind={kind} /></div>
        {view.scale > 0 && highlights.map(hl => (
          <button key={hl.nodeId}
            aria-label={`Voir le changement de ${hl.nodeId}`}
            onClick={(e) => { e.stopPropagation(); onSelect(hl.nodeId); }}
            class={`absolute rounded-sm ${TONE_CLASS[hl.tone]} ${selectedId === hl.nodeId ? 'ring-2 ring-white/70 bg-white/5' : 'hover:bg-white/5'}`}
            style={{ left: `${hl.bbox.x}px`, top: `${hl.bbox.y}px`, width: `${Math.max(6, hl.bbox.w)}px`, height: `${Math.max(6, hl.bbox.h)}px`, borderWidth: `${2 / view.scale}px`, borderStyle: 'solid' }}
          />
        ))}
      </div>
      <button aria-label="Réinitialiser la vue" onClick={() => setView(fitView())}
        class="absolute bottom-2 right-2 z-10 px-2 py-1 text-[10px] bg-gray-800/80 text-gray-300 rounded hover:bg-gray-700">Réinitialiser</button>
    </div>
  );
}
```

Note : les highlights sont désormais positionnés en **coordonnées de frame** (pas × scale) car ils vivent DANS la couche transformée ; la bordure est divisée par `scale` pour rester fine. `TONE_CLASS` ne contient plus que la couleur (`border-purple-400`…) — retirer un éventuel `border-2` du map, l'épaisseur vient du style inline.

- [ ] **Step 2: Vérifier build + typecheck**

Run (depuis `plugin/`): `npm run typecheck && npm test && npm run build`
Expected: typecheck clean, **119 tests** verts (aucun test ne couvre le JSX), build OK.

- [ ] **Step 3: Vérif visuelle manuelle**

Relancer le plugin, ouvrir un diff avec ≥1 changement : molette zoome sur le curseur, glisser déplace, les surlignages restent alignés à toute échelle, clic net déselectionne, double-clic/bouton « Réinitialiser » recadre.

- [ ] **Step 4: Commit**

```bash
git add plugin/src/ui.tsx
git commit -m "feat(diff): restaure zoom molette + pan dans HighlightCanvas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Helper backend `geometry.service` (bbox + enrichissement delta)

**Files:**
- Create: `backend/src/services/geometry.service.ts`
- Test: `backend/src/tests/geometry.service.test.ts`
- Modify: `backend/src/types/figma.ts` (champs optionnels)

**Interfaces:**
- Produces:
  - `type Bbox = { x: number; y: number; w: number; h: number }`
  - `nodeBboxRelative(snapshot: FigmaSnapshot, nodeId: string): Bbox | null`
  - `enrichDeltaGeometry(delta: DeltaJSON, currentSnap: FigmaSnapshot, prevSnap: FigmaSnapshot | null): DeltaJSON` — ajoute `bbox` à chaque `NodeDelta` (modified/added depuis currentSnap ; removed depuis prevSnap) et `frame = { w, h }` (dims root du currentSnap) sur le delta.

- [ ] **Step 1: Étendre les types** (`backend/src/types/figma.ts`)

Ajouter à `NodeDelta` : `bbox?: { x: number; y: number; w: number; h: number };`
Ajouter à `DeltaJSON` : `frame?: { w: number; h: number };`

- [ ] **Step 2: Écrire le test** (`backend/src/tests/geometry.service.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { nodeBboxRelative, enrichDeltaGeometry } from '../services/geometry.service.js';
import type { FigmaSnapshot, DeltaJSON } from '../types/figma.js';

const snap = (): FigmaSnapshot => ({
  root: { id: 'root', name: 'F', type: 'FRAME', x: 100, y: 50, width: 200, height: 100,
    opacity: 1, fills: [], strokes: [],
    children: [{ id: 'a', name: 'A', type: 'RECT', x: 120, y: 70, width: 40, height: 20, opacity: 1, fills: [], strokes: [], children: [] }] },
} as unknown as FigmaSnapshot);

describe('nodeBboxRelative', () => {
  it('renvoie la bbox relative à la root', () => {
    expect(nodeBboxRelative(snap(), 'a')).toEqual({ x: 20, y: 20, w: 40, h: 20 });
  });
  it('null si nœud absent', () => {
    expect(nodeBboxRelative(snap(), 'zzz')).toBeNull();
  });
});

describe('enrichDeltaGeometry', () => {
  it('ajoute frame + bbox aux modified', () => {
    const delta = { modified: [{ nodeId: 'a', nodeName: 'A', nodeType: 'RECT', changes: [] }], added: [], removed: [], totalChanges: 1, metadata: {} } as unknown as DeltaJSON;
    const out = enrichDeltaGeometry(delta, snap(), null);
    expect(out.frame).toEqual({ w: 200, h: 100 });
    expect(out.modified[0].bbox).toEqual({ x: 20, y: 20, w: 40, h: 20 });
  });
});
```

- [ ] **Step 3: Lancer → échoue**

Run (depuis `backend/`): `npm run test:run -- geometry.service`
Expected: FAIL (module absent).

- [ ] **Step 4: Implémenter** (`backend/src/services/geometry.service.ts`)

```ts
import type { FigmaSnapshot, NodeSnapshot, DeltaJSON } from '../types/figma.js';

export type Bbox = { x: number; y: number; w: number; h: number };

function findNode(node: NodeSnapshot, id: string): NodeSnapshot | null {
  if (node.id === id) return node;
  for (const c of node.children ?? []) { const f = findNode(c, id); if (f) return f; }
  return null;
}

/** Bbox du nœud relative à la root (AABB visuelle si présente, sinon x/y/w/h bruts). */
export function nodeBboxRelative(snapshot: FigmaSnapshot, nodeId: string): Bbox | null {
  const node = findNode(snapshot.root, nodeId);
  if (!node) return null;
  const rb = snapshot.root.aabb;
  const ox = rb ? rb.x : snapshot.root.x;
  const oy = rb ? rb.y : snapshot.root.y;
  if (node.aabb) return { x: node.aabb.x - ox, y: node.aabb.y - oy, w: node.aabb.w, h: node.aabb.h };
  return { x: node.x - snapshot.root.x, y: node.y - snapshot.root.y, w: node.width, h: node.height };
}

/** Ajoute `frame` (dims root) + `bbox` par-nœud au delta, pour éviter de retélécharger le snapshot au GET. */
export function enrichDeltaGeometry(delta: DeltaJSON, currentSnap: FigmaSnapshot, prevSnap: FigmaSnapshot | null): DeltaJSON {
  const rb = currentSnap.root.aabb;
  const frame = { w: rb ? rb.w : currentSnap.root.width, h: rb ? rb.h : currentSnap.root.height };
  const put = (arr: DeltaJSON['modified'], snap: FigmaSnapshot | null) =>
    arr.map(nd => ({ ...nd, bbox: snap ? (nodeBboxRelative(snap, nd.nodeId) ?? undefined) : undefined }));
  return {
    ...delta, frame,
    modified: put(delta.modified, currentSnap),
    added:    put(delta.added, currentSnap),
    removed:  put(delta.removed, prevSnap),
  };
}
```

- [ ] **Step 5: Lancer → passe**

Run: `npm run test:run -- geometry.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/geometry.service.ts backend/src/tests/geometry.service.test.ts backend/src/types/figma.ts
git commit -m "feat(diff): geometry.service — bbox relative + enrichissement delta

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Enrichir le delta à la capture (deux controllers)

**Files:**
- Modify: `backend/src/controllers/checkpoints.controller.ts` (~68-75, `computeMeta`)
- Modify: `backend/src/controllers/branches.controller.ts` (~259-266, `computeMeta`)

**Interfaces:**
- Consumes: `enrichDeltaGeometry` de `geometry.service.ts`.

- [ ] **Step 1: `checkpoints.controller.ts`** — dans `computeMeta`, après le calcul du delta

Remplacer `const delta = diffService.compareSnapshots(prevSnapshot, body.snapshot_json as FigmaSnapshot);` par :
```ts
const rawDelta = diffService.compareSnapshots(prevSnapshot, body.snapshot_json as FigmaSnapshot);
const delta = enrichDeltaGeometry(rawDelta, body.snapshot_json as FigmaSnapshot, prevSnapshot ?? null);
```
Ajouter l'import `import { enrichDeltaGeometry } from '../services/geometry.service.js';`.
(`prevSnapshot` peut être `null` sur le 1er checkpoint — géré par le helper.)

- [ ] **Step 2: `branches.controller.ts`** — même chose (~265)

```ts
const rawDelta = diffService.compareSnapshots(headSnap, snapshot);
const delta = enrichDeltaGeometry(rawDelta, snapshot, headSnap ?? null);
```
Ajouter l'import si absent.

- [ ] **Step 3: Vérifier**

Run (depuis `backend/`): `npm run typecheck && npm run test:run`
Expected: typecheck clean, tests verts (les tests controllers existants ne vérifient pas la géométrie → inchangés).

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/checkpoints.controller.ts backend/src/controllers/branches.controller.ts
git commit -m "feat(diff): stocke bbox+frame dans analysis_json à la capture

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: GET diff lit la géométrie stockée (repli snapshot) — subsume B1

**Files:**
- Modify: `backend/src/controllers/branches.controller.ts` (GET `/versions/:id`, ~118-223)
- Test: `backend/src/tests/branches.controller.test.ts` (ajout d'un cas)

**Interfaces:**
- Consumes: `analysis_json.frame` + `NodeDelta.bbox` (Task 3/4).

- [ ] **Step 1: Rendre les downloads snapshot conditionnels**

Aujourd'hui `currentSnap` est téléchargé inconditionnellement (`:143`) et `prevSnap` sur `?thumbs`. Nouvelle logique : ne télécharger un snapshot **que** si la géométrie stockée manque (version legacy) **et** qu'on en a besoin.
```ts
const storedFrame = (delta && (delta as DeltaJSON).frame) || null;
const needSnapForBbox = wantThumbs && (delta?.modified ?? []).concat(delta?.added ?? [], delta?.removed ?? []).some(n => !('bbox' in n));
const currentSnap = (needSnapForBbox || (wantThumbs && !storedFrame)) ? await resolveSnapshot(getSupabaseStorage(), versionData) : null;
const prevSnap = (wantThumbs && needSnapForBbox && prevVersion) ? await resolveSnapshot(getSupabaseStorage(), prevVersion) : null;
```

- [ ] **Step 2: `current_frame` depuis la géométrie stockée, repli snapshot**

```ts
const current_frame = storedFrame ?? (currentSnap ? { w: currentSnap.root.width, h: currentSnap.root.height } : null);
// idem prev_frame : delta stocke la frame courante ; pour la frame précédente, repli sur prevSnap si présent
const prev_frame = prevSnap ? { w: prevSnap.root.width, h: prevSnap.root.height } : (prevVersion?.analysis_json as DeltaJSON | null)?.frame ?? null;
```

- [ ] **Step 3: `bbox` par-nœud depuis le delta, repli `nodeBbox`**

Dans la boucle de construction de `nodeDiffs`, remplacer les appels `nodeBbox(currentSnap, nd.nodeId)` / `nodeBbox(prevSnap, ...)` par : utiliser `nd.bbox` si présent, sinon (legacy) l'ancien `nodeBbox(...)` avec le snapshot téléchargé. Exemple pour les modified :
```ts
const bbox = (nd as NodeDelta).bbox ?? (render && currentSnap ? nodeBbox(currentSnap, nd.nodeId) : null);
before_bbox: render ? ((prevDelta?.byId?.[nd.nodeId]) ?? (prevSnap ? nodeBbox(prevSnap, nd.nodeId) : null)) : null,
after_bbox:  render ? bbox : null,
```
(Conserver le `nodeBbox` local existant comme fonction de repli. La frame courante des `before_bbox` reste celle du prev — pour les modified, le delta courant ne porte pas la bbox « avant » ; repli sur prevSnap si legacy, sinon `null` acceptable puisque le crop « avant » est secondaire.)

> Simplification pragmatique acceptée : si `prev_frame`/`before_bbox` exigent le prevSnap, on le télécharge **uniquement en repli**. Le gain principal (chemin nominal sans download) porte sur `current_frame` + `after_bbox` + les highlights, qui viennent tous du delta stocké.

- [ ] **Step 4: Écrire le test** (`branches.controller.test.ts`)

Cas : version dont `analysis_json` contient `frame` + `bbox` → `GET /versions/:id?thumbs=1` **n'appelle pas** `resolveSnapshot`. Mocker le module `versioning.service` et asserter que `resolveSnapshot` n'est pas appelé, et que la réponse contient `current_frame` = la frame stockée + `node_diffs[].after_bbox` = la bbox stockée.

```ts
// squelette — adapter aux helpers de mock existants du fichier
it('GET diff : géométrie stockée => aucun download de snapshot', async () => {
  // analysis_json avec frame + bbox ; spy sur resolveSnapshot
  // expect(resolveSnapshotSpy).not.toHaveBeenCalled();
  // expect(body.current_frame).toEqual({ w: ..., h: ... });
});
```

- [ ] **Step 5: Vérifier**

Run (depuis `backend/`): `npm run typecheck && npm run test:run`
Expected: typecheck clean ; nouveau test vert ; anciens tests controllers verts (repli legacy intact).

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/branches.controller.ts backend/src/tests/branches.controller.test.ts
git commit -m "perf(diff): GET lit bbox/frame du delta, snapshot seulement en repli legacy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Cache client + prefetch ◀▶

**Files:**
- Modify: `plugin/src/ui.tsx` (`useDiffLoader` ~568-582, module-level cache)

**Interfaces:**
- Consumes: `api`, `DiffData`, `siblings` du store.

- [ ] **Step 1: Cache module + hydratation**

Au niveau module (hors composant) :
```ts
const diffCache = new Map<string, DiffData>(); // versionId -> payload lourd (thumbs)
export function clearDiffCache() { diffCache.clear(); }
```
Vider le cache au changement d'asset/branche : appeler `clearDiffCache()` là où `setAsset`/`setBranch` sont déclenchés (ou dans le handler qui recharge l'historique).

- [ ] **Step 2: `useDiffLoader` — servir le cache, prefetch siblings**

```ts
function useDiffLoader(dispatch: (a: DiffAction) => void, apiKey: string, versionId: string) {
  const siblings = useAppStore(s => s.siblings);
  useEffect(() => {
    send({ type: 'RESIZE', width: 820, height: 640 });
    const cached = diffCache.get(versionId);
    if (cached) { dispatch({ type: 'LOAD_SUCCESS', data: cached }); dispatch({ type: 'HEAVY_LOADED', data: cached }); }
    else {
      api<DiffData>(apiKey, `/api/branches/versions/${versionId}`)
        .then(data => {
          dispatch({ type: 'LOAD_SUCCESS', data });
          return api<DiffData>(apiKey, `/api/branches/versions/${versionId}?thumbs=1`);
        })
        .then(full => { if (full) { diffCache.set(versionId, full); dispatch({ type: 'HEAVY_LOADED', data: full }); } })
        .catch(e => dispatch({ type: 'LOAD_ERROR', err: (e as Error).message }));
    }
    // prefetch voisins (léger+thumbs) en tâche de fond, sans dispatch
    const idx = siblings.findIndex(s => s.id === versionId);
    for (const n of [siblings[idx - 1], siblings[idx + 1]]) {
      if (n && !diffCache.get(n.id)) {
        api<DiffData>(apiKey, `/api/branches/versions/${n.id}?thumbs=1`).then(d => diffCache.set(n.id, d)).catch(() => {});
      }
    }
  }, [apiKey, versionId]);
}
```

- [ ] **Step 3: Vérifier**

Run (depuis `plugin/`): `npm run typecheck && npm test && npm run build`
Expected: verts. Manuel : première ouverture normale ; ◀▶ vers un voisin déjà prefetché = quasi instantané.

- [ ] **Step 4: Commit**

```bash
git add plugin/src/ui.tsx
git commit -m "perf(diff): cache client + prefetch des versions voisines

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `loadAllPagesAsync` différé

**Files:**
- Modify: `plugin/src/main.ts` (`:32`, `:352`, `:494`, `handleCreateBranch`, `handleStoreHistoryClone`, `handleSwitchBranch`)

- [ ] **Step 1: Helper idempotent + retrait au démarrage**

```ts
let pagesLoaded = false;
async function ensurePagesLoaded(): Promise<void> {
  if (pagesLoaded) return;
  await figma.loadAllPagesAsync();
  pagesLoaded = true;
}
```
Retirer l'`await figma.loadAllPagesAsync();` du démarrage (`:32`).

- [ ] **Step 2: Appeler `ensurePagesLoaded()` en tête des handlers qui touchent d'autres pages**

Remplacer les `await figma.loadAllPagesAsync();` existants par `await ensurePagesLoaded();` dans : `handleSnapshot` (capture/clone historique), `handleRestoreToFigma`, `handleCreateBranch`, `handleStoreHistoryClone`, `handleSwitchBranch` (tout handler accédant à `dg/_history` ou aux pages `dg/*`). Vérifier qu'aucun accès cross-page ne subsiste au démarrage/`auto-init` (auto-init lit `figma.root`/`fileKey` uniquement).

- [ ] **Step 3: Vérifier**

Run (depuis `plugin/`): `npm run typecheck && npm test && npm run build`
Expected: verts. Manuel : ouverture du plugin plus rapide sur gros fichier ; capture / création de branche / restore fonctionnent toujours (pas d'erreur dynamic-page).

- [ ] **Step 4: Commit**

```bash
git add plugin/src/main.ts
git commit -m "perf(plugin): loadAllPagesAsync différé aux ops multi-pages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Vérification globale

- [ ] **Step 1: Suite complète**

```bash
cd backend && npm run typecheck && npm run test:run
cd ../plugin && npm run typecheck && npm test && npm run build
```
Expected: backend ≥ 181 (+ nouveaux tests geometry/controller), plugin ≥ 119 (+ canvasView), build OK. **Aucune régression.**

- [ ] **Step 2: Recette manuelle (parcours clés)**

Zoom/pan + surlignages alignés ; ◀▶ instantané (prefetch) ; ouverture plugin ; capture d'un **nouveau** checkpoint puis ouverture de son diff = **aucun download snapshot** (vérifiable dans les logs backend) ; ouverture d'une **ancienne** version (legacy) = repli fonctionne. Restore OK.

- [ ] **Step 3: Commit éventuels ajustements**

---

## Self-Review (auteur du plan)

- **Couverture spec** : zoom/pan → T1+T2 ; B1 → T5 (subsumé) ; B3 → T3+T4 (capture) + T5 (GET) ; B4 → T6 ; B5 → T7 ; vérif → T8. ✅ tout couvert. B6/B7 explicitement hors périmètre (spec §2).
- **Placeholders** : le squelette de test en T5-Step4 est marqué « adapter aux helpers de mock existants » — c'est le seul point à contextualiser à l'implémentation (le fichier de test a ses propres mocks Supabase) ; toutes les autres étapes ont du code complet.
- **Cohérence types** : `View`/`clampView` (T1) réutilisés en T2 ; `enrichDeltaGeometry`/`nodeBboxRelative` (T3) réutilisés en T4/T5 ; `bbox`/`frame` optionnels (T3-Step1) lus en T5. Cohérent.
- **Rétro-compat** : repli snapshot conservé partout où la géométrie stockée manque (T5). ✅
