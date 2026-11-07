-- Staging (tdktfbtqceldlaeqjtow) only. Checks migration 91 with real roles.
-- Nothing can be committed: the block ends with an exception that carries the report, so every statement it ran
-- (the TRUNCATE attempts, the INSERT / UPDATE / DELETE of the author scenario) is rolled back by PostgreSQL.
-- If a TRUNCATE were ever permitted it would still be rolled back (and it would also be stopped by the foreign
-- keys that reference requests unless CASCADE is used, which this script never does).
--   verdict PASS  : anon and authenticated hold none of TRUNCATE / TRIGGER / REFERENCES, cannot TRUNCATE, the author
--                   journey works, anon cannot read or write, the 76 rows are untouched.
--   verdict FAIL  : read 'failures' in the report.
DO $do$
DECLARE
    v_roles text[] := ARRAY['anon', 'authenticated', 'authenticator', 'service_role', 'postgres'];
    v_privs text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
    v_role text; v_priv text;
    matrix jsonb := '{}'::jsonb;
    failures text[] := '{}';
    v_total_before int; v_total_after int; v_md5_before text; v_md5_after text;
    r_anon_read text; r_anon_trunc text; r_auth_trunc text; r_anon_insert text;
    v_author uuid; v_other uuid; v_own_visible int; v_new_id uuid; v_updated int; v_foreign_updated int; v_deleted int;
    v_policies text;
BEGIN
    SELECT count(*), md5(string_agg(r::text, '|' ORDER BY id)) INTO v_total_before, v_md5_before FROM public.requests r;

    -- 1. Effective privileges (direct + inherited + PUBLIC) as PostgreSQL computes them.
    FOREACH v_role IN ARRAY v_roles LOOP
        matrix := matrix || jsonb_build_object(v_role, (
            SELECT jsonb_object_agg(p, has_table_privilege(v_role, 'public.requests', p)) FROM unnest(v_privs) p));
    END LOOP;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'authenticator'] LOOP
        FOREACH v_priv IN ARRAY ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
            IF has_table_privilege(v_role, 'public.requests', v_priv) THEN
                failures := failures || (v_role || ' has ' || v_priv);
            END IF;
        END LOOP;
        IF has_any_column_privilege(v_role, 'public.requests', 'REFERENCES') THEN
            failures := failures || (v_role || ' has a column REFERENCES');
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
               WHERE c.oid = 'public.requests'::regclass AND a.grantee = 0) THEN
        failures := failures || 'PUBLIC holds a privilege on requests';
    END IF;
    IF NOT (has_table_privilege('service_role', 'public.requests', 'TRUNCATE') AND has_table_privilege('postgres', 'public.requests', 'TRUNCATE')) THEN
        failures := failures || 'service_role or postgres lost TRUNCATE';
    END IF;

    -- 2. anon: direct read denied.
    BEGIN
        SET LOCAL ROLE anon;
        PERFORM count(*) FROM public.requests;
        r_anon_read := 'READABLE';
    EXCEPTION WHEN insufficient_privilege THEN r_anon_read := 'denied';
    END;
    RESET ROLE;
    IF r_anon_read <> 'denied' THEN failures := failures || 'anon can read requests'; END IF;

    -- 3. TRUNCATE attempts with real roles (rolled back by the final exception in any case).
    BEGIN
        SET LOCAL ROLE anon;
        EXECUTE 'TRUNCATE TABLE public.requests';
        r_anon_trunc := 'PERMITTED';
    EXCEPTION WHEN insufficient_privilege THEN r_anon_trunc := 'denied';
              WHEN OTHERS THEN r_anon_trunc := 'NOT DENIED BY PRIVILEGE: ' || SQLERRM;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    BEGIN
        SET LOCAL ROLE authenticated;
        EXECUTE 'TRUNCATE TABLE public.requests';
        r_auth_trunc := 'PERMITTED';
    EXCEPTION WHEN insufficient_privilege THEN r_auth_trunc := 'denied';
              WHEN OTHERS THEN r_auth_trunc := 'NOT DENIED BY PRIVILEGE: ' || SQLERRM;
    END;
    RESET ROLE;
    IF r_anon_trunc <> 'denied' THEN failures := failures || ('anon TRUNCATE: ' || r_anon_trunc); END IF;
    IF r_auth_trunc <> 'denied' THEN failures := failures || ('authenticated TRUNCATE: ' || r_auth_trunc); END IF;

    -- 4. Ordinary journeys still work for an author (own read, create, edit, delete) and stay closed to others.
    SELECT requester_id INTO v_author FROM public.requests
    WHERE requester_id IS NOT NULL AND public_moderation_status = 'approved'
    GROUP BY requester_id ORDER BY count(*) DESC, requester_id LIMIT 1;
    SELECT id INTO v_other FROM public.requests WHERE requester_id IS DISTINCT FROM v_author AND public_moderation_status = 'approved' ORDER BY id LIMIT 1;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_author, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT count(*) INTO v_own_visible FROM public.requests WHERE requester_id = v_author;
    INSERT INTO public.requests (requester_id, title) VALUES (v_author, 'privilege check (rolled back)') RETURNING id INTO v_new_id;
    UPDATE public.requests SET title = 'privilege check edited' WHERE id = v_new_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    UPDATE public.requests SET title = title WHERE id = v_other;
    GET DIAGNOSTICS v_foreign_updated = ROW_COUNT;
    DELETE FROM public.requests WHERE id = v_new_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RESET ROLE;
    IF v_own_visible = 0 THEN failures := failures || 'author cannot read own requests'; END IF;
    IF v_new_id IS NULL THEN failures := failures || 'author cannot create a request'; END IF;
    IF v_updated <> 1 THEN failures := failures || 'author cannot edit own request'; END IF;
    IF v_foreign_updated <> 0 THEN failures := failures || 'author can edit a foreign request'; END IF;
    IF v_deleted <> 1 THEN failures := failures || 'author cannot delete own request'; END IF;

    -- anon cannot create either (policy requires an authenticated JWT)
    PERFORM set_config('request.jwt.claims', '', true);
    BEGIN
        SET LOCAL ROLE anon;
        INSERT INTO public.requests (title) VALUES ('anon insert (must fail)');
        r_anon_insert := 'PERMITTED';
    EXCEPTION WHEN insufficient_privilege THEN r_anon_insert := 'denied';
    END;
    RESET ROLE;
    IF r_anon_insert <> 'denied' THEN failures := failures || 'anon can insert'; END IF;

    SELECT count(*), md5(string_agg(r::text, '|' ORDER BY id)) INTO v_total_after, v_md5_after FROM public.requests r;
    IF v_total_after <> v_total_before OR v_md5_after IS DISTINCT FROM v_md5_before THEN
        failures := failures || 'rows differ inside the test transaction (before the final rollback)';
    END IF;
    SELECT string_agg(policyname || ':' || cmd || ':' || roles::text, ' | ' ORDER BY policyname) INTO v_policies
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'requests';

    RAISE EXCEPTION 'REPORT %', jsonb_pretty(jsonb_build_object(
        'effective_privileges', matrix,
        'anon_direct_read', r_anon_read,
        'anon_truncate', r_anon_trunc,
        'authenticated_truncate', r_auth_trunc,
        'anon_insert', r_anon_insert,
        'author_journey', jsonb_build_object('own_rows_visible', v_own_visible, 'created', v_new_id IS NOT NULL,
            'edited_rows', v_updated, 'foreign_rows_edited', v_foreign_updated, 'deleted_rows', v_deleted),
        'rows', jsonb_build_object('before', v_total_before, 'after_in_transaction', v_total_after, 'same_fingerprint', v_md5_after = v_md5_before),
        'policies', v_policies,
        'failures', to_jsonb(failures),
        'verdict', CASE WHEN cardinality(failures) = 0 THEN 'PASS' ELSE 'FAIL' END
    )) USING ERRCODE = 'P0001';
END
$do$;
