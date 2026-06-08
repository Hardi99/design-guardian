# Configuration Supabase - Design Guardian

Guide complet pour configurer Supabase pour Design Guardian.

## Prérequis

1. Créer un compte sur [supabase.com](https://supabase.com)
2. Créer un nouveau projet
3. Récupérer les clés API

## Étape 1 : Récupérer les clés API

1. Va dans **Settings > API** dans le dashboard Supabase
2. Note ces valeurs :
   - **Project URL** : `https://xxxxx.supabase.co`
   - **anon/public key** : `eyJhbG...` (pour le frontend)
   - **service_role key** : `eyJhbG...` (pour le backend, GARDER SECRET)

## Étape 2 : Créer le schéma de base de données

1. Va dans **SQL Editor** dans le dashboard
2. Copie-colle le contenu de `schema.sql`
3. Clique **Run**
4. Vérifie que les tables sont créées dans **Table Editor**

Tables créées :
- `profiles` - Utilisateurs
- `projects` - Projets
- `assets` - Assets (fichiers SVG)
- `versions` - Versions des assets
- `comparisons` - Comparaisons cachées

## Étape 3 : Configurer les policies RLS

1. Dans **SQL Editor**
2. Copie-colle le contenu de `policies.sql`
3. Clique **Run**

Cela active la Row Level Security pour que chaque utilisateur
ne voie que ses propres données.

## Étape 4 : Créer le bucket Storage

Le bucket actif est **`snapshots`** (snapshots JSON + rendus du plugin).

1. Dans **SQL Editor**, exécute `migrations/008_snapshot_storage.sql` — il crée le bucket `snapshots` (privé, 5MB, `application/json`) **et** ses policies.

> ⚠️ L'ancien bucket `svg-files` (config dans `storage.sql`) appartenait à la version SaaS upload-SVG, abandonnée. Ne plus le créer.

## Étape 5 : Policies Storage

Les policies du bucket `snapshots` sont **incluses** dans `migrations/008_snapshot_storage.sql` (déjà exécuté à l'étape 4) — rien de plus à faire.

## Étape 6 : Configurer les variables d'environnement

### Backend (`backend/.env`)

```bash
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OpenAI
OPENAI_API_KEY=sk-...

# Server
PORT=3002
NODE_ENV=development
```

### Frontend (`frontend/.env.local`)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:3002
```

## Étape 7 : Tester la configuration

### Test 1 : Vérifier les tables

```sql
SELECT * FROM profiles LIMIT 5;
SELECT * FROM projects LIMIT 5;
SELECT * FROM assets LIMIT 5;
SELECT * FROM versions LIMIT 5;
```

### Test 2 : Créer un utilisateur test

1. Va dans **Authentication > Users**
2. Clique **Add user**
3. Email : `test@example.com`
4. Password : `test123456`

Un profil devrait être créé automatiquement dans la table `profiles`.

### Test 3 : Vérifier le Storage

1. Va dans **Storage > snapshots**
2. Les snapshots JSON y apparaissent après un checkpoint depuis le plugin

## Structure des données

### Profiles
```
id (uuid) - PK, ref auth.users
email (text)
full_name (text)
avatar_url (text)
created_at (timestamp)
```

### Projects
```
id (uuid) - PK
name (text)
description (text)
owner_id (uuid) - FK profiles
created_at (timestamp)
```

### Assets
```
id (uuid) - PK
project_id (uuid) - FK projects
name (text)
description (text)
current_version_id (uuid) - FK versions
created_at (timestamp)
```

### Versions
```
id (uuid) - PK
asset_id (uuid) - FK assets
version_number (int)
storage_path (text)
file_size (int)
analysis_json (jsonb)
ai_summary (text)
is_approved (bool)
created_at (timestamp)
```

## Storage Path Convention

Bucket `snapshots` — snapshots JSON (et rendus `*_render.json`) :
```
{asset_id}/{branch}/v{version_number}.json
{asset_id}/{branch}/v{version_number}_render.json
```

## Dépannage

### Erreur "RLS policy violation"
- Vérifie que l'utilisateur est authentifié
- Vérifie que les policies sont bien créées
- Utilise la service_key côté backend pour bypasser RLS

### Erreur "Bucket not found"
- Vérifie que le bucket `snapshots` existe (migration 008)
- Vérifie le nom (sensible à la casse)

### Erreur "Invalid MIME type"
- Vérifie que le fichier est bien un SVG
- Configure les allowed MIME types du bucket

## Notes de sécurité

- **JAMAIS** exposer `SUPABASE_SERVICE_KEY` côté client
- Utilise `SUPABASE_ANON_KEY` pour le frontend
- Les policies RLS protègent les données par utilisateur
- Le backend utilise la service_key pour les opérations admin
