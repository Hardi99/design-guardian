# Suivi d'évaluation — Design Guardian

> Dernière mise à jour : 2026-05-22
> Deux évaluations distinctes, un seul projet.

---

## Légende

| Icône | Signification |
|-------|---------------|
| ✅ | Fait / livrable présent |
| ⚠️ | Partiel / à compléter |
| ❌ | Manquant |
| 🔒 | Éliminatoire au jury RNCP |

---

## 1. Cours Web Services (Notion)

Critère principal : **6 microservices + 1 frontend React**

### Microservices backend

| # | Service | Exigence Notion | État | Fichier(s) clé(s) |
|---|---------|-----------------|------|-------------------|
| A | **Auth** (OAuth + OpenID) | OAuth Google/GitHub + JWT + inscription email | ✅ | `auth.controller.ts`, `plugin.middleware.ts` |
| B | **Base de données** | CRUD Supabase, validation, contraintes | ✅ | `supabase.ts`, migrations Supabase |
| C | **Métriques** | Prometheus + Grafana, health checks | ⚠️ Prometheus ✅, Grafana ❌ | `metrics.service.ts`, `/metrics` |
| D | **Notifications** | Email (Resend) + SMS (Twilio) | ✅ | `notification.service.ts`, `notifications.controller.ts` |
| E | **IA** | LLM, traitement requêtes, vendre aux users | ✅ | `openai.service.ts`, `diff.service.ts` |
| F | **Paiements** | Stripe, abonnements récurrents, webhooks | ✅ | `stripe.service.ts`, `payments.controller.ts` |

### Frontend React

| Page | Exigence | État | Notes |
|------|----------|------|-------|
| Plugin Figma (Preact) | Interface principale | ✅ | Plugin Figma = équivalent frontend |
| Inscription / Connexion | Auth + email validation + SMS reset | ✅ | Via auto-init + `figma.clientStorage` |
| Cœur de l'app (IA) | Service IA vendu aux utilisateurs | ✅ | Timeline, diff, AI Patch Notes |
| Paiement | Plans Free/Pro/Team, souscription | ⚠️ | API ✅, page web pricing ❌ |

### Blocs de compétences (Notion)

| Bloc | Exigence | État |
|------|----------|------|
| **BC01** | Cartographie, faisabilité, risques, SWOT, veille, budget, architecture, deck 15-20 slides | ⚠️ Docs Mermaid ✅, deck slides ❌ |
| **BC02** | Stratégie tests, tests unitaires (63 cas), cahier recettes, CI/CD, OpenAPI/Swagger | ✅ |
| **BC03** | Scrum, backlog MoSCoW, sprints, KPIs, burndown, vidéo Sprint Review 10-15 min | ⚠️ Docs ✅, vidéo ❌ |
| **BC04** | Dependabot ✅, Prometheus ✅, Grafana ❌, CHANGELOG ✅, hotfix process ✅ | ⚠️ |

---

## 2. Jury RNCP 39583 — Expert en Développement Logiciel

Critère principal : **Acquis / Non Acquis** par compétence. Format livrable = présentation orale + démonstration.

### BLOC 1 — Cadrer un projet

| Compétence | Livrable attendu jury | État | Fichier(s) |
|------------|----------------------|------|------------|
| C1.1.1 Cartographie parties prenantes 🔒 | Matrice influence/intérêt | ✅ | `docs/BC01/03-parties-prenantes.md` |
| C1.1.2 Analyse de la demande | Présentation contexte + enjeux | ✅ | `docs/BC01/README.md` |
| C1.2.1 Cartographie opportunités/menaces | SWOT | ⚠️ | À formaliser |
| C1.2.2 Faisabilité technique | Audit technique, contraintes, langages | ✅ | `docs/BC01/` |
| C1.2.3 Cartographie des risques | Référentiel risques + indicateurs | ✅ | `docs/BC01/04-risques.md` |
| C1.3.1 Veille technique/réglementaire | Sources, outils veille, bénéfices | ⚠️ | À compléter |
| C1.3.2 Étude comparative solutions | Tableau comparatif justifié | ✅ | `docs/BC01/` |
| C1.4.1 Estimation charge de travail | Diagramme fonctionnel, jour/homme | ✅ | `docs/BC01/02-gantt.md` |
| C1.4.2 Estimation coûts / budget | Budget prévisionnel postes de coûts | ⚠️ | À compléter |
| C1.5 Architecture logicielle 🔒 | Schémas légendés, UML/Mermaid | ✅ | `docs/BC01/01-architecture.md` |
| C1.6 Présentation client 🔒 | Deck 15-20 slides, argumentation | ❌ | Slides à créer |

### BLOC 2 — Concevoir et développer

| Compétence | Livrable attendu jury | État | Fichier(s) |
|------------|----------------------|------|------------|
| C2.1.1 Environnement déploiement/test | Protocol CI/CD, critères qualité | ✅ | `.github/workflows/ci.yml` |
| C2.1.2 Intégration continue | Pipeline CI/CD documenté | ✅ | `.github/workflows/ci.yml` |
| C2.2.1 Prototype fonctionnel 🔒 | App fonctionnelle + user stories | ✅ | Plugin Figma + backend |
| C2.2.2 Tests unitaires 🔒 | Harnais de tests couvrant le code | ✅ | `backend/src/**/*.test.ts` (63 cas) |
| C2.2.3 Sécurité (OWASP) + accessibilité | Mesures OWASP Top 10, référentiel accessibilité | ⚠️ | À documenter |
| C2.2.4 Déploiement progressif + versioning | Historique versions, logiciel manipulable | ✅ | `CHANGELOG.md`, Railway |
| C2.3.1 Cahier de recettes 🔒 | Fiches REC-XXX-NNN, résultats | ✅ | `docs/RECETTES.md` (18 fiches) |
| C2.3.2 Plan de correction bogues | Classification P1-P4, corrections | ✅ | `docs/RECETTES.md` (section plan) |
| C2.4.1 Documentation technique 🔒 | README, OpenAPI, manuel déploiement | ⚠️ | OpenAPI ✅, manuel déploiement ❌ |

### BLOC 3 — Coordonner et piloter

| Compétence | Livrable attendu jury | État | Fichier(s) |
|------------|----------------------|------|------------|
| C3.1 Planification + méthodologie 🔒 | Scrum/Kanban justifié, Gantt, RACI | ✅ | `docs/BC01/02-gantt.md` |
| C3.2.1 Suivi avancement (KPIs) | Tableaux de bord, burndown | ⚠️ | À formaliser |
| C3.2.2 Arbitrage documenté | Cas concret : contexte, options, décision | ⚠️ | Ex: Supabase vs Convex, Plugin vs Web App |
| C3.3.1 Gestion équipe + styles managériaux | Affectation missions, style directif/participatif | ⚠️ | Projet solo — à reformuler |
| C3.3.2 Plan développement compétences | Grille compétences, formations | ⚠️ | À créer |
| C3.4.1 Comptes rendus + indicateurs satisfaction | CR structurés, NPS, points validation | ⚠️ | À formaliser |
| C3.4.2 Démonstration fonctionnalités 🔒 | Démo live devant jury | ✅ | Plugin fonctionnel |

### BLOC 4 — Maintenir en condition opérationnelle

| Compétence | Livrable attendu jury | État | Fichier(s) |
|------------|----------------------|------|------------|
| C4.1.1 Gestion mises à jour dépendances | Process MAJ, fréquence, périmètre | ✅ | `.github/dependabot.yml` |
| C4.1.2 Système supervision + alertes 🔒 | Prometheus + Grafana, sondes, seuils | ⚠️ | Prometheus ✅, Grafana dashboard ❌ |
| C4.2.1 Consignation anomalies | Fiche incident type + exemple réel | ⚠️ | Template dans RECETTES ✅, exemple réel ❌ |
| C4.2.2 Créer/déployer correctif | Hotfix branch + CI/CD | ✅ | Commits `fix:` + Railway auto-deploy |
| C4.3.1 Axes d'amélioration | Recommandations argumentées | ⚠️ | À rédiger (roadmap) |
| C4.3.2 Journal des versions 🔒 | CHANGELOG avec correctifs documentés | ✅ | `CHANGELOG.md` (v1.0→v1.4) |
| C4.3.3 Collaboration support client | Exemple problème résolu avec contexte | ⚠️ | Bug nav bar (doc à formaliser) |

---

## 3. Récapitulatif par priorité

### Bloquant pour le jury (éliminatoires manquants)

| Item | Action |
|------|--------|
| **Deck 15-20 slides** (C1.6) | Créer la présentation client |
| **Grafana dashboard** (C4.1.2) | Configurer dashboard sur infra Railway |

### Impact fort, non éliminatoire

| Item | Effort | Action |
|------|--------|--------|
| Manuel de déploiement (C2.4.1) | Faible | Créer `docs/DEPLOIEMENT.md` |
| Fiche anomalie réelle (C4.2.1) | Faible | Documenter le bug nav bar (BUG-001) |
| Arbitrage documenté (C3.2.2) | Faible | Rédiger cas Supabase vs Convex |
| Page web pricing (Paiements) | Moyen | Frontend Next.js `/pricing` |
| SWOT formalisé (C1.2.1) | Faible | Ajouter dans `docs/BC01/` |

### Cours uniquement (pas jury)

| Item | État |
|------|------|
| Vidéo Sprint Review 10-15 min (BC03) | ❌ À enregistrer |
| Couverture tests ≥ 80% (BC02 quality gate) | ⚠️ Actuelle : vérifier avec `vitest --coverage` |
