# Spec — Unification d'identité plugin ↔ webapp + checkout par compte

> **Date** : 2026-06-09
> **Statut** : design validé, prêt pour plan d'implémentation
> **Contexte cours** : Web Services (services Auth + Paiements). Boucle « voir mes projets → payer ».

---

## 1. Problème

Aujourd'hui, le plugin Figma et la webapp Next.js vivent dans **deux espaces d'identité disjoints** qui ne se croisent jamais :

| Surface | Identité utilisée | Clé |
|---|---|---|
| Plugin | `figma.currentUser` (`id`, `name`, `photoUrl` — **pas d'email**) + `X-API-Key` par projet | `figma_file_key` |
| Webapp | User Supabase (magic-link email) → UUID | `auth.users.id` |

Conséquences mesurées dans le code :

- **`projects.owner_id` est `null`** sur tous les projets créés par le plugin. L'auto-init (`backend/src/controllers/projects.controller.ts:42`) insère `{ figma_file_key, name }` sans owner.
- **La webapp n'envoie aucun `Authorization: Bearer`** (`frontend/lib/api/client.ts`) alors que `/api/projects` exige `authMiddleware`. Le dashboard ne peut donc pas réellement lister de projets (401). Le `owner_id` passé en query est ignoré par le backend (il lit `userId` du JWT).
- **Le checkout est plugin-only** : `POST /api/payments/checkout` s'authentifie par `X-API-Key` + `projectId` (`backend/src/controllers/payments.controller.ts:32`). La webapp n'a pas cette clé.
- **L'abonnement est indexé par projet** (`projects.plan`, `projects.stripe_customer_id`) — incohérent avec la grille tarifaire publiée (`/pricing` : Free = « 1 projet », Pro = « **projets illimités** »), qui suppose un abonnement **par compte**.

**Pourquoi pas un matching par email** (option écartée) : `figma.currentUser` n'expose pas l'email (limite plateforme Figma). Le seul moyen de l'obtenir serait un OAuth Figma complet (`/v1/me`), qui ajoute un 2ᵉ fournisseur d'identité et oblige quand même à matcher sur l'email — fragile (mails compte Figma ≠ login web possibles, aucune preuve de possession, mails changent). Rejeté.

## 2. Objectif

Une **identité unique** (Supabase `auth.users`) pour les deux surfaces, jointe partout par **`projects.owner_id`**. Résultat attendu :

1. L'utilisateur s'appaire dans le plugin (code d'appairage) → ses projets reçoivent `owner_id`.
2. Login email sur la webapp → il voit les projets créés depuis le plugin.
3. « Passer à Pro » → paiement Stripe **au niveau du compte** → tous ses projets passent Pro.

Hors scope (évolutions notées, pas faites) : OAuth ×3 fournisseurs, table `subscriptions` normalisée, flux SMS/2FA.

## 3. Décisions figées

| # | Décision | Choix |
|---|---|---|
| D1 | Login dans le plugin | **Code d'appairage (device-code flow)** |
| D2 | Token plugin après appairage | **JWT signé par le backend** (`{ sub: user_id, typ: 'plugin' }`), vérifié par middleware |
| D3 | Portée de l'abonnement | **Par compte** (pas par projet) |
| D4 | Source de vérité du plan | **`profiles.plan`** (+ colonnes Stripe sur `profiles`). `projects.plan` déprécié, laissé en place |
| D5 | Périmètre du livrable | Identité unifiée **+** checkout par compte (boucle complète) |

---

## 4. Architecture

### 4.1 Modèle d'identité

- **Source unique** : `auth.users` (Supabase). `profiles.id = auth.users.id`, `profiles.email` miroir.
- **Clé de jointure universelle** : `projects.owner_id → profiles.id`.
- La webapp est déjà un user Supabase. Le plugin le **devient** via l'appairage (D1).

### 4.2 Flux d'appairage device-code (nouveau)

```
Plugin                         Backend                        Webapp (user loggé)
  │  POST /auth/device/start      │                                  │
  │ ────────────────────────────▶ │  crée device_links               │
  │ ◀──────────────────────────── │  { device_code, user_code,       │
  │   device_code (secret),        │    expires_in: 600 }             │
  │   user_code (court, humain)    │                                  │
  │                                │                                  │
  │  affiche user_code + ouvre ───────────────────────────────────▶  │  /link
  │                                │   POST /auth/device/claim        │
  │                                │ ◀─────────────────────────────── │  { user_code } + JWT
  │                                │  user_id ← JWT, status=claimed   │
  │  POST /auth/device/poll (×n)   │                                  │
  │ ────────────────────────────▶ │  si claimed → JWT plugin signé   │
  │ ◀──────────────────────────── │  { plugin_token }, status=consumed│
  │  stocke plugin_token dans clientStorage                          │
```

Détails :
- `user_code` : court et lisible (ex. 6 caractères base32 sans ambiguïté, `XXXX-XX`). `device_code` : aléatoire long (secret, jamais affiché).
- `expires_at` = +10 min. Le poll renvoie `pending` tant que non réclamé, `expired` après échéance, le token une seule fois (puis `consumed`).
- Poll : intervalle ~2 s côté plugin, arrêt après expiration.

### 4.3 Token plugin (D2)

- À la consommation du poll, le backend signe un **JWT** `{ sub: user_id, typ: 'plugin', iat }` avec un secret backend (`PLUGIN_JWT_SECRET`), expiration longue (ex. 90 j).
- Nouveau middleware **`pluginUserMiddleware`** : vérifie ce JWT (header **`X-Plugin-Token`**, distinct du `Authorization: Bearer` du JWT web pour éviter toute collision) et pose `c.set('userId', sub)`.
- Le plugin stocke le token dans `figma.clientStorage` (clé `dg_plugin_token`), géré **dans `main.ts`** (double-thread), transmis à `ui.tsx` par `postMessage`.

### 4.4 Remplissage de `owner_id` (D1 → projets)

- `auto-init` accepte optionnellement le token plugin. Si présent et valide :
  - à la **création** d'un projet → `owner_id = userId` ;
  - si un projet existe déjà pour ce `figma_file_key` avec `owner_id IS NULL` → **rattrapage** : on pose `owner_id = userId`.
- **Projets orphelins existants** : réclamés **organiquement** à la réouverture du fichier Figma par l'utilisateur appairé (auto-init tourne à chaque ouverture). Pas de migration de masse.
- Garde : si un projet a déjà un `owner_id ≠ userId`, on **ne réécrit pas** (évite le vol de projet).

### 4.5 Abonnement par compte (D3/D4)

- `plan`, `stripe_customer_id`, `stripe_subscription_id` portés par **`profiles`** (un customer Stripe par personne).
- `pluginMiddleware` (data plugin, auth par api_key) : résout le plan via `project.owner_id → profiles.plan`. `owner_id null` → `free`.
- Webhook Stripe : écrit `profiles.plan` via **`metadata.user_id`** (au lieu de `projects` via `project_id`).
- `projects.plan` : laissé en place mais **ignoré** (pas de migration destructive).

### 4.6 Auth webapp → backend (correctif trou A)

- `apiClient` injecte `Authorization: Bearer <access_token>` (depuis `supabase.auth.getSession()`) sur les appels authentifiés ; suppression du `owner_id` en query (ignoré).
- Corrige le listing du dashboard du même coup.

### 4.7 Checkout par compte (trou C)

- Helper partagé `createCheckoutForUser(userId, plan, interval, urls)` dans `stripe.service.ts`.
- Nouvelle route `POST /api/payments/checkout` en **`authMiddleware` (JWT web)**, body `{ plan, interval }` — **pas de `project_id`**.
  - Récupère/crée le `stripe_customer_id` sur `profiles`.
  - `metadata: { user_id, plan }` sur la session **et** la subscription.
- Page `/pricing` : « Passer à Pro » → non connecté → `/login?next=/pricing` ; connecté → appel checkout → `window.location.href = session.url`.
- Page retour `success_url` = `/dashboard?checkout=success` (message de confirmation ; le webhook fait le reste).
- Route `/portal` migre aussi sur `profiles.stripe_customer_id` + auth JWT.

---

## 5. Modèle de données — migration `009_account_identity_billing.sql`

Défensive (`IF NOT EXISTS`, `DROP NOT NULL`) car les colonnes Stripe et `owner_id` nullable ont été appliquées hors migrations trackées.

```sql
-- owner_id nullable (projets plugin non appairés)
ALTER TABLE projects ALTER COLUMN owner_id DROP NOT NULL;

-- Abonnement porté par le compte
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free','pro','team')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Appairage device-code
CREATE TABLE IF NOT EXISTS device_links (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_code  TEXT UNIQUE NOT NULL,
  user_code    TEXT UNIQUE NOT NULL,
  user_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','claimed','consumed','expired')),
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_device_links_user_code   ON device_links(user_code);
CREATE INDEX IF NOT EXISTS idx_device_links_device_code ON device_links(device_code);
```

`projects.plan`, `projects.stripe_customer_id`, `projects.stripe_subscription_id` : conservés, non utilisés.

---

## 6. Découpage en composants

| Composant | Fichier(s) | Rôle | Dépend de |
|---|---|---|---|
| Migration | `supabase/migrations/009_*.sql` | schéma device_links + profiles billing | — |
| Service appairage | `backend/src/services/device-link.service.ts` | start/claim/poll, génération codes, JWT plugin | supabase, jwt |
| Controller appairage | `backend/src/controllers/auth-device.controller.ts` | routes `/api/auth/device/*` | service ci-dessus, authMiddleware |
| Middleware plugin-user | `backend/src/middleware/plugin-user.middleware.ts` | vérifie JWT plugin → `userId` | jwt |
| Auto-init MAJ | `projects.controller.ts` | stamping `owner_id` si token plugin | plugin-user mw |
| pluginMiddleware MAJ | `plugin.middleware.ts` | plan résolu via owner | — |
| Service Stripe MAJ | `stripe.service.ts` | `createCheckoutForUser`, customer sur profile | — |
| Payments MAJ | `payments.controller.ts` | route checkout JWT, webhook par user_id, portal | authMiddleware |
| apiClient MAJ | `frontend/lib/api/client.ts` | Bearer token, méthode `createCheckout` | supabase client |
| Page link | `frontend/app/(dashboard)/link/page.tsx` | saisie user_code → claim | apiClient |
| Pricing MAJ | `frontend/app/pricing/page.tsx` | CTA → checkout | apiClient |
| UI plugin appairage | `plugin/src/ui.tsx`, `main.ts`, `store.ts` | écran connexion + poll + stockage token | — |

---

## 7. Stratégie de test (Vitest, ≥80 %)

**Backend**
- device-link service : génération codes uniques ; claim (succès, mauvais code, expiré) ; poll (pending → token → consumed, double consommation refusée).
- plugin-user middleware : token valide/invalide/expiré.
- auto-init : stamping owner_id (création + rattrapage null) ; refus de réécriture si owner différent.
- checkout web : garde d'auth JWT ; metadata user_id ; customer créé/réutilisé sur profile.
- webhook : `checkout.session.completed` met `profiles.plan` par user_id ; `subscription.deleted` repasse free.

**Plugin**
- store : transitions appairage (idle → pending → linked) ; persistance token.
- boucle poll : arrêt sur token, arrêt sur expiration.

**Webapp**
- apiClient attache le Bearer ; gère l'absence de session.
- CTA pricing : redirige vers login si déconnecté, vers Stripe si connecté.

---

## 8. Risques & points d'attention

- **Double-thread Figma** : `clientStorage` uniquement dans `main.ts`, HTTP uniquement dans `ui.tsx` (règle projet). Le token transite par `postMessage`.
- **Manifest** : ne pas ajouter de permission ; vérifier que les domaines backend sont dans `allowedDomains` du manifest pour les appels HTTP du plugin.
- **Schéma Zod** : tout nouveau champ d'entrée doit être ajouté au schéma Zod correspondant (un schéma trop strict supprimait silencieusement des champs — historique projet).
- **Sécurité device-code** : `device_code` secret jamais exposé à la webapp ; `user_code` court mais à usage unique et expirant ; rate-limit sur `/poll` et `/start`.
- **Drift migrations** : la 009 est défensive car la prod a divergé des migrations trackées.
- **Rétro-compat** : le flux data plugin (X-API-Key) reste inchangé ; l'appairage est additif.

---

## 9. Évolutions futures (hors scope)

- Table `subscriptions` normalisée (statut, période, historique) pour la commercialisation réelle.
- OAuth ×3 fournisseurs (exigence cours) — réutilisera l'identité Supabase posée ici.
- « Sign in with Figma » (OAuth Figma) comme alternative à l'appairage si l'email Figma devient nécessaire.
