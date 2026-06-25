# Architecture Cloud — Plugin Figma "GitHub pour Designers"

> ⚠️ **DOCUMENT D'EXPLORATION INITIALE — SUPERSEDED (ne pas utiliser comme référence).**
> Cette architecture **Azure** (App Service, Blob Storage, Functions, export JSON+thumbnails) date du **concept SaaS abandonné** (pivot SaaS→plugin, mars 2026). Elle **ne reflète plus** la réalité du projet :
> - Hébergement réel : **Railway** (Node.js) — pas Azure.
> - Données : **Supabase** (PostgreSQL + Storage) — pas Azure Database/Blob.
> - Backend : **monolithe modulaire Hono** (6 domaines, 1 déploiement) — pas de microservices Azure.
> - Diff : sur **propriétés natives Figma** (ε = 0,01px) — **aucun export SVG/PNG** (`exportAsync` abandonné, permission `exports` interdite).
>
> **Architecture canonique** → `docs/BC01/01-architecture.md`, `PIPELINE.md`, et la section Stack de `CLAUDE.md`.
> **Valeur conservée :** ce document sert d'**artefact d'arbitrage BC03** (le pivot Azure-SaaS → Railway-plugin = le « cas en or » à présenter au jury).

## Concept

Plugin Figma permettant de versionner des fichiers de design : snapshots, historique, diffs visuels entre versions, traçabilité des modifications par collaborateur. Interface web limitée à la gestion des abonnements.

---

## Architecture globale

```
[Plugin Figma]
      |
      | HTTPS (REST API)
      v
[API Gateway / App Service]
      |
      |——————————————————————————————|
      v                              v
[Base de données]            [Blob Storage]
PostgreSQL                   Snapshots JSON
(users, projets,             Thumbnails PNG
commits, branches)           (via SAS URL)
      |
      v
[Azure Function]
Calcul des diffs
entre versions
      |
[Web App]
Gestion abonnements
/ billing uniquement
```

---

## Services cloud utilisés

| Service | Rôle |
|---|---|
| **App Service** | Héberge l'API (Node.js ou Python FastAPI) |
| **Azure Database for PostgreSQL** | Stocke utilisateurs, projets, commits, branches |
| **Azure Blob Storage** | Stocke les snapshots JSON + thumbnails PNG des frames |
| **Azure Function** | Calcule les diffs entre deux versions (déclenché à la demande) |
| **Azure Container Registry** | Stocke les images Docker de l'API |
| **App Service (web)** | Interface de gestion des abonnements |
| **Azure API Management** | (optionnel) Rate limiting, auth, quotas par plan |

---

## Flux principal — Créer un snapshot (commit)

```
1. Utilisateur clique "Commit" dans le plugin Figma
2. Le plugin exporte le JSON du fichier + thumbnails PNG des frames
3. Plugin → POST /commits  (métadonnées : message, auteur, timestamp, projet)
4. API crée l'entrée en base (PostgreSQL) + génère une SAS URL (Blob)
5. Plugin uploade directement JSON + images sur Azure Blob via SAS URL
6. Azure Function se déclenche → calcule le diff avec le commit précédent
7. Le diff est stocké en base pour affichage dans le plugin
```

---

## Flux secondaire — Voir qui a touché à quoi

```
Plugin → GET /projects/{id}/commits
API → requête PostgreSQL (commits filtrés par projet + auteur)
Retour : liste chronologique avec auteur, date, frames modifiées
```

---

## Modèle de données (PostgreSQL)

```
users
  id, email, name, plan (free/pro/team), created_at

projects
  id, name, figma_file_key, owner_id, created_at

commits
  id, project_id, author_id, message, created_at
  blob_path (chemin du snapshot JSON dans Blob)
  thumbnail_path (chemin du thumbnail principal)

branches
  id, project_id, name, base_commit_id, created_at

commit_diffs
  id, commit_id, previous_commit_id
  diff_json (résumé des frames modifiées/ajoutées/supprimées)

collaborators
  project_id, user_id, role (owner/editor/viewer)
```

---

## Modèle économique et impact cloud

| Plan | Limites | Ce que ça implique |
|---|---|---|
| **Free** | 3 projets, 10 commits/mois | Quota en base, pas de blob illimité |
| **Pro** | Projets illimités, 100 commits/mois | SAS URL avec quota de storage |
| **Team** | Tout illimité + collaborateurs | Azure API Management pour le rate limiting |

---

## CI/CD (GitHub Actions)

```
push sur src/api/    → Docker build → ACR → App Service API
push sur src/web/    → Docker build (nginx) → ACR → App Service web
push sur src/worker/ → zip deploy → Azure Function
```

---

## Pourquoi ce pattern SAS URL

Les snapshots JSON et thumbnails peuvent peser plusieurs Mo par commit. Les faire transiter par l'API surchargerait le serveur inutilement. Le plugin uploade directement sur Azure Blob grâce à une URL temporaire signée (15 min) générée par l'API — même pattern que S3 Presigned URL sur AWS.

---

## Monitoring

| Outil | Usage |
|---|---|
| **Sentry** | Erreurs applicatives dans le plugin et l'API |
| **Azure Monitor** | Santé des App Services, temps de réponse, alertes |
| **Azure Storage Analytics** | Volume de données stockées par plan/utilisateur |
