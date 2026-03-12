# Design Guardian

> **"Le Git pour Figma"** — Plugin de Version Control & QA pour equipes Design · Projet M2

---

## 1. Vision & Objectif

Plugin Figma de version control et quality assurance. Apporte la rigueur du developpement logiciel (Git) dans le chaos creatif du design.

**Cible :**
- Equipes UX/UI & Product Designers
- Designers graphiques (identite visuelle, logos, icones)
- Designers packaging (Figma sert aussi pour le packaging)
- Illustrateurs vectoriels

**Probleme resolu :**
- La peur d'ecraser : multiplication des `v1_final_VRAIMENT_FINAL.fig`
- L'anonymat : "Qui a bouge ce bouton de 2px ?" — impossible a tracer
- Figma Version History : pixel diff sans granularite, pas de Delta JSON, pas de blame
- Figma Branches : plan Organization uniquement (~45$/mois/user)

**Differenciateurs vs Figma natif :**

| | Figma Version History | Figma Branches (Org) | Design Guardian |
|--|--|--|--|
| Comparaison | Pixel / rendu | Pixel / rendu | Geometrique sur proprietes (0.01px) |
| Attribution | Auteur du fichier | Auteur du fichier | Auteur par noeud modifie |
| Delta structure | Aucun | Aucun | Delta JSON exploitable |
| Branches | Absent (Free/Pro) | ~45$/mois/user | Tous les plans |
| AI Patch Note | Absent | Absent | Changelog automatique |
| Workflow QA | Absent | Absent | Draft → Review → Approved (Gold) |

---

## 2. Architecture Technique

### Double thread Figma (FONDAMENTAL)

```
main.ts  [Main Thread — acces API Figma UNIQUEMENT]
  figma.currentUser         -> identite auteur
  node.absoluteTransform    -> coordonnees absolues
  node.fills / strokes      -> attributs visuels
  node.vectorPaths          -> paths resolus
  node.exportAsync('SVG')   -> SVG pour affichage visuel uniquement
  figma.clientStorage       -> persistence token auth
        |
        | postMessage (JSON serialise)
        v
ui.tsx  [UI Thread — Preact + HTTP]
  Interface utilisateur
  Appels HTTP vers backend (Authorization: Bearer <token>)
  Timeline, diff viewer, smart data
```

`figma.currentUser`, `exportAsync`, `node.fills` etc. sont UNIQUEMENT accessibles dans `main.ts`. Jamais depuis l'UI.

### Backend

**Stack :** HonoJS + TypeScript sur Railway/Render (Node.js — pas CF Workers, limite CPU incompatible)

**Routes :**
```
POST /api/checkpoints              -> snapshot + diff + AI patch note
GET  /api/branches/tree?asset_id=  -> arbre des versions (parent_id)
PUT  /api/branches/versions/:id/approve -> Gold status
GET  /api/projects                 -> projets de l'utilisateur
GET  /api/assets?project_id=       -> assets d'un projet
POST /api/assets                   -> creer un asset
```

**Architecture :**
```
controllers/
  checkpoints.controller.ts   -> orchestration checkpoint
  branches.controller.ts      -> tree + approve
  projects.controller.ts
  assets.controller.ts
services/
  diff.service.ts             -> compareSnapshots() — algorithme core
  openai.service.ts           -> generatePatchNote(delta, author)
middleware/
  auth.middleware.ts          -> supabase.auth.getUser(token)
```

### Schema PostgreSQL

```sql
profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  figma_id text UNIQUE,
  full_name text,
  avatar_url text,
  plan text DEFAULT 'free'   -- 'free' | 'pro' | 'team'
)

projects (
  id uuid PRIMARY KEY,
  name text,
  owner_id uuid REFERENCES profiles(id)
)

assets (
  id uuid PRIMARY KEY,
  project_id uuid REFERENCES projects(id),
  name text,
  asset_type text            -- 'logo' | 'icon' | 'packaging' | 'illustration' | 'ui'
)

versions (
  id uuid PRIMARY KEY,
  asset_id uuid REFERENCES assets(id),
  parent_id uuid REFERENCES versions(id),  -- NULL = racine de branche
  branch_name text,                         -- 'main', 'test-couleur', 'packaging-v2'
  version_number integer,
  author_id uuid REFERENCES profiles(id),
  figma_node_id text,
  snapshot_json jsonb NOT NULL,             -- proprietes natives Figma (source de verite)
  storage_path text,                        -- SVG dans Supabase Storage (affichage uniquement)
  analysis_json jsonb,                      -- Delta JSON geometrique
  ai_summary text,                          -- Patch note IA
  status text DEFAULT 'draft',              -- 'draft' | 'review' | 'approved'
  approved_by uuid REFERENCES profiles(id),
  approved_at timestamp,
  created_at timestamp
)
```

**Arbre de branches via CTE recursif (argument M2) :**
```sql
WITH RECURSIVE branch_tree AS (
  SELECT id, parent_id, branch_name, version_number, author_id, created_at, 0 AS depth
  FROM versions WHERE parent_id IS NULL AND asset_id = $1
  UNION ALL
  SELECT v.id, v.parent_id, v.branch_name, v.version_number, v.author_id, v.created_at, bt.depth + 1
  FROM versions v JOIN branch_tree bt ON v.parent_id = bt.id
)
SELECT * FROM branch_tree ORDER BY depth, created_at;
```

---

## 3. Algorithme de Diff (Coeur du Projet)

**Principe : proprietes Figma natives, jamais le SVG pour le diff.**

Figma expose toutes les proprietes en coordonnees absolues resolues via l'API plugin — pas besoin de parser du SVG.

```typescript
function extractSnapshot(node: SceneNode): NodeSnapshot {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    x: node.absoluteTransform[0][2],   // coordonnees absolues, deja resolues
    y: node.absoluteTransform[1][2],
    width: 'width' in node ? node.width : 0,
    height: 'height' in node ? node.height : 0,
    fills: 'fills' in node ? node.fills : [],
    strokes: 'strokes' in node ? node.strokes : [],
    opacity: 'opacity' in node ? node.opacity : 1,
    cornerRadius: 'cornerRadius' in node ? node.cornerRadius : 0,
    vectorPaths: 'vectorPaths' in node ? node.vectorPaths : [],
    children: 'children' in node ? node.children.map(extractSnapshot) : [],
  }
}
```

**Workflow :**
```
1. Plugin main.ts
   -> extractSnapshot() → snapshot_json (source de verite du diff)
   -> exportAsync('SVG') → svg_base64 (affichage visuel uniquement)

2. POST /api/checkpoints
   -> recupere snapshot precedent de la meme branche
   -> DiffService.compareSnapshots(v1, v2) → Delta JSON
   -> OpenAI GPT-4o mini : Delta JSON → patch note (jamais le SVG — RGPD)
   -> Stocke SVG dans Supabase Storage

3. Response → { version, analysis, ai_summary }
```

**Format Delta JSON :**
```json
{
  "modified": [
    {
      "nodeId": "node_123",
      "nodeName": "Logo/Cercle principal",
      "changes": [
        { "property": "x", "oldValue": 10.0, "newValue": 12.5, "delta": "+2.5px" },
        { "property": "fills[0].color", "oldValue": "#CCCCCC", "newValue": "#555555" }
      ]
    }
  ],
  "added": [],
  "removed": [],
  "totalChanges": 1
}
```

---

## 4. Fonctionnalites MVP

| Feature | Description | Priorite |
|---|---|---|
| **Auth** | Login Supabase (OAuth Google / magic link) | Must |
| **Onboarding** | Selectionner projet/asset depuis liste — aucun UUID visible | Must |
| **Checkpoint** | Snapshot proprietes Figma + attribution auteur | Must |
| **Branching** | Creer une branche depuis n'importe quelle version | Must |
| **Attribution / Blame** | "Modifie par Isaac il y a 2h" par noeud | Must |
| **AI Patch Note** | Delta JSON → changelog lisible et factuel | Must |
| **Timeline** | Liste verticale chronologique, rails si branches paralleles | Must |
| **Diff & Overlay** | Split (V1/V2 cote a cote) + Overlay (opacite reglable) | Must |
| **Smart Data** | Deltas chiffres groupes par categorie (Geometrie/Couleurs/Opacite) | Must |
| **Gold Status** | Draft → Review → Approved, badge visuel distinct | Must |
| **Plan check** | Backend verifie le plan au demarrage | Must |
| **Restore** | Nouveau checkpoint avec snapshot d'une version anterieure | Should |
| **Merge** | Remplacer main par une branche (explicite, confirme) | Bonus |

---

## 5. UX — Design System

**Principe directeur :** Dark, dense, professionnel. L'IA expose des faits, pas des recits.

### Design tokens
- Fond : `#030712` (gray-950) · Surfaces : `#111827` (gray-900)
- Typographie : **Inter** uniquement
- Accent : **Violet** `#9333ea`
- Etats : vert `#22c55e` = Approved · orange `#f59e0b` = Review · gris = Draft
- Zero ombre portee, zero gradient decoratif

### 1. Timeline (Inspiration : GitKraken / Vercel)
- Rail vertical chronologique, rails lateraux pour branches paralleles
- Chaque point : avatar + date relative + extrait patch note IA (1 ligne)
- Badge **Gold** distinctif sur `status = 'approved'`
- Selecteur de branche en haut, "main" par defaut

### 2. Diff Viewer (Inspiration : Kaleidoscope)
- Le plugin se redimensionne pour la vue diff : `figma.ui.resize(820, 640)`
- `Split View` : SVG V1 / V2 cote a cote
- `Overlay` : superposition avec curseur d'opacite
- Smart Data dans le meme panneau (pas d'onglet separe) : deltas chiffres + blame par noeud

### 3. Actions (Inspiration : Linear / Figma AI)
- `Save Checkpoint` — toujours visible
- `Restore this Version` — nouveau checkpoint (non destructif)
- `Mark as Approved` / `Revoke` — toggle Gold
- `Create Branch from here`
- Feedback inline, modal de confirmation uniquement pour les actions destructives

### 4. Onboarding
- Aucun UUID visible ou saisi manuellement par l'utilisateur
- Apres login : liste des projets → liste des assets → lier un noeud Figma
- Si aucun projet : CTA "Creer mon premier projet"

---

## 6. Tech Stack

| Couche | Choix | Raison |
|---|---|---|
| Plugin UI | Preact + Tailwind | 3KB vs 45KB React, meme API |
| Plugin build | create-figma-plugin | esbuild, double-thread natif |
| Backend | HonoJS + TypeScript | perf, type-safe, middleware propre |
| Hosting | Railway / Render | Node.js unrestricted (pas CF Workers) |
| Diff engine | Proprietes natives Figma | coordonnees absolues resolues, 0 parsing SVG |
| Tests | Vitest | natif ESM/TS, zero config |
| AI | OpenAI GPT-4o mini | input : Delta JSON uniquement, jamais SVG |
| Auth | Supabase Auth | OAuth Google + magic link |
| DB | Supabase PostgreSQL | CTE recursifs pour l'arbre |
| Storage | Supabase Storage | SVG pour overlay visuel uniquement |
| Paiement | Lemon Squeezy / Paddle | MoR, TVA EU automatique |

---

## 7. Modele Economique

Souscription sur le **site web** uniquement (guidelines Figma).

| Plan | Prix | Limites |
|---|---|---|
| Free | 0 | 1 projet, 10 checkpoints, 1 branche |
| Pro | 8$/mois | Illimite, historique complet |
| Team | 20$/mois/user | Multi-users, permissions, export rapports |

---

## 8. Regles de Developpement

- **Zero `any`** — tout type (NodeSnapshot, DeltaJSON, ApiResponse)
- **Double thread** : `main.ts` API Figma exclusivement · `ui.tsx` Preact + HTTP exclusivement
- **postMessage** uniquement entre les deux threads, jamais d'import croise
- `exportAsync` peut echouer sur composants complexes : retry x2, fallback gracieux sans SVG
- Toujours verifier `'fills' in node` avant d'acceder aux proprietes optionnelles

---

## 9. Cadre M2 — Blocs de Competences

Titre vise : **Expert en Developpement Logiciel**

| Bloc | Poids | Livrables cles |
|---|---|---|
| BC01 Cadrage | 25% | Stakeholders, faisabilite, risques (matrice 5x5), budget, archi Mermaid, deck 15-20 slides |
| BC02 Tests & Docs | 25% | Vitest 80% couverture, cahier recettes REC-XXX-001, CI/CD GitHub Actions, OpenAPI |
| BC03 Pilotage | 25% | Scrum, backlog MoSCoW, KPIs (burndown, velocity), video Sprint Review 10-15min |
| BC04 Maintenance | 25% | Dependabot, health checks, fiches incidents, hotfix rollback < 5min, changelog semver |

**Risques cles :**

| Risque | Proba | Impact | Mitigation |
|---|---|---|---|
| exportAsync instable (SVG complexe) | Haute | Moyen | Retry x2, snapshot sans SVG en fallback |
| Fuite SVG confidentiel vers OpenAI | Faible | Critique | Delta JSON uniquement a l'AI, jamais le SVG |
| API OpenAI indisponible | Moyenne | Eleve | Patch note "en attente" + retry async |
| Figma change son API plugin | Faible | Critique | Couche d'abstraction sur les proprietes Figma |
| Guidelines Figma sur les paiements | Certaine | Eleve | Souscription sur site web uniquement |

**User Stories cles :**

| ID | Story | Prio | Points |
|---|---|---|---|
| US-001 | Designer : sauvegarder un checkpoint | Must | 5 |
| US-002 | Designer : creer une branche exploration | Must | 8 |
| US-003 | Team lead : voir qui a modifie quoi | Must | 5 |
| US-004 | Designer : comparer deux versions visuellement | Must | 13 |
| US-005 | Designer packaging : versionner un calque packaging | Must | 5 |
| US-006 | Team lead : approuver une version Gold | Should | 3 |

---

## 10. Pistes Post-MVP

| Piste | Description |
|---|---|
| **Adobe UXP** | Illustrator / InDesign / Photoshop via Adobe UXP. Meme backend, nouveau client plugin. |
| **Canva** | Canva Apps SDK. Cible equipes marketing non-designers. |
| **Export rapport PDF** | Rapport diff pour validation client / audit qualite. |
| **Notifications** | Slack / email sur nouveau checkpoint ou version approuvee. |
| **API publique** | Integration Delta JSON dans pipelines CI/CD. |
