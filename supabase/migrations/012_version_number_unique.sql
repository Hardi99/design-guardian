-- Migration 012 : unicité du numéro de version par (asset, branche)
-- À RELIRE puis appliquer (SQL Editor Supabase, ou `supabase db push`).
-- Transactionnel : tout passe ou rien.
--
-- Le backend calcule version_number en lecture-puis-écriture : deux checkpoints
-- concurrents sur le même asset/branche pouvaient viser le même numéro (race).
-- Cette contrainte rend la collision détectable (SQLSTATE 23505) → le backend
-- retombe et réessaie avec le numéro suivant (createVersionAtomic).

BEGIN;

-- Garde-fou : échoue explicitement s'il existe déjà des doublons à nettoyer.
DO $$
DECLARE dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT asset_id, branch_name, version_number
    FROM public.versions
    GROUP BY asset_id, branch_name, version_number
    HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Doublons (asset_id, branch_name, version_number) présents (%): nettoyer avant d''ajouter la contrainte', dup_count;
  END IF;
END $$;

-- Idempotent : Postgres n'a pas d'`ADD CONSTRAINT IF NOT EXISTS`, on garde via pg_constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'versions_asset_branch_vnum_unique'
  ) THEN
    ALTER TABLE public.versions
      ADD CONSTRAINT versions_asset_branch_vnum_unique
      UNIQUE (asset_id, branch_name, version_number);
  END IF;
END $$;

COMMIT;
