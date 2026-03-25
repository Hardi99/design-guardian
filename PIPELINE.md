# Pipeline SVG — Design Guardian

## Vue d'ensemble

```
Figma Desktop                 Backend (HonoJS/Railway)        Plugin UI
─────────────                 ────────────────────────         ─────────
Selection → main.ts           POST /api/checkpoints            DiffScreen
  extractSnapshot()     →       compareSnapshots()               svg_b64 → <img data:...>
  (native properties)           generatePatchNote() (OpenAI)
  snapshot_json         →     INSERT versions (snapshot_json)
                              GET /api/branches/versions/:id
                                generateSvgFromSnapshot()  →   base64 inline
```

---

## Étape 1 — Extraction (main.ts, Figma thread)

Le nœud sélectionné est parcouru récursivement via `extractSnapshot()`.

Propriétés capturées :
- **Géométrie** : `absoluteTransform[0][2]` / `[1][2]` (coordonnées absolues), `width`, `height`
- **Visuel** : `fills[]`, `strokes[]`, `opacity`, `cornerRadius`, `strokeWeight`
- **Vecteur** : `vectorPaths[]` (data SVG + windingRule)
- **Arbre** : `children[]` récursif

Résultat : `FigmaSnapshot` (JSON pur, aucun binaire).

> **Pourquoi les coordonnées absolues ?** Le diff compare des nœuds par `id` entre deux snapshots. Des coordonnées relatives dépendraient du parent — si le parent bouge, chaque enfant apparaîtrait comme modifié. L'absolu garantit que seul le nœud réellement déplacé est marqué.

---

## Étape 2 — Diff géométrique (diff.service.ts, Backend)

`DiffService.compareSnapshots(v1, v2)` :

1. `flattenTree()` — aplatit les deux arbres en `Map<id, NodeSnapshot>`
2. **Removed** : ids présents en v1 mais absents de v2
3. **Added** : ids présents en v2 mais absents de v1
4. **Modified** : `compareNodes()` pour chaque id commun

Propriétés comparées avec tolérance `ε = 0.01px` : `x, y, width, height`.
Sans tolérance : `opacity` (seuil 0.001), `cornerRadius`, `strokeWeight`, couleur fill/stroke, `vectorPaths`.

Sortie : `DeltaJSON` → stocké dans `analysis_json`, transmis à OpenAI.

---

## Étape 3 — AI Patch Note (openai.service.ts, Backend)

Si `delta.totalChanges > 0` → prompt structuré envoyé à GPT-4o-mini.
Retourne une phrase en français du type :
`"@Auteur a modifié la couleur de fill de Button/Label : #FF2200 → #F2FF00"`

---

## Étape 4 — Persistance (checkpoints.controller.ts, Backend)

INSERT dans `versions` :
```
asset_id | branch_name | version_number | snapshot_json | analysis_json | ai_summary | parent_id
```

Aucun fichier binaire stocké. Supabase Storage n'est **pas** utilisé pour le diff.

---

## Étape 5 — Reconstruction SVG (svg-generator.service.ts, Backend)

À chaque `GET /api/branches/versions/:id`, le SVG est reconstruit **à la volée** depuis `snapshot_json` :

```typescript
generateSvgFromSnapshot(snapshot) → SVG string → base64
```

Rendu par type de nœud :
| Type Figma | SVG généré |
|---|---|
| RECTANGLE | `<rect>` avec `rx/ry` si cornerRadius |
| ELLIPSE | `<ellipse>` |
| FRAME / GROUP / COMPONENT | `<g transform="translate">` + `<rect>` de fond |
| VECTOR / STAR / POLYGON | `<path>` depuis `vectorPaths.data` |
| TEXT | `<rect>` placeholder (couleur fill) |

Couleurs : `fill="#hex" fill-opacity="x"` (pas de `rgba()` — invalide en SVG attribute).
ViewBox : padé de `strokeWeight/2` pour que les strokes ne soient pas coupés.

---

## Étape 6 — Affichage (ui.tsx, Plugin UI)

```tsx
<img src={`data:image/svg+xml;base64,${data.svg_b64}`} />
```

Split view (avant/après) et Overlay (slider) côte à côte.
Aucune URL signée, aucun bucket S3. Le SVG arrive inline dans la réponse JSON.

---

## Ce pipeline est-il optimal ?

### Forces

| Critère | Évaluation |
|---|---|
| **Simplicité** | ✅ Zéro dépendance Storage. Le SVG est un dérivé calculable du snapshot — le stocker serait de la redondance. |
| **Solidité** | ✅ Le diff se fait sur des propriétés natives Figma (pas sur du SVG parsé) → pas de perte d'information due à la sérialisation SVG. |
| **Performance** | ✅ `generateSvgFromSnapshot` est O(n) sur les nœuds, < 5ms pour des frames standards. |
| **Cohérence** | ✅ `snapshot_json` est la source unique de vérité : diff, SVG et AI patch note viennent tous du même objet. |
| **Maintenabilité** | ✅ Ajouter un nouveau type de nœud = ajouter un `if` dans `renderNode()`. |

### Limites connues

| Limite | Impact | Mitigation |
|---|---|---|
| TEXT rendu comme rectangle | Pas de texte lisible dans le diff viewer | Acceptable pour M2 ; extension possible avec `characters` + `<text>` SVG |
| Gradients / images non supportés | Fill affiché `none` | Hors scope diff géométrique — les fills avancés sont ignorés, pas crashés |
| Arbre très profond (> 500 nœuds) | Légère latence reconstruction | Cas extrême ; seuil à documenter si nécessaire |
| Coordonnées absolues → SVG racine à (0,0) | Requis dans renderNode via `parentX/parentY` | Déjà géré par `renderNode(root, root.x, root.y)` |

### Verdict

**Le pipeline est optimal** pour l'usage ciblé (diff vectoriel logos, icônes, composants UI simples).
Il serait contre-productif de le complexifier (ex. stocker le SVG, parser du XML) — la solidité vient précisément du fait que le diff opère sur les propriétés natives, pas sur une représentation intermédiaire.

---

## Arbre des fichiers concernés

```
plugin/src/
  main.ts                  ← extraction snapshot (Figma thread)
  types.ts                 ← FigmaSnapshot, NodeSnapshot, messages IPC

backend/src/
  services/
    diff.service.ts        ← compareSnapshots, flattenTree, compareNodes
    svg-generator.service.ts ← generateSvgFromSnapshot, renderNode
    openai.service.ts      ← generatePatchNote
  controllers/
    checkpoints.controller.ts ← POST /api/checkpoints
    branches.controller.ts    ← GET /api/branches/versions/:id + status
  types/
    figma.ts               ← FigmaSnapshot, DeltaJSON, NodeDelta, ...

plugin/src/
  ui.tsx                   ← DiffScreen, Split/Overlay, Gold Status, Restore
```
