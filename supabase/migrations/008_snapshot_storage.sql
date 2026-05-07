-- ============================================
-- MIGRATION 008 — Snapshots vers Supabase Storage
-- ============================================
-- Les snapshots JSON ne sont plus stockés dans PostgreSQL.
-- Ils sont uploadés dans le bucket 'snapshots'.
-- La colonne snapshot_json reste (nullable) pour compatibilité
-- avec les versions déjà créées avant cette migration.
-- ============================================

-- Bucket privé pour les snapshots JSON
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'snapshots',
  'snapshots',
  false,
  5242880, -- 5MB max par snapshot
  ARRAY['application/json']
)
ON CONFLICT (id) DO NOTHING;

-- Rendre snapshot_json nullable (les nouvelles versions n'en ont plus besoin)
ALTER TABLE versions ALTER COLUMN snapshot_json DROP NOT NULL;

-- ============================================
-- STORAGE POLICIES — bucket 'snapshots'
-- Path format : {asset_id}/v{version_number}.json
-- ============================================

-- Upload : l'asset doit appartenir au projet de l'utilisateur
CREATE POLICY "Users can upload snapshots for own assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'snapshots'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM assets
      JOIN projects ON projects.id = assets.project_id
      WHERE assets.id::text = (storage.foldername(objects.name))[1]
      AND projects.owner_id = auth.uid()
    )
  );

-- Lecture : idem
CREATE POLICY "Users can read snapshots for own assets"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'snapshots'
    AND EXISTS (
      SELECT 1 FROM assets
      JOIN projects ON projects.id = assets.project_id
      WHERE assets.id::text = (storage.foldername(objects.name))[1]
      AND projects.owner_id = auth.uid()
    )
  );

-- Suppression : idem
CREATE POLICY "Users can delete snapshots for own assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'snapshots'
    AND EXISTS (
      SELECT 1 FROM assets
      JOIN projects ON projects.id = assets.project_id
      WHERE assets.id::text = (storage.foldername(objects.name))[1]
      AND projects.owner_id = auth.uid()
    )
  );
