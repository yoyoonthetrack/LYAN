-- LYANN Migration 91 rollback — gives TRUNCATE, TRIGGER and REFERENCES on public.requests back to
-- anon and authenticated. Staging only. EMERGENCY USE: it restores structural privileges that no LYANN
-- journey needs. Use it only if a documented legitimate dependency is found, and prefer a targeted fix.
-- It does not touch the SELECT policy of migration 90 nor any other privilege.
BEGIN;

DO $pre$
BEGIN
    IF to_regclass('public.requests') IS NULL THEN
        RAISE EXCEPTION 'rollback 91: public.requests missing';
    END IF;
    IF (SELECT array_agg(policyname || ':' || roles::text ORDER BY policyname)
        FROM pg_policies WHERE schemaname = 'public' AND tablename = 'requests' AND cmd IN ('SELECT', 'ALL'))
       IS DISTINCT FROM ARRAY['Requests readable by authorized members:{authenticated}'] THEN
        RAISE EXCEPTION 'rollback 91: unexpected SELECT policies on requests; this rollback does not restore the pre-90 policy';
    END IF;
END
$pre$;

GRANT TRUNCATE, TRIGGER, REFERENCES ON TABLE public.requests TO anon, authenticated;

DO $post$
DECLARE
    v_role text;
    v_priv text;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        FOREACH v_priv IN ARRAY ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES'] LOOP
            IF NOT has_table_privilege(v_role, 'public.requests', v_priv) THEN
                RAISE EXCEPTION 'rollback 91: % did not get % back', v_role, v_priv;
            END IF;
        END LOOP;
    END LOOP;
    IF has_table_privilege('anon', 'public.requests', 'SELECT') THEN
        RAISE EXCEPTION 'rollback 91: anon must not have SELECT on requests';
    END IF;
END
$post$;

COMMIT;
