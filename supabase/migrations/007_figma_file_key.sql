-- Auto-init: identify projects by Figma file key (no manual API key entry)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS figma_file_key text UNIQUE;
