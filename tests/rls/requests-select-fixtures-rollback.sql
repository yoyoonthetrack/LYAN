-- ROLE MATRIX WITH FIXTURES. Staging (tdktfbtqceldlaeqjtow) only, AFTER migration 90 is applied.
-- NOT EXECUTED in phase 2.8B-1.2 (that phase forbids any Supabase write). It creates its own users and
-- announcements inside ONE transaction that always ends with ROLLBACK: nothing is kept, no production data is used.
-- It reads as real roles (SET LOCAL ROLE anon / authenticated + request.jwt.claims), not as admin or service role.
-- Any failed assertion raises an exception: run ROLLBACK and do not go further.
-- Side effects of triggers (matching, notifications, push queue rows) are rolled back with the transaction.
--
-- Fixtures (author A, all text harmless):
--   R1 PUBLIC  OPEN        approved
--   R2 PUBLIC  PAUSED      approved   invitee I (PENDING), invitee C (CANCELLED), quote provider Q, mission helper H
--   R3 PUBLIC  CLOSED      approved
--   R4 DIRECT  OPEN        approved   target T
--   R5 PUBLIC  OPEN        pending
--   R6 PUBLIC  OPEN        rejected
--   R7 PUBLIC  safety PROHIBITED (status forced to CANCELLED) approved
--   R8 PUBLIC  OPEN        approved   target T set on a PUBLIC row (inconsistent data must not be public)
BEGIN;

DO $t$
DECLARE
    a uuid := gen_random_uuid(); t uuid := gen_random_uuid(); s uuid := gen_random_uuid();
    i uuid := gen_random_uuid(); c uuid := gen_random_uuid(); q uuid := gen_random_uuid(); h uuid := gen_random_uuid();
    r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); r3 uuid := gen_random_uuid(); r4 uuid := gen_random_uuid();
    r5 uuid := gen_random_uuid(); r6 uuid := gen_random_uuid(); r7 uuid := gen_random_uuid(); r8 uuid := gen_random_uuid();
    fixture uuid[];
    actor record;
    visible uuid[];
    wanted uuid[];
    n int;
    intake boolean;
BEGIN
    fixture := ARRAY[r1, r2, r3, r4, r5, r6, r7, r8];

    -- Users (the profile trigger creates the profiles, as in tests/entitlements-staging.sql)
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    SELECT u, 'rls90-' || u || '@example.invalid', '{}'::jsonb FROM unnest(ARRAY[a, t, s, i, c, q, h]) AS u;
    IF (SELECT count(*) FROM public.profiles WHERE id = ANY (ARRAY[a, t, s, i, c, q, h])) <> 7 THEN
        RAISE EXCEPTION 'fixture: profiles were not created';
    END IF;

    -- Fixture writes run with a service-role claim so the moderation trigger accepts them (never a client path)
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

    INSERT INTO public.requests (id, requester_id, title, description, category, location, date_mode, price_mode, status, visibility, target_user_id, safety_status)
    VALUES
      (r1, a, 'Fixture RLS 90 un', 'Fixture RLS 90, annonce publique ouverte.',  'Général', 'Guadeloupe', 'FLEXIBLE', 'QUOTE', 'OPEN',   'PUBLIC', NULL, 'SAFE'),
      (r2, a, 'Fixture RLS 90 deux', 'Fixture RLS 90, annonce publique en pause.', 'Général', 'Guadeloupe', 'FLEXIBLE', 'QUOTE', 'PAUSED', 'PUBLIC', NULL, 'SAFE'),
      (r3, a, 'Fixture RLS 90 trois', 'Fixture RLS 90, annonce publique fermée.',  'Général', 'Guadeloupe', 'FLEXIBLE', 'QUOTE', 'CLOSED', 'PUBLIC', NULL, 'SAFE'),
      (r4, a, 'Fixture RLS 90 quatre', 'Fixture RLS 90, annonce directe.',         'Général', 'Guadeloupe', 'FLEXIBLE', 'QUOTE', 'OPEN',   'DIRECT', t,    'SAFE'),
      (r5, a, 'Fixture RLS 90 cinq', 'Fixture RLS 90, annonce en attente.',        'Général', 'Guadeloupe', 'FLEXIBLE', 'QUOTE', 'OPEN',   'PUBLIC', NULL, 'SAFE'),
      (r6, a, 'Fixture RLS 90 six', 'Fixture RLS 90, annonce rejetée.',            'Général', 'Guadeloupe', 'FLEXIBLE', 'QUOTE', 'OPEN',   'PUBLIC', NULL, 'SAFE'),
      (r7, a, 'Fixture RLS 90 sept', 'Fixture RLS 90, annonce interdite.',         'Général', 'Guadeloupe', 'FLEXIBLE', 'QUOTE', 'OPEN',   'PUBLIC', NULL, 'PROHIBITED'),
      (r8, a, 'Fixture RLS 90 huit', 'Fixture RLS 90, public avec cible.',         'Général', 'Guadeloupe', 'FLEXIBLE', 'QUOTE', 'OPEN',   'PUBLIC', t,    'SAFE');

    -- Moderation states are forced explicitly (the trigger may have decided differently from the text)
    UPDATE public.requests SET public_moderation_status = 'approved' WHERE id = ANY (ARRAY[r1, r2, r3, r4, r7, r8]);
    UPDATE public.requests SET public_moderation_status = 'pending'  WHERE id = r5;
    UPDATE public.requests SET public_moderation_status = 'rejected', title = title || ' (rejet)' WHERE id = r6;
    IF (SELECT count(*) FROM public.requests WHERE id = ANY (fixture)) <> 8
       OR (SELECT count(*) FROM public.requests WHERE id = ANY (ARRAY[r1, r2, r3, r4, r7, r8]) AND public_moderation_status = 'approved') <> 6
       OR (SELECT public_moderation_status FROM public.requests WHERE id = r5) <> 'pending'
       OR (SELECT public_moderation_status FROM public.requests WHERE id = r6) <> 'rejected'
       OR (SELECT safety_status FROM public.requests WHERE id = r7) <> 'PROHIBITED' THEN
        RAISE EXCEPTION 'fixture: announcements are not in the intended state';
    END IF;

    INSERT INTO public.request_invitations (request_id, requester_id, recipient_id, status)
    VALUES (r2, a, i, 'PENDING'), (r2, a, c, 'CANCELLED');
    INSERT INTO public.quotes (quote_number, request_id, provider_id, requester_id, status)
    VALUES ('RLS90-' || left(r2::text, 8), r2, q, a, 'SENT');
    INSERT INTO public.missions (helper_id, requester_id, status, title, related_request_id)
    VALUES (h, a, 'AGREED', 'rls90 fixture', r2);

    PERFORM set_config('request.jwt.claims', '', true);

    -- 1. anon: nothing, whichever way the database refuses it
    BEGIN
        SET LOCAL ROLE anon;
        SELECT count(*) INTO n FROM public.requests WHERE id = ANY (fixture);
        RESET ROLE;
        IF n <> 0 THEN RAISE EXCEPTION 'anon reads % fixture announcement(s)', n; END IF;
    EXCEPTION WHEN insufficient_privilege THEN
        RESET ROLE;
    END;

    -- 2. authenticated actors: the exact set of fixture announcements each one may read
    FOR actor IN
        SELECT * FROM (VALUES
            ('stranger',        s, ARRAY[r1]),
            ('author',          a, ARRAY[r1, r2, r3, r4, r5, r7, r8]),
            ('target T',        t, ARRAY[r1, r4, r8]),
            ('invitee pending', i, ARRAY[r1, r2]),
            ('invitee cancelled', c, ARRAY[r1]),
            ('quote provider',  q, ARRAY[r1, r2]),
            ('mission helper',  h, ARRAY[r1, r2])
        ) AS v(label, uid, ids)
    LOOP
        PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor.uid, 'role', 'authenticated')::text, true);
        SET LOCAL ROLE authenticated;
        SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO visible FROM public.requests WHERE id = ANY (fixture);
        RESET ROLE;
        SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO wanted FROM unnest(actor.ids) x;
        IF visible IS DISTINCT FROM wanted THEN
            RAISE EXCEPTION 'role matrix failed for %: visible %, expected %', actor.label, cardinality(visible), cardinality(wanted);
        END IF;
    END LOOP;

    -- 3. writes keep their rules: a stranger cannot change an announcement, the author can, and the author
    --    still gets the new row back from INSERT ... RETURNING (it needs the SELECT policy)
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', s, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE public.requests SET urgency = 'Normale' WHERE id = r1;
    GET DIAGNOSTICS n = ROW_COUNT;
    RESET ROLE;
    IF n <> 0 THEN RAISE EXCEPTION 'a stranger updated % announcement(s)', n; END IF;

    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    UPDATE public.requests SET urgency = 'Normale' WHERE id = r1;
    GET DIAGNOSTICS n = ROW_COUNT;
    RESET ROLE;
    IF n <> 1 THEN RAISE EXCEPTION 'the author could not update own announcement (% rows)', n; END IF;

    SELECT public.lyann_public_intake_open() INTO intake;
    IF intake THEN
        SET LOCAL ROLE authenticated;
        WITH ins AS (
            INSERT INTO public.requests (requester_id, title, description, category, location, date_mode, price_mode)
            VALUES (a, 'Fixture RLS 90 retour', 'Fixture RLS 90, insertion avec retour.', 'Général', 'Guadeloupe', 'FLEXIBLE', 'QUOTE')
            RETURNING id
        )
        SELECT count(*) INTO n FROM ins;
        RESET ROLE;
        IF n <> 1 THEN RAISE EXCEPTION 'INSERT ... RETURNING returned % rows to the author', n; END IF;
    ELSE
        RAISE NOTICE 'intake is closed on Staging: INSERT ... RETURNING check skipped';
    END IF;

    -- 4. privileges and function exposure
    IF has_table_privilege('anon', 'public.requests', 'SELECT') THEN RAISE EXCEPTION 'anon still has SELECT on requests'; END IF;
    IF has_function_privilege('anon', 'public.lyann_request_participant_access(uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'anon can execute the participant helper'; END IF;
    IF NOT has_function_privilege('authenticated', 'public.lyann_request_participant_access(uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'authenticated cannot execute the participant helper'; END IF;

    PERFORM set_config('request.jwt.claims', '', true);
    RAISE NOTICE 'requests RLS role matrix: PASS';
END
$t$;

ROLLBACK;
