-- Migration 016 : moindre privilège nps_responses + index FK manquant. Idempotent.
-- Suite de l'audit base 2026-09-07 :
--   • nps_responses (créée après 011) est la SEULE table encore SELECT-able par anon
--     (advisors 0026/0027). Accès réel = backend service_role uniquement — jamais un
--     client anon/authenticated. La RLS activée-sans-policy bloque déjà les lignes ;
--     on retire aussi les grants de table pour sortir l'objet du schéma GraphQL/PostgREST.
--   • device_links.profile_id : FK sans index couvrant (advisor 0001) → jointures
--     device_links → profiles non indexées.
BEGIN;

-- nps_responses : service_role only (aligne sur device_links / migration 014).
REVOKE ALL PRIVILEGES ON public.nps_responses FROM anon, authenticated;

-- Index couvrant la FK profile_id.
CREATE INDEX IF NOT EXISTS idx_device_links_profile_id ON public.device_links (profile_id);

COMMIT;
