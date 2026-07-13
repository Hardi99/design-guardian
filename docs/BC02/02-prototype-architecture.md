# C2.2.1 — Prototype + Architecture maintenable — Design Guardian

> Compétence RNCP 39583 C2.2.1 — « Justifier et implémenter une architecture définie ; documenter et argumenter les choix technologiques et architecturaux ». Preuves : repository `master`, code réel cité `fichier:ligne`, plugin Preact approuvé Figma Community (mai 2026).

---

## 1. Architecture maintenable

### 1.1 Monolithe modulaire Hono — 6 domaines

Le backend est une application **HonoJS déployée en un seul processus** sur Railway via `@hono/node-server` (`backend/src/index.ts:4,23` — `serve({ fetch: app.fetch, port })`), organisée en domaines montés sur des sous-routes (`backend/src/app.ts:89-96`) :

| Domaine | Route montée | Controller / Service réels |
|---|---|---|
| Auth | `/api/auth` | `auth.controller.ts` (vérifie `X-API-Key`) · `auth.middleware.ts` (JWT Supabase pour la webapp) |
| Projets & Assets | `/api/projects`, `/api/assets` | `projects.controller.ts`, `assets.controller.ts` |
| Checkpoints & Diff | `/api/checkpoints` | `checkpoints.controller.ts` + `diff.service.ts` (`export class DiffService`) |
| Branches & versions | `/api/branches` | `branches.controller.ts` + `versioning.service.ts`, `tree.service.ts`, `significance.service.ts`, `change-format.service.ts`, `ownership.service.ts` |
| Notifications | `/api/notifications` | `notifications.controller.ts` + `notification.service.ts` (Resend) |
| IA & Paiements | (interne aux controllers ci-dessus) + `/api/payments` | `checkpoint-ai.service.ts`, `openai.service.ts`, `payments.controller.ts`, `stripe.service.ts` |
| Liaison compte (device-link) | `/api/link` | `link.controller.ts` + `link.service.ts` |
| Métriques | `/metrics` (hors `/api`) | `metrics.service.ts` (Prometheus `prom-client`) |

Un seul déploiement Railway ; les domaines sont des modules `Hono()` indépendants montés par `app.route(...)`, prêts à être extraits si le besoin apparaît — mais **pas** 6 microservices déployés séparément (arbitrage figé).

### 1.2 Deux paires Service/Controller réelles

**`diff.service.ts` ↔ `checkpoints.controller.ts`**
`DiffService.compareSnapshots(v1, v2)` (`backend/src/services/diff.service.ts:13`) aplatit chaque arbre de nœuds via `flatten()` avec un matcher en couches — `dg_id` stable si présent des deux côtés, sinon `id` Figma si même branche, sinon chemin d'arbre — puis compare position/dimensions/opacité/corner radius/fills/strokes/texte/effets avec une tolérance `EPSILON = 0.01` px (ligne 11), et renvoie un `DeltaJSON` (`modified/added/removed/totalChanges/metadata`). C'est une classe pure, sans accès réseau, testée par `backend/src/tests/diff.service.test.ts`. Le controller `checkpoints.controller.ts` (route `POST /` montée sur `/api/checkpoints`) reçoit le snapshot, vérifie l'appartenance de l'asset au projet, applique la limite du plan Free (10 checkpoints), crée la version via `createVersionAtomic()` (qui appelle `diffService.compareSnapshots()` dans son callback `computeMeta`), répond immédiatement, puis déclenche `generateAndStoreSummary()` en fire-and-forget (`checkpoints.controller.ts:85-90`).

**`versioning.service.ts` ↔ `branches.controller.ts`**
`versioning.service.ts` porte la logique de stockage : `snapshotPath()`, `uploadSnapshot()`/`downloadSnapshot()` (Supabase Storage, bucket `snapshots`), et surtout `createVersionAtomic()` (`backend/src/services/versioning.service.ts:58`) — boucle de tentatives (`MAX_ATTEMPTS = 5`) qui réclame le prochain `version_number` libre par asset+branche, uploade le snapshot en `upsert:false` (le conflit d'écriture sert de verrou optimiste), puis insère la ligne `versions`, en nettoyant les blobs orphelins en cas d'échec. Le controller `branches.controller.ts` expose `GET /tree` (liste des versions + branches d'un asset), `GET /versions/:id` (version + rendus signés + `node_diffs` calculés via `significance.service.ts`/`change-format.service.ts`/`tree.service.ts`), `POST /versions/:id/restore`, `GET /versions/:id/snapshot`, `PUT /versions/:id/status` (cycle Draft → Review → Approved). La table `versions` porte une colonne `parent_id` (`versioning.service.ts:101` : `parent_id: prevTyped?.id ?? null`) ; le regroupement parent→enfants exploité côté serveur (détection de « moves dérivés ») est fait par un parcours d'arbre en mémoire (`tree.service.ts` : `buildTreeMaps()`), pas par une CTE SQL récursive.

### 1.3 Double-thread Figma — API Figma séparée du HTTP

Le plugin Figma impose une frontière stricte entre deux runtimes qui ne partagent que `postMessage` :

- **`plugin/src/main.ts`** (sandbox Figma) : seul endroit où l'API `figma.*` est utilisée — extraction du snapshot de nœuds, `figma.currentUser`, création/switch de page de branche `dg/<nom>` (`handleCreateBranch`, `main.ts:715-738`), clonage d'historique via `node.clone()` sur la page `dg/_history` (`main.ts:425-469`), lecture/écriture de `figma.clientStorage` (`dg_file_id`, `dg_link_token` — `main.ts:39,50,59,82`).
- **`plugin/src/ui.tsx`** (webview Preact) : aucune API Figma ; tous les appels réseau passent par le helper `api()` (`ui.tsx:25-39`) qui pose l'en-tête `X-API-Key` (et `X-Link-Token` si un compte est lié) sur `https://design-guardian.up.railway.app`.

Communication par messages typés `figma.ui.postMessage` / `window.addEventListener('message', ...)` — côté UI le type `MainToUI` (ex. `FILE_INFO`, `AUTHOR_INFO`, `SNAPSHOT_READY`, `BRANCH_CREATED`, `RESTORE_COMPLETE`, `LINK_TOKEN`) est géré par un seul handler central dans `App()` (`ui.tsx:112-150`).

---

## 2. Prototype fonctionnel

### 2.1 Plugin Preact — approuvé Figma Community (mai 2026)

Stack build réelle (`plugin/package.json`) : **Preact 10** + **Zustand 5** (`zustand/vanilla`), bundlé par **Vite** (`vite build` + une config séparée `vite.main.config.ts` pour le thread `main.ts`, plugin `vite-plugin-singlefile` pour produire le HTML autonome requis par Figma), Tailwind v4, tests **Vitest**. Le manifest (`plugin/manifest.json`) déclare `documentAccess: dynamic-page`, la seule permission `currentuser`, et une liste blanche stricte de domaines réseau (`design-guardian.up.railway.app` + le projet Supabase) — **jamais** la permission `exports` (piège connu qui fait planter le plugin).

### 2.2 Fonctionnalités réelles

| Fonctionnalité | Où dans le code |
|---|---|
| Capture checkpoint | `main.ts` (extraction snapshot + export SVG/PNG) → `POST /api/checkpoints` (`checkpoints.controller.ts:19`) |
| Historique (« timeline ») | Écran `HomeScreen` (`ui.tsx:309`), alimenté par `GET /api/branches/tree` |
| Diff viewer | Écran `DiffScreen` (`ui.tsx:661`) : canvas surligné + panneau de détail |
| Restore | Bouton « ↩ Checkpoint » (nouveau checkpoint depuis une version passée, `POST /versions/:id/restore`) et bouton « ↩ Restore » (application au canvas, message `RESTORE_TO_FIGMA` vers `main.ts`) |
| Branches | Pages Figma `dg/<nom>`, chips de branche dans `HomeScreen` |
| Gold status | Cycle Draft → Review → Approved dans l'en-tête de `DiffScreen` (`useCycleStatus`, `ui.tsx:614`) |
| AI Patch Note | `generateAndStoreSummary()` (`checkpoint-ai.service.ts:25`) → `OpenAIService.generatePatchNote()`, écrit en base, récupéré par polling (`pollPatchNote`, `ui.tsx:492`) avec filet `POST /:id/regenerate` |

Le typage `Screen = 'loading' | 'assets' | 'home' | 'checkpoint' | 'diff'` (`plugin/src/store.ts:15`) montre qu'il n'y a **pas de routing URL** : c'est une machine à écrans pilotée par le store Zustand, comme attendu d'un plugin Figma (webview sans adresse). Détail d'usage complet : `docs/MODE-EMPLOI-PLUGIN.md`.

### 2.3 Preuve d'itération réelle

**Refonte Diff Viewer — frame-héros.** Avant : deux listes parallèles (cartes de nœuds + liste de propriétés), sans contexte spatial. Après : un canvas unique (`HighlightCanvas`, `ui.tsx:866`) qui superpose des rectangles cliquables (`buildHighlights()`, `plugin/src/diffHighlights.ts:6` — filtre les nœuds « mineurs » sauf si `showDerived`, choisit la bbox avant/après selon `beforeMode`, dérive une teinte `modified/added/removed/derived`) sur le rendu de la frame ; un clic ouvre `NodeDetail` (`ui.tsx:896`, crop avant/après + changements lisibles) ; `DiffChips` (`ui.tsx:973`) affiche les compteurs et le toggle Avant/Après, plus un badge « approximatif » quand le rendu vient d'une reconstruction SVG plutôt que d'un blob exporté. Preuve détaillée : `docs/superpowers/specs/2026-06-28-diff-viewer-frame-hero-design.md`. Test de la fonction pure : `plugin/src/diffHighlights.test.ts`.

**Restore lossless par clone.** Avant : reconstruction manuelle des propriétés au restore (risque de perte des styles/variables/auto-layout). Après : au moment du checkpoint, `main.ts` clone le nœud capturé sur une page dédiée `dg/_history` (fonctions `getOrCreateHistoryPage`, `readHistoryFrames`, `main.ts:425-469`) ; au restore, le plugin retrouve ce clone par version puis l'utilise tel quel — préservation garantie par le moteur Figma plutôt que par une réapplication champ-par-champ. Deux fonctions pures testables sans Figma portent cette logique : `pickHistoryClone(frames, versionId)` (retrouve le clone d'une version) et `framesToPrune(frames, assetId, keepN)` (élague les clones au-delà des `keepN` plus récents par asset) — `plugin/src/restoreClone.ts:11,19`, testées par `plugin/src/restoreClone.test.ts`. Preuve détaillée : `docs/superpowers/specs/2026-06-20-restore-clone-design.md`.

---

## 3. Framework & paradigmes

### 3.1 Preact + Zustand

`plugin/src/store.ts` définit un store Zustand créé avec `createStore<AppState>()` (API `zustand/vanilla`, pas le hook React classique) : état plat (`screen`, `apiKey`, `plan`, `author`, `asset`, `branch`, `snapshot`, `diffVersion`, `siblings`) + actions setter (`setScreen`, `setAsset`, ...). `resetStore()` (ligne 88) réinitialise l'état entre chaque test — utilisé par `plugin/src/store.test.ts`. L'accès depuis les composants passe par le hook `useAppStore` (`plugin/src/useAppStore.ts`).

### 3.2 `useReducer` — cycle de vie du Diff Viewer

`plugin/src/diffReducer.ts` gère le **cycle réseau/asynchrone** de l'écran diff (pas les préférences d'affichage, qui restent en `useState` local dans `DiffScreen` — `beforeMode`, `showMinor`, `selectedId`, `ui.tsx:686-688`). Actions réelles (`diffReducer.ts:61-74`) : `LOAD_SUCCESS`/`LOAD_ERROR` (chargement initial léger), `HEAVY_LOADED`/`HEAVY_DONE` (fusion des vignettes chargées en différé), `STATUS_START/SUCCESS/ERROR` (cycle Gold), `RESTORE_START/ERROR`, `APPLY_START/COMPLETE/ERROR` (restauration sur le canvas), `CLEAR_MSG`. Le reducer est une fonction pure testée par `plugin/src/diffReducer.test.ts`.

### 3.3 Fonctions pures testées — trois exemples réels

- `buildHighlights(nodeDiffs, beforeMode, showDerived)` — `plugin/src/diffHighlights.ts:6` — dérive la liste de rectangles à afficher à partir des `node_diffs` renvoyés par l'API. Testée par `plugin/src/diffHighlights.test.ts`.
- `pickHistoryClone` / `framesToPrune` — `plugin/src/restoreClone.ts:11,19` — sélection/élagage des clones d'historique. Testées par `plugin/src/restoreClone.test.ts`.
- `DiffService.compareSnapshots` — `backend/src/services/diff.service.ts:13` — cœur du diff géométrique (voir §1.2). Testée par `backend/src/tests/diff.service.test.ts`.

D'autres fonctions pures suivent le même pattern : `formatNodeChanges` (`change-format.service.ts`, rend les deltas lisibles pour un designer — testé par `backend/src/tests/change-format.service.test.ts`), `buildTreeMaps`/`derivedMoveIds`/`rankDelta` (`tree.service.ts`, `significance.service.ts` — testés), `isNodeMismatch` (`node-match.ts`, testé par `node-match.test.ts` dans le même dossier).

---

## 4. Composants d'interface — écrans réels

Le plugin est un **webview sans routing** : les écrans sont des composants Preact sélectionnés par un `switch` sur `screen` dans `App()` (`plugin/src/ui.tsx:178-183`).

| Écran (`Screen`) | Composant | Rôle |
|---|---|---|
| `loading` | `LoadingScreen` | connexion au projet (auto-init via `figma_file_key`), écran d'erreur + retry |
| `assets` | `AssetsScreen` | liste/création/suppression des assets suivis dans ce fichier Figma |
| `home` | `HomeScreen` | historique de la branche courante (`VersionRow`), chips de branches + création, plan/upgrade, bouton « Capturer un checkpoint » |
| `checkpoint` | `CheckpointScreen` | formulaire de sauvegarde (nom de branche), affichage du Patch Note (polling + bouton régénérer) |
| `diff` | `DiffScreen` | canvas `HighlightCanvas` + `NodeDetail` + `DiffChips`, navigation clavier ◀/▶ entre versions sœurs, cycle de statut, boutons Restore |

En plus de ces cinq écrans, un panneau **Upgrade** (comparatif Free/Pro/Team, `ui.tsx:152-176`) et un composant **`AccountLink`** (`ui.tsx:45-96`, flux de liaison de compte par code à usage unique via `/api/link/start`+`/status`) s'affichent en overlay sans être des `Screen` à part entière. Détail d'usage utilisateur : `docs/MODE-EMPLOI-PLUGIN.md`.

---

## 5. Sécurité du prototype

### 5.1 Deux mécanismes d'auth distincts, pour deux surfaces distinctes

- **Plugin → backend** : `X-API-Key` (clé UUID par **projet**, pas par utilisateur). `pluginMiddleware` (`backend/src/middleware/plugin.middleware.ts:10`) résout la clé en `projectId` via `projects.api_key`, pose `plan` (Free par défaut), et — si l'en-tête `X-Link-Token` est présent — surcharge le plan par celui du compte lié. La clé Figma (`X-API-Key`) est générée serveur au premier lancement du plugin (`POST /api/projects/auto-init`) et persistée dans le store en mémoire (`useAppStore`), pas dans `figma.clientStorage` — ce sont `dg_file_id` et `dg_link_token` (le jeton de liaison de compte, pas un JWT) qui y sont stockés côté `main.ts`.
- **Webapp → backend** : `Authorization: Bearer <JWT>` (Supabase Auth). `authMiddleware` (`backend/src/middleware/auth.middleware.ts:16`) valide le token via `supabase.auth.getUser(token)` et pose `userId`. Utilisé par les routes `/api/link/info` et `/api/link/approve` — le point où un compte web (facturation) est associé à un plugin.

### 5.2 Pont d'identité plugin ↔ compte (device-link)

Le plugin n'a pas de login propre ; pour associer un plan payant à un projet Figma, `link.controller.ts` implémente un flux code-court : `POST /api/link/start` (auth `X-API-Key`) crée un code à durée de vie 10 min dans `device_links`, avec un plafond anti-abus de 30 démarrages/heure/projet (`link.controller.ts:17-24`) ; la webapp authentifiée (JWT) l'approuve via `POST /api/link/approve`, qui génère un jeton (`newToken()`/`hashToken()` — seul le hash est stocké durablement, `link.service.ts`) ; le plugin le récupère une seule fois par `GET /api/link/status`, puis l'envoie en `X-Link-Token` sur chaque appel suivant.

### 5.3 Paiements — webhook Stripe signé

`payments.controller.ts:54-58` valide la signature (`stripe-signature`) via `stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)` avant de traiter tout événement d'abonnement.

### 5.4 Row-Level Security Supabase

Les données sont cloisonnées par Postgres RLS (policies sur `projects`/`assets`/`versions`, migrations `supabase/migrations/010_security_perf_hardening.sql` et `011_revoke_anon_table_grants.sql`) en complément des vérifications d'appartenance faites dans les controllers (ex. `checkpoints.controller.ts:26-28`, jointure `assets.project_id === projectId`).

---

## 6. Intégration & déploiement

- **Tests** : 300 tests Vitest (181 backend + 119 plugin) — répartis entre `backend/src/tests/*.test.ts` (+ quelques `*.test.ts` colocalisés dans `backend/src/services/`) et `plugin/src/*.test.ts` colocalisés avec le code testé.
- **Déploiement** : backend en un seul conteneur Railway (`@hono/node-server`) ; plugin distribué via Figma Community (manifest `plugin/manifest.json`) ; webapp Next.js sur Vercel (façade compagnon, hors héros jury).

> CI/CD, quality gate et couverture : `docs/BC02/01-environnements-ci-cd.md`. Architecture générale et schéma double-thread : `docs/BC01/01-architecture.md`.
