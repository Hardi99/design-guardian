-- ============================================
-- DESIGN GUARDIAN - ROW LEVEL SECURITY POLICIES
-- ============================================
-- Run this AFTER schema.sql
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES POLICIES
-- ============================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================
-- PROJECTS POLICIES
-- ============================================

-- Users can view their own projects
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = owner_id);

-- Users can create projects (owner_id must match their id)
CREATE POLICY "Users can create own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Users can update their own projects
CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = owner_id);

-- Users can delete their own projects
CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = owner_id);

-- ============================================
-- ASSETS POLICIES
-- ============================================

-- Users can view assets in their projects
CREATE POLICY "Users can view assets in own projects"
  ON assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = assets.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Users can create assets in their projects
CREATE POLICY "Users can create assets in own projects"
  ON assets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Users can update assets in their projects
CREATE POLICY "Users can update assets in own projects"
  ON assets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = assets.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Users can delete assets in their projects
CREATE POLICY "Users can delete assets in own projects"
  ON assets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = assets.project_id
      AND projects.owner_id = auth.uid()
    )
  );

-- ============================================
-- VERSIONS POLICIES
-- ============================================

-- Users can view versions of assets in their projects
CREATE POLICY "Users can view versions in own projects"
  ON versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM assets
      JOIN projects ON projects.id = assets.project_id
      WHERE assets.id = versions.asset_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Users can create versions for assets in their projects
CREATE POLICY "Users can create versions in own projects"
  ON versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assets
      JOIN projects ON projects.id = assets.project_id
      WHERE assets.id = asset_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Users can update versions in their projects (e.g., approve)
CREATE POLICY "Users can update versions in own projects"
  ON versions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM assets
      JOIN projects ON projects.id = assets.project_id
      WHERE assets.id = versions.asset_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Users can delete versions in their projects
CREATE POLICY "Users can delete versions in own projects"
  ON versions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM assets
      JOIN projects ON projects.id = assets.project_id
      WHERE assets.id = versions.asset_id
      AND projects.owner_id = auth.uid()
    )
  );

-- ============================================
-- COMPARISONS POLICIES
-- ============================================

-- Users can view comparisons of their versions
CREATE POLICY "Users can view own comparisons"
  ON comparisons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM versions v1
      JOIN assets ON assets.id = v1.asset_id
      JOIN projects ON projects.id = assets.project_id
      WHERE v1.id = comparisons.version_1_id
      AND projects.owner_id = auth.uid()
    )
  );

-- Users can create comparisons for their versions
CREATE POLICY "Users can create own comparisons"
  ON comparisons FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM versions v1
      JOIN assets ON assets.id = v1.asset_id
      JOIN projects ON projects.id = assets.project_id
      WHERE v1.id = version_1_id
      AND projects.owner_id = auth.uid()
    )
  );

-- ============================================
-- SERVICE ROLE BYPASS
-- ============================================
-- Note: The service_role key bypasses RLS automatically
-- This is used by the backend API for admin operations

-- ============================================
-- DONE!
-- ============================================
