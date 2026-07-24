# Spec — AI Patch Note asynchrone (non-bloquant à la capture)

> **Date** : 2026-06-10
> **Statut** : design validé, prêt pour plan d'implémentation
> **Contexte** : la génération du AI Patch Note (OpenAI `gpt-4o-mini`) est aujourd'hui **dans le chemin synchrone** de `POST /api/checkpoints` → le plugin attend ~1-3 s avant de recevoir sa réponse de capture.

---

## 1. Problème

`backend/src/controllers/checkpoints.controller.ts` (route `POST /`) appelle `getOpenAI().generatePatchNote(delta, …)` **avant** de répondre (≈ ligne 134). Conséquences :
- **Latence de capture** : le plugin est figé ~1-3 s (round-trip OpenAI) avant de voir son checkpoint.
- **Fragilité** : si OpenAI est lent/échoue, c'est toute la capture qui traîne.

Le diff (`DiffService.compareSnapshots`) est local et rapide ; **seul l'appel IA introduit la latence**.

## 2. Objectif

Rendre la capture **quasi instantanée** : insérer le checkpoint immédiatement, générer le Patch Note **en arrière-plan**, et laisser le plugin récupérer le résumé quand il est prêt.

Non-objectif : file de jobs / worker dédié (sur-dimensionné pour le MVP — fire-and-forget sur Node/Railway suffit).

## 3. Décisions figées

| # | Décision | Choix |
|---|---|---|
| D1 | Split génération | **0 changement → résumé constant synchrone** ; **>0 changement → async** |
| D2 | Mécanisme async | **Fire-and-forget non-awaité** sur Node/Railway (process long-running), pas de queue |
| D3 | Récupération côté plugin | **Polling court** : `GET /api/checkpoints/:id` ~2 s, max ~15 s |
| D4 | Filet d'échec | Bouton **« Régénérer »** → `POST /api/checkpoints/:id/regenerate` (relance sur l'`analysis_json` stocké, pas de re-diff) |
| D5 | Schéma DB | **Inchangé** (`versions.ai_summary` déjà nullable) |

---

## 4. Architecture

### 4.1 `POST /api/checkpoints` (modifié)

Inchangé jusqu'au diff (ownership asset↔projet, limite plan free, node consistency, version précédente, download snapshot précédent, calcul `delta`, upload snapshot + render). Puis :

```
delta.totalChanges === 0
   → ai_summary = "Aucune modification détectée."   (synchrone, pas d'IA)
   → INSERT version (analysis_json = delta, ai_summary = constante)
   → 201 { version, analysis, ai_summary }

delta.totalChanges > 0  (ou pas de version précédente → delta null)
   → INSERT version (analysis_json = delta|null, ai_summary = null)
   → 201 { version, analysis, ai_summary: null }   ← réponse immédiate
   → APRÈS la réponse (fire-and-forget) :
        void generateAndStoreSummary({ versionId, delta, authorName, notifyEmail, branchName, versionNumber })
          .catch(() => { /* best-effort ; le filet = bouton Régénérer */ })
```

L'**email checkpoint** (`sendCheckpointNotification`, qui inclut le résumé) est **déplacé** dans `generateAndStoreSummary` (sinon il partirait sans Patch Note). Pour le cas 0-changement, l'email part avec la constante (dans le chemin synchrone) — ou est simplement omis si pas de changement (au choix du plan ; défaut : envoyer avec la constante pour garder le comportement).

### 4.2 Service `generateAndStoreSummary` (nouveau, testable)

`backend/src/services/checkpoint-ai.service.ts` :

```ts
export async function generateAndStoreSummary(params: {
  versionId: string;
  delta: DeltaResult;          // analysis_json non null
  authorName: string;
  notifyEmail?: string | null;
  branchName: string;
  versionNumber: number;
  projectName: string;         // pour l'email (figma_node_id ou nom asset — voir §7)
}): Promise<void>
```

- Lazy `OpenAIService` (depuis `env.OPENAI_API_KEY`), comme le controller actuel.
- `generatePatchNote(delta, authorName)` → `UPDATE versions SET ai_summary = … WHERE id = versionId`.
- `aiSummariesGeneratedTotal.inc({ status: 'success' | 'error' })`.
- En cas d'échec OpenAI/DB : log + laisse `ai_summary` null (pas de throw qui crasherait le process en fire-and-forget). En mode `regenerate` (awaité), renvoyer un booléen succès pour que le controller réponde justement.
- Si `notifyEmail` : `sendCheckpointNotification` (best-effort, `.catch`).

> Le service est appelé **sans `await`** depuis le POST (fire-and-forget) et **avec `await`** depuis `regenerate`.

### 4.3 `GET /api/checkpoints/:id` (nouveau, `pluginMiddleware`)

Renvoie la version seule (pour le polling, sans re-fetch de l'arbre). **Ownership** : la version doit appartenir à un asset du projet courant.

```ts
const { data, error } = await supabase
  .from('versions')
  .select('*, assets!inner(project_id)')
  .eq('id', id)
  .eq('assets.project_id', c.get('projectId'))
  .single();
if (error || !data) return c.json<ErrorResponse>({ error: 'Checkpoint not found' }, 404);
return c.json({ version: data });
```

### 4.4 `POST /api/checkpoints/:id/regenerate` (nouveau, `pluginMiddleware`)

- Charge la version avec ownership (même jointure) + `analysis_json`, `branch_name`, `version_number`, `author_name`.
- Si `analysis_json` null → `400 { error: 'Nothing to regenerate' }`.
- Sinon `await generateAndStoreSummary(...)` → recharge/renvoie la version mise à jour `{ version }`.

### 4.5 Plugin (`plugin/src/ui.tsx` + `store.ts`)

**Détection du « pending »** : le plugin ne reçoit PAS `analysis_json` dans `GET /api/branches/tree` ; il ne peut donc pas distinguer « génération en cours » d'un « premier checkpoint sans delta » sur les versions historiques. → On **ne poll que la version qui vient d'être créée**, dont l'état est connu via la réponse du POST : `response.analysis?.totalChanges > 0 && !response.ai_summary` ⇒ génération en cours.

- **CheckpointScreen / capture** : à la création, si la réponse indique « pending », marquer cette version comme telle dans le state.
- **HomeScreen** : la version pending affiche **« Patch Note en cours… »** (spinner).
- **Polling** (`usePatchNotePolling`, dans `ui.tsx`, HTTP uniquement) : `GET /api/checkpoints/:id` toutes les **2 s**, max **~8 essais (15 s)**, jusqu'à `ai_summary` non null → maj de la ligne dans le state local.
- **Timeout** → « Patch Note indisponible » + bouton **« Régénérer »** → `POST …/regenerate` → maj la ligne.
- Les versions historiques à `ai_summary` null (chargées depuis l'arbre) ne sont **pas** pollées (peuvent être de légitimes premiers checkpoints) — affichage neutre, pas de spinner.
- Respect double-thread : tout HTTP dans `ui.tsx` ; aucun appel `figma.*` ajouté.

---

## 5. Modèle de données

**Aucune migration.** `versions.ai_summary TEXT` est déjà nullable. `analysis_json` (le delta) est déjà stocké → la régénération n'a pas besoin de re-diff.

## 6. Découpage

| Fichier | Action |
|---|---|
| `backend/src/services/checkpoint-ai.service.ts` | Create — `generateAndStoreSummary` |
| `backend/src/controllers/checkpoints.controller.ts` | Modify — POST async + `GET /:id` + `POST /:id/regenerate` ; retirer l'appel IA bloquant + le `console.log` debug (ligne 156) |
| `backend/src/types/api.ts` | Modify si besoin (type de réponse `GET /:id`) |
| `backend/src/services/openapi.ts` | Modify — documenter les 2 nouveaux endpoints (BC02) |
| `backend/src/tests/checkpoint-ai.service.test.ts` | Create — tests du service |
| `plugin/src/ui.tsx` | Modify — affichage état + polling + bouton Régénérer |
| `plugin/src/store.ts` | Modify si besoin (maj d'une version dans le state) |
| `plugin/src/*.test.ts` | Create/Modify — tests polling/transitions |

## 7. Points d'attention / risques

- **Durabilité fire-and-forget** : si le process Railway redémarre entre la réponse et l'`UPDATE`, le résumé est perdu → `ai_summary` reste null → polling timeout → **bouton Régénérer** (filet prévu). Fenêtre courte, risque accepté (D2/D4).
- **Bug existant à corriger au passage** : `checkpoints.controller.ts:192` utilise `body.figma_node_id` comme `projectName` de l'email. Le déplacement de l'email dans le service est l'occasion de passer un nom correct (nom de l'asset si dispo, sinon « Design Guardian »).
- **`console.log` debug** (`checkpoints.controller.ts:156`) : retiré au passage.
- **Schéma Zod** : `GET /:id` et `regenerate` n'ont pas de body (params seulement) ; pas de nouveau schéma sauf si on type la réponse.
- **OpenAPI** : ajouter les 2 routes pour rester cohérent BC02.
- **Tests fire-and-forget** : le POST ne doit PAS attendre la génération (vérifier qu'il répond avec `ai_summary` null) ; le service est testé séparément.

## 8. Stratégie de test (Vitest)

**Backend**
- `generateAndStoreSummary` : succès → `UPDATE ai_summary` + métrique `success` + email si `notifyEmail` ; échec OpenAI → `ai_summary` reste null + métrique `error`, pas de throw.
- `GET /:id` : ownership (404 si version hors projet) ; renvoie la version.
- `regenerate` : `analysis_json` null → 400 ; sinon régénère + renvoie la version.
- `POST /` : 0 changement → `ai_summary` constante synchrone ; >0 → réponse avec `ai_summary` null (ne bloque pas sur l'IA).

**Plugin**
- Polling : transition `null → résumé` met à jour la version ; arrêt sur résumé ; arrêt sur timeout → état « régénérer ».

## 9. Hors scope

- File de jobs / worker, SSE/WebSocket push (alternatives écartées).
- Régénération automatique à la lecture (effet de bord sur GET — écarté).
