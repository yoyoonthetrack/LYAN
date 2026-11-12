-- LYANN Migration 97 — stop exposing FUTURE functions created by postgres to anon / authenticated by default.
-- PREPARED, NOT APPLIED, NOT REHEARSED ON STAGING. Staging only (tdktfbtqceldlaeqjtow). Needs its own authorization and its own rolled-back rehearsal.
-- Never Production without a separate, explicit decision. Rollback: 97_default_function_privileges_lockdown_rollback.sql
--
-- Cause (Phase 3.2C-5 / 5.2, read-only catalog on Staging): a new function owned by postgres in schema public receives the UNION of
--   1. the PostgreSQL built-in default for functions: EXECUTE to PUBLIC (and the owner), and
--   2. the schema default stored in pg_default_acl (postgres, public, 'f'): EXECUTE to anon, authenticated, service_role.
-- There is no global (all-schemas) default entry. Migrations 39/40 only did "REVOKE ALL ... FROM PUBLIC" on each function, which removes (1) but not (2);
-- a function created without that line is exposed twice (PUBLIC and explicit grants). A schema-level REVOKE can only remove schema-level grants, so both
-- statements below are needed: the schema one removes (2), the global one removes (1) for functions created by postgres.
-- Existing functions are NOT changed (their ACL is stored on the function).
--
-- Effect: a new function created by postgres gets ACL {postgres, service_role}. A function meant to be called from the app must be granted explicitly:
--     GRANT EXECUTE ON FUNCTION public.my_rpc(...) TO authenticated;      -- add anon only for functions meant for visitors
-- Functions evaluated as the calling role (RLS policy helpers, column defaults, view bodies) need that explicit grant as well. Trigger functions do not.
-- Side effect to know about: the global statement also applies to functions postgres creates in other schemas (for example a future CREATE EXTENSION by
-- postgres in schema extensions). Supabase-owned schemas keep their own schema-level defaults; verify with the rehearsal before applying.
--
-- Scope: default privileges only. No existing object, policy, grant or data is touched.

BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- supabase_admin owns Supabase-managed objects. postgres may not be allowed to edit that role's defaults on every project: tolerate it, report it.
DO $sa$
BEGIN
    BEGIN
        EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated';
    EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
        RAISE NOTICE 'migration 97: supabase_admin defaults not editable here (%), left unchanged', SQLERRM;
    END;
END
$sa$;

DO $post$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_default_acl d
        WHERE d.defaclrole = 'postgres'::regrole AND d.defaclobjtype = 'f'
          AND d.defaclacl::text ~ '[{,](anon|authenticated)='
          AND d.defaclnamespace = 'public'::regnamespace
    ) THEN
        RAISE EXCEPTION 'migration 97: postgres default function ACL in public still grants EXECUTE to anon or authenticated';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_default_acl d
        WHERE d.defaclrole = 'postgres'::regrole AND d.defaclobjtype = 'f' AND d.defaclacl::text ~ '[{,]=X/'
    ) THEN
        RAISE EXCEPTION 'migration 97: a postgres default function ACL still grants EXECUTE to PUBLIC';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_default_acl d
        WHERE d.defaclrole = 'postgres'::regrole AND d.defaclnamespace = 'public'::regnamespace AND d.defaclobjtype = 'f'
          AND d.defaclacl::text ~ '[{,]service_role='
    ) THEN
        RAISE EXCEPTION 'migration 97: service_role lost its default EXECUTE on new functions in public';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_default_acl d
        WHERE d.defaclrole = 'postgres'::regrole AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f'
    ) THEN
        RAISE EXCEPTION 'migration 97: the global default (PUBLIC revoked) was not recorded';
    END IF;
END
$post$;

COMMIT;
