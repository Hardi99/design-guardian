-- Migration 011 : moindre privilège sur les tables public (advisors 0026/0027)
-- Les default privileges Supabase accordent SELECT à anon ET authenticated sur tout
-- nouvel objet public → les tables apparaissent dans le schéma GraphQL/PostgREST.
-- Ce n'est pas une fuite (la RLS filtre les lignes), mais c'est de la surface inutile.
--
-- Accès réels constatés (audit code, 2026-06-11) :
--   • assets / projects / versions : JAMAIS lus en direct par un client front.
--     Seul le backend Hono y accède, en service_role (non affecté par ce REVOKE).
--   • profiles : lu par la webapp Next.js dans le dashboard, en rôle `authenticated`
--     (cf. frontend/app/(dashboard)/dashboard/page.tsx). On conserve donc ce grant.
--
-- ⚠️ Si la webapp se met un jour à lire assets/projects/versions directement via le
-- client Supabase (authenticated), il faudra re-`GRANT SELECT` à ce moment-là.

BEGIN;

-- Tables jamais lues en direct par le front → service_role (backend) uniquement
REVOKE SELECT ON public.assets,
                 public.projects,
                 public.versions
  FROM anon, authenticated;

-- profiles : retiré à anon, conservé pour authenticated (dashboard webapp)
REVOKE SELECT ON public.profiles FROM anon;

COMMIT;

-- Résiduel attendu après 010+011 :
--   • 1 WARN 0027 sur profiles/authenticated → BY DESIGN (le dashboard lit le profil).
--   • 1 WARN leaked_password_protection → bloqué par le plan Supabase free (cf. BC04 §4).
