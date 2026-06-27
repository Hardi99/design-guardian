# Pipeline d'aperçu : PNG borné + blob binaire — Design

> Spec validée 2026-06-27. Objectif : **gérer le maximum de designs (complexes, avec images), vite et solide**, en remplaçant l'aperçu SVG-base64-dans-JSON par un **PNG borné** stocké en **blob binaire** et servi en **URL signée**.

## 1. Objectif & périmètre

Le diff-viewer (Split/Overlay/crops) a besoin d'un **visuel** des frames. Aujourd'hui :
- capture en SVG (`exportAsync`) → gonfle avec le contenu (images embarquées) → un SVG > 2 Mo est **jeté** (cap `main.ts`) → fallback sur une **reconstruction lossy** (pas d'images, polices fallback) ;
- stockage en `JSON.stringify({svg_b64})` (`_render.json`) → +33 % base64, pas de cache navigateur ;
- service du b64 **inline dans le JSON** du diff → gros payloads, lents.

On corrige les **trois** d'un coup :
- **Capture** : PNG à **échelle adaptative** (borné par les pixels, pas le contenu) → tout design passe.
- **Stockage** : **blob binaire** `image/png` (plus de JSON, plus d'inflation).
- **Service** : **URL signée** → le webview charge en `<img>` (natif, caché, servi par le CDN Supabase).

**Décisions actées :** PNG partout (pipeline uniforme), échelle adaptative `2→1→0,5` avec seuil de départ ~1,2 Mo, crops par-nœud en **CSS côté client**, URL signées (bucket privé).

**Hors scope (YAGNI / différé) :** upload direct plugin→Storage (URL signée d'upload), **REST API Figma + OAuth** (north star « littéralement tous les designs », rendu côté serveur sans payload client), migration des anciens renders, refonte UX de la vue Nodes (séparée).

**Non touché :** la **détection du diff** (calculée sur les nombres du snapshot, pas l'image) et le **restore** (`dg_history`, pixel-perfect). Ce spec ne concerne que **l'aperçu visuel**.

## 2. Capture — plugin `main.ts`

Remplacer l'export SVG par un export **PNG adaptatif**. Extraire la logique de choix d'échelle en fonction pure testable :

```ts
// Choisit l'échelle : on part haut (2) et on descend jusqu'à passer sous le seuil b64.
// Retourne l'échelle retenue ; null si même 0,5 dépasse (on stocke quand même la plus petite).
export function pickScale(sizeAtScale: (s: number) => number, maxB64 = 1_200_000): number {
  for (const s of [2, 1, 0.5]) if (sizeAtScale(s) <= maxB64) return s;
  return 0.5; // plancher : on garde le ×0,5 même s'il dépasse (toujours mieux que rien)
}
```

Dans la capture : exporter à l'échelle retenue
```ts
const bytes = await (node as ExportMixin).exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
```
En pratique on exporte ×2, mesure ; si trop gros, ré-exporte ×1 puis ×0,5 (export réel, pas estimation — `exportAsync` est la seule source de taille fiable). Le PNG b64 est envoyé via le POST checkpoint existant (champ `render_b64`, ex-`render_svg_b64`). Plus de cap qui **jette** le rendu : on garde toujours le PNG borné.

## 3. Stockage — backend `versioning.service.ts`

Au lieu de `Buffer.from(JSON.stringify({ svg_b64 }))`, **décoder le b64 → octets** et uploader en blob binaire :
```ts
const renderPath = path.replace('.json', '_render.png');
await storage.from(BUCKET).upload(renderPath, Buffer.from(input.renderB64, 'base64'), { contentType: 'image/png', upsert: true });
```
Le cleanup orphelin (retry) vise `_render.png` (et tolère l'absence de l'ancien `_render.json`).

## 4. Service — backend `branches.controller.ts`

- `resolveRenderUrl(storagePath, snapshot)` : renvoie **toujours une URL-ou-null** (contrat uniforme pour l'UI). Ordre :
  1. `{path}_render.png` existe → `createSignedUrl` (TTL court, ex. 1 h) → URL signée.
  2. sinon `_render.json` existe (anciennes versions) → data-URL depuis `svg_b64`/`png_b64`.
  3. sinon reconstruction (`toFullSvgB64`) → data-URL du SVG reconstruit (dernier recours, lossy).
  4. sinon `null`.
  → L'UI consomme **toujours** `<img src>` (URL signée, ou data-URL), sans cas spécial b64.
- Le payload diff renvoie `render_url` / `prev_render_url` (string|null) **au lieu** de `svg_b64`/`prev_svg_b64`, **plus** les `bbox` (x,y,w,h relatifs à la frame, depuis le snapshot) des nœuds changés pour les crops. `toNodeSvgB64` (crop viewBox SVG) est **supprimé**.
- Le rendu différé (`?thumbs=1`) reste : phase 1 = changelog + bbox, phase 2 = URLs signées.

## 5. Affichage — UI `ui.tsx`

- **Split/Overlay** : `<img src={render_url}>` au lieu du `dangerouslySetInnerHTML`. Overlay = deux `<img>` superposés avec opacité (et mode Différence via `mix-blend-mode:difference`). Zoom via transform CSS.
- **Crops par-nœud (Nodes)** : conteneur `overflow:hidden` de taille fixe + `<img src={render_url}>` **positionné/scalé** selon la `bbox` (translate + scale pour cadrer le nœud). Une seule image téléchargée par frame, tous les crops dérivés en CSS.
- État de chargement : pendant que l'`<img>` charge, skeleton (évite le flash « pas de visuel »).

## 6. Composants & responsabilités

| Unité | Responsabilité |
|---|---|
| `plugin/src/main.ts` (+ helper pur `pickScale`) | export PNG adaptatif, envoi `render_b64` |
| `backend/.../versioning.service.ts` | stockage blob `image/png` (+ cleanup) |
| `backend/.../branches.controller.ts` | `resolveRenderUrl` (signed URL + rétro-compat), payload `render_url`+`bbox` |
| `backend/.../types/api.ts` + `openapi.ts` | champs renommés (`render_b64`, `render_url`, `bbox`) |
| `plugin/src/ui.tsx` | `<img>` Split/Overlay + crops CSS + skeleton |

## 7. Tests

- **Plugin** : `pickScale` (pur) — descend 2→1→0,5 selon le seuil, plancher 0,5.
- **Backend** : `versioning.service` upload binaire (`contentType:'image/png'`, bon chemin, cleanup `_render.png`) ; `resolveRenderUrl` (mint URL signée quand le blob existe ; rétro-compat data-URL quand seul `_render.json` existe ; null sinon) — stubs Storage.
- **Backend** : payload diff contient `render_url` + `bbox`, plus de `svg_b64` ; rétro-compat n'explose pas.

## 8. Ordre d'implémentation (pour le plan)

1. Plugin : `pickScale` + export PNG adaptatif + renommage champ.
2. Backend : stockage blob (`versioning.service`) + types.
3. Backend : `resolveRenderUrl` + payload (`render_url`/`bbox`) + rétro-compat.
4. UI : `<img>` Split/Overlay + crops CSS + skeleton.
