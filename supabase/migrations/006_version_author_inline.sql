-- Migration 006 — Inline author fields on versions
-- Figma users are identified via figma.currentUser, not via Supabase auth.
-- Store author info directly on the version row to avoid the profiles FK dependency.

ALTER TABLE versions
  ADD COLUMN IF NOT EXISTS author_figma_id TEXT,
  ADD COLUMN IF NOT EXISTS author_name     TEXT,
  ADD COLUMN IF NOT EXISTS author_avatar_url TEXT;

-- author_id (FK to profiles) remains but nullable — not used by the plugin
ALTER TABLE versions
  ALTER COLUMN author_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_versions_author_figma_id ON versions(author_figma_id);
