# Design Guardian - Backend API

API backend pour Design Guardian, un outil de versioning sémantique vectoriel pour équipes Design.

## Stack Technique

- **Framework:** HonoJS (Node.js)
- **Langage:** TypeScript (strict mode)
- **Base de données:** Supabase (PostgreSQL)
- **Storage:** Supabase Storage
- **AI:** OpenAI API (GPT-4o mini)
- **Parsing SVG:** xml2js + svg-path-properties

## Structure du Projet

```
src/
├── config/           # Configuration (env, Supabase)
├── controllers/      # Routes API (projects, assets, versions)
├── services/         # Logique métier
│   ├── svg-parser.service.ts    # Parsing de SVG
│   ├── svg-diff.service.ts      # Comparaison géométrique
│   └── openai.service.ts        # Génération de résumés IA
├── types/           # Définitions TypeScript
│   ├── database.ts  # Types Supabase
│   ├── svg.ts       # Types SVG/géométrie
│   └── api.ts       # Types API (requests/responses)
└── index.ts         # Point d'entrée
```

## Installation

```bash
npm install
```

## Configuration

Créer un fichier `.env` à la racine du dossier backend :

```bash
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Server
PORT=3001
NODE_ENV=development
```

## Schéma de Base de Données (Supabase)

Créer les tables suivantes dans Supabase :

```sql
-- Profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Assets
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  current_version_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Versions
CREATE TABLE versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID REFERENCES assets(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  analysis_json JSONB,
  ai_summary TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bucket Supabase Storage
-- Créer un bucket nommé "svg-files" dans Supabase Storage
```

## Commandes

```bash
# Développement avec hot-reload
npm run dev

# Build TypeScript
npm run build

# Production
npm start

# Type checking
npm run typecheck
```

## API Endpoints

### Projects

- `GET /api/projects?owner_id={uuid}` - Liste des projets
- `GET /api/projects/:id` - Détails d'un projet
- `POST /api/projects` - Créer un projet
- `DELETE /api/projects/:id` - Supprimer un projet

### Assets

- `GET /api/assets?project_id={uuid}` - Liste des assets
- `GET /api/assets/:id` - Détails d'un asset
- `POST /api/assets` - Créer un asset
- `DELETE /api/assets/:id` - Supprimer un asset

### Versions

- `GET /api/versions?asset_id={uuid}` - Liste des versions
- `GET /api/versions/:id` - Détails d'une version
- `POST /api/versions/upload` - Upload nouvelle version (multipart/form-data)
- `GET /api/versions/compare/:v1Id/:v2Id` - Comparer deux versions

## Workflow de Diffing

1. **Upload**: Un fichier SVG est uploadé via `POST /api/versions/upload`
2. **Parsing**: Le SVG est parsé et les éléments géométriques sont extraits
3. **Normalisation**: Toutes les formes sont converties en paths absolus
4. **Comparaison**: Si version > 1, comparaison avec la version précédente
   - Comparaison du nombre d'éléments
   - Comparaison des coordonnées (epsilon: 0.01px)
   - Comparaison des attributs (fill, stroke, etc.)
5. **AI Summary**: Génération d'un résumé en langage naturel via GPT-4o mini
6. **Storage**: Résultats sauvegardés dans `analysis_json` et `ai_summary`

## Architecture du Diffing Engine

### SVGParserService
- Parse le XML SVG en structure JSON
- Extrait les éléments géométriques
- Normalise en paths absolus
- Calcule les propriétés (bbox, area, perimeter)

### SVGDiffService
- Compare deux SVG parsés
- Détecte les ajouts/suppressions
- Mesure les changements géométriques
- Évalue la sévérité (minor/moderate/major)

### OpenAIService
- Traduit le Delta JSON en français
- Résumé en 2-3 phrases pour designers

## Type Safety

Le projet utilise TypeScript en mode strict :
- Pas de `any`
- Tous les types sont définis
- Validation Zod pour les inputs API

## Performance

- Parsing asynchrone
- Tolérance epsilon configurable (0.01px par défaut)
- Limite de 100 points échantillonnés par path
