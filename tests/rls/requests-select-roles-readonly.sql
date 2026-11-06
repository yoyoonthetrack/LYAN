-- READ-ONLY, no fixture, no write. Staging (tdktfbtqceldlaeqjtow) only.
-- For anon and for EVERY profile (as a real authenticated JWT subject: SET LOCAL ROLE authenticated +
-- request.jwt.claims), it runs the real SELECT on public.requests, then compares the visible ids with the
-- specification written below (not with the policy text). The block ends with an exception carrying the
-- report, so nothing can be committed.
--   BEFORE migration 90: leaks > 0 is expected (that is the exposure).
--   AFTER migration 90 : leaks = 0 AND missing = 0 for anon and for every profile, or roll back with 90_..._rollback.sql.
DO $do$
DECLARE
  spec constant text := $s$
    SELECT coalesce(array_agg(r.id), '{}'::uuid[]) FROM public.requests r
    WHERE COALESCE(
         (r.requester_id = $1 AND r.public_moderation_status IS DISTINCT FROM 'rejected')
      OR EXISTS (SELECT 1 FROM public.admin_members am JOIN public.admin_roles ar ON ar.id = am.role_id
                 WHERE am.user_id = $1 AND am.status = 'ACTIVE' AND ar.code IN ('SUPER_ADMIN','ADMIN','OWNER'))
      OR (r.public_moderation_status = 'approved' AND (
            (r.visibility = 'PUBLIC' AND r.status = 'OPEN' AND r.safety_status = 'SAFE' AND r.target_user_id IS NULL
             AND r.classification_status IN ('CLASSIFIED','UNCLASSIFIED'))
         OR (r.safety_status IS DISTINCT FROM 'PROHIBITED' AND (
                r.target_user_id = $1
             OR EXISTS (SELECT 1 FROM public.request_invitations i WHERE i.request_id = r.id AND i.recipient_id = $1 AND i.status <> 'CANCELLED')
             OR EXISTS (SELECT 1 FROM public.quotes q WHERE q.request_id = r.id AND q.provider_id = $1)
             OR EXISTS (SELECT 1 FROM public.missions m WHERE m.related_request_id = r.id AND m.helper_id = $1)))))
    , false) $s$;
  rec record;
  visible uuid[]; expected uuid[];
  leaks int; missing int;
  n_actors int := 0; n_leaky int := 0; n_missing int := 0; max_leak int := 0; sum_leak int := 0;
  anon_rows int := -1; anon_denied boolean := false; anon_leak int := -1;
  all_ids uuid[];
  detail jsonb := '[]'::jsonb;
BEGIN
  SELECT array_agg(id) INTO all_ids FROM public.requests;

  -- anon: nothing may be readable (a privilege error also counts as "nothing readable")
  BEGIN
    SET LOCAL ROLE anon;
    SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO visible FROM public.requests;
    anon_rows := coalesce(cardinality(visible), 0);
    anon_leak := anon_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    anon_denied := true; anon_rows := 0; anon_leak := 0;
  END;
  RESET ROLE;

  FOR rec IN SELECT p.id AS uid,
                    (SELECT count(*) FROM public.requests r WHERE r.requester_id = p.id) AS own_requests
             FROM public.profiles p ORDER BY p.id LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', rec.uid, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO visible FROM public.requests;
    RESET ROLE;
    EXECUTE spec INTO expected USING rec.uid;
    SELECT count(*) INTO leaks FROM unnest(visible) v WHERE v <> ALL (expected);
    SELECT count(*) INTO missing FROM unnest(expected) e WHERE e <> ALL (visible);
    n_actors := n_actors + 1;
    IF leaks > 0 THEN n_leaky := n_leaky + 1; END IF;
    IF missing > 0 THEN n_missing := n_missing + 1; END IF;
    max_leak := greatest(max_leak, leaks);
    sum_leak := sum_leak + leaks;
    IF leaks > 0 OR missing > 0 THEN
      IF jsonb_array_length(detail) < 5 THEN
        detail := detail || jsonb_build_array(jsonb_build_object('uid', rec.uid, 'visible', cardinality(visible), 'expected', cardinality(expected), 'leaks', leaks, 'missing', missing));
      END IF;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);

  RAISE EXCEPTION 'REPORT %', jsonb_pretty(jsonb_build_object(
    'requests_total', cardinality(all_ids),
    'anon', jsonb_build_object('rows_readable', anon_rows, 'permission_denied', anon_denied, 'leaks', anon_leak),
    'authenticated_profiles', jsonb_build_object('checked', n_actors, 'profiles_with_leaks', n_leaky,
        'profiles_with_missing_access', n_missing, 'max_leaked_rows_for_one_profile', max_leak, 'total_leaked_rows', sum_leak),
    'first_mismatches', detail,
    'verdict', CASE WHEN anon_leak = 0 AND n_leaky = 0 AND n_missing = 0 THEN 'PASS' ELSE 'MISMATCH' END
  )) USING ERRCODE = 'P0001';
END
$do$;
