# Diff-viewer : Frame-héros + surlignage + clic-pour-révéler — Design

> Spec validée 2026-06-28. Refonte **UI pure** du diff-viewer (aucun changement backend). Remplace les deux listes parallèles (cartes Nodes + Smart Data) et les « blocs déplacés » par **une frame surlignée + détail au clic**. Aligné « héros = Frame, pas de liste » (point du prof).

## 1. Objectif

Aujourd'hui le `DiffScreen` montre la même info deux fois (cartes visuelles à gauche + liste Smart Data à droite) + un en-tête « Blocs déplacés ». C'est redondant et bruyant. Cible : **la frame courante est le héros**, les changements **authored** sont **surlignés dessus**, et un **clic** révèle le détail d'UN nœud. Le dérivé/supprimé reste accessible (chips/toggle), jamais imposé.

**Acté :** garder un **toggle avant/après** (on a `prev_render_url`). Pas de zoom/pan dans le canvas v1 (le détail au clic donne le crop zoomé).

**Aucun backend** : tout existe déjà dans le payload diff — `render_url`/`render_kind`, `prev_render_url`/`prev_render_kind`, `current_frame`/`prev_frame` (dims), et `node_diffs[*]` avec `bbox` (`before_bbox`/`after_bbox`), `significance`, `kind`, `readable`.

## 2. Composants (découpage de `DiffScreen`)

Le `DiffScreen` est devenu gros → on extrait 3 composants focalisés dans `ui.tsx` :

### `HighlightCanvas`
**Rôle :** afficher une frame (image) avec des rectangles de surlignage cliquables sur les nœuds changés.
**Props :** `{ url: string; kind: 'svg'|'png'; frame: {w,h}; highlights: Highlight[]; selectedId: string|null; onSelect: (id: string|null) => void }`
où `interface Highlight { nodeId: string; bbox: Bbox; tone: 'modified'|'added'|'removed'|'derived' }`.
**Rendu :** un conteneur `relative` mesuré (ResizeObserver → `{w,h}` px). L'image en **fit/contain** :
`scale = min(CW/FW, CH/FH)` ; `offX = (CW - FW*scale)/2` ; `offY = (CH - FH*scale)/2`.
Pour chaque highlight, un `<button>` absolu : `left = offX + bbox.x*scale`, `top = offY + bbox.y*scale`, `width = bbox.w*scale`, `height = bbox.h*scale`, bordure 2px colorée par `tone` (modified=violet, added=vert, removed=rouge, derived=gris/40%). Clic → `onSelect(nodeId)`. Le surligné `selectedId` est accentué (bordure pleine + halo). Clic sur le fond (hors highlight) → `onSelect(null)`.
**Image :** réutiliser la logique d'`SvgFrame` (svg → fetch+inline ; png → `<img>`) MAIS sans zoom/pan — extraire un mini-rendu interne `<FrameImage url kind />` partagé.

### `NodeDetail`
**Rôle :** détail du nœud sélectionné.
**Props :** `{ node: NodeDiffVisual|null; renderUrl, prevRenderUrl, currentFrame, prevFrame }`.
**Rendu :** si `node === null` → état vide « Clique un élément surligné pour voir son changement. ». Sinon : nom + type ; **crops avant/après** (réutiliser `NodeCrop` : avant = `prevRenderUrl`+`prev_frame`+`before_bbox`, après = `renderUrl`+`current_frame`+`after_bbox`) ; la liste **`readable`** (réutiliser le rendu lisible existant des `NodeDiffCard`).

### `DiffChips`
**Rôle :** compteurs + toggles, en surimpression du canvas.
**Props :** `{ counts: { modified, added, removed, derived }; beforeMode: boolean; showDerived: boolean; onToggleBefore, onToggleDerived }`.
**Rendu :** rangée de chips : « N modifiés · N ajoutés · N supprimés · ▸ N dérivés » + un switch **Avant / Après**. Le chip « dérivés » bascule `showDerived` (surligne aussi les portés en gris). En mode **Avant**, on affiche les `removed` (rouge) + `modified` (au `before_bbox`).

## 3. Câblage dans `DiffScreen`

**État local :** `selectedNodeId: string|null`, `beforeMode: boolean` (false=après), `showDerived` (réutilise `showMinor`).

**Dérivation des highlights :**
```ts
const authored = data.node_diffs.filter(n => n.significance !== 'minor');
const derived  = data.node_diffs.filter(n => n.significance === 'minor');
const pool = showDerived ? data.node_diffs : authored;
// APRÈS : modified+added avec after_bbox ; AVANT : modified+removed avec before_bbox
const highlights = pool.flatMap(n => {
  const bbox = beforeMode ? n.before_bbox : n.after_bbox;
  if (!bbox) return [];
  const tone = n.significance === 'minor' ? 'derived' : n.kind; // kind: modified|added|removed
  return [{ nodeId: n.nodeId, bbox, tone }];
});
const selected = data.node_diffs.find(n => n.nodeId === selectedNodeId) ?? null;
```
**Layout :** en-tête (nav ◀▶ + actions, **inchangé**) + **titre IA** (`version.ai_summary`, déjà pollé) sous l'en-tête. Corps = 2 colonnes : **gauche** `HighlightCanvas` (flex-1) avec `DiffChips` en overlay + le toggle Avant/Après ; **droite** `NodeDetail` (largeur fixe ~w-72). Plus de vue « Nodes/Frame » en onglets, plus de Split, plus de liste Smart Data, plus de `block_moves`.

**Frame initiale (v1, pas de prev)** : si pas de `prev_version`, garder l'écran « Checkpoint initial » existant.

## 4. Ce qui est retiré (nettoyage)
- `NodeDiffCard` (cartes) et la liste qui les mappe.
- La liste **Smart Data** (mapping du delta brut) → remplacée par `NodeDetail`.
- L'en-tête **`block_moves`** (doublon du toggle dérivés). (Le champ `block_moves` reste dans le payload — on l'ignore côté UI ; pas de changement backend.)
- Les vues `'nodes'|'frame'` et `'split'|'overlay'` (`SET_VIEW`/`SET_MODE`) → supprimées du reducer si plus référencées (sinon laissées inertes — vérifier).
- `SvgFrame` (zoom/pan) → remplacé par `FrameImage` (rendu sans zoom) réutilisé par `HighlightCanvas`. Si `SvgFrame` n'est plus utilisé, le supprimer.

## 5. Données / risque
- **Aucun backend.** Tout vient du payload existant.
- Risque = gros remaniement JSX du `DiffScreen` → mitigé par l'extraction en 3 composants testables visuellement.
- **Différé (YAGNI)** : zoom/pan sur le canvas, surlignage animé, raccourcis. Le détail au clic (`NodeCrop`) couvre l'inspection rapprochée.

## 6. Tests
- Plugin (Vitest) : la logique pure est mince (dérivation des highlights, mapping tone). Extraire un helper `buildHighlights(nodeDiffs, beforeMode, showDerived)` testable (entrées → highlights attendus : after_bbox en mode après, before_bbox + removed en mode avant, derived inclus seulement si showDerived). 
- Le reste = visuel → `npm run build` + vérif manuelle en plugin (relance).

## 7. Ordre d'implémentation (pour le plan)
1. Helper pur `buildHighlights` + test.
2. `FrameImage` (extraction du rendu image d'`SvgFrame`).
3. `HighlightCanvas` (FrameImage + highlights cliquables + transform fit).
4. `NodeDetail` (réutilise `NodeCrop` + readable).
5. `DiffChips` (compteurs + toggles).
6. Refonte du corps de `DiffScreen` (assemblage, retrait des listes/blocs/onglets) + état.
7. Nettoyage (`NodeDiffCard`/`SvgFrame`/reducer inutiles).
