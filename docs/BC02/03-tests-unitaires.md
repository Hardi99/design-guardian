# C2.2.2 — Harnais de tests unitaires — Design Guardian

> **Grille RNCP 39583** : C2.2.2 — « Développer un harnais de tests unitaires et suivre l'évolution de la couverture de code ». Preuves : `backend/src/tests/*.test.ts`, `plugin/src/*.test.ts`, `backend/vitest.config.ts`, `.github/workflows/ci.yml`, `docs/RECETTES.md` (§ Couverture tests automatisés).

---

## 1. Pyramide de tests

Le harnais suit une pyramide à trois étages, cohérente avec l'architecture Service/Controller du monolithe modulaire (`docs/BC02/02-prototype-architecture.md`) :

```
                ▲
               /8\    Sommet — Recette manuelle
              /   \   REC-XXX-001 : parcours end-to-end plugin + Figma Desktop
             /-----\  → docs/BC02/07-cahier-recettes.md (docs/RECETTES.md)
            /       \
           / Contrôl.\  Intermédiaire — Tests d'intégration API
          /   leurs   \  Controllers Hono montés (`createApp()`), requête HTTP simulée,
         /-------------\ Supabase mocké, assertions sur le code HTTP et le payload
        /               \ ex. `branches.controller.test.ts`, `checkpoints.controller.test.ts`,
       /   Services /    \ `link.controller.test.ts`
      /    reducers       \
     /---------------------\ Base — Tests unitaires purs
    /                       \ Classes/fonctions sans I/O (services backend, reducers plugin),
   /_________________________\ entrées/sorties déterministes, aucun mock réseau nécessaire
```

### Base — unitaires purs

Le gros du volume de tests porte sur des **services et reducers purs**, sans dépendance réseau ni base de données :

- **Backend** : les classes `*.service.ts` sont testées en isolation. `DiffService.compareSnapshots()` (`backend/src/services/diff.service.ts`) prend deux snapshots en entrée et renvoie un `DeltaJSON` — aucun accès Supabase, donc testable sans mock (`backend/src/tests/diff.service.test.ts`). Même logique pour `significance.service.ts`, `svg-generator.service.ts`, `change-format.service.ts`, `tree.service.ts`, `node-match.ts` (colocalisé : `backend/src/services/node-match.test.ts`).
- **Plugin** : le `diffReducer` (machine à états du diff viewer) et les fonctions `store.ts`/`utils.ts` sont des fonctions pures `(state, action) → state`, testées sans webview ni `figma.*` (`plugin/src/diffReducer.test.ts`, `plugin/src/store.test.ts`, `plugin/src/utils.test.ts`).

### Intermédiaire — controllers (intégration API)

Les controllers Hono sont testés en **intégration** : l'application complète est instanciée via `createApp()` (`backend/src/app.ts`), une requête HTTP est simulée avec `app.request(...)`, et seule la couche Supabase est mockée (`vi.mock('../config/supabase.js', ...)`). Ces tests valident la chaîne réelle middleware → validation Zod → controller → réponse HTTP, pas juste une fonction isolée :

- `backend/src/tests/branches.controller.test.ts` — `PUT /api/branches/versions/:id/status` : garde d'appartenance cross-tenant. Une version appartenant au projet `'OTHER'` est appelée avec la clé API du projet `p1` → `403` attendu. Le commentaire du test explicite la condition de mutation : si la garde d'ownership dans `loadOwnedVersion` était supprimée, le handler continuerait jusqu'à l'update et renverrait `2xx` — le test échouerait, prouvant que la garde est bien exercée.
- `backend/src/tests/checkpoints.controller.test.ts` — `POST /api/checkpoints` : limite du plan Free (10 checkpoints/asset). Supabase mocké renvoie `count: 10` sur la table `versions` pour un projet `plan: 'free'` → `403` attendu.
- `backend/src/tests/link.controller.test.ts` — `POST /api/link/approve` (401 sans JWT, `authMiddleware` s'exécute avant toute logique métier) et `GET /api/link/me` (200, `{ linked: false, plan: 'free' }` sans token).

### Sommet — recette manuelle

La pointe de la pyramide n'est pas automatisée : elle couvre les parcours qui nécessitent Figma Desktop réel (sélection de nœuds, rendu canvas, navigation entre pages). Ces recettes sont documentées avec ID `REC-XXX-NNN`, préconditions, étapes, résultat attendu/obtenu — voir `docs/BC02/07-cahier-recettes.md`, qui renvoie vers `docs/RECETTES.md`.

---

## 2. Harnais Vitest & Quality Gate

**Runner** : [Vitest](https://vitest.dev) (natif ESM/TS, zéro config transpilation), utilisé côté backend et côté plugin.

**Volume mesuré** : **300 tests automatisés** — **181 backend** + **119 plugin**, tous exécutés à chaque `push`/`pull_request` sur `master` (`.github/workflows/ci.yml`).

**Quality Gate natif** — `backend/vitest.config.ts:17-22` :

```typescript
// Quality Gate réel : `test:coverage` échoue sous 80 % (statements/lines/functions).
thresholds: {
  statements: 80,
  lines: 80,
  functions: 80,
},
```

Ce n'est pas un contrôle a posteriori : la commande `bun run test:coverage` (backend) **échoue elle-même** (exit code ≠ 0) si un des trois seuils passe sous 80 %, ce qui bloque le job CI (`.github/workflows/ci.yml:31-35`) et donc le déploiement Railway.

**Couverture réelle mesurée** (`npm run test:coverage`, 2026-07-12) :

| Métrique | Seuil Quality Gate | Mesuré |
|---|---|---|
| Statements | 80 % | 88,02 % |
| Lines | 80 % | 90,33 % |
| Functions | 80 % | 92,92 % |
| Branches | *(non gaté, indicatif)* | 75,42 % |

La métrique *branches* n'est pas dans les seuils (`vitest.config.ts` ne la liste pas) — arbitrage volontaire : les branches conditionnelles imbriquées (ex. gestion d'erreurs multi-niveaux dans les services notifications/paiement) génèrent beaucoup de chemins peu porteurs de risque ; le gate porte sur statements/lines/functions, plus représentatifs du code métier réellement exercé.

**Exclusions du calcul de couverture** (`backend/vitest.config.ts:12-16`) : `src/services/metrics.service.ts` (câblage `prom-client`, infrastructure sans logique métier) et `src/services/openapi.ts` (spec OpenAPI statique).

---

## 3. Couverture par service

La ventilation fichier par fichier (nombre de tests, portée fonctionnelle) est **déjà maintenue** dans `docs/RECETTES.md` (section « Couverture tests automatisés ») — elle n'est pas dupliquée ici pour éviter deux sources de vérité. Résumé :

- **Backend** — **181 tests / 21 fichiers**, couverture 88,02 % statements / 90,33 % lines / 92,92 % functions / 75,42 % branches.
  - Fichiers principaux par volume de tests : `diff.service`, `significance.service`, `svg-generator.service`, `payments.service`, `change-format.service`, `openai.service`, `notification.service`.
  - Puis : `stripe.service`, `purge.service`, `node-match`, `link.service`, `plugin.middleware`, `versioning.service`, `checkpoint-ai.service`, `ownership.service`, `api-schema`, et les tests d'intégration controllers (`link.controller`, `branches.controller`, `checkpoints.controller`) plus le test de résolution de plan du middleware (`plugin.middleware.plan`).
- **Plugin** — **119 tests / 12 fichiers** : `diffReducer`, `store`, `utils`, `restoreDiff`, `figmaIdentity`, `restoreClone`, `identity`, `renderFormat`, `patchNote`, `linkFlow`, `diffHighlights`, `cornerRadii`.

→ Détail exhaustif (nom de fichier, nombre de tests, portée précise) : `docs/RECETTES.md`, section « Couverture tests automatisés ».

---

## 4. Prévention des régressions

### CI à chaque push/PR

Les 300 tests s'exécutent automatiquement à chaque `push` et `pull_request` vers `master` (`.github/workflows/ci.yml`, jobs backend et plugin) — voir `docs/BC02/01-environnements-ci-cd.md` pour le détail du pipeline. Aucune régression ne peut atteindre `master` sans que la suite complète soit repassée au vert, et sans que le Quality Gate ≥ 80 % soit maintenu.

### Exemples réels de tests-régression (limites/frontières)

Le noyau du produit — le diff géométrique à tolérance `EPSILON = 0.01` px (`backend/src/services/diff.service.ts`) — est protégé par des tests de frontière explicites, des deux côtés du pont main-thread/backend :

- **`backend/src/tests/diff.service.test.ts`** : `detects x position change above epsilon` (un delta juste au-dessus du seuil est détecté), `ignores changes at or below epsilon (0.01px)` (un delta ≤ 0,01 px est ignoré, évite le bruit de flottants), `detects change exactly above epsilon` (`x: 0.011`, cas limite exact). Le test `result.metadata.epsilon` vérifie même que la constante exposée dans les métadonnées vaut bien `0.01`.
- **`plugin/src/restoreDiff.test.ts`** : `différence numérique sous ε (0.01) → ignorée` et `différence numérique au-dessus de ε → incluse` — la même frontière est re-testée côté plugin, dans la logique de restauration (`restoreDiff`), pour garantir que le seuil reste cohérent entre le calcul backend et l'affichage/restauration côté client.

Ce type de test — valeur pile au seuil, valeur juste en dessous, juste au-dessus — est la garantie que toute régression future sur `EPSILON` (ou sur la logique de comparaison qui l'utilise) casse immédiatement la CI plutôt que de dégrader silencieusement la précision du diff, qui est l'argument de vente principal du produit face à Figma Version History (comparateur non numérique).

### Garde d'ownership cross-tenant

Au-delà des frontières numériques, `backend/src/tests/branches.controller.test.ts` illustre une autre classe de test-régression critique pour un produit multi-tenant : la preuve, par construction, qu'une garde de sécurité est effectivement exercée (le commentaire du test documente explicitement le scénario de mutation qui le ferait échouer si la garde disparaissait) — pattern repris pour `checkpoints.controller.test.ts` (limite plan Free) et `link.controller.test.ts` (401 sans JWT).

