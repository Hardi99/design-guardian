# Spec — Tier 1 : ouverture du plugin quasi-instantanée

> Validée 2026-08-09. Attaque le vrai goulot ressenti : l'**ouverture** (affichage des assets) = 2 requêtes en série + zéro cache. Objectif : assets **instantanés** dès la 2ᵉ ouverture, 1 seule requête réseau, sans dépenser d'argent (le cold start reste un sujet infra séparé).

## 0. Contexte (chemin actuel)

```
Boot main.ts → send FILE_INFO(fileKey) → ui.tsx POST /api/projects/auto-init  (RT#1 : api_key + project)
            → api_key posé → AssetsScreen → GET /api/assets                    (RT#2 : liste assets)
            → affichage
```
Deux allers-retours **séquentiels**, aucun cache → lent à **chaque** ouverture (même backend chaud). `figma.clientStorage` est **main-thread only** (accès `figma.*`).

## 1. Objectifs / non-goals

**Objectifs :**
1. **Win A** — `/api/projects/auto-init` renvoie **aussi les assets** → 1 requête au lieu de 2.
2. **Win B** — cache `figma.clientStorage` (api_key + plan + assets) par fileKey → affichage **instantané** au boot (stale-while-revalidate), puis rafraîchissement.
3. **Compression HTTP** backend (`hono/compress`) → payloads diff/assets plus légers sur le fil.
4. **Cache image SVG** côté plugin → revenir sur une version = image instantanée (le cache T6 ne mémorise que le payload, pas l'image fetchée).

**Non-goals :** cold start / tier payant (infra, séparé) ; keepN/pixel-perfect ; réduction de taille des snapshots ; B6/B7.

## 2. Décisions actées

| # | Décision |
|---|---|
| A | `auto-init` renvoie `{ api_key, project, assets }`. Le plugin, au 1er chargement, **utilise ces assets directement** (plus de `GET /api/assets` séparé au boot ; le GET reste pour les rafraîchissements après création/suppression). |
| B | Cache vit dans **main.ts** (clientStorage = main-thread). Boot : main.ts lit le cache → envoie `CACHED_STATE {api_key, plan, assets}` à l'UI (rendu **immédiat**, marqué « stale ») ; l'UI lance quand même l'auto-init frais ; à la réponse, l'UI renvoie `PERSIST_STATE {api_key, plan, assets}` à main.ts qui écrit le cache. Clé de cache = `fileKey` (le cache d'un fichier ne fuit pas sur un autre). |
| Compress | Middleware `hono/compress` monté tôt dans `createApp()`. |
| Img cache | `Map<url, string>` module dans `ui.tsx` ; `FrameImage` sert le SVG du cache si présent, sinon fetch puis met en cache. |
| Région | **Hors code** : vérifier dans les dashboards que Railway et Supabase sont dans la **même région** (sinon chaque requête paie la traversée). Simple check, noté pour l'utilisateur. |

## 3. Détail

### 3.1 Win A — auto-init renvoie les assets (backend)
`backend/src/controllers/projects.controller.ts` (route `auto-init`) : après résolution/création du projet + `api_key`, charger la liste des assets du projet (même requête que `GET /api/assets`) et l'ajouter à la réponse : `{ api_key, project, assets }`. Réutiliser le service/req existant (pas de duplication). Mettre à jour le schéma OpenAPI si présent.

### 3.2 Win A — conso côté plugin (ui.tsx)
Sur la réponse auto-init, poser `api_key`, `plan`, ET hydrater directement la liste d'assets (nouvel état partagé / message) → l'AssetsScreen n'a plus besoin de son `GET /api/assets` initial. Le GET reste utilisé après création/suppression d'asset.

### 3.3 Win B — cache clientStorage (main.ts + ui.tsx + messages)
- **Types** (`types.ts`) : `MainToUI` += `{ type: 'CACHED_STATE'; apiKey: string | null; plan: string | null; assets: unknown[] | null }` ; `UIToMain` += `{ type: 'PERSIST_STATE'; apiKey: string; plan: string; assets: unknown[] }`.
- **main.ts boot** : après `FILE_INFO`, lire `figma.clientStorage.getAsync('dg_cache_' + fileKey)` → si présent, `send(CACHED_STATE ...)`. Handler `PERSIST_STATE` → `figma.clientStorage.setAsync('dg_cache_' + fileKey, {...})`.
- **ui.tsx** : à réception de `CACHED_STATE` avec assets → poser api_key/plan/assets et **afficher l'écran assets immédiatement** (données stale). Continuer l'auto-init frais en parallèle ; à sa réponse, mettre à jour l'UI et `send(PERSIST_STATE ...)`.
- **Cohérence** : si l'auto-init frais renvoie un api_key différent (rare), l'UI adopte le frais. Le cache est un accélérateur d'affichage, la vérité reste le serveur.

### 3.4 Compression HTTP (backend)
`backend/src/app.ts` : `import { compress } from 'hono/compress'` puis `app.use('*', compress())` avant les routes. Vérifier qu'aucun endpoint binaire (rendus servis via URL signée Supabase, pas via l'API) n'est cassé — les rendus ne transitent PAS par l'API, donc sûr.

### 3.5 Cache image SVG (ui.tsx)
`const svgCache = new Map<string, string>()` module. Dans `FrameImage` (branche svg) : si `svgCache.has(url)` → `setSvg(cache)` sans fetch ; sinon fetch, transformer, `svgCache.set(url, t)`. Vidage : optionnel (les URLs signées expirent ; borne simple si besoin). PNG inchangé (déjà `<img>` caché par le navigateur).

## 4. Tests

- **Backend** : test que `auto-init` renvoie `assets` (tableau) dans la réponse ; compression n'altère pas le JSON (les tests existants passent inchangés).
- **Plugin** : pas de test UI existant → vérif build + typecheck + recette manuelle (ouverture instantanée à la 2ᵉ ouverture, refresh correct, création/suppression d'asset OK).
- Baseline : **307 tests (185 back + 122 plugin)** — ne pas régresser.

## 5. Risques

- **Stale cache trompeur** : afficher des assets périmés (ex. supprimés ailleurs). Mitigé : refresh systématique au boot ; le stale n'est affiché que le temps du refresh.
- **api_key changé** : l'UI adopte toujours la valeur fraîche du serveur.
- **Compression** : ne pas doubler-compresser ou casser un content-type binaire → les binaires passent par URL signée, hors API. OK.
