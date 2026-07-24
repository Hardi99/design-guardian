# Pont billing ↔ identité (device-code) — Design

> Spec validée 2026-06-26. Décisions pivots actées avec l'utilisateur : (1) lien **par utilisateur Figma** ; (2) flux **device-code initié par le plugin + approbation 1-clic web** ; (3) token = **bearer opaque hashé** (pas le modèle JWT/refresh web — voir Sécurité).

## 1. Objectif & contexte

Aujourd'hui le plugin s'identifie par une `api_key` anonyme par fichier (`auto-init`) et son `plan` vient de `projects.plan` — **déconnecté** de la facturation (`profiles.plan`, mis à jour par Stripe). Conséquence : **impossible de gater le Pro dans le plugin → pas de monétisation**.

Ce pont lie l'**utilisateur Figma** (`figma.currentUser.id`) à son **compte payant** (`profiles`) une fois ; ensuite tous les fichiers où il travaille bénéficient de son plan. C'est la **Phase 2** de la mémoire `project_identity_plugin_webapp` (la Phase 1 = checkout webapp est déjà faite).

**Non-objectifs (YAGNI)** : sièges Team multi-utilisateurs (un compte = son plan) ; révocation via UI (re-lier écrase) ; modèle JWT/refresh/rotation web (cf. §5).

## 2. Modèle de données — migration 014 (table `device_links`)

```sql
CREATE TABLE public.device_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,           -- code d'approbation éphémère (16 octets hex, NON saisi par l'humain : il voyage dans approve_url)
  figma_user_id   text NOT NULL,                  -- figma.currentUser.id qui demande le lien
  figma_user_name text,                           -- affichage page d'approbation
  profile_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL = en attente
  token_hash      text,                           -- SHA-256 hex du link_token ; NULL = en attente
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,           -- validité du `code` (~10 min)
  approved_at     timestamptz
);
CREATE INDEX idx_device_links_code       ON public.device_links (code);
CREATE INDEX idx_device_links_token_hash ON public.device_links (token_hash);
CREATE INDEX idx_device_links_figma_user ON public.device_links (figma_user_id);
ALTER TABLE public.device_links ENABLE ROW LEVEL SECURITY;
-- Aucune policy anon/authenticated : accès backend service-key uniquement (deny-all par défaut).
```

- **Pending** : `profile_id`/`token_hash` NULL, `code` valide jusqu'à `expires_at`.
- **Approved** : `profile_id` + `token_hash` posés, `approved_at` daté. La ligne **est** le lien durable.
- **Le `link_token` en clair n'est JAMAIS stocké** : on garde son SHA-256 ; le clair est renvoyé **une seule fois** au plugin.
- **Un seul lien actif par utilisateur** : à l'approbation, supprimer les lignes approuvées antérieures du même `figma_user_id` (révoque l'ancien token).
- ⚠️ Migration **non auto-appliquée** (MCP Supabase read-only) → à lancer en SQL Editor comme 012/013.

## 3. Flux (device-flow)

```
PLUGIN                         BACKEND                         WEBAPP (/link, authentifiée)
  | clic "Lier mon compte"       |                               |
  |-- POST /api/link/start ----->| crée device_links (pending)   |
  |   {figma_user_id, name}      | -> {code, approve_url, exp}   |
  |<-----------------------------|                               |
  | openExternal(approve_url) ------------------------------------>| GET info(code) -> {figma_user_name}
  | (poll toutes ~3s)            |                               | "Lier {name} à {email} ?" [Confirmer]
  |-- GET /link/status?code ---->| pending...                    |--- POST /api/link/approve {code} (JWT)
  |<-- {status:'pending'} -------|                               |    profile_id = userId ; gen token
  |-- GET /link/status?code ---->| approved -> {link_token} once |<-- {ok, figma_user_name}
  |<-- {status:'approved',token}-|                               |
  | clientStorage.set(token)     |                               |
  | écran "Lié · Plan: Pro"      |                               |
```

## 4. Endpoints (nouveau `backend/src/controllers/link.controller.ts`, monté `/api/link`)

Per-route middleware (le routeur mixe auth plugin et auth JWT) :

| Route | Auth | Entrée | Sortie |
|---|---|---|---|
| `POST /api/link/start` | `pluginMiddleware` (X-API-Key) + rate-limit | `{ figma_user_id, figma_user_name }` (Zod) | `{ code, approve_url, expires_at }` |
| `GET /api/link/status?code=` | `pluginMiddleware` | query `code` | `{ status: 'pending'\|'approved'\|'expired', link_token? }` (token livré sur le 1er poll `approved`, puis `expires_at = now()` → les polls suivants par ce `code` renvoient `expired` ; le lien durable persiste via `token_hash`) |
| `GET /api/link/info?code=` | `authMiddleware` (JWT) | query `code` | `{ figma_user_name, status }` (pour l'écran de confirmation) |
| `POST /api/link/approve` | `authMiddleware` (JWT) | `{ code }` (Zod) | `{ ok, figma_user_name }` ; pose `profile_id = userId`, génère token |
| `GET /api/link/me` | en-tête `X-Link-Token` | — | `{ linked: boolean, plan }` (le plugin vérifie son lien au démarrage) |

`approve_url` = `${WEBAPP_URL}/link?code=XXXX` (nouvelle var d'env `WEBAPP_URL`, défaut non-bloquant).

## 5. Sécurité (le cœur — bearer opaque hashé)

- **`code`** : 16 octets aléatoires hex (`crypto.randomBytes`), **non saisi** (voyage dans `approve_url`), **usage unique** (invalidé à la livraison du token), **expire ~10 min**.
- **Approbation = JWT obligatoire** → `profile_id` = l'utilisateur authentifié → **impossible d'approuver pour autrui**.
- **`link_token`** : 32 octets aléatoires (hex), **renvoyé une seule fois**, **stocké en SHA-256** (`token_hash`). Validation à chaque requête : `sha256(header) == token_hash` (lookup index). Modèle « clé d'API » (cohérent avec `api_key` existant), **révocable** par suppression de ligne.
- **Pas de localStorage** : plugin → `figma.clientStorage` (sandbox isolé, non exposé XSS) ; webapp → cookies httpOnly Supabase (déjà en place).
- **Rate-limit** sur `/start` (réutilise le pattern du rate-limiter notifications, par projet).
- **Décision actée** : on n'adopte PAS le modèle access-JWT-court + refresh + rotation de zerbib-2 (conçu pour une session web à cookie httpOnly) — il est sur-dimensionné et incohérent pour un bearer détenu par un plugin. On en garde l'esprit : backend génère/vérifie, autorité durable en DB révocable, **hashage au repos**, jamais de localStorage.

## 6. Intégration du gating

`pluginMiddleware` est étendu : s'il reçoit `X-Link-Token` valide → `plan` effectif = `profiles.plan` du compte lié (override) ; sinon → `projects.plan` (Free). Ainsi la limite Free (10 checkpoints/asset) et les futures features Pro utilisent enfin le **vrai** plan de l'utilisateur. Coût : un lookup DB supplémentaire **uniquement** quand `X-Link-Token` est présent.

## 7. Plugin

- **Stockage** : `link_token` dans `figma.clientStorage` (clé `dg_link_token`). Envoyé en `X-Link-Token` sur les requêtes gatées.
- **Démarrage** : si token présent → `GET /api/link/me` pour afficher le plan ; sinon plan = celui du projet.
- **UI** (`ui.tsx`, section « Compte ») : non lié → bouton « Lier mon compte » ; lié → « Lié · Plan: {plan} ».
- **Machine à états de polling** extraite en **réducteur pur** (`linkFlow.ts`, testable sans Figma) : `idle → starting → awaiting(code) → approved(token) | expired | error`.
- `main.ts` : `figma.currentUser` (id/name), `figma.openExternal`, `figma.clientStorage` — tous déjà utilisés ailleurs.

## 8. Webapp

- Nouvelle page `/link` (App Router) : authentifiée (redirige vers `/login?next=/link?code=...` si déconnecté, en **préservant le code**). Lit `?code`, appelle `GET /api/link/info` pour afficher `figma_user_name`, bouton **Confirmer** → `POST /api/link/approve` → écran succès.
- La carte « Plugin Figma » du dashboard reste informative (le flux part du plugin).

## 9. Composants & responsabilités (isolation)

| Unité | Responsabilité | Dépend de |
|---|---|---|
| `migration 014` | table `device_links` + RLS | — |
| `link.service.ts` (backend) | helpers PURS : `newCode()`, `newToken()→{token,hash}`, `hashToken()`, `linkStatus(row, now)` | crypto (Node) |
| `link.controller.ts` (backend) | routes + orchestration DB ; étend rien (lit/écrit `device_links`, `profiles`) | `link.service`, supabase, middlewares |
| `pluginMiddleware` (modif) | résout le plan effectif via `X-Link-Token` | `device_links`, `profiles` |
| `linkFlow.ts` (plugin) | réducteur pur du polling | — |
| `ui.tsx` (modif, plugin) | section Compte + appels HTTP + clientStorage | `linkFlow`, store |
| `/link` (webapp) | écran d'approbation authentifié | apiClient, Supabase SSR |

## 10. Tests

- **Backend** : `link.service` (pur — code/token/hash, `linkStatus` pending/approved/expired) ; intégration controller (`approve` exige JWT → 401 sans ; `status` ne renvoie le token qu'une fois ; gating : `X-Link-Token` valide override le plan).
- **Plugin** : `linkFlow` réducteur (transitions idle→awaiting→approved/expired).
- Couverture services backend ≥ 80 % maintenue ; verts plugin.

## 11. Variables d'environnement

- `WEBAPP_URL` (backend) — base de `approve_url` (ex. `https://app.designguardian.app`). Défaut vide non-bloquant ; requis en prod (à ajouter à la garde `loadEnv` production).

## 12. Découpage / ordre d'implémentation (pour le plan)

1. Migration 014 (table + RLS) — fichier + à appliquer manuellement.
2. `link.service.ts` (pur) + tests.
3. `link.controller.ts` (routes start/status/info/approve/me) + Zod + tests intégration.
4. Extension `pluginMiddleware` (X-Link-Token → plan) + test.
5. Plugin : `linkFlow.ts` (pur) + tests, puis câblage `ui.tsx`/`main.ts` + clientStorage + X-Link-Token.
6. Webapp : page `/link` + lien apiClient.
7. `WEBAPP_URL` env + garde prod.
