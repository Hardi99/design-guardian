# Spec — NPS in-plugin (instrument BC04 · C4.3.1 / KPI)

> Validée 2026-08-14 (mini-brainstorming). Instrument **minimal** de collecte NPS : un prompt dans le plugin après capture, throttlé, qui enregistre un score 0–10 (+ commentaire optionnel). Ferme le trou « NPS à instrumenter » du dossier BC04. **Pas de surcharge** : collecter proprement, l'agrégation vient plus tard.

## 1. Objectif / non-goals

**Objectif :** collecter un score NPS depuis la **vraie surface d'usage** (le plugin), au **vrai moment** (après une capture réussie), sans spammer.

**Non-goals :** calcul du score NPS agrégé (%promoteurs − %détracteurs), dashboard NPS, prompt webapp, relance email. (Analyse ultérieure sur la donnée collectée.)

## 2. Décisions actées (brainstorming)

| Décision | Choix |
|---|---|
| Surface | **Plugin**, après une capture réussie (throttlé) |
| Déclenchement | À la **3ᵉ capture réussie**, **une seule fois** ; ignoré → snooze 90 j ; répondu → jamais |
| Répondant | **Optionnel** : nom/id `figma.currentUser` si dispo, sinon anonyme (champ nullable) |
| Auth | **X-API-Key** (comme les autres appels plugin) |
| Stockage | Nouvelle table `nps_responses` (migration `015`) |

## 3. Backend

### 3.1 Migration `supabase/migrations/015_nps_responses.sql`
Table `nps_responses` :
- `id` uuid PK (default `gen_random_uuid()`),
- `project_id` uuid NOT NULL REFERENCES `projects(id)` ON DELETE CASCADE,
- `score` int NOT NULL CHECK (`score` BETWEEN 0 AND 10),
- `comment` text NULL,
- `respondent` text NULL (nom ou id Figma),
- `created_at` timestamptz NOT NULL DEFAULT `now()`.
- Index sur `project_id`.
- **RLS** activée, cohérente avec les autres tables (le service_role backend écrit ; pas d'accès `anon`).

### 3.2 Endpoint `POST /api/nps` (`nps.controller.ts` + service)
- Auth **X-API-Key** → résout le `project_id` (même middleware/resolver que les autres routes plugin).
- Corps validé par **Zod** : `{ score: number (0–10, entier), comment?: string, respondent?: string }`. Hors borne → **400**.
- Insère la ligne via le service (séparation Service/Controller). Réponse `201 { ok: true }`.
- Monté dans `app.ts` : `app.route('/api/nps', npsRouter)`. Ajout à l'OpenAPI si trivial.

## 4. Plugin

### 4.1 Logique de déclenchement — fonction pure `shouldShowNps`
Fichier `plugin/src/nps.ts` :
```
type NpsState = { done?: boolean; snoozeUntil?: number };
function shouldShowNps(state: NpsState, captureCount: number, now: number, threshold = 3): boolean
```
Règles : `false` si `state.done` ; `false` si `state.snoozeUntil && now < state.snoozeUntil` ; sinon `captureCount >= threshold`. **Testable** en isolation (comme `clampView`).

### 4.2 Throttle (clientStorage, main thread)
- `dg_nps_captures` : compteur incrémenté à chaque capture réussie.
- `dg_nps_state` : `{ done }` ou `{ snoozeUntil }`.
- Messages (types.ts) : `NPS_SHOW` (main→ui, quand `shouldShowNps` est vrai au moment d'une capture réussie), `NPS_SUBMIT`/`NPS_DISMISS` (ui→main pour persister l'état). Réutilise le pattern de messages existant.

### 4.3 UI (ui.tsx)
Bloc compact (non modal, dismissible) : titre « Quelle est la probabilité que vous recommandiez Design Guardian ? », **échelle 0–10** (boutons), champ commentaire optionnel, bouton Envoyer + fermer.
- **Envoyer** → `POST /api/nps { score, comment?, respondent? }` → message `NPS_SUBMIT` (persiste `done`).
- **Fermer** → message `NPS_DISMISS` (persiste `snoozeUntil = now + 90 j`).
- `respondent` : rempli depuis `figma.currentUser` si déjà transporté dans l'état ; sinon omis.

## 5. Tests (baseline 308 à ne pas régresser)

- **Backend** (`nps` service/controller) : score valide inséré (201) ; score hors borne / non entier → 400 ; comment/respondent optionnels.
- **Plugin** (`shouldShowNps`) : sous le seuil → false ; au seuil → true ; `done` → false ; snooze actif → false ; snooze expiré → true.

## 6. Risques

- **Spam utilisateur** : mitigé par seuil + one-shot + snooze 90 j.
- **project_id résolu** : réutiliser exactement le resolver X-API-Key existant (pas de nouveau chemin d'auth).
- **currentUser** : n'est accessible qu'en main thread ; si non déjà transporté, on stocke anonyme (acceptable, champ nullable) — ne pas ajouter un aller-retour juste pour ça.
