-- Page-centric (cf. docs/conception/specs/2026-09-20-page-centric-design.md).
-- Marque l'unité de capture d'un asset. Les lignes existantes sont frame-centric et
-- passent en lecture seule ; les nouvelles captures créeront des assets 'page'.
-- Marqueur EXPLICITE : un id de page Figma n'est pas distinguable d'un id de nœud,
-- donc l'inférence est impossible.
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'frame';

ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS assets_scope_check;

ALTER TABLE assets
  ADD CONSTRAINT assets_scope_check CHECK (scope IN ('frame', 'page'));

COMMENT ON COLUMN assets.scope IS
  'Unité de capture : frame (legacy, lecture seule) ou page (page-centric).';
