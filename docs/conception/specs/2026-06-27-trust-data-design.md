# Trust-data (RGPD) — Design

> Spec validée 2026-06-27. **Re-scopée pour la sécurité** : pas d'endpoint de suppression destructif public, pas de self-serve hard-delete (jugé trop risqué pour un produit de versioning). Conformité par **docs légaux + suppression sur demande via un script opérateur testé (dry-run par défaut)**.

## 1. Objectif & périmètre

Lever le bloqueur de confiance B2B (un client Team confie des designs à notre Supabase) avec le **minimum de surface destructive**. Trois volets :
- **A. Docs légaux** : Privacy Policy + CGU (RGPD/FR), pages webapp.
- **B. Suppression sur demande** : pas de route publique ; un **script opérateur** (clé service, `--dry-run` par défaut) qui annule l'abonnement Stripe, **purge le Storage** (corrige la fuite actuelle) puis supprime les lignes. Périmètres : **compte** ou **fichier/projet**.
- **C. Sécurité** : affirmer la RLS `profiles` own-row (déjà en place) ; **NE PAS** faire le `REVOKE SELECT ... FROM authenticated` (il casserait la lecture légitime du profil par la webapp).

**Décisions actées :** suppression complète (compte + fichier + purge Storage) mais **opérateur, pas self-serve** ; Privacy + CGU (DPA reporté).

**Non-objectifs (YAGNI / différés)** : endpoints de suppression publics, UI self-serve (webapp/plugin), soft-delete + délai de grâce, DPA, bannière cookies (seuls cookies essentiels Supabase), `REVOKE` GraphQL.

**Pourquoi pas le self-serve hard-delete** : irréversible (perte définitive pour un client payant), rayon de souffle large (cascade + Storage), endpoint `admin.deleteUser` à très haute valeur (cible d'attaque), et contradictoire avec la promesse « tu ne perds jamais ton travail ». Le RGPD exige la *capacité* de supprimer sur demande (~30 j), pas l'instantané self-serve. Le self-serve futur se fera en **soft-delete recouvrable**, jamais en hard-delete.

## 2. Volet A — Docs légaux (webapp)

Pages **`/privacy`** et **`/terms`** (App Router, contenu statique FR), liées depuis le footer, la page login et le dashboard.

**Privacy Policy** (contenu) :
- **Données traitées** : propriétés géométriques natives Figma (positions, tailles, couleurs, chemins vectoriels…) = le **snapshot** ; **pas** le fichier source ni le rendu original. Attribution : `figma.currentUser` (id/nom/avatar). Compte : email, plan, identifiants Stripe.
- **Sous-traitants** : Supabase (BDD+Storage, UE), OpenAI (génération du patch note, données minimisées : delta rangé), Stripe (paiement), Resend (emails), Twilio (SMS).
- **Finalités & base légale** : exécution du service (versioning), facturation (contrat), notifications (intérêt légitime/consentement).
- **Droits RGPD** : accès, rectification, **suppression** (procédure §3), portabilité, opposition. Contact dédié.
- **Rétention** : tant que le compte/projet existe ; suppression sur demande.

**CGU/Terms** : objet du service, comptes, abonnements (Free/Pro 12 €/Team 39 €), paiement & résiliation, propriété (le designer reste propriétaire de ses designs), limitation de responsabilité, droit applicable (France).

## 3. Volet B — Suppression sur demande (script opérateur)

**Aucune route HTTP destructive.** Un module testable + un script CLI.

### `backend/src/services/purge.service.ts` (logique injectable, testable)
- `collectProjectStoragePaths(storage, projectId): Promise<string[]>` — énumère les blobs d'un projet (`{assetId}/{branch}/v{n}.json` + `_render.json`) sur 2 niveaux. Généralise `removeAssetStorage` existant.
- `purgeProjectData(db, storage, projectId): Promise<{ assets: number; blobs: number }>` — supprime les blobs Storage puis la ligne `projects` (cascade SQL assets/versions). Idempotent.
- `purgeAccount(db, storage, stripe, userId): Promise<{ projects: number }>` — annule l'abonnement Stripe (`profiles.stripe_subscription_id` → `stripe.subscriptions.cancel`), purge le Storage de chaque projet possédé, puis `admin.auth.admin.deleteUser(userId)` (cascade profil → projets → assets/versions → device_links).

### `backend/scripts/purge.mjs` (CLI opérateur)
- Usage : `node scripts/purge.mjs --file-key <k> | --project <id> | --account <email|uuid> [--confirm]`.
- **`--dry-run` par défaut** : sans `--confirm`, n'AFFICHE que ce qui serait supprimé (projets, nb assets/versions, nb blobs, abonnement à annuler) — **rien n'est détruit**.
- Avec `--confirm` : exécute via `purge.service`. Logge chaque étape.
- Charge l'env (`dotenv`), clients service + stripe. Pas dans le bundle applicatif (script de maintenance).

### Sécurité du script
- Hors de l'API publique ; nécessite la **clé service** (accès opérateur). Dry-run par défaut = pas de destruction accidentelle. Résolution du périmètre **exacte** (par `figma_file_key` / `project.id` / `profile.id`) — jamais de suppression « large ».

## 4. Volet C — Sécurité (sans casse)

- **Affirmer** que la RLS `profiles` est own-row (policies de la migration 010 : `(select auth.uid()) = id`) → un compte ne lit/écrit que SON profil. **Les données sont protégées.**
- **NE PAS** `REVOKE SELECT ON public.profiles FROM authenticated` : casserait la lecture REST légitime du dashboard (`profiles.plan`/email). L'advisor ne signale qu'une *découvrabilité* de schéma GraphQL, faible risque sous RLS stricte.
- Documenter cette protection dans la Privacy Policy. (Defense-in-depth « table billing service-only » = option future, hors scope.)

## 5. Composants & responsabilités

| Unité | Responsabilité | Dépend de |
|---|---|---|
| `frontend/app/privacy/page.tsx`, `frontend/app/terms/page.tsx` | contenu légal statique | — |
| liens footer/login/dashboard | accès aux pages | — |
| `backend/src/services/purge.service.ts` | logique pure-ish de purge (scope + Storage + delete), injectable | supabase, stripe.service, storage |
| `backend/scripts/purge.mjs` | CLI opérateur, dry-run par défaut | purge.service, env |
| `backend/src/tests/purge.service.test.ts` | tests de la logique (scope, paths, ordre, idempotence) avec stubs | — |

## 6. Tests

- **Backend** : `purge.service` testé avec stubs Supabase/Storage (comme `ownership`/`versioning`) — `collectProjectStoragePaths` (énumération 2 niveaux), `purgeProjectData` (supprime blobs PUIS lignes ; renvoie les comptes), `purgeAccount` (annule Stripe → purge projets → deleteUser ; gère l'absence d'abonnement). Vérifier qu'aucune suppression « hors périmètre » n'est émise.
- **Webapp** : `next build` passe avec `/privacy` `/terms`.
- Le script `purge.mjs` n'est pas testé unitairement (wrapper opérationnel) ; sa logique l'est via `purge.service`.

## 7. Ordre d'implémentation (pour le plan)

1. `purge.service.ts` + tests (pur, le cœur réutilisable).
2. `scripts/purge.mjs` (dry-run par défaut).
3. Webapp : pages `/privacy` + `/terms` + liens.
4. (Pas de migration ; sécurité = affirmation RLS documentée.)
