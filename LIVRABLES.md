# Livrables M2 — Design Guardian

> Référence de suivi pour la soutenance. Chaque livrable est classé par bloc de compétence.
> Statuts : ✅ Fait · ⚠️ Partiel · ❌ À faire

---

## BC01 — Cadrage Projet (25%)

### 1. Cartographie des parties prenantes ❌
- Commanditaire, utilisateurs finaux (UX designers, illustrateurs, packaging designers), équipes techniques
- Matrice influence / intérêt (4 quadrants)
- **Contenu Design Guardian** : designer freelance (early adopter), étudiants M2, jury soutenance, Figma platform

### 2. Analyse de la demande et des besoins ❌
- Contexte : Figma Version History trop vague, Branches réservé aux plans Organization (~45$/mois/user)
- Problématique : aucun outil de diff géométrique précis, accessible, avec attribution et approbation
- Objectifs SMART (ex. "Atteindre 10 utilisateurs actifs en 1 mois post-lancement")
- Périmètre MVP vs hors-scope
- Contraintes : plugin Figma (sandbox, double thread), pas de `exportAsync` en dev mode

### 3. Étude de faisabilité ❌
- **Technique** : Figma Plugin API, HonoJS, Supabase, Railway, OpenAI
- **Organisationnelle** : projet solo, planning M2, dépendance Figma platform
- **Économique** : coûts infra (Railway ~5$/mois, Supabase free tier, OpenAI ~0.002$/req), ROI freemium

### 4. Cartographie des risques ❌
- Matrice criticité 5×5
- Risques identifiés :
  - Figma change l'API Plugin → perte de `absoluteTransform`
  - `exportAsync` indisponible en dev → résolu (reconstruction backend)
  - OpenAI latence / coût / quota
  - Adoption faible (concurrent Figma natif)
- Plan de mitigation pour chaque risque critique

### 5. Veille technologique et réglementaire ❌
- État de l'art IA générative (GPT-4o-mini vs Gemini Flash vs Claude Haiku)
- Comparatif auth : Supabase Auth vs Auth0 vs Better-Auth
- Comparatif paiement : Lemon Squeezy vs Paddle vs Stripe (MoR, TVA EU auto)
- RGPD : données utilisateur stockées (figma_id, name, avatar_url), droit à l'oubli
- AI Act européen : usage IA générative dans un outil professionnel
- DSP2/PSD2 : paiements récurrents

### 6. Étude comparative des solutions techniques ❌
- 2-3 alternatives par composant clé avec tableau (coût / perf / sécurité / maintenabilité)
- Composants à couvrir : backend runtime, base de données, hébergement, diff engine, SVG rendering
- **Décisions déjà documentées** : abandons exportAsync, SVG_STRING, Cloudflare Workers (CPU limit)

### 7. Estimation des charges et budget prévisionnel ❌
- Décomposition par service (auth, IA, notifications, paiements, frontend, infra)
- Méthode : Planning Poker ou PERT
- Budget détaillé : infrastructure, services tiers (Railway, Supabase, OpenAI, Resend/Twilio), dev, maintenance
- Coût réel vs estimé

### 8. Architecture logicielle ⚠️
- ✅ `PIPELINE.md` — pipeline SVG détaillé (extraction → diff → IA → SVG → affichage)
- ❌ Diagramme architecture globale microservices (Draw.io ou Mermaid)
- ❌ Flux de données inter-services
- ❌ Diagrammes de séquence (ex. capture checkpoint, ouverture diff, upgrade plan)
- ❌ Patterns architecturaux justifiés (double thread Figma, DAG versions, CTE récursifs)
- ❌ Sécurité (X-API-Key, RLS Supabase, secrets Railway)
- **Base disponible** : CLAUDE.md architecture section, commits git, PIPELINE.md

### 9. Dossier de présentation client (15-20 slides) ❌
- Contexte → Problématique → Solution → Architecture → Planning → Budget → Risques → Prochaines étapes
- **Angle Design Guardian** : "Figma Version History sans la précision. Figma Branches sans le prix."
- Tableau comparatif vs concurrents (Figma VH, Figma Branches, Abstract)
- Demo screenshot du diff viewer (node-level cards)
- Modèle économique freemium (Free 10 checkpoints / Pro illimité / Team collaboration)

---

## BC02 — Tests & Documentation Technique (25%)

### 1. Stratégie de tests ⚠️
- ✅ Vitest configuré (`test`, `test:run`, `test:coverage`)
- ❌ Document formel : pyramide des tests, couverture cible 80% min, justification des outils
- ❌ Politique de tests avant merge (branch protection rule GitHub)
- ❌ Environnements définis (local, staging Railway, prod)

### 2. Tests unitaires par service ⚠️
- ✅ `diff.service.ts` — 29 tests (géométrie, couleurs, opacité, strokeWeight, cornerRadius, vectorPaths, arbre, totalChanges)
- ❌ Auth : JWT validation, OAuth mocks, hachage mdp
- ❌ BDD : CRUD Supabase, validation schemas Zod
- ❌ IA : formatage prompt, parsing réponse OpenAI, gestion erreurs (mocks)
- ❌ Paiements : webhooks Lemon Squeezy, calcul plans, upgrade/downgrade
- ❌ Notifications : formatage emails, templating, envoi (mock Resend)
- ❌ SVG generator : `generateSvgFromSnapshot`, `findNodeById`, `generateSvgFromNode`

### 3. Tests d'intégration ❌
- Inscription → Auth → BDD → Notification email
- Connexion OAuth → Provider → BDD
- Souscription → Paiement → BDD → Notification
- Capture checkpoint → IA → BDD → réponse plugin
- Ouverture diff → SVG generation → réponse frontend

### 4. Cahier de recettes ❌
- Fiches de test format : `REC-[SERVICE]-001`
- Champs : ID · Fonctionnalité · Préconditions · Étapes · Résultat attendu · Résultat obtenu · Statut
- Cas obligatoires : Auth (OAuth + email), Paiement (webhook + upgrade), IA (génération diff + patch note)
- **Base disponible** : tests manuels déjà effectués (ellipse, frame complexe)

### 5. Plan de correction des anomalies ❌
- P1 Critique → résolution < 4h (ex. plugin crash, API down)
- P2 Majeur → résolution < 24h (ex. diff incorrect, SVG vide)
- P3 Mineur → résolution < 1 semaine (ex. UI cosmétique)
- P4 Évolution → Backlog

### 6. Pipeline CI/CD ❌
```
Commit → Build → Tests unitaires → Quality Gate → Deploy Staging → Tests E2E → Deploy Prod
```
- Quality Gate : couverture > 80%, 0 bug bloquant, 0 vulnérabilité critique, < 3% duplication
- **Outil** : GitHub Actions (`.github/workflows/`)
- **Services à couvrir** : backend (Vitest + build) + plugin (build Vite)

### 7. Documentation technique ⚠️
- ✅ `README.md` français (architecture, stack, pricing, BC01-BC04)
- ✅ `PIPELINE.md` (pipeline SVG complet)
- ❌ Documentation par service (endpoints API, variables env, tests)
- ❌ OpenAPI/Swagger (au moins pour le backend principal)
- ❌ Manuel de déploiement (Railway, variables d'env, rollback procédure)

---

## BC03 — Pilotage de Projet (25%)

### 1. Choix et justification méthodologie ❌
- Justification Kanban vs Scrum pour un projet solo
- Adaptations (pas de daily standup solo, sprints 2 semaines)
- Outil retenu : GitHub Projects (déjà sur le repo)

### 2. Planification du projet ❌
- **Product Backlog** : User Stories format `En tant que [rôle], je veux [action] afin de [bénéfice]`
- Priorisation MoSCoW (Must / Should / Could / Won't)
- Estimation story points
- **Sprints identifiés** :
  - Sprint 1 : Auth + BDD + Infra (Supabase, Railway)
  - Sprint 2 : Diff engine + SVG viewer (node-level)
  - Sprint 3 : Microservices + Notifications + Paiements
  - Sprint 4 : CI/CD + Documentation + Soutenance
- Planning macroscopique (Gantt ou roadmap GitHub)

### 3. Outils de suivi ❌
- KPIs : vélocité, burndown, lead time, bugs ouverts, couverture tests
- Tableau Kanban (GitHub Projects)
- Burndown/Burnup charts
- **Base disponible** : historique git (commits datés), branches, PR

### 4. Gestion des risques et arbitrages ❌
- Registre des risques actualisé (réutiliser BC01.4)
- **Arbitrages déjà documentables** (décisions importantes prises) :
  - Abandon `exportAsync` → reconstruction SVG backend
  - Abandon Cloudflare Workers → Railway (limite CPU)
  - Abandon `svgson`/parsing SVG → propriétés natives Figma
  - Monolithe → microservices (en attente confirmation prof)
  - Web app → Plugin Figma (pivot initial)
  - Supabase Storage → SVG inline base64 (simplicité)

### 5. Vidéo Sprint Review (10-15 min) ❌
- Démo du plugin en conditions réelles (frame complexe)
- Narration des choix techniques
- Présentation des métriques du sprint
- **Conseil** : enregistrer après le test avec le designer

---

## BC04 — Maintenance & Exploitation (25%)

### 1. Gestion des dépendances ❌
- Activer **Dependabot** sur le repo GitHub (`.github/dependabot.yml`)
- `npm audit` intégré dans CI/CD
- Process : branche dédiée `deps/update-xxx` → tests → revue → merge

### 2. Système de supervision et alertes ❌
- **Health checks** : `GET /health` sur chaque service (temps réponse, version, DB ping)
- Seuils : < 200ms acceptable · > 1000ms critique
- **Prometheus** : endpoint `/metrics` sur chaque service
- **Grafana Cloud** (gratuit) : dashboard temps réponse, erreurs 5xx, checkpoints/heure
- Alertes → email ou Slack

### 3. Gestion des anomalies ❌
- Centralisation logs : Railway Logs (existant) ou ELK Stack
- Fiches d'incident format : Date · Détection · Impact · Analyse · Correctif · Vérification · Clôture
- Workflow : Détection → Consignation → Analyse → Correctif → Test → Déploiement → Vérification → Clôture
- **Incidents documentables** : exportAsync "not a function", SVG rgba() invalide, frames clippées

### 4. Correctifs et déploiement ❌
- Branches `hotfix/xxx` depuis `main`
- PR avec revue obligatoire avant merge
- Monitoring renforcé 24h post-deploy
- Rollback < 5 min (Railway : redéploiement version précédente en 1 clic)

### 5. Amélioration continue ❌
- Collecte feedback utilisateurs (designer early adopter)
- MTTR (Mean Time To Repair), SLA cible (99% uptime)
- NPS, taux de rétention

### 6. Journal des versions (Changelog) ❌
- Format `CHANGELOG.md` (Keep a Changelog)
- **Base disponible** : tous les commits git sont propres et conventionnels (feat/fix/refactor/chore)
- Générable automatiquement depuis l'historique git

### 7. Collaboration support ❌
- Escalade N1 (utilisateur) → N2 (FAQ) → N3 (dev) → N4 (infra)
- Canal `#support-technique` (Slack ou Discord)
- Base de connaissances partagée (Notion ou GitHub Wiki)

---

## Récapitulatif global

| BC | Total livrables | ✅ Fait | ⚠️ Partiel | ❌ À faire |
|---|---|---|---|---|
| BC01 — Cadrage | 9 | 0 | 1 | 8 |
| BC02 — Tests & Docs | 7 | 0 | 3 | 4 |
| BC03 — Pilotage | 5 | 0 | 0 | 5 |
| BC04 — Maintenance | 7 | 0 | 0 | 7 |
| **Total** | **28** | **0** | **4** | **24** |

---

## Ce qui existe déjà et accélère tout

| Existant | Sert à |
|---|---|
| `README.md` (français, détaillé) | Base BC01.9 (slides) + BC02.7 (doc technique) |
| `PIPELINE.md` | Base BC01.8 (architecture) + BC02.7 |
| 29 tests Vitest `diff.service` | Base BC02.2 + BC02.1 |
| Commits git conventionnels datés | Base BC03.2 (sprints) + BC04.6 (changelog) |
| Décisions techniques documentées en mémoire | Base BC01.6 (comparatif) + BC03.4 (arbitrages) |
| Plugin fonctionnel testé | Base BC03.5 (vidéo sprint review) |
| Incidents résolus (exportAsync, SVG rgba, frames) | Base BC04.3 (fiches incident) + BC02.5 (anomalies) |

---

> **Prochain chantier** : attendre confirmation prof sur microservices + tester le plugin sur frame complexe avec le designer. Ensuite attaquer dans l'ordre : CI/CD (BC02.6) → Dependabot (BC04.1) → health checks (BC04.2) → notification-service (BC02.2) → documentation formelle (BC01 + BC03).
