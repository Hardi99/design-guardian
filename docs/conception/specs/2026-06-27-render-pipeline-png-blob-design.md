# Pipeline d'aperçu : format adaptatif (SVG vectoriel / PNG borné) + blob binaire — Design

> Spec validée 2026-06-27 (révisée : **adaptatif** au lieu de PNG-partout). Objectif : **gérer le maximum de designs (complexes, avec images), vite et solide**, tout en **préservant le zoom vectoriel sans perte** là où il compte.

## 1. Objectif & périmètre

Le diff-viewer (Split/Overlay/crops) a besoin d'un **visuel** des frames. Aujourd'hui :
- capture en SVG (`exportAsync`) → le SVG gonfle avec le contenu (images embarquées) → un SVG > 2 Mo est **jeté** (cap `main.ts`) → fallback sur une **reconstruction lossy** (pas d'images, polices fallback) ;
- stockage en `JSON.stringify({svg_b64})` (`_render.json`) → +33 % base64, pas de cache navigateur ;
- service du b64 **inline dans le JSON** du diff → gros payloads, lents.

**Insight directeur :** le SVG offre un zoom sans perte **uniquement pour le vectoriel** ; une image raster pixelise de toute façon, même embarquée dans un SVG. Or les designs **vectoriels** (où le SVG brille) sont exactement ceux où le SVG reste **petit** ; les designs **avec images** (où le SVG explose) sont ceux où son avantage zoom est **moot**. → format **adaptatif** :
- **SVG** quand l'export reste petit (vectoriel) → **zoom net préservé** (niche design systems/illustration) ;
- **PNG** à échelle adaptative quand c'est lourd/raster → **borné**, tout design passe.

Transport **commun aux deux formats** : **blob binaire** + **URL signée** (le gain perf/fiabilité s'applique à SVG comme à PNG).

**Décisions actées :** adaptatif SVG≤seuil sinon PNG ; seuil SVG ~800 Ko ; PNG échelles `2→1→0,5` (seuil ~1,2 Mo, plancher 0,5) ; stockage blob ; URL signées (bucket privé) ; crops par-nœud en **CSS côté client** ; reconstruction lossy conservée en **dernier recours**.

**Hors scope (YAGNI / différé) :** upload direct plugin→Storage, **REST API Figma + OAuth** (north star « littéralement tous les designs », rendu serveur sans payload client), migration des anciens renders, refonte UX de la vue Nodes (séparée).

**Non touché :** la **détection du diff** (calculée sur les nombres du snapshot, pas l'image) et le **restore** (`dg_history`, pixel-perfect). Ce spec ne concerne que **l'aperçu visuel**.

## 2. Capture — plugin `main.ts`

Décider le format à la capture :
1. Exporter en **SVG** (`exportAsync({format:'SVG'})`). Si `svg_b64.length ≤ SVG_MAX` (~800 Ko) → **garder SVG** (`kind:'svg'`).
2. Sinon **exporter en PNG** à échelle adaptative et garder le PNG (`kind:'png'`).

Échelle PNG adaptative — logique pure testable :
```ts
// Part haut (×2), descend jusqu'à passer sous le seuil ; plancher ×0,5 (on garde même si ça dépasse).
export function pickScale(sizeAtScale: (s: number) => number, maxB64 = 1_200_000): number {
  for (const s of [2, 1, 0.5]) if (sizeAtScale(s) <= maxB64) return s;
  return 0.5;
}
```
`sizeAtScale` ré-exporte réellement (`exportAsync({format:'PNG', constraint:{type:'SCALE', value:s}})` → mesure le b64) — `exportAsync` est la seule source de taille fiable. Le rendu part au backend via le POST checkpoint existant : champ `render_b64` (ex-`render_svg_b64`) **+ `render_kind: 'svg' | 'png'`**. Plus de cap qui **jette** le rendu : on garde toujours un rendu borné.

## 3. Stockage — backend `versioning.service.ts`

Au lieu de `Buffer.from(JSON.stringify({svg_b64}))`, **décoder le b64 → octets** et uploader en **blob binaire**, extension + content-type selon `render_kind` :
```ts
const ext  = kind === 'png' ? 'png' : 'svg';
const ctype = kind === 'png' ? 'image/png' : 'image/svg+xml';
const renderPath = path.replace('.json', `_render.${ext}`);
await storage.from(BUCKET).upload(renderPath, Buffer.from(renderB64, 'base64'), { contentType: ctype, upsert: true });
```
Le cleanup orphelin (retry) vise `_render.png` **et** `_render.svg` (tolère l'absence).

## 4. Service — backend `branches.controller.ts`

- `resolveRenderUrl(storagePath, snapshot)` : renvoie **toujours `{ url, kind } | null`** (contrat uniforme). Ordre :
  1. `{path}_render.png` existe → `createSignedUrl` (TTL ~1 h) → `{url, kind:'png'}`.
  2. `{path}_render.svg` existe → URL signée → `{url, kind:'svg'}`.
  3. ancien `_render.json` (versions historiques) → data-URL depuis `svg_b64`/`png_b64` → `{url, kind}`.
  4. reconstruction (`toFullSvgB64`) → data-URL SVG reconstruit → `{url, kind:'svg'}` (dernier recours, lossy).
  5. sinon `null`.
- Payload diff : `render_url`/`render_kind` et `prev_render_url`/`prev_render_kind` (au lieu de `svg_b64`/`prev_svg_b64`), **+** les `bbox` (x,y,w,h relatifs à la frame, depuis le snapshot) des nœuds changés pour les crops. `toNodeSvgB64` (crop viewBox SVG serveur) est **supprimé**.
- Rendu différé (`?thumbs=1`) conservé : phase 1 = changelog + bbox ; phase 2 = URLs signées.

## 5. Affichage — UI `ui.tsx`

Le composant d'aperçu reçoit `{ url, kind }` :
- **`kind:'png'`** → `<img src={url}>`. Zoom = transform CSS (pixelise au-delà du natif, acceptable pour un aperçu).
- **`kind:'svg'`** → rendu **scalable net** : `<img src={url}>` dimensionné par **layout** (pas par transform) pour rester crisp, ou inline si nécessaire. Le **zoom sans perte** du vectoriel est préservé.
- **Split/Overlay** : deux aperçus superposés (Overlay = opacité / `mix-blend-mode:difference`).
- **Crops par-nœud (Nodes)** : conteneur `overflow:hidden` + l'aperçu **positionné/scalé** selon la `bbox` (CSS). Une seule image téléchargée par frame, tous les crops dérivés côté client. Uniforme SVG/PNG.
- **Skeleton** pendant le chargement de l'aperçu (évite le flash « pas de visuel »).

## 6. Composants & responsabilités

| Unité | Responsabilité |
|---|---|
| `plugin/src/main.ts` (+ helper pur `pickScale`) | décision SVG/PNG, export, envoi `render_b64`+`render_kind` |
| `backend/.../versioning.service.ts` | stockage blob selon kind (svg/png) + cleanup |
| `backend/.../branches.controller.ts` | `resolveRenderUrl` (signed URL + rétro-compat), payload `render_url`/`render_kind`/`bbox` |
| `backend/.../types/api.ts` + `openapi.ts` | champs `render_b64`,`render_kind`,`render_url`,`bbox` |
| `plugin/src/ui.tsx` | aperçu `<img>` (svg net / png) + crops CSS + skeleton |

## 7. Tests

- **Plugin** : `pickScale` (pur) — descend 2→1→0,5 selon le seuil, plancher 0,5.
- **Backend** : `versioning.service` upload binaire **selon kind** (`image/png` → `_render.png` ; `image/svg+xml` → `_render.svg` ; cleanup les deux) ; `resolveRenderUrl` (PNG > SVG > legacy `_render.json` data-URL > reconstruction data-URL > null) — stubs Storage.
- **Backend** : payload diff contient `render_url`+`render_kind`+`bbox`, plus de `svg_b64` ; rétro-compat n'explose pas.

## 8. Ordre d'implémentation (pour le plan)

1. Plugin : `pickScale` + décision SVG/PNG + export + champs `render_b64`/`render_kind`.
2. Backend : stockage blob selon kind (`versioning.service`) + types.
3. Backend : `resolveRenderUrl` + payload (`render_url`/`render_kind`/`bbox`) + rétro-compat.
4. UI : aperçu `<img>` (svg net / png) + crops CSS + skeleton.
