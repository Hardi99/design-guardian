# Design Guardian

> Plugin de version control et QA pour les équipes design — "Le Git pour Figma"

Design Guardian apporte la rigueur du développement logiciel (Git) dans le chaos créatif du design. Conçu comme un plugin Figma avec un backend HonoJS, il offre un diff géométrique au pixel près, des changelogs automatiques générés par IA, et un workflow d'approbation d'équipe — disponible sur tous les plans Figma.

---

## Pourquoi Design Guardian ?

| | Figma Version History | Figma Branches | Design Guardian |
|---|---|---|---|
| Comparaison | Pixel / rendu | Pixel / rendu | Géométrique sur propriétés (0,01px) |
| Attribution | Auteur du fichier | Auteur du fichier | Par nœud modifié |
| Delta | Aucun | Aucun | Delta JSON exploitable |
| Branches | Absent (Free/Pro) | ~45€/mois/user | Tous les plans |
| AI Changelog | Non | Non | Automatique via GPT-4o mini |
| Workflow QA | Non | Non | Draft → Review → Approved |

---

## Fonctionnalités

- **Checkpoint** — Snapshot des propriétés natives Figma avec attribution de l'auteur
- **Diff géométrique** — Comparaison à 0,01px sur x, y, width, height, fills, opacité, vector paths
- **Branching** — Créer des branches depuis n'importe quelle version, sans plan Organization Figma
- **Attribution / Blame** — "Modifié par X il y a 2h" au niveau du nœud
- **AI Patch Note** — Delta JSON → changelog lisible via GPT-4o mini (le SVG n'est jamais envoyé à l'IA)
- **Timeline** — Historique chronologique avec rails de branches parallèles (inspiré GitKraken)
- **Diff Viewer** — Split view + overlay avec curseur d'opacité (inspiré Kaleidoscope)
- **Smart Data** — Deltas chiffrés groupés par nœud dans un panneau latéral
- **Gold Status** — Workflow Draft → Review → Approved avec badge visuel distinct
- **Restore** — Rollback non-destructif : crée un nouveau checkpoint depuis n'importe quelle version passée

---

## Architecture

```
plugin/           Plugin Figma — Preact + Tailwind + Vite
  src/main.ts     Main thread — API Figma uniquement (extraction snapshot, exportAsync)
  src/ui.tsx      UI thread — Preact + appels HTTP backend

backend/          HonoJS + TypeScript sur Railway
  controllers/    checkpoints, branches, projects, assets
  services/       diff.service.ts, openai.service.ts, svg-generator.service.ts
  middleware/     plugin.middleware.ts (auth par X-API-Key)

supabase/
  migrations/     Schéma PostgreSQL + arbre de branches via CTE récursif
```

**Double thread** — `main.ts` a accès exclusif à l'API Figma. La communication avec `ui.tsx` se fait uniquement via `postMessage`.

**Moteur de diff** — Les propriétés natives Figma (`absoluteTransform`, `fills`, `vectorPaths`) sont extraites en `snapshot_json`. Aucun parsing SVG pour le calcul du diff. Le SVG est généré côté serveur pour l'affichage visuel uniquement.

---

## Stack technique

| Couche | Choix | Raison |
|---|---|---|
| Plugin UI | Preact + Tailwind v4 + Vite | 3 Ko vs 45 Ko React, ESM natif |
| Backend | HonoJS + TypeScript | Type-safe, performant, middleware propre |
| Hébergement | Railway | Node.js sans limite CPU (Cloudflare Workers incompatible avec le diff) |
| Moteur diff | Propriétés natives Figma | Coordonnées absolues résolues, zéro parsing SVG |
| IA | OpenAI GPT-4o mini | Input : Delta JSON uniquement, jamais le SVG |
| Auth | X-API-Key par projet, auto-init via `figma.fileKey` | |
| BDD | Supabase PostgreSQL | CTE récursif pour l'arbre de branches |
| Stockage | Supabase Storage | SVG pour l'overlay visuel uniquement |

---

## Tarification

Souscription sur le **site web uniquement** (guidelines Figma — pas de paiement in-plugin).

| Plan | Prix | Limites |
|---|---|---|
| Free | 0 € | 1 projet, 10 checkpoints, 1 branche |
| Pro | 8 €/mois | Illimité, historique complet |
| Team | 20 €/mois/utilisateur | Multi-utilisateurs, permissions, export rapports |

---

## Développement local

### Plugin

```bash
cd plugin
npm install
npm run build
# Importer dist/manifest.json dans Figma Desktop : Plugins → Development → Import plugin from manifest
```

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev          # tsx watch — port 3001
npm run test:run     # 63 tests unitaires (Vitest)
npm run test:coverage # rapport de couverture HTML dans coverage/
npm run build        # compile vers dist/
```

**Variables d'environnement** (`.env`) :

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `SUPABASE_URL` | ✅ | URL du projet Supabase |
| `SUPABASE_ANON_KEY` | ✅ | Clé publique (vérification JWT utilisateur) |
| `SUPABASE_SERVICE_KEY` | ✅ | Clé admin (toutes les opérations BDD) |
| `OPENAI_API_KEY` | ✅ | Clé GPT-4o-mini pour les patch notes |
| `PORT` | ➖ | Port serveur (défaut : `3001`) |
| `NODE_ENV` | ➖ | `development` / `production` / `test` |

### Base de données

Exécuter les migrations dans l'ordre via le SQL Editor Supabase :

```
supabase/migrations/001_initial.sql
supabase/migrations/002_...
...
```

---

## Projet M2 — Expert en Développement Logiciel

Design Guardian a été conçu pour valider le titre **Expert en Développement Logiciel** en couvrant les 4 blocs de compétences à travers des choix techniques concrets et justifiés.

### BC01 — Cadrage et conception (25%)

Le projet répond à un besoin marché réel : les designers Figma n'ont pas accès à un vrai système de version control granulaire sans souscrire à un plan Organization (~45€/mois/user). Design Guardian adresse ce gap pour tous les plans.

- **Analyse de faisabilité** : étude des contraintes du double thread Figma (main/UI), de la limite CPU Cloudflare Workers, et des guidelines paiement Figma
- **Matrice des risques** : exportAsync instable, fuite SVG vers l'IA, indisponibilité OpenAI, changement API Figma
- **Architecture documentée** : diagramme double thread, schéma PostgreSQL avec CTE récursifs, flux Delta JSON → IA
- **Modèle économique** : freemium avec souscription web (Lemon Squeezy / Paddle, TVA EU automatique)
- **Stakeholders** : designers UX/UI, designers packaging, illustrateurs vectoriels, team leads

### BC02 — Tests et documentation (25%)

La fiabilité du moteur de diff est centrale : une erreur de calcul de delta détruit la valeur du produit.

- **Tests unitaires** avec Vitest sur `diff.service.ts` : fixtures `NodeSnapshot` avec deltas connus (déplacement +2,5px, changement couleur, opacité)
- **Couverture 80%** sur les services core (diff, openai, svg-generator)
- **Cahier de recettes** : scénarios REC-XXX-001 couvrant checkpoint, diff, restore, Gold Status
- **CI/CD GitHub Actions** : build TypeScript, tests Vitest, déploiement Railway automatique
- **OpenAPI** : documentation des routes (`/api/checkpoints`, `/api/branches/tree`, `/api/projects/auto-init`)

### BC03 — Pilotage projet (25%)

Projet géré en méthodologie Scrum avec priorisation MoSCoW.

- **Backlog MoSCoW** : Must (auth, checkpoint, diff, AI, timeline), Should (restore, Gold Status), Bonus (merge)
- **User stories chiffrées** : US-001 à US-006 avec story points (5 à 13 points)
- **Sprints** avec burndown et vélocité mesurée
- **KPIs produit** : taux de rétention Free→Pro, nombre de checkpoints/semaine, taux d'utilisation Gold Status
- **Vidéo Sprint Review** : démo fonctionnelle du plugin (10-15 min)

### BC04 — Maintenance et exploitation (25%)

Le plugin est déployé en production et doit rester stable face aux évolutions de l'API Figma.

- **Dependabot** : mises à jour automatiques des dépendances (`@figma/plugin-typings`, Supabase SDK, HonoJS)
- **Health checks** : endpoint `/health` sur Railway, monitoring uptime
- **Couche d'abstraction Figma** : `extractSnapshot()` isole les propriétés Figma — si l'API change, un seul point de modification
- **Rollback < 5 min** : Railway permet un rollback instantané vers le déploiement précédent
- **Changelog sémantique** : versioning semver, patch notes générées automatiquement
- **Gestion des incidents** : retry x2 sur `exportAsync`, fallback SVG depuis `snapshot_json`, patch note "en attente" si OpenAI indisponible

---
