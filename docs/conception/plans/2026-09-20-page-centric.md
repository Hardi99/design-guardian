# Page-centric — Plan d'implémentation (Phase 0 + Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mesurer le coût réel d'une capture de page entière, puis poser le modèle de données « viewport » qui permettra au diff de couvrir tous les calques d'une page.

**Architecture :** La page devient la racine du snapshot, mais comme `PageNode` n'a aucune géométrie, le repère géométrique se déplace vers le **viewport** — l'enfant de premier niveau de la page. Chaque bbox devient relative à son viewport, ce qui permet de réutiliser tel quel le pipeline de rendu et de surlignage existant, frame par frame.

**Tech Stack :** TypeScript strict, Vitest, HonoJS, Supabase PostgreSQL, Preact (plugin Figma).

**Spec :** `docs/conception/specs/2026-09-20-page-centric-design.md`

## Portée de CE plan

Ce plan couvre **la Phase 0 (spike) et la Phase 1 (modèle)** du découpage §14 du spec.

Les phases 2 (capture), 3 (arbre de calques) et 4 (restore) **ne sont volontairement pas détaillées ici** : le spike de la Tâche 1 est un **gate bloquant** dont le résultat détermine la stratégie de capture. Écrire aujourd'hui les tâches de la Phase 2 reviendrait à risquer de les écrire deux fois. Elles feront l'objet d'un second plan, rédigé une fois les chiffres connus.

En revanche la Phase 1 est **robuste au résultat du spike** : quelle que soit la stratégie de capture retenue (directe, incrémentale, plafonnée), le modèle « viewport » reste nécessaire. On peut donc l'implémenter sans attendre.

## Global Constraints

- **D1** — 1 page Figma = 1 asset = 1 timeline.
- **D2** — Remplacement net : les assets frame existants passent en **lecture seule**.
- **D3** — Capture page, **lecture par viewport** (enfant de premier niveau, qui a une géométrie Figma réelle).
- **D6** — Invariant : **cliquable ⟺ modifié**.
- La racine synthétique est un **conteneur** : géométrie constante `x:0, y:0, width:0, height:0`, `opacity:1`, `fills:[]`, `strokes:[]` → aucun diff par construction. Exclue du diff ET du restore.
- La racine synthétique **doit porter un `dg_id`** : `compareSnapshots` calcule `useDgId = !!v1.root.dg_id && !!v2.root.dg_id`. Sans lui, le matching par `dg_id` se désactive pour toute la page.
- Un enfant de premier niveau **est son propre viewport** : sa bbox vaut `{x:0, y:0, w, h}`.
- `changes` dans `viewports[]` compte les **groupes** au sens de #71 (clé = `instanceRoot ?? nodeId`), pas les nœuds bruts.
- TypeScript strict, **zéro `any`**. Séparation Service / Controller.
- **Baseline : 330 tests (200 backend + 130 plugin)** — aucune régression tolérée.
- Le préfixe de page `dg/` est **réservé** (branches + `_history`).
- **Hors périmètre** : décommissionnement des branches (97 occurrences / 26 fichiers).

---

## File Structure

| Fichier | Responsabilité | Action |
|---|---|---|
| `backend/src/services/tree.service.ts` | Parcours d'arbre : `buildTreeMaps`, `instanceRootMap`, **`viewportRootMap`** | Modifier |
| `backend/src/services/geometry.service.ts` | Bbox et enrichissement géométrique du delta | Modifier |
| `backend/src/types/figma.ts` | Types `NodeDelta` / `DeltaJSON` | Modifier |
| `backend/src/controllers/versions.controller.ts` | Exposition de `node_diffs` au plugin | Modifier |
| `supabase/migrations/018_assets_scope.sql` | Colonne `assets.scope` ('frame' \| 'page') | Créer |
| `backend/src/tests/tree.service.test.ts` | Tests de `viewportRootMap` | Modifier |
| `backend/src/tests/geometry.service.test.ts` | Tests bbox / enrichissement | Modifier |
| `backend/src/tests/versions.controller.test.ts` | Test du passthrough `viewport` | Modifier |
| `plugin/src/main.ts` | **Spike temporaire uniquement** (retiré en fin de Tâche 1) | Modifier puis révoquer |

---

## Task 1 : Spike de mesure — GATE BLOQUANT

**Objectif :** produire des chiffres, pas du code conservé. Tout ce qui est écrit ici est **retiré à la fin de la tâche**.

**Files:**
- Modify (temporairement) : `plugin/src/main.ts`
- Modify (temporairement) : `plugin/src/ui.tsx`

**Interfaces:**
- Consumes : `extractSnapshot(node: SceneNode): NodeSnapshot` (existant, `main.ts`), `ensurePagesLoaded()` (existant)
- Produces : aucun code. Produit **quatre nombres** consignés dans le spec §10.

- [ ] **Step 1 : Ajouter le handler de mesure temporaire dans `main.ts`**

Dans le `switch` des messages de `figma.ui.onmessage`, ajouter ce `case` (marqué temporaire) :

```ts
    // ⚠️ TEMPORAIRE — spike de mesure page-centric. À RETIRER (cf. Task 1, step 6).
    case 'SPIKE_MEASURE': {
      await ensurePagesLoaded();
      const page = figma.currentPage;

      const t0 = Date.now();
      const children = page.children.map(extractSnapshot);
      const extractMs = Date.now() - t0;

      const json = JSON.stringify({
        figmaNodeId: page.id,
        figmaNodeName: page.name,
        capturedAt: new Date().toISOString(),
        root: {
          id: page.id, name: page.name, type: 'PAGE',
          x: 0, y: 0, width: 0, height: 0,
          opacity: 1, fills: [], strokes: [], children,
        },
      });

      let layers = 0;
      const count = (n: NodeSnapshot): void => { layers++; (n.children ?? []).forEach(count); };
      children.forEach(count);

      const jsonKb = Math.round(json.length / 1024);
      console.log('[DG SPIKE]', { layers, viewports: children.length, extractMs, jsonKb });
      figma.notify(`${layers} calques · ${children.length} viewports · extraction ${extractMs} ms · JSON ${jsonKb} Ko`, { timeout: 20000 });
      break;
    }
```

- [ ] **Step 2 : Ajouter le déclencheur temporaire dans `ui.tsx`**

Dans l'écran d'accueil, juste avant la fermeture du conteneur principal, ajouter :

```tsx
        {/* ⚠️ TEMPORAIRE — spike page-centric. À RETIRER (cf. Task 1, step 6). */}
        <button
          onClick={() => send({ type: 'SPIKE_MEASURE' })}
          class="mx-4 mb-2 px-2 py-1 rounded text-xs bg-amber-700 text-amber-100"
        >
          ⏱ Spike : mesurer la page
        </button>
```

Si TypeScript refuse le type de message, élargir temporairement le type dans `plugin/src/types.ts` :

```ts
  | { type: 'SPIKE_MEASURE' }   // ⚠️ TEMPORAIRE — spike page-centric
```

- [ ] **Step 3 : Construire et lancer**

Run : `cd plugin && npm run build`
Puis, dans Figma : ouvrir le plugin **sur une page de design réelle et représentative** (pas une page vide, pas la page de test à une seule frame), et cliquer « ⏱ Spike ».

- [ ] **Step 4 : Consigner les mesures**

Répéter sur **au moins deux pages** de tailles différentes. Reporter dans le tableau du §10 du spec :

| Métrique | Page A | Page B |
|---|---|---|
| Nombre de calques | | |
| Nombre de viewports | | |
| Temps d'extraction (ms) | | |
| Poids du snapshot JSON (Ko) | | |

- [ ] **Step 5 : Appliquer le gate**

Comparer le **temps d'extraction** à la référence actuelle (~1,6 s pour une capture complète d'une frame, réseau inclus) :

- **< 5 s** → ✅ design validé tel quel. Continuer à la Tâche 2, et rédiger le plan des Phases 2-4.
- **5 – 15 s** → ⚠️ design tenable. Continuer à la Tâche 2, mais **le plan des Phases 2-4 devra inclure un retour de progression pendant la capture**.
- **> 15 s** → 🛑 **ARRÊT**. Ne pas continuer. Revenir au spec et revoir la stratégie de capture (incrémentale, plafonds, exclusion des sous-arbres inchangés) avant tout code.

> Reporter également le poids JSON : au-delà de ~5 Mo, signaler le point même si le temps est bon — le téléversement et le stockage deviennent un sujet à part entière.

- [ ] **Step 6 : Retirer intégralement le code du spike**

Annuler les modifications des steps 1, 2 (et le type éventuel) :

```bash
git checkout -- plugin/src/main.ts plugin/src/ui.tsx plugin/src/types.ts
cd plugin && npm run build
```

- [ ] **Step 7 : Vérifier qu'il ne reste rien**

Run : `cd plugin && npx vitest run && npx tsc --noEmit`
Expected : 130 tests PASS, typecheck silencieux.
Run : `grep -rn "SPIKE" plugin/src/`
Expected : aucun résultat.

- [ ] **Step 8 : Commiter les mesures dans le spec**

```bash
git add docs/conception/specs/2026-09-20-page-centric-design.md
git commit -m "docs(conception): mesures du spike page-centric" -m "Chiffres relevés sur deux pages réelles ; décision du gate §10 consignée."
```

---

## Task 2 : `viewportRootMap` — chaque calque connaît son viewport

**Files:**
- Modify : `backend/src/services/tree.service.ts`
- Test : `backend/src/tests/tree.service.test.ts`

**Interfaces:**
- Consumes : `NodeSnapshot` (`backend/src/types/figma.ts`)
- Produces : `viewportRootMap(root: NodeSnapshot): Map<string, { id: string; name: string }>` — chaque nœud descendant d'un enfant de premier niveau pointe vers cet enfant ; un enfant de premier niveau pointe vers **lui-même** ; la racine est **absente** de la map.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à la fin de `backend/src/tests/tree.service.test.ts` :

```ts
describe('viewportRootMap', () => {
  // page → [ Accueil → [Header → [Logo]], Sticker ]
  const page = node('page', 'Écrans app', [
    node('accueil', 'Accueil', [node('header', 'Header', [node('logo', 'Logo')])]),
    node('sticker', 'Sticker libre'),
  ]);

  it('mappe un descendant profond vers son enfant de premier niveau', () => {
    const map = viewportRootMap(page);
    expect(map.get('logo')).toEqual({ id: 'accueil', name: 'Accueil' });
    expect(map.get('header')).toEqual({ id: 'accueil', name: 'Accueil' });
  });

  it('un enfant de premier niveau est son PROPRE viewport', () => {
    const map = viewportRootMap(page);
    expect(map.get('accueil')).toEqual({ id: 'accueil', name: 'Accueil' });
    expect(map.get('sticker')).toEqual({ id: 'sticker', name: 'Sticker libre' });
  });

  it('la racine n\'a pas de viewport (conteneur, pas objet de design)', () => {
    expect(viewportRootMap(page).get('page')).toBeUndefined();
  });

  it('page sans enfant → map vide (pas de crash)', () => {
    expect(viewportRootMap(node('page', 'Vide')).size).toBe(0);
  });
});
```

Et compléter l'import en tête du fichier :

```ts
import { buildTreeMaps, instanceRootMap, viewportRootMap } from '../services/tree.service.js';
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run : `cd backend && npx vitest run src/tests/tree.service.test.ts`
Expected : FAIL — `viewportRootMap is not a function` (ou erreur d'import TypeScript).

- [ ] **Step 3 : Implémenter**

Ajouter à la fin de `backend/src/services/tree.service.ts` :

```ts
// Map chaque nœud → le VIEWPORT qui le contient, c'est-à-dire l'enfant de premier
// niveau de la racine dont il descend (un enfant de premier niveau est son propre
// viewport). La racine est absente : c'est un conteneur, pas un objet de design.
// Le viewport est le repère géométrique du page-centric : PageNode n'ayant aucune
// géométrie, les bbox et les dimensions de cadre sont relatives au viewport.
export function viewportRootMap(root: NodeSnapshot): Map<string, { id: string; name: string }> {
  const out = new Map<string, { id: string; name: string }>();
  for (const top of root.children ?? []) {
    const vp = { id: top.id, name: top.name };
    const walk = (n: NodeSnapshot): void => {
      out.set(n.id, vp);
      for (const c of n.children ?? []) walk(c);
    };
    walk(top);
  }
  return out;
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run : `cd backend && npx vitest run src/tests/tree.service.test.ts`
Expected : PASS (8 tests — 1 `buildTreeMaps` + 3 `instanceRootMap` + 4 `viewportRootMap`).

- [ ] **Step 5 : Commiter**

```bash
git add backend/src/services/tree.service.ts backend/src/tests/tree.service.test.ts
git commit -m "feat(page-centric): viewportRootMap — chaque calque connaît son viewport"
```

---

## Task 3 : `nodeBboxIn` — bbox relative à une origine choisie

**Files:**
- Modify : `backend/src/services/geometry.service.ts`
- Test : `backend/src/tests/geometry.service.test.ts`

**Interfaces:**
- Consumes : `findNodeById` (`backend/src/services/svg-generator.service.js`), `Bbox`, `FigmaSnapshot`
- Produces : `nodeBboxIn(snapshot: FigmaSnapshot, nodeId: string, originId: string): Bbox | null`. `nodeBboxRelative(snapshot, nodeId)` devient un alias de `nodeBboxIn(snapshot, nodeId, snapshot.root.id)` — comportement identique, aucune régression.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter dans `backend/src/tests/geometry.service.test.ts`, après le `describe('nodeBboxRelative')` :

```ts
describe('nodeBboxIn', () => {
  // root [100,50] → accueil [120,70, 40×20] → logo [124,74, 10×10]
  const s = (): FigmaSnapshot => ({
    root: { id: 'root', name: 'P', type: 'PAGE', x: 100, y: 50, width: 0, height: 0,
      opacity: 1, fills: [], strokes: [],
      children: [{ id: 'accueil', name: 'Accueil', type: 'FRAME', x: 120, y: 70, width: 40, height: 20,
        opacity: 1, fills: [], strokes: [],
        children: [{ id: 'logo', name: 'Logo', type: 'VECTOR', x: 124, y: 74, width: 10, height: 10,
          opacity: 1, fills: [], strokes: [], children: [] }] }] },
  } as unknown as FigmaSnapshot);

  it('bbox d\'un descendant relative à son viewport', () => {
    expect(nodeBboxIn(s(), 'logo', 'accueil')).toEqual({ x: 4, y: 4, w: 10, h: 10 });
  });

  it('un viewport relatif à lui-même est en {0,0}', () => {
    expect(nodeBboxIn(s(), 'accueil', 'accueil')).toEqual({ x: 0, y: 0, w: 40, h: 20 });
  });

  it('null si le nœud ou l\'origine est introuvable', () => {
    expect(nodeBboxIn(s(), 'zzz', 'accueil')).toBeNull();
    expect(nodeBboxIn(s(), 'logo', 'zzz')).toBeNull();
  });
});
```

Et compléter l'import en tête du fichier :

```ts
import { nodeBboxRelative, nodeBboxIn, enrichDeltaGeometry } from '../services/geometry.service.js';
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run : `cd backend && npx vitest run src/tests/geometry.service.test.ts`
Expected : FAIL — `nodeBboxIn is not a function`.

- [ ] **Step 3 : Implémenter**

Dans `backend/src/services/geometry.service.ts`, remplacer la fonction `nodeBboxRelative` par :

```ts
/** Bbox du nœud relative à une ORIGINE choisie (AABB visuelle si présente, sinon x/y/w/h bruts). */
export function nodeBboxIn(snapshot: FigmaSnapshot, nodeId: string, originId: string): Bbox | null {
  const node = findNodeById(snapshot.root, nodeId);
  const origin = findNodeById(snapshot.root, originId);
  if (!node || !origin) return null;
  const ob = origin.aabb;
  const ox = ob ? ob.x : origin.x;
  const oy = ob ? ob.y : origin.y;
  if (node.aabb) return { x: node.aabb.x - ox, y: node.aabb.y - oy, w: node.aabb.w, h: node.aabb.h };
  return { x: node.x - ox, y: node.y - oy, w: node.width, h: node.height };
}

/** Bbox relative à la racine du snapshot. Conservée pour le mode frame (lecture seule). */
export function nodeBboxRelative(snapshot: FigmaSnapshot, nodeId: string): Bbox | null {
  return nodeBboxIn(snapshot, nodeId, snapshot.root.id);
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run : `cd backend && npx vitest run src/tests/geometry.service.test.ts`
Expected : PASS — les 3 nouveaux tests **et** les anciens tests de `nodeBboxRelative` (preuve de non-régression).

- [ ] **Step 5 : Vérifier l'absence de régression globale**

Run : `cd backend && npx vitest run && npx tsc --noEmit`
Expected : 207 tests PASS (200 de base + 4 de la Tâche 2 + 3 ici), typecheck silencieux.

- [ ] **Step 6 : Commiter**

```bash
git add backend/src/services/geometry.service.ts backend/src/tests/geometry.service.test.ts
git commit -m "refactor(geometry): nodeBboxIn — bbox relative à une origine choisie" -m "nodeBboxRelative devient un alias sur la racine : comportement inchangé pour le mode frame."
```

---

## Task 4 : Enrichissement `viewport` + `viewports[]` du delta

**Files:**
- Modify : `backend/src/types/figma.ts`
- Modify : `backend/src/services/geometry.service.ts`
- Test : `backend/src/tests/geometry.service.test.ts`

**Interfaces:**
- Consumes : `viewportRootMap` (Task 2), `nodeBboxIn` (Task 3), `instanceRootMap` (existant)
- Produces : sur chaque `NodeDelta` → `viewport?: string` et `bbox` **relative au viewport** ; sur le `DeltaJSON` → `viewports?: Array<{ id: string; name: string; frame: { w: number; h: number }; changes: number }>`. L'enrichissement viewport ne s'active que si `currentSnap.root.type === 'PAGE'`.

- [ ] **Step 1 : Étendre les types**

Dans `backend/src/types/figma.ts`, dans l'interface `NodeDelta`, après `instanceBbox` :

```ts
  // Page-centric : viewport = enfant de premier niveau de la page contenant ce nœud.
  // C'est le repère géométrique — `bbox` lui est relative (et non à la racine).
  viewport?: string;
```

Et dans l'interface `DeltaJSON`, après `frame` :

```ts
  // Page-centric : un cadre navigable par viewport modifié. `changes` compte les GROUPES
  // au sens du regroupement d'icônes (clé = instanceRoot ?? nodeId), pas les nœuds bruts.
  viewports?: Array<{ id: string; name: string; frame: { w: number; h: number }; changes: number }>;
```

- [ ] **Step 2 : Écrire les tests qui échouent**

Ajouter dans `backend/src/tests/geometry.service.test.ts`, dans le `describe('enrichDeltaGeometry')` :

```ts
  // Page (type PAGE) → [ Accueil [120,70,40×20] → Logo [124,74,10×10] ]
  const snapPage = (): FigmaSnapshot => ({
    root: { id: 'page', name: 'Écrans', type: 'PAGE', x: 0, y: 0, width: 0, height: 0,
      opacity: 1, fills: [], strokes: [],
      children: [{ id: 'accueil', name: 'Accueil', type: 'FRAME', x: 120, y: 70, width: 40, height: 20,
        opacity: 1, fills: [], strokes: [],
        children: [{ id: 'logo', name: 'Logo', type: 'VECTOR', x: 124, y: 74, width: 10, height: 10,
          opacity: 1, fills: [], strokes: [], children: [] }] }] },
  } as unknown as FigmaSnapshot);

  const deltaOf = (ids: string[]): DeltaJSON => ({
    modified: ids.map(id => ({ nodeId: id, nodeName: id, nodeType: 'VECTOR', changes: [] })),
    added: [], removed: [], totalChanges: ids.length, metadata: {},
  } as unknown as DeltaJSON);

  it('attache le viewport et rend la bbox relative à CE viewport', () => {
    const out = enrichDeltaGeometry(deltaOf(['logo']), snapPage(), null);
    expect(out.modified[0].viewport).toBe('accueil');
    expect(out.modified[0].bbox).toEqual({ x: 4, y: 4, w: 10, h: 10 }); // et non {24,24}
  });

  it('expose viewports[] avec nom, cadre et compte de changements', () => {
    const out = enrichDeltaGeometry(deltaOf(['logo', 'accueil']), snapPage(), null);
    expect(out.viewports).toEqual([{ id: 'accueil', name: 'Accueil', frame: { w: 40, h: 20 }, changes: 2 }]);
  });

  it('compte les GROUPES : deux nœuds d\'une même icône comptent pour 1', () => {
    const d = deltaOf(['logo']);
    d.modified.push({ nodeId: 'logo2', nodeName: 'l2', nodeType: 'VECTOR', changes: [] });
    // Les deux nœuds appartiennent à la même instance → 1 seul groupe.
    d.modified[0].instanceRoot = 'icon1';
    d.modified[1].instanceRoot = 'icon1';
    const out = enrichDeltaGeometry(d, snapPage(), null);
    expect(out.viewports?.[0].changes).toBe(1);
  });

  it('mode frame (racine non-PAGE) : aucun viewport, bbox relative à la racine', () => {
    const out = enrichDeltaGeometry(deltaOf(['a']), snap(), null);
    expect(out.modified[0].viewport).toBeUndefined();
    expect(out.viewports).toBeUndefined();
    expect(out.modified[0].bbox).toEqual({ x: 20, y: 20, w: 40, h: 20 });
  });
```

- [ ] **Step 3 : Lancer les tests pour vérifier l'échec**

Run : `cd backend && npx vitest run src/tests/geometry.service.test.ts`
Expected : FAIL — `viewport` est `undefined` et `bbox` vaut `{x:24,y:24,...}` (encore relative à la racine).

- [ ] **Step 4 : Implémenter**

Dans `backend/src/services/geometry.service.ts`, compléter l'import :

```ts
import { instanceRootMap, viewportRootMap } from './tree.service.js';
```

Puis remplacer le corps de `enrichDeltaGeometry` par :

```ts
export function enrichDeltaGeometry(delta: DeltaJSON, currentSnap: FigmaSnapshot, prevSnap: FigmaSnapshot | null): DeltaJSON {
  const rb = currentSnap.root.aabb;
  const frame = { w: rb ? rb.w : currentSnap.root.width, h: rb ? rb.h : currentSnap.root.height };
  const curInst = instanceRootMap(currentSnap.root);
  const prevInst = prevSnap ? instanceRootMap(prevSnap.root) : null;

  // Page-centric : le repère devient le viewport. En mode frame (racine non-PAGE),
  // les maps restent vides → bbox relative à la racine, comportement d'origine.
  const curVp  = currentSnap.root.type === 'PAGE' ? viewportRootMap(currentSnap.root) : null;
  const prevVp = prevSnap?.root.type === 'PAGE'   ? viewportRootMap(prevSnap.root)    : null;

  const put = (
    arr: DeltaJSON['modified'],
    snap: FigmaSnapshot | null,
    inst: ReturnType<typeof instanceRootMap> | null,
    vp: ReturnType<typeof viewportRootMap> | null,
  ) =>
    arr.map(nd => {
      const root = inst?.get(nd.nodeId);
      const viewport = vp?.get(nd.nodeId);
      const origin = viewport?.id ?? snap?.root.id;
      return {
        ...nd,
        bbox: snap && origin ? (nodeBboxIn(snap, nd.nodeId, origin) ?? undefined) : undefined,
        instanceRoot: root?.id,
        instanceName: root?.name,
        instanceBbox: root && snap && origin ? (nodeBboxIn(snap, root.id, origin) ?? undefined) : undefined,
        viewport: viewport?.id,
      };
    });

  const modified = put(delta.modified, currentSnap, curInst, curVp);
  const added    = put(delta.added,    currentSnap, curInst, curVp);
  const removed  = put(delta.removed,  prevSnap,    prevInst, prevVp);

  return { ...delta, frame, modified, added, removed, viewports: buildViewports([...modified, ...added, ...removed], currentSnap) };
}

// Un cadre navigable par viewport touché. `changes` compte les GROUPES (clé =
// instanceRoot ?? nodeId) : les nœuds internes d'une même icône comptent pour 1,
// sinon l'arbre afficherait un nombre que le viewer contredirait.
function buildViewports(nodes: DeltaJSON['modified'], snap: FigmaSnapshot): DeltaJSON['viewports'] {
  if (snap.root.type !== 'PAGE') return undefined;
  const groups = new Map<string, Set<string>>();
  for (const nd of nodes) {
    if (!nd.viewport) continue;
    const set = groups.get(nd.viewport) ?? new Set<string>();
    set.add(nd.instanceRoot ?? nd.nodeId);
    groups.set(nd.viewport, set);
  }
  const out: NonNullable<DeltaJSON['viewports']> = [];
  for (const top of snap.root.children ?? []) {
    const set = groups.get(top.id);
    if (!set) continue;
    const ab = top.aabb;
    out.push({
      id: top.id, name: top.name,
      frame: { w: ab ? ab.w : top.width, h: ab ? ab.h : top.height },
      changes: set.size,
    });
  }
  return out;
}
```

- [ ] **Step 5 : Lancer les tests pour vérifier le succès**

Run : `cd backend && npx vitest run src/tests/geometry.service.test.ts`
Expected : PASS — les 4 nouveaux tests **et** les anciens (dont `instanceRoot`/`instanceBbox` de #71, preuve que le mode frame est intact).

- [ ] **Step 6 : Vérifier l'absence de régression globale**

Run : `cd backend && npx vitest run && npx tsc --noEmit`
Expected : 211 tests PASS, typecheck silencieux.

- [ ] **Step 7 : Commiter**

```bash
git add backend/src/types/figma.ts backend/src/services/geometry.service.ts backend/src/tests/geometry.service.test.ts
git commit -m "feat(page-centric): viewport par nœud + viewports[] dans le delta" -m "La bbox devient relative au viewport quand la racine est une PAGE ; le mode frame est inchangé."
```

---

## Task 5 : Migration `assets.scope`

**Files:**
- Create : `supabase/migrations/018_assets_scope.sql`
- Modify : `backend/src/types/database.ts`

**Interfaces:**
- Produces : colonne `assets.scope` de type `text`, valeurs `'frame' | 'page'`, défaut `'frame'`. Les assets existants restent `'frame'` (lecture seule, D2) ; les captures page-centric créeront des assets `'page'`.

- [ ] **Step 1 : Écrire la migration**

Créer `supabase/migrations/018_assets_scope.sql` :

```sql
-- Page-centric (cf. docs/conception/specs/2026-09-20-page-centric-design.md).
-- Marque l'unité de capture d'un asset. Les lignes existantes sont frame-centric et
-- passent en lecture seule (D2) ; les nouvelles captures créent des assets 'page'.
-- Marqueur EXPLICITE : un id de page Figma n'est pas distinguable d'un id de nœud.
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'frame';

ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS assets_scope_check;

ALTER TABLE assets
  ADD CONSTRAINT assets_scope_check CHECK (scope IN ('frame', 'page'));

COMMENT ON COLUMN assets.scope IS
  'Unité de capture : frame (legacy, lecture seule) ou page (page-centric).';
```

- [ ] **Step 2 : Refléter la colonne dans le type**

Dans `backend/src/types/database.ts`, ajouter le champ à l'interface `Asset` :

```ts
  scope: 'frame' | 'page';
```

- [ ] **Step 3 : Vérifier le typecheck**

Run : `cd backend && npx tsc --noEmit`
Expected : silencieux. Si une construction d'objet `Asset` échoue faute du champ, c'est le signal qu'un point d'écriture doit décider de son `scope` — le renseigner explicitement à `'frame'` pour l'instant (la capture page-centric arrivera en Phase 2).

- [ ] **Step 4 : Appliquer la migration**

L'appliquer sur Supabase (dashboard SQL editor ou MCP `apply_migration`), puis vérifier :

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'assets' and column_name = 'scope';
```
Expected : une ligne, `text`, défaut `'frame'::text`.

- [ ] **Step 5 : Documenter dans le journal des migrations**

Ajouter la ligne correspondante à `supabase/MIGRATIONS.md`, au format déjà utilisé par les migrations 015-017 : numéro (018), objet (`assets.scope`), et la date du jour où elle a été appliquée.

- [ ] **Step 6 : Commiter**

```bash
git add supabase/migrations/018_assets_scope.sql supabase/MIGRATIONS.md backend/src/types/database.ts
git commit -m "feat(db): migration 018 — assets.scope (frame|page)"
```

---

## Task 6 : Exposer `viewport` et `viewports[]` au plugin

**Files:**
- Modify : `backend/src/controllers/versions.controller.ts`
- Test : `backend/src/tests/versions.controller.test.ts`

**Interfaces:**
- Consumes : `NodeDelta.viewport` et `DeltaJSON.viewports` (Task 4)
- Produces : chaque entrée de `node_diffs` gagne `viewport: string | null` ; la réponse du `GET /api/versions/versions/:id` gagne `viewports` (tableau, ou `null` pour les versions frame).

- [ ] **Step 1 : Écrire le test qui échoue**

Dans `backend/src/tests/versions.controller.test.ts`, enrichir le fixture `analysis_json` du `describe('GET /api/versions/versions/:id — stored geometry')` : ajouter `viewport: 'accueil'` au nœud `n1` et au nœud `n2`, puis, après le bloc `analysis_json.frame`, ajouter :

```ts
        viewports: [{ id: 'accueil', name: 'Accueil', frame: { w: 400, h: 800 }, changes: 2 }],
```

Puis ajouter ce test dans le même `describe` :

```ts
  it('expose viewport par nœud et viewports[] (navigation page-centric)', async () => {
    const res = await createApp().request('/api/versions/versions/v2', {
      headers: { 'X-API-Key': 'key-of-p1' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as {
      node_diffs: Array<{ nodeId: string; viewport: string | null }>;
      viewports: Array<{ id: string; name: string; changes: number }> | null;
    };
    expect(body.node_diffs.find(n => n.nodeId === 'n1')?.viewport).toBe('accueil');
    expect(body.viewports).toEqual([{ id: 'accueil', name: 'Accueil', frame: { w: 400, h: 800 }, changes: 2 }]);
  });
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

Run : `cd backend && npx vitest run src/tests/versions.controller.test.ts`
Expected : FAIL — `viewport` est `undefined`, `viewports` est absent de la réponse.

- [ ] **Step 3 : Implémenter**

Dans `backend/src/controllers/versions.controller.ts` :

(a) Ajouter le champ au type du tableau `nodeDiffs`, après `instance_after_bbox` :

```ts
    // Page-centric : viewport (enfant de premier niveau) auquel ce nœud appartient.
    // C'est l'unité de rendu ET le repère de `before_bbox`/`after_bbox`.
    viewport: string | null;
```

(b) Dans **chacune des trois boucles** (`delta.modified`, `delta.added`, `delta.removed`), ajouter à l'objet poussé :

```ts
        viewport: nd.viewport ?? null,
```

(c) Ajouter `viewports` à la réponse JSON, après `current_frame, prev_frame,` :

```ts
    viewports: delta?.viewports ?? null,
```

- [ ] **Step 4 : Lancer le test pour vérifier le succès**

Run : `cd backend && npx vitest run src/tests/versions.controller.test.ts`
Expected : PASS (4 tests).

- [ ] **Step 5 : Vérifier l'absence de régression globale**

Run : `cd backend && npx vitest run && npx tsc --noEmit`
Expected : 212 tests PASS, typecheck silencieux.

- [ ] **Step 6 : Commiter**

```bash
git add backend/src/controllers/versions.controller.ts backend/src/tests/versions.controller.test.ts
git commit -m "feat(page-centric): expose viewport et viewports[] dans node_diffs"
```

---

## Task 7 : Prouver que la racine synthétique ne produit aucun diff

**Files:**
- Test : `backend/src/tests/diff.service.test.ts`

**Interfaces:**
- Consumes : `DiffService.compareSnapshots(v1, v2)` (existant, **non modifié**)
- Produces : aucun code de production. Verrouille une propriété dont tout le modèle dépend.

> **Pourquoi ce test.** La racine synthétique est un conteneur : elle ne doit jamais apparaître comme un changement. Aujourd'hui c'est vrai **par construction** — sa géométrie est constante et `name` ne fait pas partie des propriétés comparées par `compareNodes`. Rien ne le garantit dans le temps : quiconque ajouterait la comparaison de `name` ferait apparaître un faux « la page a changé » à chaque renommage. Ce test transforme une coïncidence en contrat.

- [ ] **Step 1 : Écrire le test**

Ajouter dans `backend/src/tests/diff.service.test.ts` :

```ts
describe('racine synthétique page-centric', () => {
  const pageSnap = (pageName: string, logoX: number): FigmaSnapshot => ({
    figmaNodeId: 'page', figmaNodeName: pageName, capturedAt: '2026-01-01T00:00:00Z',
    root: {
      id: 'page', name: pageName, type: 'PAGE', dg_id: 'dg-page',
      x: 0, y: 0, width: 0, height: 0, opacity: 1, fills: [], strokes: [],
      children: [{
        id: 'accueil', name: 'Accueil', type: 'FRAME', dg_id: 'dg-accueil',
        x: 0, y: 0, width: 400, height: 800, opacity: 1, fills: [], strokes: [],
        children: [{
          id: 'logo', name: 'Logo', type: 'VECTOR', dg_id: 'dg-logo',
          x: logoX, y: 10, width: 10, height: 10, opacity: 1, fills: [], strokes: [], children: [],
        }],
      }],
    },
  } as unknown as FigmaSnapshot);

  it('page renommée sans changement de design → aucun diff sur la racine', () => {
    const delta = new DiffService().compareSnapshots(pageSnap('Écrans', 10), pageSnap('Écrans v2', 10));
    expect(delta.totalChanges).toBe(0);
    expect(delta.modified.find(n => n.nodeId === 'page')).toBeUndefined();
  });

  it('un vrai changement interne est bien détecté, et la racine reste absente', () => {
    const delta = new DiffService().compareSnapshots(pageSnap('Écrans', 10), pageSnap('Écrans', 50));
    expect(delta.modified.map(n => n.nodeId)).toEqual(['logo']);
    expect(delta.modified.find(n => n.nodeId === 'page')).toBeUndefined();
  });
});
```

- [ ] **Step 2 : Lancer le test**

Run : `cd backend && npx vitest run src/tests/diff.service.test.ts`
Expected : **PASS immédiatement** — la propriété est déjà vraie par construction. Si le premier test échoue, c'est que `name` (ou une autre propriété de la racine) est comparé : corriger `compareSnapshots` pour ignorer la racine quand `root.type === 'PAGE'` avant d'aller plus loin.

- [ ] **Step 3 : Vérifier l'absence de régression globale**

Run : `cd backend && npx vitest run && npx tsc --noEmit`
Expected : 214 tests PASS, typecheck silencieux.

- [ ] **Step 4 : Commiter**

```bash
git add backend/src/tests/diff.service.test.ts
git commit -m "test(page-centric): la racine synthétique ne produit aucun diff" -m "Verrouille une propriété aujourd'hui vraie par construction : géométrie constante et name non comparé."
```

---

## Fin de la Phase 1 — état attendu

- **214 tests backend** (200 de base + 14 ajoutés : 4 + 3 + 4 + 1 + 2) + **130 tests plugin**, tous verts.
- Le backend sait, pour un snapshot dont la racine est une `PAGE` : attribuer un viewport à chaque calque, rendre les bbox relatives à ce viewport, et produire la liste des viewports modifiés avec un compte de changements cohérent avec le regroupement d'icônes de #71.
- Le mode frame est **strictement inchangé** (prouvé par les tests d'origine restés verts).
- La base accepte des assets `scope = 'page'`.
- **Rien n'est visible côté utilisateur** — c'est attendu : la capture (Phase 2) et l'arbre (Phase 3) viendront dans le plan suivant.

## Suite

Rédiger le plan des **Phases 2 à 4** une fois le gate de la Tâche 1 franchi, en tenant compte des chiffres mesurés :

- Phase 2 — capture sans sélection, racine synthétique **avec `dg_id`**, garde `dg/*`, rendus des viewports modifiés.
- Phase 3 — endpoint `GET /api/versions/versions/:id/layers` + arbre de calques dans le plugin.
- Phase 4 — restore par viewport + clones bornés aux viewports modifiés.
