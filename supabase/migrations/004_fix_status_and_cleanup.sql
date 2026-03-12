-- ============================================================
-- MIGRATION 004 - Fix status workflow + cleanup
-- ============================================================

-- 1. Fix status CHECK: replace 'rejected' with 'review'
--    Workflow: draft → review → approved
ALTER TABLE versions
  DROP CONSTRAINT IF EXISTS versions_status_check;

ALTER TABLE versions
  ADD CONSTRAINT versions_status_check
  CHECK (status IN ('draft', 'review', 'approved'));

-- 2. Remove branch column from assets (wrongly re-added by add_asset_branches.sql)
--    Branch lives on versions.branch_name, not on assets.
ALTER TABLE assets
  DROP COLUMN IF EXISTS branch;

DROP INDEX IF EXISTS idx_assets_branch;
