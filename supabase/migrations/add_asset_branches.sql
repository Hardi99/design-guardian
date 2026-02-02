-- Add branch support to assets
ALTER TABLE assets ADD COLUMN IF NOT EXISTS branch text NOT NULL DEFAULT 'main';

-- Create index for branch filtering
CREATE INDEX IF NOT EXISTS idx_assets_branch ON assets(project_id, branch);

-- Example branches: 'main', 'feature/new-logo', 'experiment/dark-mode'
