-- Migration 017 : retrait du stockage inline legacy et de la FK d'attribution morte.
-- Contexte (audit base 2026-09-07, mesuré sur 83 versions réelles) :
--
--   • versions.snapshot_json : plus JAMAIS écrit depuis la migration 008 (snapshots
--     déportés dans le bucket Storage `snapshots`, colonne storage_path). Seules
--     25 lignes « json_only » antérieures au 2026-03-28 en dépendaient encore —
--     confirmées jetables (aucun besoin de rouvrir/diffs/restaurer un checkpoint
--     pré-fin-mars 2026).
--     ⚠️ Ce DROP supprime DÉFINITIVEMENT ces 25 snapshots inline legacy.
--     Le chemin nominal (storage_path) et le cache de diff (analysis_json) sont intacts.
--
--   • versions.author_id : FK vers profiles JAMAIS renseignée (0/83). L'attribution
--     passe entièrement par author_figma_id / author_name / author_avatar_url — un
--     snapshot de l'auteur figé à la capture, robuste à la disparition du profil.
--     Le DROP retire automatiquement l'index idx_versions_author_id et la contrainte
--     versions_author_id_fkey (dépendants de la colonne).
BEGIN;

ALTER TABLE public.versions DROP COLUMN IF EXISTS snapshot_json;
ALTER TABLE public.versions DROP COLUMN IF EXISTS author_id;

COMMIT;
