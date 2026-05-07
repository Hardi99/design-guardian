# Changelog

Toutes les modifications notables sont documentées ici.
Format basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).
Versioning [Semver](https://semver.org/lang/fr/).

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
