-- Migration 005 — Project API key + plan
-- Each project has a unique API key used by the Figma plugin.
-- Plan is stored on the project (team-level, not per user).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free', 'pro', 'team'));

CREATE INDEX IF NOT EXISTS idx_projects_api_key ON projects(api_key);
