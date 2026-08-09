# Tier 1 — Ouverture du plugin quasi-instantanée — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre l'ouverture du plugin quasi-instantanée : 1 requête réseau au lieu de 2 (auto-init renvoie les assets), affichage immédiat via cache clientStorage (stale-while-revalidate), compression HTTP, et cache de l'image SVG.

**Architecture:** Backend — `auto-init` renvoie aussi les assets + middleware `hono/compress`. Plugin — le cache (api_key/plan/assets par fileKey) vit dans `main.ts` (clientStorage = main-thread), échangé avec l'UI par messages `CACHED_STATE`/`PERSIST_STATE` ; l'UI affiche le cache immédiatement puis rafraîchit via auto-init. Cache module des SVG fetchés dans `ui.tsx`.

**Tech Stack:** HonoJS + Vitest (backend), Preact/TypeScript + `figma.clientStorage` (plugin).

## Global Constraints

- Baseline **307 tests (185 backend + 122 plugin)** — ne pas régresser ; chaque tâche laisse typecheck + tests verts.
- TypeScript strict, **zéro `any`**.
- `figma.*` UNIQUEMENT dans `plugin/src/main.ts` ; HTTP UNIQUEMENT dans `plugin/src/ui.tsx`.
- Le cache est un **accélérateur d'affichage** : la vérité reste le serveur (l'UI adopte toujours la réponse fraîche de l'auto-init).
- Clé de cache = **`fileKey`** (isolation entre fichiers).
- Commits : message court + trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Ne jamais stager `.devcontainer/` ni `presentation/`.
- **Hors code** : vérifier que Railway et Supabase sont dans la même région (dashboards) — noté, pas une tâche.

---

## File Structure

- **Modify** `backend/src/app.ts` — middleware `compress`.
- **Modify** `backend/src/controllers/projects.controller.ts` — `auto-init` renvoie `assets`.
- **Modify/Create** `backend/src/tests/projects.controller.test.ts` — test auto-init renvoie assets.
- **Modify** `plugin/src/types.ts` — messages `CACHED_STATE` / `PERSIST_STATE`.
- **Modify** `plugin/src/store.ts` — état `assets` partagé (pour hydratation depuis auto-init/cache).
- **Modify** `plugin/src/main.ts` — lecture/écriture cache clientStorage.
- **Modify** `plugin/src/ui.tsx` — conso auto-init assets, cache stale-while-revalidate, cache SVG.

---

## Task 1: Compression HTTP (backend)

**Files:**
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Ajouter le middleware**

Dans `backend/src/app.ts`, ajouter l'import `import { compress } from 'hono/compress';` (près des autres `hono/*`), et monter le middleware dans `createApp()` **avant les routes**, juste après le `logger` :
```ts
app.use('*', compress());
```

- [ ] **Step 2: Vérifier**

Run (depuis `backend/`): `npm run typecheck && npm run test:run`
Expected: typecheck clean, **185 tests** verts (la compression ne change pas le JSON ; les rendus binaires passent par URL signée Supabase, hors API → non affectés).

- [ ] **Step 3: Commit**

```bash
git add backend/src/app.ts
git commit -m "perf(api): compression HTTP (hono/compress)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `auto-init` renvoie les assets (backend)

**Files:**
- Modify: `backend/src/controllers/projects.controller.ts` (handler `POST /auto-init`, ~23-53)
- Test: `backend/src/tests/projects.controller.test.ts`

**Interfaces:**
- Produces: réponse auto-init `{ api_key: string; project: { id; name; plan }; assets: Asset[] }`.

- [ ] **Step 1: Charger les assets et les inclure dans les 2 chemins de réponse**

Dans le handler `auto-init`, après avoir résolu le projet (chemin `existing` **et** chemin `created`), récupérer ses assets avec la même requête que `GET /api/assets` et les ajouter à la réponse. Helper local pour éviter la duplication :
```ts
async function loadAssets(supabase: SupabaseClient, projectId: string) {
  const { data } = await supabase.from('assets').select('*').eq('project_id', projectId);
  return data ?? [];
}
```
Chemin existant : `return c.json({ api_key: existing.api_key, project: { id: existing.id, name: existing.name, plan: existing.plan }, assets: await loadAssets(supabase, existing.id) });`
Chemin créé : idem avec `created`.
(Le type `SupabaseClient` est déjà importé ailleurs dans le backend ; sinon `import type { SupabaseClient } from '@supabase/supabase-js'`.)

- [ ] **Step 2: Écrire le test** (suivre le style des mocks existants de `branches.controller.test.ts` : `vi.mock('../config/supabase.js', ...)` + `createApp()` + `app.request`)

Cas : `POST /api/projects/auto-init` avec un projet existant qui a 2 assets mockés → réponse 200 contient `assets` = tableau de 2. Squelette (adapter aux helpers de mock du repo) :
```ts
// mock supabase : projects.select -> projet existant ; assets.select -> 2 lignes
// const res = await app.request('/api/projects/auto-init', { method:'POST', body: JSON.stringify({ figma_file_key:'f1', figma_file_name:'F' }), headers:{'content-type':'application/json'} });
// expect(res.status).toBe(200); const body = await res.json();
// expect(Array.isArray(body.assets)).toBe(true); expect(body.assets).toHaveLength(2);
```
Vérifier le champ exact attendu par `autoInitSchema` (ouvre `backend/src/types/api.ts` pour les noms : `figma_file_key`/`figma_file_name`).

- [ ] **Step 3: Vérifier**

Run (depuis `backend/`): `npm run typecheck && npm run test:run`
Expected: nouveau test vert, 186 tests, anciens verts.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/projects.controller.ts backend/src/tests/projects.controller.test.ts
git commit -m "perf(api): auto-init renvoie aussi les assets (1 requête au lieu de 2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Le plugin consomme les assets de l'auto-init (store + ui.tsx)

**Files:**
- Modify: `plugin/src/store.ts` (ajouter `assets`/`setAssets` si absent de l'état partagé)
- Modify: `plugin/src/ui.tsx` (handler auto-init + `AssetsScreen`)

**Interfaces:**
- Consumes: réponse auto-init `{ api_key, project, assets }` (Task 2).
- Produces: état store `assets: Asset[]`, `setAssets(a: Asset[])`.

- [ ] **Step 1: État assets partagé dans le store**

Dans `plugin/src/store.ts`, ajouter au state : `assets: Asset[]` (défaut `[]`) + action `setAssets: (a: Asset[]) => void`. (Réutiliser le type `Asset` déjà exporté.)

- [ ] **Step 2: Hydrater depuis l'auto-init**

Dans `ui.tsx`, le handler `FILE_INFO` (~117-124) qui fait le `fetch auto-init` : typer la réponse `{ api_key: string; project: { id: string; name: string; plan: string }; assets: Asset[] }`, et après `setApiKey(data.api_key)` (+ plan), appeler `setAssets(data.assets)` puis afficher l'écran assets.

- [ ] **Step 3: `AssetsScreen` lit le store, ne GET plus au montage**

Dans `AssetsScreen` (~218+), remplacer l'état local `useState<Asset[]>` + le `useEffect(GET /api/assets)` initial par la lecture de `assets`/`setAssets` du store. **Garder** le `GET /api/assets` après création/suppression (rafraîchissement), pas au montage.

- [ ] **Step 4: Vérifier**

Run (depuis `plugin/`): `npm run typecheck && npm test && npm run build`
Expected: typecheck clean, **122 tests** verts, build OK.

- [ ] **Step 5: Commit**

```bash
git add plugin/src/store.ts plugin/src/ui.tsx
git commit -m "perf(plugin): hydrate les assets depuis l'auto-init (plus de GET au montage)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Cache clientStorage stale-while-revalidate (types + main.ts + ui.tsx)

**Files:**
- Modify: `plugin/src/types.ts` (unions `MainToUI` ~73, `UIToMain` ~90)
- Modify: `plugin/src/main.ts` (boot + handler)
- Modify: `plugin/src/ui.tsx` (réception cache + persistance)

**Interfaces:**
- Consumes: `setApiKey`/`setAssets`/plan (Task 3).
- Produces: messages `CACHED_STATE` (main→UI), `PERSIST_STATE` (UI→main).

- [ ] **Step 1: Types de message**

`plugin/src/types.ts` :
- `MainToUI` += `| { type: 'CACHED_STATE'; apiKey: string | null; plan: string | null; assets: Asset[] | null }`
- `UIToMain` += `| { type: 'PERSIST_STATE'; fileKey: string; apiKey: string; plan: string; assets: Asset[] }`
(importer/réutiliser le type `Asset`).

- [ ] **Step 2: main.ts — lire le cache au boot, écrire sur demande**

Dans le bloc boot (après le `send(FILE_INFO ...)`, ~70) :
```ts
const cached = await figma.clientStorage.getAsync('dg_cache_' + fileKey) as
  { apiKey: string; plan: string; assets: Asset[] } | undefined;
if (cached) send({ type: 'CACHED_STATE', apiKey: cached.apiKey, plan: cached.plan, assets: cached.assets });
```
Dans le `switch` `onmessage`, ajouter :
```ts
case 'PERSIST_STATE':
  await figma.clientStorage.setAsync('dg_cache_' + msg.fileKey, { apiKey: msg.apiKey, plan: msg.plan, assets: msg.assets });
  break;
```

- [ ] **Step 3: ui.tsx — afficher le cache immédiatement, persister après refresh**

- À réception de `CACHED_STATE` avec `assets` non nul : `setApiKey`, poser le plan, `setAssets(assets)`, et **afficher l'écran assets** (données stale) sans attendre le réseau.
- Après l'auto-init frais (Task 3), en plus d'hydrater l'UI : `send({ type: 'PERSIST_STATE', fileKey, apiKey: data.api_key, plan: data.project.plan, assets: data.assets })`. (Le `fileKey` est déjà connu de l'UI via `FILE_INFO`.)
- Si l'auto-init frais renvoie un `api_key` différent du cache → adopter le frais (déjà le cas puisqu'on écrase l'état).

- [ ] **Step 4: Vérifier**

Run (depuis `plugin/`): `npm run typecheck && npm test && npm run build`
Expected: verts. Manuel : 2ᵉ ouverture du plugin → assets **affichés immédiatement**, puis rafraîchis ; création/suppression d'asset toujours OK ; ouvrir un autre fichier Figma → pas de fuite d'assets (clé par fileKey).

- [ ] **Step 5: Commit**

```bash
git add plugin/src/types.ts plugin/src/main.ts plugin/src/ui.tsx
git commit -m "perf(plugin): cache clientStorage des assets (affichage instantané au boot)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Cache de l'image SVG (ui.tsx)

**Files:**
- Modify: `plugin/src/ui.tsx` (`FrameImage`)

- [ ] **Step 1: Map module + service depuis le cache**

Au niveau module (près de `diffCache`) : `const svgCache = new Map<string, string>();`
Dans `FrameImage`, branche `svg` : si `svgCache.has(url)` → `setSvg(svgCache.get(url)!)` sans fetch ; sinon, après transformation du texte, `svgCache.set(url, transformed)` avant `setSvg`. Le PNG reste inchangé (mis en cache par le navigateur via `<img>`).
```ts
useEffect(() => {
  if (kind !== 'svg') { setSvg(null); return; }
  const hit = svgCache.get(url);
  if (hit !== undefined) { setSvg(hit); return; }
  let alive = true; setSvg(null);
  fetch(url).then(r => r.text()).then(t => {
    const out = t.replace(/(<svg[^>]*)\s+(?:width|height)="[^"]*"/g, '$1')
                 .replace('<svg', '<svg style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid meet"');
    svgCache.set(url, out);
    if (alive) setSvg(out);
  }).catch(() => { if (alive) setSvg(''); });
  return () => { alive = false; };
}, [url, kind]);
```
(Conserver l'appel `onReady?.()` déjà présent — l'effet `useEffect(..., [svg, kind])` qui déclenche `onReady` reste valable, y compris sur hit cache puisque `svg` change.)

- [ ] **Step 2: Vérifier**

Run (depuis `plugin/`): `npm run typecheck && npm test && npm run build`
Expected: verts. Manuel : revenir sur une version déjà vue → image affichée **sans re-fetch** (instantané).

- [ ] **Step 3: Commit**

```bash
git add plugin/src/ui.tsx
git commit -m "perf(plugin): cache des rendus SVG fetchés (retour version instantané)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Vérification globale

- [ ] **Step 1: Suites complètes**

```bash
cd backend && npm run typecheck && npm run test:run
cd ../plugin && npm run typecheck && npm test && npm run build
```
Expected: backend ≥ 186 (185 + 1 auto-init), plugin 122, build OK. Aucune régression.

- [ ] **Step 2: Recette manuelle**

1ʳᵉ ouverture (cache vide) : assets via 1 requête (auto-init). 2ᵉ ouverture : assets **instantanés** (cache) puis refresh. Création/suppression d'asset OK. Diff : revenir sur une version = image instantanée. Autre fichier Figma = pas de fuite d'assets.

- [ ] **Step 3: Note hors-code**

Rappeler à l'utilisateur : vérifier la **co-localisation région Railway ↔ Supabase** dans les dashboards (une différence de région ajoute de la latence à chaque requête).

---

## Self-Review (auteur du plan)

- **Couverture spec** : Win A → T2 (backend) + T3 (conso) ; Win B → T4 (+ store T3) ; compression → T1 ; cache SVG → T5 ; région → note (T6). ✅
- **Placeholders** : le squelette de test T2-Step2 est marqué « adapter aux mocks du repo » (le fichier projects.controller.test peut ne pas exister → suivre le pattern de branches.controller.test) — seul point à contextualiser. Reste = code complet.
- **Cohérence types** : `Asset` réutilisé (store T3, messages T4) ; réponse auto-init `{api_key, project, assets}` définie T2, consommée T3, persistée T4 ; `CACHED_STATE`/`PERSIST_STATE` définis T4-Step1, utilisés T4-Step2/3. Cohérent.
- **Threads** : clientStorage seulement dans main.ts (T4) ; fetch seulement dans ui.tsx. ✅
