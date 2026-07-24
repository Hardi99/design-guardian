# C2.2.4 — Historique des versions et version viable — Design Guardian

> Compétence RNCP 39583 C2.2.4 — « Mettre en place un système de gestion de versions, retraçant l'historique des évolutions du logiciel, disponible aux collaborateurs autorisés » + « livrer une dernière version fonctionnelle et viable du logiciel manipulable en autonomie ». Preuves : `CHANGELOG.md`, `git log`, la spécification de conception « restore clone », `docs/MODE-EMPLOI-PLUGIN.md`.

---

## Gestion de versions

**Code** — Git + GitHub, commits conventionnels (`type(scope): sujet`), historique daté et consultable :

```
76009d8 2026-07-13 docs(bc02): C2.2.3 accessibilité OPQUAST + fixes alt/aria ui.tsx
8f7fff2 2026-07-12 refactor: remove dead block_moves feature + resync test counts
5ab7c0a 2026-06-28 feat(diff): canvas states + approximate badge + T7 dead-code cleanup
dfd0dab 2026-06-28 fix(diff): capture absolute AABB so highlights/crops align on rotated nodes
1200670 2026-06-28 fix(diff): clearer before/after segmented toggle (active = current view)
```

Types utilisés en pratique : `feat`, `fix`, `docs`, `refactor` — préfixe cohérent sur l'ensemble de l'historique (`git log --oneline`), pas une convention affichée une fois puis abandonnée.

**Produit** — versioning sémantique (Semver) documenté dans `CHANGELOG.md` (format [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)), une entrée par palier fonctionnel :

| Version | Date | Contenu principal | Réf. |
|---|---|---|---|
| `1.5.0` | 2026-06-10 | Dashboard billing webapp, AI Patch Note asynchrone, CORS configurable | `CHANGELOG.md:9-34` |
| `1.4.0` | 2026-05-22 | Service Paiements (Stripe Checkout/portal/webhooks) | `CHANGELOG.md:37-49` |
| `1.3.0` | 2026-05-20 | Service Notifications (Resend + Twilio) | `CHANGELOG.md:52-67` |
| `1.2.0` | 2026-03-31 | Branch isolation via pages Figma, pipeline CI/CD, cahier de recettes | `CHANGELOG.md:70-89` |
| `1.1.0` | 2026-03-15 | Diff Viewer, Smart Data, Gold Status, Restore | `CHANGELOG.md:92-106` |
| `1.0.0` | 2026-02-28 | Plugin Figma initial, moteur de diff géométrique, AI Patch Note | `CHANGELOG.md:109-127` |

Chaque entrée est catégorisée `Added` / `Changed` / `Fixed` / `Removed` / `Security` (table de référence `CHANGELOG.md:130-138`) — permet de distinguer une évolution fonctionnelle d'une correction ou d'un retrait, condition pour qu'un historique de versions soit exploitable et pas juste une liste de commits bruts.

---

## Évolutions tracées

Design Guardian trace les évolutions à **deux niveaux distincts**, parce que le produit versionne à la fois son propre code *et* les designs de ses utilisateurs — c'est le cœur métier, pas un détail d'implémentation.

### 1. Évolutions du code (le logiciel lui-même)

Git (commits) + `CHANGELOG.md` (paliers Semver), décrits ci-dessus. Historique disponible à tout collaborateur autorisé via le repository GitHub.

### 2. Évolutions du design (ce que le produit versionne pour l'utilisateur final)

C'est la fonction produit : chaque **checkpoint** capturé par un designer dans le plugin est un point d'historique — auteur (`figma.currentUser`), horodatage, résumé IA (AI Patch Note), diff géométrique contre la version précédente (tolérance 0,01px). Deux mécanismes assurent que cet historique reste manipulable, pas juste consultable :

- **Diff/changelog** — `DiffService` compare deux snapshots propriété par propriété ; le résultat alimente à la fois le Diff Viewer (Split/Overlay/Nodes) et l'AI Patch Note. Détail : `docs/BC02/02-prototype-architecture.md` §2.
- **Restore lossless** — depuis la refonte documentée dans la spécification de conception « restore clone », chaque checkpoint sauvegardé avec succès est aussi **cloné** sur une page dédiée `dg/_history` (`plugin/src/main.ts:425` — `HISTORY_PAGE`), taggé par version/asset/numéro de version (`plugin/src/main.ts:453-460`), et élagué aux `N` clones les plus récents par asset (`framesToPrune`, `plugin/src/restoreClone.ts`).
  Au restore, le plugin réutilise ce clone tel quel (préservation garantie par le moteur Figma — variables, styles, instances, auto-layout — plutôt que par une réapplication champ-par-champ) ; en son absence (checkpoint ancien, élagué), il retombe sur la reconstruction par propriétés (`handleRestoreToFigma`), sans régression. Fonctions pures testées séparément de la glue Figma : `plugin/src/restoreClone.test.ts`.

Ce second niveau est ce qui distingue Design Guardian d'un simple journal de commits : l'historique n'est pas seulement *lisible* (résumé IA, diff visuel), il est **manipulable en autonomie** par le designer — il peut revenir à un état antérieur sans intervention technique.

---

## Dernière version fonctionnelle et viable

Le plugin est **approuvé Figma Community depuis mai 2026** (`docs/BC02/02-prototype-architecture.md:3,47`) et compte un **early adopter actif** (designer UX/UI externe utilisant le produit en conditions réelles) — c'est la preuve d'usage la plus forte disponible : un tiers non impliqué dans le développement a validé que le logiciel est installable, utilisable et fonctionnel sans accompagnement du développeur.

**Manipulable en autonomie** : `docs/MODE-EMPLOI-PLUGIN.md` documente chaque commande (capturer, créer une branche, changer de branche, restaurer, diff viewer, statut Gold) avec le comportement attendu — utilisable comme guide d'onboarding par un designer qui n'a jamais vu le code, et comme check-list de non-régression pour le développeur.

**Baseline qualité de cette version** : 300 tests Vitest (181 backend + 119 plugin), Quality Gate CI ≥ 80 % de couverture (`docs/BC02/03-tests-unitaires.md`, `docs/BC02/01-environnements-ci-cd.md`).

---

## Déploiement progressif

Chaque évolution suit le même chemin avant d'atteindre la production — décrit en détail dans `docs/BC02/01-environnements-ci-cd.md` :

```
git push master → GitHub Actions (typecheck → tests+coverage ≥80% → build) → Railway auto-deploy → /health
```

Aucun déploiement ne contourne ce chemin : la CI est le seul déclencheur du déploiement Railway (pas de déploiement manuel documenté), et la Quality Gate ≥ 80 % bloque la fusion avant même d'atteindre le déploiement. Détail des étapes, secrets, seuils et Dependabot : `docs/BC02/01-environnements-ci-cd.md` §C2.1.1/C2.1.2.

---

## Note — `branches.controller.ts` n'est pas un vestige

Le nom du fichier (`backend/src/controllers/branches.controller.ts`) date de l'époque où les branches étaient positionnées comme fonctionnalité héroïque ; depuis le pivot de juin 2026 (recentrage sur diff + changelog + restore, cf. mémoire projet), son rôle réel est celui de **hub diff/versions** — il porte les endpoints centraux de tout le versioning produit :

| Endpoint | Rôle | Réf. |
|---|---|---|
| `GET /tree` | Historique complet d'un asset (liste des versions + branches) | `branches.controller.ts:31-54` |
| `GET /versions/:id` | Détail d'une version : snapshot, delta, SVG avant/après, crops par nœud | `branches.controller.ts:60-220` |
| `POST /versions/:id/restore` | Restore explicable — crée un nouveau checkpoint depuis une version passée, diff contre le head de la branche cible, AI Patch Note fire-and-forget | `branches.controller.ts:229-302` |
| `GET /versions/:id/snapshot` | Snapshot brut d'une version (consommé par le restore côté canvas) | `branches.controller.ts:309-325` |
| `PUT /versions/:id/status` | Cycle Gold status (`draft → review → approved`) | `branches.controller.ts:331-353` |

Le nom du fichier est un vestige de nommage, pas le signe d'une fonctionnalité morte — une re-dénomination (`versions.controller.ts`) est identifiée comme cosmétique et volontairement non tranchée dans le backlog (« re-scoping éventuel... non inclus : risque/portée, à trancher séparément », le plan de conception « backend audit fixes »).
