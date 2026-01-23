-- ============================================
-- DESIGN GUARDIAN - DATABASE SCHEMA
-- ============================================
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================

-- Enable UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. PROFILES TABLE
-- ============================================
-- Stores user profile data (linked to Supabase Auth)

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. PROJECTS TABLE
-- ============================================
-- A project groups multiple design assets

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries by owner
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(owner_id);

-- ============================================
-- 3. ASSETS TABLE
-- ============================================
-- An asset is a single design file (e.g., logo.svg)

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  current_version_id UUID, -- Will be updated when new version is uploaded
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries by project
CREATE INDEX IF NOT EXISTS idx_assets_project_id ON assets(project_id);

-- ============================================
-- 4. VERSIONS TABLE
-- ============================================
-- A version is a specific revision of an asset

CREATE TABLE IF NOT EXISTS versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  storage_path TEXT NOT NULL, -- Path in Supabase Storage
  file_size INTEGER, -- Size in bytes

  -- Analysis results (from diffing engine)
  analysis_json JSONB,
  ai_summary TEXT,

  -- Metadata
  is_approved BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES profiles(id),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique version numbers per asset
  UNIQUE(asset_id, version_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_versions_asset_id ON versions(asset_id);
CREATE INDEX IF NOT EXISTS idx_versions_created_at ON versions(created_at DESC);

-- ============================================
-- 5. COMPARISONS TABLE (Optional - for caching)
-- ============================================
-- Stores comparison results between two versions

CREATE TABLE IF NOT EXISTS comparisons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version_1_id UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  version_2_id UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  analysis_json JSONB NOT NULL,
  ai_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure unique comparison pairs
  UNIQUE(version_1_id, version_2_id)
);

-- ============================================
-- 6. HELPER FUNCTIONS
-- ============================================

-- Function to get next version number for an asset
CREATE OR REPLACE FUNCTION get_next_version_number(p_asset_id UUID)
RETURNS INTEGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_num
  FROM versions
  WHERE asset_id = p_asset_id;

  RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- Function to update asset's current_version_id
CREATE OR REPLACE FUNCTION update_asset_current_version()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE assets
  SET current_version_id = NEW.id,
      updated_at = NOW()
  WHERE id = NEW.asset_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update current version
DROP TRIGGER IF EXISTS on_version_created ON versions;
CREATE TRIGGER on_version_created
  AFTER INSERT ON versions
  FOR EACH ROW EXECUTE FUNCTION update_asset_current_version();

-- ============================================
-- 7. UPDATED_AT TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_assets_updated_at ON assets;
CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- DONE!
-- ============================================
-- Next steps:
-- 1. Run policies.sql for Row Level Security
-- 2. Create "svg-files" bucket in Storage
-- 3. Configure Storage policies
