-- Staging (tdktfbtqceldlaeqjtow) only. Checks migration 92 with real roles, for anon and for EVERY profile.
-- Nothing can be committed: fixtures (one location row per existing announcement, one extra announcement) and every
-- statement of the block are rolled back by the final exception, which carries the report.
--   verdict PASS: anon reads nothing; for every member the visible locations are exactly the locations of the
--   announcements that member can read in public.requests; nobody but service_role can write; constraints refuse
--   incoherent rows; deleting an announcement deletes its location; no precise-position column exists.
DO $do$
DECLARE
    failures text[] := '{}';
    rec record;
    v_visible_loc uuid[]; v_visible_req uuid[]; v_expected uuid[];
    v_extra int; v_missing int;
    n_actors int := 0; n_bad int := 0; max_seen int := 0; min_seen int := 999999;
    r_anon_read text; r_err text;
    v_author uuid; v_new uuid; v_cols text[]; v_n_before int; v_n_after int; v_md5_before text; v_md5_after text;
    v_rows_total int;
    v_sql text;
    v_role text; v_sub uuid;
    v_writes text[] := ARRAY[
        'INSERT INTO public.request_locations (request_id, service_mode) SELECT id, ''REMOTE'' FROM public.requests LIMIT 1 ON CONFLICT DO NOTHING',
        'UPDATE public.request_locations SET service_mode = ''REMOTE'', location_visibility = NULL, commune_code = NULL',
        'DELETE FROM public.request_locations',
        'TRUNCATE public.request_locations'
    ];
BEGIN
    SELECT count(*), md5(string_agg(r::text, '|' ORDER BY id)) INTO v_n_before, v_md5_before FROM public.requests r;
    IF to_regclass('public.request_locations') IS NULL THEN RAISE EXCEPTION 'migration 92 is not applied'; END IF;

    -- Fixtures (owner role, rolled back): one DISCREET location for every existing announcement.
    INSERT INTO public.request_locations (request_id, service_mode, location_visibility, commune_code)
    SELECT id, 'ON_SITE', 'DISCREET', '97113' FROM public.requests;
    GET DIAGNOSTICS v_rows_total = ROW_COUNT;

    -- 1. anon: nothing, not even a count.
    BEGIN
        SET LOCAL ROLE anon;
        PERFORM count(*) FROM public.request_locations;
        r_anon_read := 'READABLE';
    EXCEPTION WHEN insufficient_privilege THEN r_anon_read := 'denied';
    END;
    RESET ROLE;
    IF r_anon_read <> 'denied' THEN failures := failures || 'anon can read request_locations'; END IF;

    -- 2. Every profile: visible locations == locations of the announcements readable in requests.
    FOR rec IN SELECT p.id AS uid FROM public.profiles p ORDER BY p.id LOOP
        PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', rec.uid, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated;
        SELECT coalesce(array_agg(request_id), '{}') INTO v_visible_loc FROM public.request_locations;
        SELECT coalesce(array_agg(id), '{}') INTO v_visible_req FROM public.requests;
        RESET ROLE;
        v_expected := v_visible_req;   -- every announcement has a fixture location
        SELECT count(*) INTO v_extra FROM unnest(v_visible_loc) v WHERE v <> ALL (v_expected);
        SELECT count(*) INTO v_missing FROM unnest(v_expected) e WHERE e <> ALL (v_visible_loc);
        n_actors := n_actors + 1;
        IF v_extra > 0 OR v_missing > 0 THEN n_bad := n_bad + 1; END IF;
        max_seen := greatest(max_seen, cardinality(v_visible_loc));
        min_seen := least(min_seen, cardinality(v_visible_loc));
    END LOOP;
    IF n_bad > 0 THEN failures := failures || (n_bad || ' profiles see a different set of locations than announcements'); END IF;

    -- 3. No direct write for anon, for a member, nor for the author of the rows.
    SELECT requester_id INTO v_author FROM public.requests WHERE requester_id IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1;
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        v_sub := CASE WHEN v_role = 'anon' THEN NULL ELSE v_author END;
        PERFORM set_config('request.jwt.claims', CASE WHEN v_sub IS NULL THEN '' ELSE jsonb_build_object('sub', v_sub, 'role', 'authenticated')::text END, true);
        FOREACH v_sql IN ARRAY v_writes LOOP
            BEGIN
                EXECUTE 'SET LOCAL ROLE ' || v_role;
                EXECUTE v_sql;
                failures := failures || (v_role || ' could run: ' || left(v_sql, 40));
            EXCEPTION WHEN insufficient_privilege THEN NULL;
                      WHEN OTHERS THEN failures := failures || (v_role || ' not denied by privilege (' || SQLERRM || '): ' || left(v_sql, 40));
            END;
            RESET ROLE;
        END LOOP;
    END LOOP;
    PERFORM set_config('request.jwt.claims', '', true);
    SELECT count(*) INTO v_extra FROM public.request_locations;
    IF v_extra <> v_rows_total THEN failures := failures || 'fixture rows changed during the write attempts'; END IF;

    -- 4. Effective privileges
    FOREACH v_sql IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] LOOP
        IF has_table_privilege('anon', 'public.request_locations', v_sql) THEN failures := failures || ('anon has ' || v_sql); END IF;
        IF v_sql <> 'SELECT' AND has_table_privilege('authenticated', 'public.request_locations', v_sql) THEN failures := failures || ('authenticated has ' || v_sql); END IF;
    END LOOP;
    IF NOT has_table_privilege('authenticated', 'public.request_locations', 'SELECT') THEN failures := failures || 'authenticated cannot read'; END IF;
    IF NOT has_table_privilege('service_role', 'public.request_locations', 'INSERT') THEN failures := failures || 'service_role cannot write'; END IF;

    -- 5. Constraints refuse incoherent rows (checked with the strongest writer).
    DELETE FROM public.request_locations;
    FOREACH v_sql IN ARRAY ARRAY[
        $c$('REMOTE', NULL, '97113', NULL, NULL)$c$, $c$('ON_SITE', 'DISCREET', NULL, NULL, NULL)$c$,
        $c$('ON_SITE', 'DISCREET', '97113', '971-v2-a-15.16', 2)$c$, $c$('ON_SITE', 'STANDARD', '97113', NULL, NULL)$c$,
        $c$('ON_SITE', 'STANDARD', '97113', '971-v2-a-15.16', 1)$c$, $c$('ON_SITE', 'STANDARD', '97213', '971-v2-a-15.16', 2)$c$,
        $c$('ON_SITE', 'STANDARD', '97113', '12 rue des Lilas', 2)$c$, $c$('ANYWHERE', NULL, NULL, NULL, NULL)$c$
    ] LOOP
        BEGIN
            EXECUTE 'INSERT INTO public.request_locations (request_id, service_mode, location_visibility, commune_code, zone_id, zone_version) SELECT id, v.m, v.v, v.c, v.z, v.n::smallint FROM (SELECT id FROM public.requests LIMIT 1) r, (VALUES ' || v_sql || ') AS v(m, v, c, z, n)';
            failures := failures || ('constraint accepted ' || v_sql);
        EXCEPTION WHEN check_violation THEN NULL;
        END;
    END LOOP;
    -- ... and accept the coherent ones, V1 included
    FOREACH v_sql IN ARRAY ARRAY[
        $c$('REMOTE', NULL, NULL, NULL, NULL)$c$, $c$('ON_SITE', 'DISCREET', '97113', NULL, NULL)$c$,
        $c$('ON_SITE', 'STANDARD', '97113', '971-v2-a-15.16', 2)$c$, $c$('ON_SITE', 'STANDARD', '97113', '971-v1-a-12.34', 1)$c$
    ] LOOP
        DELETE FROM public.request_locations;
        BEGIN
            EXECUTE 'INSERT INTO public.request_locations (request_id, service_mode, location_visibility, commune_code, zone_id, zone_version) SELECT id, v.m, v.v, v.c, v.z, v.n::smallint FROM (SELECT id FROM public.requests LIMIT 1) r, (VALUES ' || v_sql || ') AS v(m, v, c, z, n)';
        EXCEPTION WHEN check_violation THEN failures := failures || ('constraint refused ' || v_sql);
        END;
    END LOOP;

    -- 6. Deleting an announcement (as its author, with no privilege on request_locations) removes its location.
    DELETE FROM public.request_locations;
    INSERT INTO public.requests (requester_id, title, description) VALUES (v_author, 'location cascade check', 'x') RETURNING id INTO v_new;
    INSERT INTO public.request_locations (request_id, service_mode) VALUES (v_new, 'REMOTE');
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_author, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    DELETE FROM public.requests WHERE id = v_new;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    IF EXISTS (SELECT 1 FROM public.request_locations WHERE request_id = v_new) THEN failures := failures || 'location survived its announcement'; END IF;

    -- 7. Shape of the table: no coordinate, no address
    SELECT array_agg(column_name::text ORDER BY column_name) INTO v_cols FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'request_locations';
    IF v_cols IS DISTINCT FROM ARRAY['commune_code', 'created_at', 'location_visibility', 'request_id', 'service_mode', 'updated_at', 'zone_id', 'zone_version'] THEN
        failures := failures || ('unexpected columns: ' || v_cols::text);
    END IF;

    SELECT count(*), md5(string_agg(r::text, '|' ORDER BY id)) INTO v_n_after, v_md5_after FROM public.requests r;
    IF v_n_after <> v_n_before OR v_md5_after IS DISTINCT FROM v_md5_before THEN failures := failures || 'requests differ inside the test transaction'; END IF;

    RAISE EXCEPTION 'REPORT %', jsonb_build_object(
        'anon_read', r_anon_read, 'profiles_checked', n_actors, 'profiles_with_wrong_set', n_bad,
        'locations_seen_min', min_seen, 'locations_seen_max', max_seen, 'fixture_rows', v_rows_total,
        'columns', v_cols, 'requests_before', v_n_before, 'requests_after_in_transaction', v_n_after,
        'failures', to_jsonb(failures), 'verdict', CASE WHEN cardinality(failures) = 0 THEN 'PASS' ELSE 'FAIL' END)::text USING ERRCODE = 'P0001';
END
$do$;
