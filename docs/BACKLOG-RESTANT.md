# Design Guardian — Backlog restant à implémenter

> État au 2026-06-26. Ce qui reste APRÈS : audit backend A–F mergé (`9258952`/`743acf7`), précision snapshot mergée (`c833bd0`), cohérence DB + Hono `routePath` (`c524c03`). Tests : backend 166/166, plugin 109/109.
>
> Légende effort : **S** ≤ 1 j-h · **M** 1–3 j-h · **L** > 3 j-h. Priorité : 🔴 bloqueur · 🟠 important · 🟡 utile · 🔵 différé.

---

## 0. Actions manuelles immédiates (clickops / SQL — pas de code, mais à faire)

Ces points n'ont **pas** de code à écrire : ce sont des opérations console/SQL que seul le titulaire des accès peut faire (le MCP Supabase est en lecture seule).

| # | Action | Où | Pourquoi | Effort |
|---|--------|-----|----------|--------|
| 0.1 | Appliquer **migration 013** : `ALTER TABLE public.versions DROP CONSTRAINT IF EXISTS versions_asset_id_version_number_key;` | SQL Editor Supabase | La contrainte legacy `(asset_id, version_number)` contredit la numérotation par branche → casserait le 1er checkpoint d'une 2e branche (409). Fichier : `supabase/migrations/013_drop_legacy_version_unique.sql` | S |
| 0.2 | `REVOKE SELECT ON public.profiles FROM authenticated;` (+ vérifier RLS lignes intacte) | SQL Editor | Advisor sécurité : `profiles` (email + ids Stripe) découvrable en GraphQL par tout compte. RLS protège les lignes mais pas la découvrabilité. Prérequis trust-data. | S |
| 0.3 | Activer **Leaked Password Protection** | Dashboard → Auth → Policies | Advisor sécurité (HaveIBeenPwned). Non configurable en SQL. | S |
| 0.4 | Activer les **providers OAuth ×3** (Google/GitHub/Facebook) + **Twilio** | Dashboard Supabase | Le code est déjà câblé (`frontend/app/(auth)/`) ; reste l'activation. Couvre l'exigence cours « OAuth 3 fournisseurs + SMS ». | S |

**Vérif 013 :** `SELECT conname FROM pg_constraint WHERE conrelid='public.versions'::regclass AND contype='u';` → ne doit rester que `versions_asset_branch_vnum_unique`.

---

## 1. 🔴 Bloqueurs de commercialisation (sans eux, on ne vend pas)

### 1.1 — Pont billing ↔ identité (device-code) · **L** · 🔴 *LE bloqueur n°1*
**Problème** : le plugin s'identifie par une `api_key` anonyme par fichier (`auto-init`) ; la facturation est par **compte** (webapp). Aucun lien vivant entre « cet utilisateur/fichier Figma » et « ce compte qui paie » → **impossible de gater le Pro dans le plugin** → pas de monétisation.
**Approche figée** (cf. mémoire) : pont par **device-code** (PAS par email — l'email Figma est indisponible). Phase 1 (checkout webapp) ✅ déjà faite ; c'est la **Phase 2** (pont plugin) qui reste.
**À faire** :
- Endpoint backend : génération + échange d'un device-code (court, à expiration), liant `project.id`/`figma_file_key` ↔ `profile.id` (compte payant).
- Plugin : écran « lier ce compte » → affiche le code → l'utilisateur le valide sur la webapp connectée → le plugin obtient un token de compte (stocké en `figma.clientStorage`).
- Backend : résoudre le **plan effectif** du projet depuis le compte lié (pas depuis `projects.plan` seul) → gater les features Pro.
**Acceptation** : un designer qui paie sur la webapp voit le plugin passer en Pro sans ressaisir d'email ; un projet non lié reste Free.
**Dépend de** : rien (le checkout existe).

### 1.2 — Trust data (confiance & conformité) · **M** · 🔴 *bloqueur B2B*
**Problème** : on stocke des snapshots de designs (potentiellement confidentiels) sur notre Supabase. L'équipe à 39 €/mois exigera des garanties.
**À faire** :
- **Privacy Policy** + **Terms** (générables ; cf. skill `saas-create-legals-docs`) — couvrir : nature des données (snapshots = propriétés géométriques, pas le rendu source), localisation, sous-traitants (Supabase, OpenAI, Stripe, Resend, Twilio).
- **Rétention / suppression** : endpoint + doc « supprimer mes données » (la cascade SQL + cleanup Storage existe déjà côté asset — l'exposer au niveau projet/compte).
- 0.2 (REVOKE profiles) appliqué.
- (Optionnel B2B avancé) **DPA** type.
**Acceptation** : une page publique privacy/terms ; un chemin clair de suppression ; advisor sécurité profiles au vert.

### 1.3 — Validation de la demande · **M** · 🔴 *go-to-market, pas du code*
**Problème** : 1 early adopter ≠ marché.
**À faire** : 5–10 intentions d'achat réelles, un peu de rétention, idéalement une waitlist. Mesurer : activation (1er checkpoint), rétention (revient checkpointer).
**Acceptation** : signaux quantifiés avant d'investir davantage produit.

---

## 2. 🟠 Exploitation & UX (qualité de service + adoption)

### 2.1 — Durcissement exploitation prod · **M** · 🟠
- **Sentry** (error tracking) backend + plugin (cf. axe post-oral).
- **Backups** Supabase (politique de sauvegarde / PITR sur tier payant).
- **Sortie du free-tier Supabase** : le `/ping` anti-pause est un hack de démo ; un produit payant a besoin du tier payant (pas de pause, backups, perfs).
- **Status page** publique (uptime).
- **Fallback IA Mistral** (IA FR) en secours d'OpenAI (le fallback déterministe existe déjà ; Mistral = secours qualitatif).
**Acceptation** : erreurs tracées, base sauvegardée, pas de pause, page d'état.

### 2.2 — UX héros « plus simple » (point du prof) · **M** · 🟠
**Principe** : **héros = Frame (Split/Overlay) + titre AI** ; **démonter la vue Nodes comme onglet** → replier le détail par-nœud DANS la frame (clic-pour-révéler, progressive disclosure). « Pas de liste ».
**À faire** (UI plugin, pas de backend) :
- Supprimer Nodes comme 3e mode co-égal ; surligner les zones changées sur la Frame ; clic sur une zone → changement lisible en contexte (le backend fournit déjà `node_diffs`/`readable`, rendus différés `?thumbs=1`).
- **NE PAS** supprimer l'intelligence par-nœud (c'est la valeur 0,01px pour la niche design-systems).
- Onboarding < 60 s (1er checkpoint guidé).
**Acceptation** : un designer comprend l'écran en 5 s, zéro liste par défaut, le détail précis reste accessible au clic.

---

## 3. 🔵 Précision technique (différé — YAGNI ; le clone-restore les couvre déjà)

Le **restore est déjà pixel-perfect** (clone `dg_history`). Ces points n'améliorent QUE le **changelog/diff** et le **fallback-restore**. À faire seulement si la niche le réclame, même patron que `cornerRadii` (capture plugin + Zod backend + diff + restore).

| Item | Effort | Note |
|------|--------|------|
| **Rich-text par-plage** (couleur/police par segment) via `getStyledTextSegments` / `setRange*` | L | Le plus gros lift ; projet « fidélité rich-text » déjà identifié en commentaire dans `main.ts` |
| **Typo en PERCENT/AUTO** (letterSpacing/lineHeight non-px) | M | v1 actuelle = px uniquement ; nécessite gérer l'unité (+ fontSize pour résoudre) |
| **Blend modes**, **stroke align/dash/cap**, **gradient strokes** | S–M | Complète le diff sur des cas pro |
| **Constraints**, **auto-layout padding/itemSpacing**, **clipsContent** | M | Changements de layout actuellement invisibles au changelog |

---

## 4. Parkés (décision produit — ne pas rouvrir sans raison)

- **Branches / merge / cherry-pick** (SP2) — parqués depuis le pivot 2026-06-15 (piège Abstract). `dg_id` gardé comme sur-ensemble robuste. ⚠️ Avant de rallumer : appliquer 0.1 (migration 013) sinon la feature casse.
- **Option 2 — SVG pixel-perfect via Figma REST API** (`figma.com/v1/images?format=svg`, OAuth) — roadmap produit ; Option 1 (propriétés natives) suffit pour l'usage actuel.
- **MoR (Lemon Squeezy / Paddle)** pour la TVA EU — à la commercialisation réelle (Stripe suffit pour le MVP).

---

## Ordre conseillé

1. **0.1–0.4** (clickops, < 1 j cumulé) — débloque la sécurité/cohérence + l'exigence cours OAuth/SMS.
2. **1.1 Pont billing** — le domino qui débloque la monétisation.
3. **1.2 Trust data** (en parallèle, surtout 0.2 + privacy/terms).
4. **2.2 UX héros** + **2.1 exploitation**.
5. **1.3 validation** en continu.
6. Le reste (§3) à la demande de la niche ; §4 reste parqué.
