# BC02 — Concevoir et développer des applications logicielles — Design Guardian

Ce dossier recense les **9 compétences RNCP 39583** (C2.x) du bloc BC02 : démonstration de la capacité à concevoir, tester, sécuriser et déployer une application logicielle complète. Le dossier juxtapose **code réel** (repository, workflows CI/CD, tests, audit de sécurité) et **documentation écrite** ; l'ensemble s'adresse au **jury RNCP** (pas au cours). **Solo assumé** ; architecture **monolithe modulaire Hono** (pas microservices).

## Mapping — 9 compétences BC02 → fichiers + preuves

| Compétence | Livrable | Fichier | Preuve |
|---|---|---|---|
| **C2.1.1** — Déploiement continu + critères qualité/perf | Protocole déploiement continu + critères qualité/perf | `01-environnements-ci-cd.md` | `.github/workflows/ci.yml` |
| **C2.1.2** — Intégration continue | Protocole d'intégration continue | `01-environnements-ci-cd.md` | CI + Quality Gate |
| **C2.2.1** — Architecture + prototype + framework | Architecture + prototype + framework | `02-prototype-architecture.md` | `BC01/01-architecture.md` |
| **C2.2.2** — Harnais tests unitaires | Harnais tests unitaires | `03-tests-unitaires.md` | 300 tests Vitest (181 backend + 119 plugin) |
| **C2.2.3** — Sécurité OWASP + accessibilité OPQUAST | Sécurité OWASP + accessibilité OPQUAST | `04-securite-owasp.md`, `05-accessibilite-opquast.md` | Mesures + audit OPQUAST |
| **C2.2.4** — Historique versions + version viable | Historique versions + déploiement viable | `06-versioning-deploiement.md` | Git + Figma Community approuvé (mai 2026) |
| **C2.3.1** — Cahier de recettes | Cahier de recettes (REC-XXX-001, …) | `07-cahier-recettes.md` | `docs/RECETTES.md` |
| **C2.3.2** — Plan de correction des bogues | Plan de correction des bogues | `08-plan-correction-bogues.md` | Historique git + hotfix |
| **C2.4.1** — Documentation technique (3 manuels) | Doc technique (DEPLOIEMENT / MODE-EMPLOI / MISE-À-JOUR) | `09-doc-technique.md` | Manuels dans repo |

## Périmètre

### Périmètre jury BC02 (ces 9 compétences)
- CI/CD (GitHub Actions, Quality Gate).
- Architecture réelle du produit (HonoJS + Supabase + plugin Figma + webapp Next.js).
- Tests (300 Vitest, couverture ≥ 80 %).
- Sécurité OWASP + accessibilité.
- Versioning git + déploiement viable (Figma Community approuvé).
- Cahier de recettes.
- Plan de correction des bogues.
- Documentation technique d'exploitation.

### Hors périmètre jury (cours M2 / roadmap)
- OAuth ×3 (Google/GitHub/Facebook) + flux SMS : câblés en code (2026-06-22), reste clickops Supabase.
- Mistral (IA FR) : roadmap post-oral.
- Services de secours + Sentry : roadmap post-oral.
- Montée en charge (event-driven + hébergement) : roadmap post-oral.
- Figma REST API SVG (Option 2) : roadmap produit.
