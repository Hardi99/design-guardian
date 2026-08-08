# Spec — Diff Viewer : zoom/pan + accélération du chargement

> Validée 2026-07-27. Restaure le zoom/pan perdu à la refonte frame-héros et réduit la latence de chargement du diff en retirant les téléchargements de snapshot du chemin critique. **Côte-à-côte (Split) exclu** (décision utilisateur).

## 0. Contexte

- Le diff-viewer actuel (`plugin/src/ui.tsx`) = `HighlightCanvas` (fit-to-container figé) + `NodeDetail` (crop au clic). Le zoom (molette) et le pan (glisser) ont disparu avec `SvgFrame` (refonte `5cf9677`/`5ab7c0a`).
- Chargement d'un diff : `useDiffLoader` fait **2 GET** `/api/branches/versions/:id` (léger puis `?thumbs=1`). Le backend télécharge le(s) snapshot(s) depuis Supabase Storage pour calculer `current_frame` (dims) et les `bbox` par-nœud (`findNodeById`).
- Le diff lui-même (`analysis_json`) est **déjà pré-calculé** à la capture — on ne recalcule rien, on veut juste arrêter de retélécharger les snapshots.

## 1. Objectifs

1. **Zoom + pan** dans la frame-héros, surlignages alignés.
2. **GET diff sans téléchargement de snapshot** dans le cas nominal (versions récentes).
3. **Navigation ◀▶ instantanée** (cache + prefetch).
4. **Ouverture du plugin plus rapide** (différer `loadAllPagesAsync`).

**Non-goals** : Split côte-à-côte, Overlay/Différence, rich-text, changement du moteur de diff.

## 2. Décisions actées (audit)

| Item | Décision |
|---|---|
| Zoom/pan | Réintroduits dans `HighlightCanvas` via un wrapper transform partagé (image + highlights). |
| B1 | Download `currentSnap` rendu **conditionnel à `?thumbs`** (inutile sur l'appel léger). |
| B3 | **Stocker `frame` (dims root) + `bbox` par-nœud dans `analysis_json` à la capture** → le GET diff lit ces valeurs, ne télécharge le snapshot **qu'en repli** (versions legacy sans bbox stockés). |
| B4 | **Cache client** des payloads diff par `versionId` + **prefetch** des siblings prev/next. |
| B5 | `loadAllPagesAsync` **différé** aux opérations qui le requièrent (branches, historique/clone, restore) au lieu du démarrage. |
| B6/B7 | Discipline de taille de rendu — **différé** (YAGNI, faible gain vs risque). Hors périmètre v1. |

## 3. Détail par composant

### 3.1 Zoom/pan — `plugin/src/ui.tsx` `HighlightCanvas`
- État local `view = { scale, tx, ty }` (initial : fit calculé comme aujourd'hui).
- **Molette** (`onWheel`) : zoom centré sur le curseur (clamp scale ∈ [fit, ~8×]). `preventDefault`.
- **Glisser** (`onPointerDown/Move/Up`) : pan (maj `tx/ty`) ; un clic sans déplacement (< ~4px) = déselection (comportement actuel préservé).
- La couche transformée contient **`FrameImage` ET les boutons de surlignage** (un seul `transform: translate(tx,ty) scale(scale)`), pour garder l'alignement. Les bordures de surlignage compensent l'épaississement (`border-width` / scale) pour rester fines.
- Bouton **« Réinitialiser la vue »** (retour au fit). Double-clic = reset.
- Accessibilité : la molette ne doit pas piéger le scroll de page (le canvas est plein écran, OK) ; garder `aria-label` des highlights.
- **Fonction pure testable** : `clampView(view, bounds)` (clamp scale + bornes de pan) dans un module à part (`plugin/src/canvasView.ts`) + test Vitest. Le reste (handlers DOM) = vérif manuelle/build.

### 3.2 B1 — download conditionnel · `backend/src/controllers/branches.controller.ts:143`
- `const currentSnap = wantThumbs ? await resolveSnapshot(...) : null;`
- Vérifier que rien dans le chemin léger ne déréférence `currentSnap` (aujourd'hui : seulement `current_frame`, voir B3).

### 3.3 B3 — bbox + frame dims dans `analysis_json` (capture)
- **À la capture** (là où `analysis_json` est produit — service de diff/versioning), enrichir chaque entrée `modified/added/removed` d'un `bbox` (AABB relative à la root, même calcul que `nodeBbox` actuel) et stocker `frame: { w, h }` (dims root) dans `analysis_json.metadata` (ou champ dédié).
- **GET diff** : lire `frame`/`bbox` depuis `analysis_json` ; ne télécharger le snapshot **que** si absents (versions antérieures) → repli sur `nodeBbox`/`currentSnap` actuel. Zéro régression sur l'ancien.
- Résultat nominal : le GET `?thumbs=1` ne télécharge **plus de snapshot**, il signe juste les 2 URLs de rendu.
- **Rétro-compat** : les versions déjà en base n'ont pas ces champs → repli automatique. Documenter que le gain s'applique aux **nouveaux** checkpoints.

### 3.4 B4 — cache + prefetch · `plugin/src/ui.tsx`
- Cache module (`Map<versionId, DiffData>`) hors composant (survit au remount `key`).
- `useDiffLoader` : si `versionId` en cache → hydrate immédiatement (skip le GET léger), rafraîchit le lourd en arrière-plan si besoin.
- Après chargement d'une version, **prefetch** `prev`/`next` siblings (GET léger only) en tâche de fond.
- Invalidation simple : cache vidé au changement d'asset/branche (ou TTL court).

### 3.5 B5 — `loadAllPagesAsync` différé · `plugin/src/main.ts:32`
- Retirer l'appel du démarrage ; l'appeler (idempotent) **au début** des handlers qui en dépendent : création/switch de branche, capture (clone historique), restore. Un flag `pagesLoaded` évite les appels répétés.
- Vérifier qu'aucun accès cross-page au démarrage ne casse (auto-init lit `figma.root`/`fileKey`, pas les pages).

## 4. Tests

- **Pur** : `canvasView.test.ts` (`clampView` : clamp scale bas/haut, bornes pan, fit initial).
- **Backend** : test que le GET diff lit `bbox`/`frame` depuis `analysis_json` sans appeler Storage quand présents (mock : `resolveSnapshot` non appelé) ; repli quand absents.
- **Manuel/build** : zoom/pan visuel, nav ◀▶ instantanée, ouverture plugin, non-régression restore.
- Baseline actuelle : 300 tests (181 back + 119 plugin) — ne pas régresser.

## 5. Risques

- **Transform + highlights** : désalignement si la compensation de bordure est mal faite → test visuel soigné.
- **B3 capture** : la génération d'`analysis_json` doit rester la source de vérité ; ne pas dupliquer le calcul de bbox (réutiliser le même helper que `nodeBbox`, factorisé côté backend).
- **B5** : un handler oubliant `ensurePagesLoaded()` planterait sur dynamic-page → checklist des handlers concernés.
