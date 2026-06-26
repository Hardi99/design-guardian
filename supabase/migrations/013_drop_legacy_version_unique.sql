-- Migration 013 : supprimer la contrainte d'unicité legacy (asset_id, version_number)
-- À RELIRE puis appliquer (SQL Editor Supabase, ou `supabase db push`). Idempotent.
--
-- PROBLÈME (trouvé par audit de cohérence db↔backend 2026-06-26) :
-- la contrainte historique `versions_asset_id_version_number_key UNIQUE (asset_id, version_number)`
-- impose que version_number soit unique par ASSET, TOUTES BRANCHES CONFONDUES. Or le backend
-- numérote PAR (asset, branche) (`createVersionAtomic`). Conséquence : le 1er checkpoint d'une
-- 2e branche vise version_number=1, qui existe déjà sur 'main' → collision 23505 sur l'ANCIENNE
-- contrainte ; le retry recalcule le max par branche (toujours 1) → boucle → échec 409.
-- Latent uniquement parce que les branches sont parquées.
--
-- La bonne contrainte est celle de la migration 012 : (asset_id, branch_name, version_number).
-- On supprime donc la legacy. Sûr : retirer une contrainte ne peut pas échouer sur des données,
-- et 012 garantit déjà l'absence de doublons (asset, branche, vnum).

BEGIN;

ALTER TABLE public.versions
  DROP CONSTRAINT IF EXISTS versions_asset_id_version_number_key;

COMMIT;
