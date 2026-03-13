# Bilan base de données — Design Guardian

## Ce qui a été fait via SQL Editor

### Corrections manuelles (hors migrations)

```sql
-- storage_path était NOT NULL, on passe à nullable
ALTER TABLE versions ALTER COLUMN storage_path DROP NOT NULL;

-- owner_id était NOT NULL, on passe à nullable (pas de web app pour créer des users)
ALTER TABLE projects ALTER COLUMN owner_id DROP NOT NULL;

-- Trigger qui référençait assets.current_version_id (colonne inexistante)
DROP TRIGGER IF EXISTS on_version_created ON versions;
DROP FUNCTION IF EXISTS update_asset_current_version();
```

---

## Migrations (à appliquer dans l'ordre)

### 003 — Schéma plugin Figma
- `profiles` : ajout `figma_id` (identité Figma) + `plan` ('free'|'pro'|'team')
- `assets` : ajout `asset_type` ('logo'|'icon'|'packaging'|'illustration'|'ui'|'other')
- `assets` : suppression `current_version_id` et `branch` (branch vit sur `versions`)
- `versions` : ajout `parent_id` (arbre de branches), `branch_name`, `author_id`, `figma_node_id`
- `versions` : ajout `snapshot_json JSONB NOT NULL` (propriétés Figma natives — source du diff)
- `versions` : ajout `approved_by`
- Suppression table `comparisons` (plus utilisée)
- Création vue `version_tree` (CTE récursif pour l'arbre)

### 004 — Fix workflow status
- Contrainte `status` : remplace 'rejected' par 'review' → `('draft','review','approved')`
- Supprime la colonne `branch` sur `assets` (ré-ajoutée par erreur)

### 005 — API key projet
- `projects` : ajout `api_key TEXT UNIQUE DEFAULT gen_random_uuid()::text`
- `projects` : ajout `plan` ('free'|'pro'|'team')
- Index sur `api_key` pour les lookups rapides

### 006 — Attribution inline sur les versions
- `versions` : ajout `author_figma_id`, `author_name`, `author_avatar_url`
- `author_id` (FK profiles) reste mais devient nullable — le plugin utilise `figma.currentUser` directement

### 007 — Auto-init par fichier Figma
- `projects` : ajout `figma_file_key TEXT UNIQUE`
- Permet au plugin de s'auto-connecter sans saisie manuelle de clé

---

## Schéma final des tables clés

```
projects
  id uuid PK
  name text
  owner_id uuid (nullable) → profiles
  api_key text UNIQUE          ← auth du plugin (X-API-Key header)
  figma_file_key text UNIQUE   ← identifiant du fichier Figma (auto-init)
  plan 'free'|'pro'|'team'
  created_at

assets
  id uuid PK
  project_id uuid → projects
  name text
  asset_type 'logo'|'icon'|'packaging'|'illustration'|'ui'|'other'

versions
  id uuid PK
  asset_id uuid → assets
  parent_id uuid → versions    ← structure arbre (NULL = racine de branche)
  branch_name text             ← 'main', 'test-couleur', etc.
  version_number int
  author_figma_id text         ← figma.currentUser.id
  author_name text             ← figma.currentUser.name
  author_avatar_url text
  figma_node_id text
  snapshot_json jsonb NOT NULL ← propriétés Figma natives (source du diff)
  storage_path text (nullable) ← chemin SVG dans Supabase Storage
  analysis_json jsonb          ← Delta JSON (résultat du diff)
  ai_summary text              ← patch note générée par OpenAI
  status 'draft'|'review'|'approved'
  approved_by uuid
  approved_at timestamp
  created_at timestamp
```

---

## Bucket Supabase Storage : `design-guardian`

**À quoi il sert :** stocker les exports SVG des éléments Figma, **uniquement pour l'affichage visuel** dans le diff viewer (Split/Overlay).

**Ce qu'il ne fait PAS :** le diff lui-même. Le diff est calculé à partir de `snapshot_json` (propriétés géométriques natives Figma). Le SVG n'est jamais envoyé à OpenAI (RGPD).

**Structure des fichiers :**
```
design-guardian/
  {project_id}/
    {asset_id}/
      {branch_name}/
        v1.svg
        v2.svg
        ...
```

**Accès :** bucket privé, accès via URLs signées (1h d'expiry) générées par le backend avec la `SERVICE_ROLE_KEY`.

**Sans SVG :** le plugin fonctionne quand même — `storage_path` est nullable, le diff textuel (Smart Data + AI) reste disponible. Le visuel est un bonus.
