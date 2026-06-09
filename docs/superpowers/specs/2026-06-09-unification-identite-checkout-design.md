# Spec — Checkout par compte (Phase 1) + pont plugin↔webapp différé (Phase 2)

> **Date** : 2026-06-09
> **Statut** : design validé, prêt pour plan d'implémentation de la **Phase 1**
> **Contexte cours** : Web Services (services Auth + Paiements). Exigence « un service IA + **le vendre aux utilisateurs** ».

---

## 0. Décision de périmètre (la plus importante)

Le besoin se décompose en **deux livrables d'ambition très différente**. Seule la Phase 1 est dans le scope courant.

| | **Phase 1 — Checkout par compte** | **Phase 2 — Pont plugin↔SaaS** |
|---|---|---|
| Touche le plugin ? | **Non** | Oui (device-code, écran login, `clientStorage`…) |
| Nécessaire pour le **cours** | **Oui** (« vendre aux utilisateurs ») | Non |
| Nécessaire pour le **produit réel** | — | Oui (payer → débloquer le plugin, « voir mes projets ») |
| Poids | Léger (webapp + backend paiements) | Lourd (~70 % de l'effort, risque plugin) |
| Quand | **Maintenant** | **Différée** — déclencheur explicite (voir §8) |

**Justification du report de la Phase 2** : l'exigence du cours est un *paiement fonctionnel sur le frontend React*. Un utilisateur se logge sur la webapp (magic-link, déjà en place), crée un projet côté web, s'abonne → `profiles.plan = pro`. La boucle « vendre aux utilisateurs » est **complète et démontrable sans toucher au plugin**. Le pont plugin↔SaaS (faire apparaître les projets créés *dans le plugin* et débloquer le plugin après paiement) est une **complétude produit**, pas une exigence cours. On le construit quand un besoin réel l'impose (§8), pas avant — principe YAGNI.

**Limite assumée de la Phase 1** : un utilisateur qui paie sur le web ne voit pas (encore) son statut Pro *dans le plugin* — le plugin reste indexé par projet (`projects.plan`). Acceptable pour la démo cours : le paiement marche, l'abonnement est enregistré, la webapp reflète Pro.

---

## 1. Problème (constaté dans le code)

- **La webapp n'envoie aucun `Authorization: Bearer`** (`frontend/lib/api/client.ts`) alors que `/api/projects` exige `authMiddleware`. Le dashboard ne peut donc pas réellement lister/créer de projets (401). Le `owner_id` passé en query est ignoré (le backend lit `userId` du JWT).
- **Aucun checkout web** : `POST /api/payments/checkout` s'authentifie par `X-API-Key` + `projectId` (`backend/src/controllers/payments.controller.ts:32`), pensé pour le plugin. Or le plugin **ne fait jamais de checkout** (aucun appel Stripe côté plugin) → cette route est de fait inutilisée. La page `/pricing` affiche « Stripe » mais les 3 CTA pointent vers `/login`.
- **L'abonnement est indexé par projet** (`projects.plan`, `projects.stripe_customer_id`) — incohérent avec la grille publiée (`/pricing` : Free = « 1 projet », Pro = « **projets illimités** »), qui suppose un abonnement **par compte**. Indexer par projet crée un customer Stripe par fichier Figma : faux.

## 2. Objectif (Phase 1)

Rendre le **paiement réel et au niveau du compte** depuis la webapp :

1. La webapp s'authentifie correctement auprès du backend (Bearer) → dashboard fonctionnel.
2. « Passer à Pro » lance un vrai **Stripe Checkout par compte** → `profiles.plan = pro`.
3. Modèle Stripe propre : **un customer par utilisateur**.

Hors scope Phase 1 : tout le plugin, le device-code, le stamping `owner_id`. (→ Phase 2, §7.)

## 3. Décisions figées

| # | Décision | Choix |
|---|---|---|
| D1 | Portée de l'abonnement | **Par compte** (pas par projet) |
| D2 | Source de vérité du plan | **`profiles.plan`** (+ colonnes Stripe sur `profiles`). `projects.plan` déprécié, laissé en place |
| D3 | Auth checkout web | **`authMiddleware`** (JWT Supabase web), pas d'`X-API-Key` |
| D4 | Périmètre courant | **Phase 1 uniquement** ; Phase 2 différée avec déclencheur (§8) |
| D5 | (Phase 2, pour mémoire) Login plugin / token | Device-code · JWT plugin signé (`X-Plugin-Token`) — *non implémenté maintenant* |

---

## 4. Architecture — Phase 1

### 4.1 Auth webapp → backend (correctif de fond)

- `apiClient` injecte `Authorization: Bearer <access_token>` (depuis `supabase.auth.getSession()`) sur tous les appels authentifiés ; suppression du `owner_id` en query (ignoré côté backend).
- Corrige immédiatement le listing **et** la création de projets côté webapp (`projects.controller.ts` `POST /` pose déjà `owner_id = c.get('userId')`).

### 4.2 Abonnement par compte (D1/D2)

- `plan`, `stripe_customer_id`, `stripe_subscription_id` portés par **`profiles`** (un customer Stripe par personne).
- Webhook Stripe : écrit `profiles.plan` via **`metadata.user_id`** (au lieu de `projects` via `project_id`). La branche `project_id` historique est laissée mais marquée *legacy* (jamais déclenchée puisque le plugin ne checkout pas).
- `projects.plan` : conservé, **ignoré**. Pas de migration destructive.

### 4.3 Checkout par compte (D3)

- Helper partagé `createCheckoutForUser(userId, plan, interval, urls)` dans `stripe.service.ts` :
  - récupère/crée `profiles.stripe_customer_id` (upsert défensif si la ligne `profiles` manque) ;
  - `metadata: { user_id, plan }` sur la session **et** la subscription.
- Route **`POST /api/payments/checkout`** réécrite en **`authMiddleware`**, body `{ plan, interval }` — **pas de `project_id`**.
- Route **`POST /api/payments/portal`** : même bascule (auth JWT + `profiles.stripe_customer_id`).
- Pas de sélection de projet : l'abonnement est sur le compte → l'edge « 0 ou plusieurs projets » disparaît.

### 4.4 Frontend pricing

- `apiClient.createCheckout(plan, interval)` → `POST /api/payments/checkout` → `{ url }`.
- `/pricing` : « Passer à Pro » → non connecté → `/login?next=/pricing` ; connecté → `createCheckout('pro','month')` puis `window.location.href = session.url`.
- Retour `success_url = /dashboard?checkout=success` → message de confirmation (le webhook a déjà mis `profiles.plan`).
- Team reste `mailto:` (inchangé).

---

## 5. Modèle de données — migration `009_account_billing.sql` (Phase 1)

Défensive (`IF NOT EXISTS`) car les colonnes Stripe ont été appliquées hors migrations trackées (drift prod).

```sql
-- Abonnement porté par le compte
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free','pro','team')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id);
```

`projects.plan` / `projects.stripe_customer_id` / `projects.stripe_subscription_id` : conservés, non utilisés.
**Pré-requis à vérifier** : une ligne `profiles` existe bien à l'inscription (trigger `auth.users → profiles`). Sinon, l'upsert de `createCheckoutForUser` la crée.

---

## 6. Découpage en composants — Phase 1

| Composant | Fichier(s) | Rôle |
|---|---|---|
| Migration | `supabase/migrations/009_account_billing.sql` | billing sur `profiles` |
| Service Stripe MAJ | `backend/src/services/stripe.service.ts` | `createCheckoutForUser`, customer sur profile |
| Payments MAJ | `backend/src/controllers/payments.controller.ts` | route checkout JWT, portal JWT, webhook par `user_id` |
| apiClient MAJ | `frontend/lib/api/client.ts` | header Bearer + méthode `createCheckout` |
| Pricing MAJ | `frontend/app/pricing/page.tsx` | CTA → checkout |
| Dashboard | `frontend/app/(dashboard)/dashboard/page.tsx` | bannière `?checkout=success` |

Le plugin n'est **pas** touché.

---

## 7. Stratégie de test — Phase 1 (Vitest, ≥80 %)

**Backend**
- `createCheckoutForUser` : customer créé puis réutilisé ; upsert profile si absent ; metadata `user_id` correct.
- route checkout : garde d'auth JWT (401 sans token) ; refus du plan `free`.
- webhook : `checkout.session.completed` met `profiles.plan` par `user_id` ; `customer.subscription.deleted` repasse `free` ; signature invalide → 400.

**Webapp**
- `apiClient` attache le Bearer ; gère l'absence de session.
- CTA pricing : redirige vers login si déconnecté, vers Stripe si connecté.

---

## 8. Phase 2 — différée (pont plugin↔SaaS)

> **Ne pas implémenter maintenant.** Documentée pour mémoire et pour le plan futur.

**Déclencheur explicite** : à activer uniquement quand un besoin réel l'impose — typiquement *« un utilisateur abonné doit voir son statut Pro débloqué dans le plugin »* ou *« voir dans la webapp les projets créés depuis le plugin »* (ex. l'early-adopter qui teste le produit).

**Contenu prévu** :
- **Appairage device-code** : table `device_links` (`device_code` secret, `user_code` court à usage unique, `user_id`, `status`, `expires_at` +10 min). Routes `/api/auth/device/{start,claim,poll}`. Le `/poll` renvoie un **JWT plugin signé** (`{ sub: user_id, typ: 'plugin' }`, header `X-Plugin-Token`), stocké dans `figma.clientStorage`.
- **Stamping `owner_id`** : `auto-init` accepte le token plugin → pose `owner_id = userId` à la création et rattrape les projets `owner_id IS NULL` du même `figma_file_key`. Pas de réécriture si `owner_id` différent (anti-vol). Migration : `ALTER TABLE projects ALTER COLUMN owner_id DROP NOT NULL` (défensif).
- **Plan résolu par compte côté plugin** : `pluginMiddleware` résout le plan via `project.owner_id → profiles.plan` (au lieu de `projects.plan`).
- **UI plugin** : écran « Connexion » (poll), respect du double-thread (`clientStorage` dans `main.ts`, HTTP dans `ui.tsx`). Page webapp `/link` (saisie `user_code` → claim).

**Pourquoi pas l'email Figma** (tranché) : `figma.currentUser` n'expose pas l'email (limite plateforme). L'obtenir exigerait un OAuth Figma complet (2ᵉ IdP) et obligerait quand même à matcher sur l'email — fragile (mails divergents, aucune preuve de possession). Le device-code prouve le lien sans email.

---

## 9. Risques & points d'attention — Phase 1

- **Schéma Zod** : tout nouveau champ d'entrée (`plan`, `interval`) doit être ajouté au schéma Zod de la route (un schéma trop strict supprimait silencieusement des champs — historique projet).
- **Ligne `profiles` manquante** : sécuriser par upsert dans `createCheckoutForUser`.
- **Route checkout legacy** (`X-API-Key`) : la remplacer par la version JWT ; vérifier qu'aucun appelant plugin ne l'utilisait (confirmé : le plugin ne checkout pas).
- **Webhook** : tester en local avec la CLI Stripe (signature) ; `STRIPE_WEBHOOK_SECRET` requis.
- **Drift migrations** : la 009 est défensive car la prod a divergé des migrations trackées.

---

## 10. Évolutions futures (au-delà de Phase 1/2)

- Table `subscriptions` normalisée (statut, période, historique) pour la commercialisation réelle.
- OAuth ×3 fournisseurs (exigence cours BC02 recettes) — réutilisera l'identité Supabase.
