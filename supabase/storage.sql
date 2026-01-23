-- ============================================
-- DESIGN GUARDIAN - STORAGE CONFIGURATION
-- ============================================
-- Run this AFTER schema.sql and policies.sql
-- ============================================

-- ============================================
-- 1. CREATE BUCKET (via Dashboard or SQL)
-- ============================================
-- Go to Supabase Dashboard > Storage > Create Bucket
-- Name: svg-files
-- Public: No (private)
-- File size limit: 10MB
-- Allowed MIME types: image/svg+xml

-- Or via SQL (if you have the storage schema access):
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'svg-files',
  'svg-files',
  false,
  10485760, -- 10MB in bytes
  ARRAY['image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. STORAGE POLICIES
-- ============================================

-- Policy: Users can upload SVG files to their project folders
-- Path format: {project_id}/{asset_id}/v{version}.svg
CREATE POLICY "Users can upload SVG files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'svg-files'
    AND auth.role() = 'authenticated'
    AND (
      -- Check user owns the project (first part of path)
      EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.owner_id = auth.uid()
      )
    )
  );

-- Policy: Users can view their own SVG files
CREATE POLICY "Users can view own SVG files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'svg-files'
    AND (
      EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.owner_id = auth.uid()
      )
    )
  );

-- Policy: Users can delete their own SVG files
CREATE POLICY "Users can delete own SVG files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'svg-files'
    AND (
      EXISTS (
        SELECT 1 FROM projects
        WHERE projects.id::text = (storage.foldername(name))[1]
        AND projects.owner_id = auth.uid()
      )
    )
  );

-- ============================================
-- NOTE: Service Role Access
-- ============================================
-- The backend uses SUPABASE_SERVICE_KEY which bypasses
-- all RLS policies. This is intentional for server-side
-- operations like automated analysis.

-- ============================================
-- DONE!
-- ============================================
