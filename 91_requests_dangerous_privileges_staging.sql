-- LYANN Migration 91 — requests: remove the structural table privileges TRUNCATE, TRIGGER and REFERENCES
-- from anon, authenticated (and PUBLIC). Staging only (tdktfbtqceldlaeqjtow). Never Production.
-- Rollback: 91_requests_dangerous_privileges_rollback.sql. Notes: docs/requests-privileges-lockdown-staging.md.
--
-- Why: RLS filters rows for SELECT/INSERT/UPDATE/DELETE only. TRUNCATE ignores row level security, and
-- TRIGGER / REFERENCES are DDL-grade privileges. They were granted by the Supabase default privileges and no
-- LYANN journey needs them: the web and mobile clients and the API only run SELECT / INSERT / UPDATE / DELETE
-- through PostgREST, and the triggers, functions and foreign keys that involve requests belong to postgres
-- (owner), which keeps its own privileges.
--
-- Not changed here, on purpose: SELECT, INSERT, UPDATE, DELETE and MAINTAIN, the policies (the secure SELECT policy of
-- migration 90 stays byte for byte), service_role, postgres and every other table.
BEGIN;

-- 0. Preconditions and snapshots. Anything unexpected aborts and rolls back the whole migration.
DO $pre$
DECLARE
    v_policies text;
    v_kept text;
BEGIN
    IF to_regclass('public.requests') IS NULL
       OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.requests'::regclass) THEN
        RAISE EXCEPTION 'migration 91: public.requests missing or RLS disabled';
    END IF;

    -- Migration 90 must be in place: exactly one SELECT policy, for authenticated, and anon has no SELECT.
    IF (SELECT array_agg(policyname || ':' || roles::text ORDER BY policyname)
        FROM pg_policies WHERE schemaname = 'public' AND tablename = 'requests' AND cmd IN ('SELECT', 'ALL'))
       IS DISTINCT FROM ARRAY['Requests readable by authorized members:{authenticated}'] THEN
        RAISE EXCEPTION 'migration 91: apply migration 90 first (unexpected SELECT policies on requests)';
    END IF;
    IF has_table_privilege('anon', 'public.requests', 'SELECT') THEN
        RAISE EXCEPTION 'migration 91: anon still has SELECT on requests (migration 90 incomplete)';
    END IF;

    -- Snapshot 1: every policy of the table (name, command, roles, expressions).
    SELECT md5(string_agg(policyname || '|' || cmd || '|' || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''),
                          E'\n' ORDER BY policyname))
      INTO v_policies
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'requests';

    -- Snapshot 2: every table privilege that this migration must NOT touch (grantee, privilege), PUBLIC included.
    SELECT coalesce(string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type), '')
      INTO v_kept
    FROM (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type
          FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
          WHERE c.oid = 'public.requests'::regclass
            AND a.privilege_type NOT IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')) s;

    PERFORM set_config('lyann.m91_policies', v_policies, true);
    PERFORM set_config('lyann.m91_kept', v_kept, true);
END
$pre$;

-- 1. The correction. PUBLIC is included so that nothing can remain through the pseudo role.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.requests FROM PUBLIC, anon, authenticated;

-- 2. Post-conditions: roll back if the result is not exactly what was prepared.
DO $post$
DECLARE
    v_role text;
    v_priv text;
    v_policies text;
    v_kept text;
BEGIN
    -- Effective privileges (direct, inherited and through PUBLIC) of the two exposed roles.
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'authenticator'] LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role);  -- authenticator: Supabase only
        FOREACH v_priv IN ARRAY ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES'] LOOP
            IF has_table_privilege(v_role, 'public.requests', v_priv) THEN
                RAISE EXCEPTION 'migration 91: % still has % on requests', v_role, v_priv;
            END IF;
        END LOOP;
        IF has_any_column_privilege(v_role, 'public.requests', 'REFERENCES') THEN
            RAISE EXCEPTION 'migration 91: % still has a column REFERENCES privilege on requests', v_role;
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
               WHERE c.oid = 'public.requests'::regclass AND a.grantee = 0
                 AND a.privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')) THEN
        RAISE EXCEPTION 'migration 91: PUBLIC still holds a structural privilege on requests';
    END IF;

    -- Internal roles keep what they had.
    IF NOT (has_table_privilege('service_role', 'public.requests', 'TRUNCATE')
        AND has_table_privilege('service_role', 'public.requests', 'TRIGGER')
        AND has_table_privilege('service_role', 'public.requests', 'REFERENCES')
        AND has_table_privilege('postgres', 'public.requests', 'TRUNCATE')) THEN
        RAISE EXCEPTION 'migration 91: service_role or postgres lost a privilege';
    END IF;

    -- Nothing else moved: same other privileges, same policies.
    SELECT coalesce(string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type), '')
      INTO v_kept
    FROM (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type
          FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
          WHERE c.oid = 'public.requests'::regclass
            AND a.privilege_type NOT IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')) s;
    IF v_kept IS DISTINCT FROM current_setting('lyann.m91_kept') THEN
        RAISE EXCEPTION 'migration 91: other privileges changed (before: %, after: %)', current_setting('lyann.m91_kept'), v_kept;
    END IF;

    SELECT md5(string_agg(policyname || '|' || cmd || '|' || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''),
                          E'\n' ORDER BY policyname))
      INTO v_policies
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'requests';
    IF v_policies IS DISTINCT FROM current_setting('lyann.m91_policies') THEN
        RAISE EXCEPTION 'migration 91: the policies of requests changed';
    END IF;
END
$post$;

COMMIT;
