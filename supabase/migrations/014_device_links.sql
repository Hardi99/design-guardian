-- Migration 014 : pont billing↔identité (device_links). Idempotent. À appliquer en SQL Editor.
BEGIN;

CREATE TABLE IF NOT EXISTS public.device_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text NOT NULL UNIQUE,           -- 16 octets hex, voyage dans approve_url (non saisi)
  figma_user_id   text NOT NULL,
  figma_user_name text,
  profile_id      uuid REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL = en attente
  token_hash      text,                           -- SHA-256 hex du link_token ; NULL = en attente
  pending_token   text,                           -- plaintext éphémère, livré 1× puis NULL
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,           -- validité du `code` (~10 min)
  approved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_device_links_code       ON public.device_links (code);
CREATE INDEX IF NOT EXISTS idx_device_links_token_hash ON public.device_links (token_hash);
CREATE INDEX IF NOT EXISTS idx_device_links_figma_user ON public.device_links (figma_user_id);

ALTER TABLE public.device_links ENABLE ROW LEVEL SECURITY;
-- Aucune policy : accès backend service-key uniquement (deny-all pour anon/authenticated).

COMMIT;
