-- Migration 010 : security & performance hardening
-- Généré à partir de l'audit `get_advisors` (sécurité + perf) du 2026-06-11.
-- À RELIRE puis appliquer (SQL Editor Supabase, ou `supabase db push`).
-- Idempotent et transactionnel : tout passe ou rien.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Suppression de la vue version_tree (advisor 0010 security_definer_view — ERROR)
--    Créée en migration 003 comme helper d'arbre récursif, mais JAMAIS utilisée :
--    le code reconstruit l'arbre en TS via `parent_id` (branches.controller `/tree`).
--    Elle était SECURITY DEFINER + accessible à `anon` = fuite cross-tenant (elle
--    contournait la RLS de `versions`). Inutile + dangereuse → on la supprime.
--    (À supprimer AVANT les colonnes ci-dessous, dont elle dépendait.)
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.version_tree;

-- Colonnes mortes (jamais écrites par le code ; `status` est la source de vérité
-- de l'approbation, pas `is_approved`).
ALTER TABLE public.versions DROP COLUMN IF EXISTS is_approved;
ALTER TABLE public.versions DROP COLUMN IF EXISTS file_size;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fonctions : search_path figé (advisor 0011 function_search_path_mutable).
--    Avec search_path = '', toutes les tables sont qualifiées par public.*
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_next_version_number(p_asset_id uuid)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_num
  FROM public.versions
  WHERE asset_id = p_asset_id;
  RETURN next_num;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER          -- requis : crée le profil au signup en contournant la RLS
SET search_path = ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fonctions trigger : ne pas les exposer en RPC public/REST
--    (advisors 0028/0029 — handle_new_user appelable par anon/authenticated).
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_next_version_number(uuid)    FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS : auth.uid() enveloppé dans (select auth.uid())
--    (advisor 0003 auth_rls_initplan — évalué une fois au lieu de par ligne).
-- ─────────────────────────────────────────────────────────────────────────────
-- profiles
ALTER POLICY "Users can view own profile"   ON public.profiles USING ((select auth.uid()) = id);
ALTER POLICY "Users can update own profile" ON public.profiles USING ((select auth.uid()) = id);

-- projects
ALTER POLICY "Users can view own projects"   ON public.projects USING ((select auth.uid()) = owner_id);
ALTER POLICY "Users can update own projects" ON public.projects USING ((select auth.uid()) = owner_id);
ALTER POLICY "Users can delete own projects" ON public.projects USING ((select auth.uid()) = owner_id);
ALTER POLICY "Users can create own projects" ON public.projects WITH CHECK ((select auth.uid()) = owner_id);

-- assets
ALTER POLICY "Users can view assets in own projects"   ON public.assets
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = assets.project_id AND projects.owner_id = (select auth.uid())));
ALTER POLICY "Users can update assets in own projects" ON public.assets
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = assets.project_id AND projects.owner_id = (select auth.uid())));
ALTER POLICY "Users can delete assets in own projects" ON public.assets
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = assets.project_id AND projects.owner_id = (select auth.uid())));
ALTER POLICY "Users can create assets in own projects" ON public.assets
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = assets.project_id AND projects.owner_id = (select auth.uid())));

-- versions
ALTER POLICY "Users can view versions in own projects"   ON public.versions
  USING (EXISTS (SELECT 1 FROM public.assets JOIN public.projects ON projects.id = assets.project_id WHERE assets.id = versions.asset_id AND projects.owner_id = (select auth.uid())));
ALTER POLICY "Users can update versions in own projects" ON public.versions
  USING (EXISTS (SELECT 1 FROM public.assets JOIN public.projects ON projects.id = assets.project_id WHERE assets.id = versions.asset_id AND projects.owner_id = (select auth.uid())));
ALTER POLICY "Users can delete versions in own projects" ON public.versions
  USING (EXISTS (SELECT 1 FROM public.assets JOIN public.projects ON projects.id = assets.project_id WHERE assets.id = versions.asset_id AND projects.owner_id = (select auth.uid())));
ALTER POLICY "Users can create versions in own projects" ON public.versions
  WITH CHECK (EXISTS (SELECT 1 FROM public.assets JOIN public.projects ON projects.id = assets.project_id WHERE assets.id = versions.asset_id AND projects.owner_id = (select auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. FK non indexée (advisor 0001 unindexed_foreign_keys)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_versions_approved_by ON public.versions (approved_by);

COMMIT;

-- NB : "Leaked password protection" (advisor auth) n'est PAS configurable en SQL —
-- l'activer dans Dashboard → Authentication → Policies.
-- Les "unused index" (INFO) sont normaux en phase dev (peu de trafic) : on ne touche pas.
