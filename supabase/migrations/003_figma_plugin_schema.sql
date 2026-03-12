-- ============================================================
-- MIGRATION 003 - Figma Plugin Schema
-- Design Guardian pivot: web app -> Figma plugin
-- Run in Supabase SQL Editor after 001 and 002
-- ============================================================

-- ============================================================
-- 1. PROFILES — add Figma identity + subscription plan
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS figma_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'team'));

-- ============================================================
-- 2. ASSETS — add asset_type, remove branch (moves to versions)
-- ============================================================

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS asset_type TEXT NOT NULL DEFAULT 'other'
    CHECK (asset_type IN ('logo', 'icon', 'packaging', 'illustration', 'ui', 'other'));

-- Remove current_version_id (replaced by querying versions directly)
ALTER TABLE assets
  DROP COLUMN IF EXISTS current_version_id;

-- Remove branch column from assets (branch now lives on versions)
ALTER TABLE assets
  DROP COLUMN IF EXISTS branch;

-- ============================================================
-- 3. VERSIONS — new columns for Figma plugin vision
-- ============================================================

-- parent_id: enables the branch tree structure (adjacency list)
ALTER TABLE versions
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES versions(id);

-- branch_name: which branch this version belongs to
ALTER TABLE versions
  ADD COLUMN IF NOT EXISTS branch_name TEXT NOT NULL DEFAULT 'main';

-- author_id: who created this checkpoint (attribution / blame)
ALTER TABLE versions
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES profiles(id);

-- figma_node_id: the Figma node.id this checkpoint was taken from
ALTER TABLE versions
  ADD COLUMN IF NOT EXISTS figma_node_id TEXT;

-- snapshot_json: Figma node properties (source of truth for diff)
-- Replaces the SVG parsing approach entirely
ALTER TABLE versions
  ADD COLUMN IF NOT EXISTS snapshot_json JSONB;

-- Make snapshot_json NOT NULL going forward (existing rows get empty object)
UPDATE versions SET snapshot_json = '{}' WHERE snapshot_json IS NULL;
ALTER TABLE versions ALTER COLUMN snapshot_json SET NOT NULL;

-- approved_by: who approved this version (Gold status)
ALTER TABLE versions
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);

-- Rename is_approved to reflect Gold concept (keep column name for compat)
-- is_approved already exists from schema.sql

-- ============================================================
-- 4. REMOVE comparisons table (no longer needed)
-- ============================================================

DROP TABLE IF EXISTS comparisons;

-- ============================================================
-- 5. INDEXES for new columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_versions_parent_id    ON versions(parent_id);
CREATE INDEX IF NOT EXISTS idx_versions_branch_name  ON versions(branch_name);
CREATE INDEX IF NOT EXISTS idx_versions_author_id    ON versions(author_id);
CREATE INDEX IF NOT EXISTS idx_profiles_figma_id     ON profiles(figma_id);

-- ============================================================
-- 6. WITH RECURSIVE helper view for branch tree
-- ============================================================

CREATE OR REPLACE VIEW version_tree AS
WITH RECURSIVE tree AS (
  -- Root nodes (no parent = branch root)
  SELECT
    v.*,
    0 AS depth,
    ARRAY[v.id] AS path
  FROM versions v
  WHERE v.parent_id IS NULL

  UNION ALL

  -- Children
  SELECT
    v.*,
    t.depth + 1,
    t.path || v.id
  FROM versions v
  JOIN tree t ON v.parent_id = t.id
)
SELECT * FROM tree;

-- ============================================================
-- 7. Supabase Storage bucket: design-guardian
-- ============================================================
-- Run separately in Storage dashboard or via:
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('design-guardian', 'design-guardian', false)
-- ON CONFLICT DO NOTHING;

-- ============================================================
-- DONE
-- ============================================================
