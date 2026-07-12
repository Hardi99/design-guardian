# Dossier BC02 jury (RNCP 39583) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produire le dossier écrit BC02 (`docs/BC02/`) couvrant les 9 compétences C2.1.1→C2.4.1 de la grille jury, appuyé sur le code source réel, + combler les 2 trous (sécurité OWASP, accessibilité OPQUAST) et le manuel de mise à jour.

**Architecture :** Un dossier = README index + 9 fichiers markdown (1 par compétence/groupe), calqué sur `docs/BC01/`. Chaque affirmation pointe vers un fichier/commit RÉEL du repo. Deux tâches touchent le code : fixes accessibilité dans `plugin/src/ui.tsx`, et (optionnel) tests sécurité backend.

**Tech Stack :** Markdown (dossier) · Preact/TypeScript (`plugin/src/ui.tsx`) · Vitest (tests) · HonoJS (backend, preuves).

## Global Constraints

- **Cible = jury RNCP 39583** (grille `24 10 10 …xlsx` onglet « Grille Eval Bloc 2 » + `Référentiel …RNCP39583.pdf` p.7-10). PAS le BC02 du cours (4 flux d'intégration) — hors périmètre.
- **Preuves réelles uniquement** : chaque affirmation cite un `fichier:ligne` ou un commit SHA existant. **Zéro invention.** Si une preuve manque → écrire le gap + l'action, ne rien inventer.
- **Honnêteté jury** : assumer le **solo** et le **monolithe modulaire Hono** (6 domaines, 1 déploiement).
- **Baseline tests vivante** : **300 (181 backend + 119 plugin)** au 2026-07-12, couv. backend 88,02 % stmts / 90,33 % lines / 92,92 % funcs / 75,42 % branches. Si une tâche ajoute des tests → re-mesurer (`npm run test:coverage`) et re-synchroniser partout.
- **Code** : TypeScript strict, **zéro `any`**. `figma.*` main-thread only, HTTP UI-thread only.
- **Commits** : un commit par tâche, message court, terminé par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Ne jamais stager `.devcontainer/`.
- **Accessibilité** : référentiel = **OPQUAST** (acté).

---

## File Structure

```
docs/BC02/
├── README.md                     # T1 — index + mapping C2.x → fichiers
├── 01-environnements-ci-cd.md    # T2 — C2.1.1 + C2.1.2
├── 02-prototype-architecture.md  # T3 — C2.2.1
├── 03-tests-unitaires.md         # T4 — C2.2.2
├── 04-securite-owasp.md          # T5 — C2.2.3 (sécurité)
├── 05-accessibilite-opquast.md   # T6 — C2.2.3 (accessibilité) + fixes ui.tsx
├── 06-versioning-deploiement.md  # T7 — C2.2.4
├── 07-cahier-recettes.md         # T8 — C2.3.1
├── 08-plan-correction-bogues.md  # T10 — C2.3.2
└── 09-doc-technique.md           # T9 — C2.4.1 (index des 3 manuels)
docs/MISE-A-JOUR.md               # T9 — 3ᵉ manuel (mise à jour)
plugin/src/ui.tsx                 # T6 — fixes accessibilité
```

**Preuves déjà repérées (à réutiliser, ne pas re-chercher) :**
- CI/CD : `.github/workflows/ci.yml` · Quality Gate seuil dans `backend/vitest.config.ts` · `.github/dependabot.yml`
- Déploiement : `docs/DEPLOIEMENT.md` (déjà tagué C2.4.1) · `monitoring/` (Prometheus/Grafana)
- Archi/prototype : `docs/BC01/01-architecture.md` · refonte diff `docs/superpowers/specs/2026-06-28-diff-viewer-frame-hero-design.md` · restore clone `docs/superpowers/specs/2026-06-20-restore-clone-design.md`
- Tests : `docs/RECETTES.md` §« Couverture tests automatisés » (table par fichier, déjà resync 300/181)
- Sécurité (ancres réelles) : CORS `backend/src/app.ts:23-26` · webhook Stripe signé `backend/src/controllers/payments.controller.ts:48-54` · middleware clé `backend/src/middleware/plugin.middleware.ts:11-12` · rate-limit `backend/src/controllers/link.controller.ts:17-29` · Zod dans 9 controllers + `backend/src/types/api.ts` · RLS/`security_invoker` : migration du 2026-06-11 (fuite `version_tree`) · Dependabot `.github/dependabot.yml`
- Accessibilité (audit réel `plugin/src/ui.tsx`) : 30 `<button>`, ~20 `aria-label`, plusieurs `aria-pressed` ; **2 `<img>` sans `alt` (L834, L853)** ; **1 seul `onKeyDown`/`tabIndex`** ; inputs bien labellisés (L289-290, L552-553)
- Manuel utilisation existant : `docs/MODE-EMPLOI-PLUGIN.md`
- Bugs réels (C2.3.2) : `git log --oneline` — ex. `00250c7` (AABB absolu rotation), `132a006` (MIME bucket), Zod silencieux (`a0126b0`), SVG data-URI lourd (`da85c8d`), `exportAsync`→props natives (`2076ca8`), clone `dg_history`/`loadAllPagesAsync`

**Convention de vérification (tâches doc)** : pas de tests unitaires — la « vérification » est (a) chaque `fichier:ligne` cité existe (`grep`/ouverture), (b) aucun chiffre de test ≠ 300/181/119, (c) le fichier est lié depuis `README.md`.

---

## Task 1: `docs/BC02/README.md` — index + mapping

**Files:**
- Create: `docs/BC02/README.md`

**Interfaces:**
- Produces: la table de mapping que toutes les autres tâches remplissent (une ligne par compétence → fichier). Modèle : `docs/BC01/README.md`.

- [ ] **Step 1: Écrire le README index**

Contenu (structure exacte) :
- Titre `# BC02 — Concevoir et développer des applications logicielles — Design Guardian`
- Phrase de cadrage : dossier écrit + code source réel ; cible jury RNCP 39583 ; solo + monolithe modulaire assumés.
- Table mapping (colonnes : Compétence | Livrable attendu | Fichier | Preuve principale) avec les 9 lignes :

| Compétence | Livrable | Fichier | Preuve |
|---|---|---|---|
| C2.1.1 | Protocole déploiement continu + critères qualité/perf | `01-environnements-ci-cd.md` | `.github/workflows/ci.yml` |
| C2.1.2 | Protocole d'intégration continue | `01-environnements-ci-cd.md` | CI + Quality Gate |
| C2.2.1 | Archi + prototype + framework | `02-prototype-architecture.md` | `BC01/01-architecture.md` |
| C2.2.2 | Harnais tests unitaires | `03-tests-unitaires.md` | 300 tests Vitest |
| C2.2.3 | Sécurité OWASP + accessibilité | `04-securite-owasp.md`, `05-accessibilite-opquast.md` | mesures + audit OPQUAST |
| C2.2.4 | Historique versions + version viable | `06-versioning-deploiement.md` | git + Figma Community |
| C2.3.1 | Cahier de recettes | `07-cahier-recettes.md` | `docs/RECETTES.md` |
| C2.3.2 | Plan de correction des bogues | `08-plan-correction-bogues.md` | historique git |
| C2.4.1 | Doc technique (3 manuels) | `09-doc-technique.md` | `DEPLOIEMENT`/`MODE-EMPLOI`/`MISE-A-JOUR` |

- Encadré « Périmètre » : ce qui est jury (ces 9) vs hors périmètre (cours).

- [ ] **Step 2: Vérifier**

Run: `ls docs/BC02/README.md && grep -c 'C2\.' docs/BC02/README.md`
Expected: fichier présent, ≥ 9 occurrences de `C2.`.

- [ ] **Step 3: Commit**

```bash
git add docs/BC02/README.md
git commit -m "docs(bc02): index + mapping compétences C2.x

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `01-environnements-ci-cd.md` — C2.1.1 + C2.1.2

**Files:**
- Create: `docs/BC02/01-environnements-ci-cd.md`
- Read (preuves): `.github/workflows/ci.yml`, `backend/vitest.config.ts`, `.github/dependabot.yml`, `docs/DEPLOIEMENT.md`

**Interfaces:**
- Consumes: mapping de T1.
- Produces: référence « protocole CI/CD » citée par T4 (tests) et T7 (versioning).

- [ ] **Step 1: Lire les preuves**

Run: `cat .github/workflows/ci.yml && sed -n '1,40p' backend/vitest.config.ts`
Noter : étapes du workflow (checkout, install, typecheck, test, coverage), déclencheurs (push/PR master), seuils coverage.

- [ ] **Step 2: Écrire le fichier**

Structure exacte :
- `## C2.1.1 — Environnements de déploiement et de test`
  - **Environnement de développement** : éditeur (VS Code), langages (TypeScript strict), gestion de sources (Git/GitHub), gestionnaire de paquets (npm), runner de tests (Vitest), serveur d'app (HonoJS `@hono/node-server`), compilateur (`tsc`).
  - **Outils de suivi qualité/perf** : Prometheus/Grafana (`monitoring/`), `/metrics` `/health` `/ping`, couverture Vitest.
  - **Protocole de déploiement continu** (séquences) : `git push master` → GitHub Actions (typecheck + tests + coverage) → si vert, Railway auto-deploy. Citer `docs/DEPLOIEMENT.md` §pipeline.
  - **Critères de qualité/performance** : Quality Gate ≥ 80 % (seuil `backend/vitest.config.ts:LIGNE`), 0 test rouge, health check.
- `## C2.1.2 — Intégration continue`
  - Protocole IC : fusion des branches → CI à chaque push/PR → séquences (install → typecheck → test → coverage → gate). Citer `.github/workflows/ci.yml` (nom du job + steps).
  - Dependabot `.github/dependabot.yml` (mises à jour régulières testées par la CI).

Chaque affirmation → `fichier:ligne`.

- [ ] **Step 3: Vérifier**

Run: `grep -oE '[a-zA-Z0-9_./-]+\.(ts|yml|md):[0-9]+' docs/BC02/01-environnements-ci-cd.md | sort -u`
Puis ouvrir 2-3 ancres au hasard pour confirmer qu'elles existent. Aucun chiffre de test ≠ 300/181/119.

- [ ] **Step 4: Commit**

```bash
git add docs/BC02/01-environnements-ci-cd.md
git commit -m "docs(bc02): C2.1.1/C2.1.2 environnements + CI/CD

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `02-prototype-architecture.md` — C2.2.1

**Files:**
- Create: `docs/BC02/02-prototype-architecture.md`
- Read (preuves): `docs/BC01/01-architecture.md`, spec frame-héros, spec restore-clone, `docs/MODE-EMPLOI-PLUGIN.md`

**Interfaces:**
- Consumes: mapping T1.
- Produces: description du prototype réutilisée par T6 (versioning) et T8 (recettes).

- [ ] **Step 1: Écrire le fichier**

Structure exacte (critères grille : bonnes pratiques, prototype fonctionnel, user stories, composants UI, sécurité) :
- `## Architecture maintenable` : monolithe modulaire Hono (6 domaines), séparation **Service/Controller** (citer 2-3 paires réelles, ex. `diff.service.ts` ↔ `branches.controller.ts`), double-thread Figma (`main.ts` API-only ↔ `ui.tsx` HTTP-only). Renvoyer à `docs/BC01/01-architecture.md`.
- `## Prototype fonctionnel` : plugin Preact approuvé Figma Community (mai 2026). Fonctionnalités principales : capture checkpoint, diff viewer (frame-héros + clic-pour-révéler), AI Patch Note, restore. **Preuve d'itération réelle** : refonte diff-viewer (spec `2026-06-28-diff-viewer-frame-hero-design.md`, « héros = Frame, pas de liste ») + restore lossless par `node.clone()`/`dg/_history` (spec `2026-06-20-restore-clone-design.md`).
- `## Framework & paradigmes` : Preact (composants), Zustand + useReducer (état), fonctions pures testées (`diffReducer`, `restoreDiff`, `restoreClone`), `create-figma-plugin`.
- `## Composants d'interface` : citer les écrans (Home/Timeline, DiffScreen `HighlightCanvas`/`NodeDetail`/`DiffChips`, badge plan). Renvoyer à `docs/MODE-EMPLOI-PLUGIN.md`.
- `## Exigences de sécurité (prototype)` : auth Supabase + JWT, X-API-Key par projet, token en `figma.clientStorage`. Renvoi vers `04-securite-owasp.md`.

- [ ] **Step 2: Vérifier**

Run: `grep -nE 'service|controller|main\.ts|ui\.tsx' docs/BC02/02-prototype-architecture.md | head`
Confirmer que les paires Service/Controller citées existent : `ls backend/src/services/diff.service.ts backend/src/controllers/branches.controller.ts`.

- [ ] **Step 3: Commit**

```bash
git add docs/BC02/02-prototype-architecture.md
git commit -m "docs(bc02): C2.2.1 prototype + architecture

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `03-tests-unitaires.md` — C2.2.2

**Files:**
- Create: `docs/BC02/03-tests-unitaires.md`
- Read (preuves): `docs/RECETTES.md` (§Couverture), `backend/vitest.config.ts`

**Interfaces:**
- Consumes: baseline 300/181/119 (Global Constraints).
- Produces: rien (feuille).

- [ ] **Step 1: Écrire le fichier**

Structure :
- `## Pyramide de tests` : base = unitaires purs (services/reducers), intermédiaire = controllers (intégration API : `branches`/`checkpoints`/`link.controller`), sommet = recette manuelle (`07-cahier-recettes.md`).
- `## Harnais Vitest` : **300 tests (181 backend + 119 plugin)**, ≥ 80 % (couv. backend 88,02 % stmts / 90,33 % lines / 92,92 % funcs / 75,42 % branches, mesurée 2026-07-12). Quality Gate natif (`backend/vitest.config.ts`).
- `## Couverture par service` : **réutiliser telle quelle** la table de `docs/RECETTES.md` (§« Couverture tests automatisés ») — ne pas la ré-inventer, y renvoyer + coller le tableau backend (21 fichiers) et la ligne plugin (12 fichiers).
- `## Prévention des régressions` : tests exécutés à chaque push/PR (CI), exemples de tests-régression réels (ex. `diff.service` EPS boundary, `restoreDiff` ε=0.01).

- [ ] **Step 2: Vérifier la cohérence des chiffres**

Run: `grep -oE '[0-9]{2,3}' docs/BC02/03-tests-unitaires.md | sort -u`
Expected: on ne doit voir que 300/181/119/80/88/90/92/75/21/12 (et années). Aucun 199/257/307/188.

- [ ] **Step 3: Commit**

```bash
git add docs/BC02/03-tests-unitaires.md
git commit -m "docs(bc02): C2.2.2 harnais de tests unitaires

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `04-securite-owasp.md` — C2.2.3 (sécurité)

**Files:**
- Create: `docs/BC02/04-securite-owasp.md`
- Read (preuves): ancres sécurité listées dans File Structure.

**Interfaces:**
- Consumes: mapping T1.
- Produces: référence sécurité citée par T3 et T8.

- [ ] **Step 1: Confirmer chaque ancre**

Run:
```bash
sed -n '20,30p' backend/src/app.ts                       # CORS
sed -n '45,60p' backend/src/controllers/payments.controller.ts  # webhook signé
sed -n '5,20p' backend/src/middleware/plugin.middleware.ts      # X-API-Key
sed -n '15,30p' backend/src/controllers/link.controller.ts      # rate-limit
```
Noter le `fichier:ligne` exact de chaque mesure.

- [ ] **Step 2: Écrire le tableau OWASP Top 10 (2021)**

`## OWASP Top 10 (2021) — mesures Design Guardian` : table (Risque | Mesure DG | Preuve `fichier:ligne`/commit | Statut) avec les 10 lignes. Base honnête :
- A01 Broken Access Control → RLS + `security_invoker` (migration 2026-06-11, fuite `version_tree` corrigée) + X-API-Key `plugin.middleware.ts:11` + garde cross-tenant (`ownership.service`, tests `branches.controller.test.ts`)
- A02 Cryptographic Failures → HTTPS (Railway/Supabase) + JWT signés + secrets en env (`backend/src/config/env.ts`, jamais en repo)
- A03 Injection → requêtes paramétrées Supabase + **validation Zod** (9 controllers, `backend/src/types/api.ts`)
- A04 Insecure Design → séparation Service/Controller + monolithe modulaire + rate-limit `link.controller.ts:17` + moindre privilège (PAT read-only)
- A05 Security Misconfiguration → CORS `app.ts:23` + `REVOKE anon`/`REVOKE profiles` + pas de stack-trace prod
- A06 Vulnerable Components → **Dependabot** `.github/dependabot.yml` + `npm audit` en CI
- A07 Auth Failures → Supabase Auth (JWT/OAuth) + Leaked Password Protection (HaveIBeenPwned)
- A08 Data Integrity Failures → **webhook Stripe signé** `payments.controller.ts:54` + Quality Gate CI
- A09 Logging/Monitoring → `hono/logger` + Prometheus/Grafana + `/health` `/ping` (+ cible Loki)
- A10 SSRF → aucun fetch d'URL utilisateur serveur ; sorties fixes (OpenAI/Stripe/Resend/Twilio)

`## Points d'amélioration` : lister honnêtement les manques (ex. en-têtes de sécurité type CSP/HSTS explicites, rate-limit global au-delà de `link`) → décision (fait / backlog justifié). **Ne rien surévaluer.**

- [ ] **Step 3: Vérifier**

Run: `grep -cE 'A0[1-9]|A10' docs/BC02/04-securite-owasp.md`
Expected: ≥ 10. Puis ouvrir 3 ancres citées pour confirmer.

- [ ] **Step 4: Commit**

```bash
git add docs/BC02/04-securite-owasp.md
git commit -m "docs(bc02): C2.2.3 sécurité — mapping OWASP Top 10

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `05-accessibilite-opquast.md` + fixes `ui.tsx` — C2.2.3 (accessibilité)

**Files:**
- Modify: `plugin/src/ui.tsx` (fixes a11y réels)
- Create: `docs/BC02/05-accessibilite-opquast.md`
- Test: `plugin/` build + typecheck

**Interfaces:**
- Consumes: audit a11y (File Structure).
- Produces: tableau « avant/après » cité dans le dossier.

- [ ] **Step 1: Confirmer l'audit sur le code actuel**

Run:
```bash
grep -nE '<img' plugin/src/ui.tsx
grep -cnE 'onKeyDown|tabIndex' plugin/src/ui.tsx
grep -nE '<button' plugin/src/ui.tsx | wc -l
```
Attendu : 2 `<img>` (L834, L853) sans `alt` ; peu de gestion clavier ; 30 boutons.

- [ ] **Step 2: Fix #1 — alternatives textuelles sur les images de rendu**

Dans `plugin/src/ui.tsx`, ajouter un `alt` descriptif aux 2 `<img>` (rendus de frame). Exemple L853 :
```tsx
if (kind === 'png') return <img src={url} alt="Rendu de la frame" class="w-full h-full object-contain" style={{ pointerEvents: 'none' }} />;
```
Et L834 (image de fond du canvas) : `alt=""` (décorative, doublée par les surlignages) OU `alt="Aperçu de la frame"`. Choisir selon rôle : le canvas cliquable = informatif → `alt="Aperçu de la frame comparée"`.

- [ ] **Step 3: Fix #2 — vérifier les boutons icône-seul**

Run: `grep -nE '<button' plugin/src/ui.tsx` puis inspecter chaque bouton sans texte visible : s'assurer qu'il a `aria-label`. Ajouter `aria-label` là où il manque (les toggles ont déjà `aria-pressed` ; compléter le label si absent). Ne pas dupliquer un label là où un texte existe déjà.

- [ ] **Step 4: Vérifier build + typecheck (pas de régression)**

Run (depuis `plugin/`): `npm run typecheck && npm test && npm run build`
Expected: typecheck clean, **119 tests** verts, build OK.

- [ ] **Step 5: Écrire le fichier dossier**

Structure :
- `## Référentiel choisi — OPQUAST` : présenter (240 bonnes pratiques qualité web) + **justifier** vs RGAA/WCAG : UI custom de plugin (pas un site public réglementé), pragmatisme, délai. Assumer que ce n'est pas une conformité RGAA légale.
- `## Audit` : table (Bonne pratique OPQUAST | État avant | Action | État après) avec les cas RÉELS : images sans alternative (2 `<img>` → `alt` ajouté), boutons icône (aria-label vérifiés), labels de champs (déjà OK, `htmlFor`/`id` L289-290 L552-553), états de bascule (`aria-pressed` présents), contraste (constat visuel).
- `## Limites assumées` : navigation clavier avancée partielle (webview Figma contraint), pas d'audit lecteur d'écran complet.

- [ ] **Step 6: Commit**

```bash
git add plugin/src/ui.tsx docs/BC02/05-accessibilite-opquast.md
git commit -m "docs(bc02): C2.2.3 accessibilité OPQUAST + fixes alt/aria ui.tsx

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `06-versioning-deploiement.md` — C2.2.4

**Files:**
- Create: `docs/BC02/06-versioning-deploiement.md`
- Read (preuves): `CHANGELOG.md`, `git log`, spec restore-clone

**Interfaces:**
- Consumes: T3 (prototype).
- Produces: rien (feuille).

- [ ] **Step 1: Écrire le fichier**

Structure (critères : système de versions, évolutions tracées, logiciel manipulable en autonomie) :
- `## Gestion de versions` : Git/GitHub (commits conventionnels datés) + versioning sémantique (`CHANGELOG.md`).
- `## Évolutions tracées` : deux niveaux — (1) code via Git/CHANGELOG, (2) **design via le produit lui-même** (checkpoints, `dg/_history` clone lossless, restore). C'est le cœur métier : Design Guardian versionne le design. Citer spec `2026-06-20-restore-clone-design.md`.
- `## Dernière version fonctionnelle et viable` : plugin **approuvé Figma Community (mai 2026)**, early adopter actif. Manipulable en autonomie → renvoyer à `docs/MODE-EMPLOI-PLUGIN.md`.
- `## Déploiement progressif` : push → CI → Railway (renvoi `01-environnements-ci-cd.md`).
- **Note** : préciser que `branches.controller` est le hub diff/versions (endpoints `/tree`, `/versions/:id`, `/status`, `/snapshot`, `/restore`), pas un vestige « branches ».

- [ ] **Step 2: Vérifier**

Run: `test -f CHANGELOG.md && echo ok && git log --oneline -3`
Confirmer que les commits/tags cités existent.

- [ ] **Step 3: Commit**

```bash
git add docs/BC02/06-versioning-deploiement.md
git commit -m "docs(bc02): C2.2.4 versioning + déploiement progressif

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `07-cahier-recettes.md` — C2.3.1

**Files:**
- Create: `docs/BC02/07-cahier-recettes.md`
- Read (preuves): `docs/RECETTES.md`

**Interfaces:**
- Consumes: `docs/RECETTES.md` (23 fiches REC + plan P1-P4).
- Produces: référence recette citée par T10 (bogues).

- [ ] **Step 1: Écrire le fichier**

Structure (critère : reprend TOUTES les fonctionnalités ; tests **fonctionnels, structurels ET sécurité**) :
- `## Cahier de recettes` : renvoyer au document maître `docs/RECETTES.md` (méthodo + 23 fiches REC-XXX par module : AUTH, IA, PAIEMENT, NOTIF, VERSIONING, BRANCHES).
- `## Types de tests couverts` : mapper explicitement les 3 familles exigées :
  - **Fonctionnels** : REC-VER-*, REC-IA-*, REC-BR-* (parcours utilisateur).
  - **Structurels** : tests controllers automatisés (`branches`/`checkpoints`/`link.controller.test.ts`) — intégration API.
  - **Sécurité** : REC-AUTH-003 (serveur inaccessible), garde cross-tenant (test `branches.controller` 403), limite plan (test `checkpoints.controller` 403), rate-limit `link`. Renvoyer à `04-securite-owasp.md`.
- `## Plan d'anomalies` : reprendre la table P1<4h / P2<24h / P3<1sem / P4 backlog de `RECETTES.md`.

- [ ] **Step 2: Vérifier**

Run: `grep -cE 'REC-' docs/RECETTES.md` (confirme la source), puis `grep -nE 'fonctionnel|structurel|sécurité' docs/BC02/07-cahier-recettes.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/BC02/07-cahier-recettes.md
git commit -m "docs(bc02): C2.3.1 cahier de recettes (fonctionnel/structurel/sécurité)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: `docs/MISE-A-JOUR.md` (3ᵉ manuel) + `09-doc-technique.md` — C2.4.1

**Files:**
- Create: `docs/MISE-A-JOUR.md`
- Create: `docs/BC02/09-doc-technique.md`
- Read (preuves): `docs/DEPLOIEMENT.md`, `docs/MODE-EMPLOI-PLUGIN.md`, `supabase/migrations/`, `CHANGELOG.md`

**Interfaces:**
- Consumes: manuels existants (déploiement, utilisation).
- Produces: le 3ᵉ manuel qui complète C2.4.1.

- [ ] **Step 1: Écrire `docs/MISE-A-JOUR.md` (manuel de mise à jour)**

Structure :
- `## Versioning` : semver, où est tracé (`CHANGELOG.md`).
- `## Mettre à jour le backend` : `git push master` → CI → Railway auto-deploy ; **rollback < 5 min** (redeploy commit précédent sur Railway).
- `## Migrations base de données` : procédure d'application des migrations Supabase (`supabase/migrations/` ; ex. « appliquer 013 » comme cas réel du backlog), ordre, vérification.
- `## Mettre à jour le plugin` : rebuild (`npm run build`), publication sur Figma Community, versionnement du manifest.
- `## Dépendances` : Dependabot ouvre des PR → CI valide → merge.

- [ ] **Step 2: Écrire `docs/BC02/09-doc-technique.md` (index des 3 manuels)**

`## Documentation technique d'exploitation` : table des 3 manuels avec lien + 1 phrase chacun + les choix techno décrits :
- Manuel de **déploiement** → `docs/DEPLOIEMENT.md`
- Manuel d'**utilisation** → `docs/MODE-EMPLOI-PLUGIN.md`
- Manuel de **mise à jour** → `docs/MISE-A-JOUR.md`
Ajouter un paragraphe « choix de technologies » (HonoJS, Supabase, Railway, Preact, OpenAI) et pourquoi (renvoi `BC01/01-architecture.md`).

- [ ] **Step 3: Vérifier**

Run: `ls docs/MISE-A-JOUR.md docs/DEPLOIEMENT.md docs/MODE-EMPLOI-PLUGIN.md`
Expected: les 3 présents (les 3 manuels exigés existent).

- [ ] **Step 4: Commit**

```bash
git add docs/MISE-A-JOUR.md docs/BC02/09-doc-technique.md
git commit -m "docs(bc02): C2.4.1 manuel de mise à jour + index doc technique

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: `08-plan-correction-bogues.md` — C2.3.2

**Files:**
- Create: `docs/BC02/08-plan-correction-bogues.md`
- Read (preuves): `git log`, `docs/RECETTES.md` (plan P1-P4)

**Interfaces:**
- Consumes: plan d'anomalies de T8.
- Produces: rien (feuille).

- [ ] **Step 1: Extraire les bugs réels**

Run: `git log --oneline --grep='fix' -20`
Sélectionner 5-6 bugs RÉELS représentatifs, ex. :
- Zod supprimait silencieusement des champs (`a0126b0`) — détection : champs absents en BDD.
- SVG data-URI lourd échoue dans le webview (`da85c8d`) — fix `dangerouslySetInnerHTML`+`atob`.
- `figma.mixed` non sérialisable (cornerRadius/strokeWeight) — fix guards `safeNum/safeStr`.
- MIME bucket `snapshots` rejette `image/png` (`132a006`).
- AABB absolu sur nœuds pivotés (`00250c7`).
- Clone `dg_history` casse → `loadAllPagesAsync` requis (dynamic-page).

- [ ] **Step 2: Écrire le fichier**

Structure (critères : détectés, qualifiés, traités + analyse d'amélioration) :
- `## Plan de qualification` : reprendre P1/P2/P3/P4 (délais) de `RECETTES.md`.
- `## Fiches de bogues traités` : une fiche par bug (table : ID | Symptôme | Cause racine | Priorité | Correctif (commit) | Amélioration). Chaque commit doit exister (`git show <sha> --stat`).
- `## Analyse des points d'amélioration` : pour 2-3 bugs, la règle tirée (ex. « champ absent en BDD → vérifier le schéma Zod en premier » ; « SVG lourds → transport blob+URL signée »).

- [ ] **Step 3: Vérifier que les commits cités existent**

Run: `for sha in a0126b0 da85c8d 132a006 00250c7; do git show -s --oneline $sha 2>/dev/null || echo "MANQUE $sha"; done`
Expected: aucun « MANQUE ». Si un SHA n'existe pas, le remplacer par un vrai trouvé via `git log --grep`.

- [ ] **Step 4: Commit**

```bash
git add docs/BC02/08-plan-correction-bogues.md
git commit -m "docs(bc02): C2.3.2 plan de correction des bogues

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Passe de cohérence finale + vérification globale

**Files:**
- Modify: potentiellement `docs/BC02/README.md` (compléter des liens)

- [ ] **Step 1: Cohérence des chiffres**

Run: `grep -rnE '\b(199|247|257|275|307|188|166|109|142|123)\b' docs/BC02 docs/MISE-A-JOUR.md`
Expected: aucun résultat (que du 300/181/119 dans les docs BC02).

- [ ] **Step 2: Tous les fichiers existent et sont liés**

Run: `ls docs/BC02/ && grep -oE '[0-9]{2}-[a-z-]+\.md' docs/BC02/README.md | sort -u`
Expected: les 9 fichiers `NN-*.md` existent ET sont référencés dans le README.

- [ ] **Step 3: Vérification code globale (aucune régression introduite par T6)**

Run:
```bash
cd backend && npm run typecheck && npm run test:run
cd ../plugin && npm run typecheck && npm test && npm run build
```
Expected: backend **181** verts, plugin **119** verts, build OK.

- [ ] **Step 4: Commit final (si ajustements)**

```bash
git add docs/BC02/README.md
git commit -m "docs(bc02): passe de cohérence finale du dossier

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (fait par l'auteur du plan)

- **Couverture spec** : C2.1.1→T2 · C2.1.2→T2 · C2.2.1→T3 · C2.2.2→T4 · C2.2.3→T5+T6 · C2.2.4→T7 · C2.3.1→T8 · C2.3.2→T10 · C2.4.1→T9. README→T1, cohérence→T11. **9/9 compétences couvertes.**
- **Chantiers réels** : OWASP (T5), accessibilité + fixes `ui.tsx` (T6), manuel MAJ (T9), fiches bugs (T10). ✅
- **Nettoyage block_moves** : fait avant le plan (baseline 300). ✅
- **Placeholders** : aucune tâche ne dit « TBD » ; chaque tâche doc a structure + ancres réelles + vérif. Les fixes T6 ont du code concret.
- **Cohérence des types/chiffres** : baseline 300/181/119 rappelée en Global Constraints et vérifiée en T4 + T11.
