-- Migration 015 : réponses NPS (satisfaction, prompt in-plugin). Idempotent. À appliquer en SQL Editor.
BEGIN;

CREATE TABLE IF NOT EXISTS public.nps_responses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  score       int  NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment     text,
  respondent  text,                              -- nom/id figma.currentUser (optionnel)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nps_responses_project ON public.nps_responses (project_id);

ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;
-- Aucune policy : accès backend service-key uniquement (deny-all pour anon/authenticated),
-- cohérent avec device_links (migration 014).

COMMIT;
