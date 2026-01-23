# Design Guardian

> **Semantic Vector Versioning** pour équipes Design - Projet M2

## 1. Vision & Objectif

Ce projet est un outil de **"Semantic Vector Versioning"** destiné aux équipes de Design.

**Problème résolu :**
- GitHub compare du code textuel (pas adapté aux SVG)
- Abstract compare des pixels/images (pas de détection géométrique)
- **Design Guardian** analyse la **structure géométrique** des fichiers SVG

**Objectif :**
Agir comme un sas de validation **Quality Assurance** pour garantir l'intégrité géométrique des assets graphiques (logos, icônes, typographies) avant la mise en production.

**Key Value Proposition :**
Détecter les micro-changements invisibles à l'œil nu via une analyse mathématique :
- Déplacement de point de 0.5px
- Courbe de Bézier modifiée de 2%
- Changements d'attributs subtils

---

## 2. Tech Stack (Strict TypeScript)

### Frontend
- **Framework:** Next.js (App Router)
- **UI Library:** Shadcn/UI + TailwindCSS
- **Langage:** TypeScript
- **Rendu SVG:** Composants React natifs ou manipulation DOM directe

### Backend (API)
- **Framework:** HonoJS (Node.js)
- **Architecture:** API REST (ou RPC via Hono)
- **Langage:** TypeScript

### Data & Storage
- **Provider:** Supabase
- **Database:** PostgreSQL (utilisation intensive des types `JSONB`)
- **File Storage:** Supabase Storage (Buckets) pour les fichiers `.svg` bruts

### Core Engine (L'Algorithme)
- **Parsing:** `xml2js` ou équivalent (SVG string → JSON)
- **Maths Vectorielles:** `paper.js` (headless/Node) ou `svg-path-properties`
- **But:** Calculer coordonnées, longueurs de courbes, aires de formes

### AI Integration
- **Service:** OpenAI API (GPT-4o mini)
- **Rôle:** "Translator" - Convertit le diff technique en langage naturel
  - **Input:** `path_3 d="M10..." → d="M12..."`
  - **Output:** `"Le tracé principal a été déplacé de 2px vers la droite"`

---

## 3. Architecture du "Diffing Engine" (Cœur du projet)

### Principe fondamental
**Pas de comparaison textuelle** (string diff) → **Parser la géométrie**

### Workflow de comparaison

```
1. Ingestion
   ↓ Réception de V1.svg et V2.svg

2. Parsing
   ↓ Extraction des balises <path>, <rect>, <circle>

3. Normalisation
   ↓ Conversion en chemins (paths) absolus

4. Comparaison Algorithmique
   ├─ Nombre de nœuds (points d'ancrage)
   ├─ Coordonnées (tolérance epsilon: 0.01px)
   └─ Attributs (fill, stroke, opacity)

5. Output
   → Objet "Delta JSON" avec IDs modifiés + nature des changements
```

---

## 4. Fonctionnalités Clés (MVP)

| Feature | Description |
|---------|-------------|
| **Project & File Management** | Créer un projet, uploader un SVG initial |
| **Version Upload** | Uploader une nouvelle version du même fichier |
| **Automated Analysis** | Le backend calcule le diff géométrique immédiatement |
| **Visual Feedback** | Affichage superposé ou côte à côte avec zones modifiées surlignées |
| **AI Summary** | Phrase explicative générée par l'IA |
| **Validation** | Bouton "Approve Version" (marque le fichier comme 'Gold') |

---

## 5. Règles de Développement

### Type Safety
- ❌ Pas de `any`
- ✅ Tout doit être typé (structures SVG + réponses API)

### Clean Code
- Séparation **Service** (logique parsing) / **Controller** (routes API)

### Performance
- Parsing de gros SVG peut être lourd
- Traitement asynchrone si besoin

### Erreurs
- Gestion robuste des fichiers SVG mal formés

---

## 6. Structure de Données (Supabase)

```sql
-- Profiles (users)
profiles (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamp
)

-- Projects
projects (
  id uuid PRIMARY KEY,
  name text,
  owner_id uuid REFERENCES profiles(id),
  created_at timestamp
)

-- Assets
assets (
  id uuid PRIMARY KEY,
  project_id uuid REFERENCES projects(id),
  name text,
  current_version_id uuid,
  created_at timestamp
)

-- Versions
versions (
  id uuid PRIMARY KEY,
  asset_id uuid REFERENCES assets(id),
  storage_path text,
  version_number integer,
  analysis_json jsonb,
  ai_summary text,
  created_at timestamp
)
```