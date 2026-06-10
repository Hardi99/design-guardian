# Changelog

Toutes les modifications notables sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).
Versioning [Semver](https://semver.org/lang/fr/).

---

## [1.5.0] — 2026-06-10

### Added
- **Webapp dashboard compte/billing** — plan courant, « Gérer mon abonnement » (portail Stripe), CTA installer le plugin
- **AI Patch Note asynchrone** — `GET /api/checkpoints/:id` (polling) + `POST /api/checkpoints/:id/regenerate` (filet) ; UI plugin « en cours… » + bouton Régénérer
- **Checkout par compte** côté webapp — `apiClient` envoie le Bearer Supabase, bouton pricing fonctionnel

### Changed
- **Abonnement porté par le compte** (`profiles.plan`) et non plus par projet — cohérent avec la grille « projets illimités » ; routes paiement authentifiées par JWT web (`payments.service` extrait du controller)
- **Capture non-bloquante** — l'appel OpenAI sort du chemin synchrone de `POST /api/checkpoints` (réponse immédiate, génération en arrière-plan)
- **Pricing réconcilié** — une seule source (page pricing) ; `PLANS.features` marketing retiré du backend ; export reformulé « Rapport d'approbation (bientôt) »

### Removed
- **Flux upload-SVG mort** de la webapp (route `projects/[id]`, `useProject`, `DropZone`/`AssetCard`/`VersionCard`/`FontSpecimen`) — vestige du SaaS abandonné
- **Code mort backend** — `getOrCreateCustomer` (par projet) + 6 fonctions `notification.service` orphelines

### Security
- **CORS configurable** (`CORS_ORIGINS` — allowlist si défini, sinon `*` car le plugin émet en origine `null`)
- **`/metrics` protégeable** (`METRICS_TOKEN` — bearer requis si défini)
- Erreurs Supabase **remontées** dans `payments.service` (plus de dérive silencieuse de facturation)

### Fixed
- **Typecheck plugin** rétabli — `@figma/plugin-typings` installé + référencé ; vrai bug corrigé (`strokeWeight` sur `MinimalStrokesMixin`)
- **Régression hono 4.12** — `c.req.param('id')` typé `string | undefined` ; garde ajoutée (`assets.controller`)
- Tri des PR Dependabot (12) + master CI verte

---

## [1.4.0] — 2026-05-22

### Added
- **Service Paiements (BC F)** — `GET /api/payments/plans`, `POST /api/payments/checkout`, `/portal`, `/webhook`
- Intégration Stripe : Checkout hébergé, billing portal, webhooks signés (`stripe-signature`)
- 5 événements webhook : `checkout.session.completed`, `subscription.updated/deleted`, `invoice.payment_succeeded/failed`
- Mise à jour automatique `projects.plan` + `stripe_subscription_id` à la réception du webhook
- Emails transactionnels Stripe : activation abonnement, annulation, facture PDF, échec de paiement
- Prometheus counter `payments_total{event, plan}`
- Catalogue plans Free / Pro (12€/mois) / Team (39€/mois) avec réduction annuelle
- Colonnes Supabase : `stripe_customer_id`, `stripe_subscription_id`, `notify_email`
- Fiches recettes REC-PAY-004, REC-PAY-005, REC-PAY-006

---

## [1.3.0] — 2026-05-20

### Added
- **Service Notifications (BC D)** — Resend (email) + Twilio (SMS)
- `POST /api/notifications/checkpoint` — notification collaborateurs sur nouveau checkpoint
- `POST /api/notifications/sms/verify` — envoi code de vérification SMS
- `POST /api/notifications/test` — endpoint de démonstration jury
- Emails : checkpoint, review request, version approuvée
- Dégradation gracieuse : variables env optionnelles, retourne `{ sent: false }` si non configuré
- Fiches recettes REC-NOTIF-001, REC-NOTIF-002, REC-NOTIF-003

### Fixed
- **Apply to Figma** — `resize()` ignoré sur le nœud root (évite recalcul contraintes BOTTOM, bug nav bar)
- **Apply to Figma** — position/resize ignorés pour les enfants en auto-layout (évite `Cannot resize auto layout child`)
- `package-lock.json` resynchronisé après `bun add resend twilio` (CI `npm ci` était en échec)

---

## [1.2.0] — 2026-03-31

### Added
- **Branch isolation via pages Figma** — `CREATE_BRANCH` crée une page `dg/{branchName}` avec clone de la sélection ; `SWITCH_BRANCH` navigue vers la page correspondante (équivalent `git checkout`)
- **Plan badge interactif** — affiche `FREE`/`PRO`/`TEAM` avec tooltip descriptif ; clic sur FREE ouvre la page pricing
- **Gold status tooltip** — explication "Version validée, référence officielle" sur le badge et le bouton de cycle de statut
- **Lien "Passer à Pro"** — correction du handler `onClick` manquant

### Added (BC02)
- Tests unitaires `openai.service.test.ts` — 10 cas (zero-change, fallback erreur, réponse AI, structure prompt)
- Tests unitaires `svg-generator.service.test.ts` — 19 cas (RECT, ELLIPSE, TEXT, gradients, `findNodeById`)
- Tests unitaires `plugin.middleware.test.ts` — 5 cas (header manquant, clé invalide, clé valide)
- Pipeline CI/CD `.github/workflows/ci.yml` — typecheck → tests → build (backend + plugin)
- Cahier de recettes `docs/RECETTES.md` — 15 fiches REC-XXX-NNN + plan de correction P1-P4

### Added (BC04)
- `docs/openapi.yaml` — spécification OpenAPI 3.0 complète
- `.github/dependabot.yml` — mises à jour hebdomadaires backend, plugin, GitHub Actions
- `/health` enrichi — retourne `version`, `uptime_ms`, `timestamp`

---

## [1.1.0] — 2026-03-15

### Added
- **Diff Viewer** — vue Split et Overlay avec curseur d'opacité
- **Smart Data** — panneau latéral avec deltas chiffrés groupés par nœud
- **Gold Status** — cycle Draft → Review → Approved avec badge visuel
- **Restore** — rollback non-destructif via nouveau checkpoint
- **Node-level diff** — comparaison nœud par nœud avec SVG before/after

### Fixed
- Rendu SVG inline via `dangerouslySetInnerHTML` pour contourner la limite data URI (50KB+)
- Schéma Zod complété — `characters`, `effects`, `rotation`, `gradientStops` n'étaient plus silencieusement supprimés
- Skip fill sur INSTANCE/COMPONENT pour supprimer le bruit de cartes blanches
- Échappement des caractères non-ASCII dans les SVG texte

---

## [1.0.0] — 2026-02-28

### Added
- **Plugin Figma** (Preact + Tailwind + Vite) avec double thread `main.ts` / `ui.tsx`
- **Snapshot natif Figma** — extraction via `absoluteTransform`, `fills`, `vectorPaths` (sans `exportAsync`)
- **Moteur de diff géométrique** — `DiffService` avec epsilon 0.01px sur 20+ propriétés
- **AI Patch Note** — delta JSON → changelog lisible via GPT-4o-mini (jamais le SVG)
- **Timeline** — historique chronologique avec onglets de branches
- **Assets** — organisation par type (UI, logo, icon, packaging, illustration)
- **Auto-init projet** — initialisation depuis `figma.fileKey` sans configuration manuelle
- **Backend HonoJS** déployé sur Railway avec Supabase PostgreSQL
- **Auth X-API-Key** par projet (plugin) + Bearer JWT Supabase (web app)
- **Tests unitaires** `diff.service.test.ts` — 29 cas avec Vitest

### Architecture
- Table `versions` avec `parent_id` → arbre de branches via CTE récursifs PostgreSQL
- Attribution par `figma.currentUser` (id, name, photoUrl) — main thread uniquement
- SVG généré côté serveur depuis `snapshot_json` — jamais envoyé à l'IA

---

## Types de changements

| Type | Description |
|------|-------------|
| `Added` | Nouvelle fonctionnalité |
| `Changed` | Modification d'une fonctionnalité existante |
| `Fixed` | Correction de bug |
| `Removed` | Fonctionnalité supprimée |
| `Security` | Correction de vulnérabilité |
