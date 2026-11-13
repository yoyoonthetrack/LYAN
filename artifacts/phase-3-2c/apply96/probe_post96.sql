-- Rolled-back probe (Staging tdktfbtqceldlaeqjtow ONLY). Always ends with RAISE EXCEPTION => nothing persists.
-- false is replaced by true (rehearsal of migration 96 + its rollback) or false (post-95 baseline, nothing applied).
DO $reh$
DECLARE
  v_apply96 boolean := false;
  r jsonb := '{}'::jsonb;
  a uuid; b uuid; c uuid; adm uuid;
  conv uuid; conv2 uuid; sup uuid; sup2 uuid; dj jsonb;
  n0 int; n1 int; e text;
  fp0 text; fp1 text; fp2 text;
  f text; np0 int; np1 int;
  cnt0 jsonb;
BEGIN
  SELECT am.user_id INTO adm FROM public.admin_members am JOIN public.admin_roles ar ON ar.id = am.role_id
   WHERE am.status = 'ACTIVE' AND ar.code IN ('SUPER_ADMIN','ADMIN','OWNER') LIMIT 1;
  SELECT x.id, y.id INTO a, b FROM public.profiles x, public.profiles y
   WHERE x.id < y.id AND x.id IS DISTINCT FROM adm AND y.id IS DISTINCT FROM adm
     AND NOT public.is_blocked_between(x.id, y.id)
     AND NOT EXISTS (SELECT 1 FROM public.conversation_participants p1 JOIN public.conversation_participants p2 ON p1.conversation_id = p2.conversation_id
                      WHERE p1.user_id = x.id AND p2.user_id = y.id)
   ORDER BY x.id, y.id LIMIT 1;
  SELECT id INTO c FROM public.profiles WHERE id NOT IN (a, b) AND id IS DISTINCT FROM adm ORDER BY id LIMIT 1;
  r := r || jsonb_build_object('members_found', a IS NOT NULL AND b IS NOT NULL AND c IS NOT NULL, 'admin_found', adm IS NOT NULL);

  cnt0 := jsonb_build_object('conversations', (SELECT count(*) FROM public.conversations), 'participants', (SELECT count(*) FROM public.conversation_participants),
          'messages', (SELECT count(*) FROM public.messages), 'notifications', (SELECT count(*) FROM public.notifications));
  SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text, '')) INTO fp0 FROM
    (SELECT policyname, tablename, cmd, roles::text, qual, with_check, permissive FROM pg_policies WHERE schemaname = 'public') x;

  SELECT count(*) INTO np0 FROM pg_policies WHERE schemaname = 'public';
  IF v_apply96 THEN
    -- ===== migration 96 (verbatim body) =====
    EXECUTE $q1$DO $pre$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'conversations' AND policyname = 'Users can insert conversations'
          AND cmd = 'INSERT' AND permissive = 'PERMISSIVE' AND with_check = 'true'
    ) THEN
        RAISE EXCEPTION 'migration 96: policy "Users can insert conversations" (WITH CHECK true) not found as expected';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'conversations' AND policyname = 'No direct insert on conversations for standard users'
          AND cmd = 'INSERT' AND with_check ILIKE '%is_current_user_admin()%'
    ) THEN
        RAISE EXCEPTION 'migration 96: the admin-only INSERT policy is missing; refusing to leave conversations without a restrictive INSERT rule';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.conversations'::regclass) THEN
        RAISE EXCEPTION 'migration 96: RLS is disabled on public.conversations';
    END IF;
END
$pre$;$q1$;
    DROP POLICY "Users can insert conversations" ON public.conversations;
    EXECUTE $q2$DO $post$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'conversations' AND cmd IN ('INSERT', 'ALL')
          AND permissive = 'PERMISSIVE' AND coalesce(with_check, 'true') = 'true'
    ) THEN
        RAISE EXCEPTION 'migration 96: a permissive unconditional INSERT policy still exists on public.conversations';
    END IF;
    IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'conversations' AND cmd = 'INSERT') <> 1 THEN
        RAISE EXCEPTION 'migration 96: expected exactly one INSERT policy on public.conversations';
    END IF;
END
$post$;$q2$;
    SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text, '')) INTO fp1 FROM
      (SELECT policyname, tablename, cmd, roles::text, qual, with_check, permissive FROM pg_policies WHERE schemaname = 'public') x;
    SELECT count(*) INTO np1 FROM pg_policies WHERE schemaname = 'public';
    r := r || jsonb_build_object('policies_changed_by_96', fp0 <> fp1,
        'insert_policies_after_96', (SELECT jsonb_agg(policyname || ' check=' || coalesce(with_check, '-')) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'conversations' AND cmd = 'INSERT'),
        'exactly_one_policy_removed', np0 - np1 = 1);
  END IF;

  -- 1. helper functions: anon / authenticated denied, service_role allowed
  FOREACH f IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    PERFORM set_config('request.jwt.claims', CASE WHEN f = 'anon' THEN '{"role":"anon"}' ELSE json_build_object('sub', a, 'role', 'authenticated')::text END, true);
    PERFORM set_config('request.jwt.claim.sub', CASE WHEN f = 'anon' THEN '' ELSE a::text END, true);
    EXECUTE format('SET LOCAL ROLE %I', f);
    e := 'ALLOWED'; BEGIN PERFORM public.lyann_insert_notification(b, 'OPPORTUNITY', 't', 'b', NULL, NULL); EXCEPTION WHEN OTHERS THEN e := SQLSTATE; END;
    r := r || jsonb_build_object(f || '_insert_notification', e);
    e := 'ALLOWED'; BEGIN PERFORM public.lyann_pair_conversation(b, c); EXCEPTION WHEN OTHERS THEN e := SQLSTATE; END;
    r := r || jsonb_build_object(f || '_pair_conversation', e);
    e := 'ALLOWED'; BEGIN PERFORM public.lyann_ensure_support_welcome(b); EXCEPTION WHEN OTHERS THEN e := SQLSTATE; END;
    r := r || jsonb_build_object(f || '_ensure_support_welcome', e);
    RESET ROLE;
  END LOOP;
  -- service_role (legitimate server path)
  SET LOCAL ROLE service_role;
  e := 'OK'; BEGIN PERFORM public.lyann_insert_notification(b, 'OPPORTUNITY', 't', 'b', NULL, NULL); EXCEPTION WHEN OTHERS THEN e := SQLSTATE || ' ' || SQLERRM; END;
  r := r || jsonb_build_object('service_role_insert_notification', e);
  e := 'OK'; BEGIN PERFORM public.lyann_pair_conversation(a, b); EXCEPTION WHEN OTHERS THEN e := SQLSTATE || ' ' || SQLERRM; END;
  r := r || jsonb_build_object('service_role_pair_conversation', e);
  e := 'OK'; BEGIN PERFORM public.lyann_ensure_support_welcome(c); EXCEPTION WHEN OTHERS THEN e := SQLSTATE || ' ' || SQLERRM; END;
  r := r || jsonb_build_object('service_role_ensure_support_welcome', e);
  RESET ROLE;

  -- 2. legitimate member flows (role authenticated, JWT of member a)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', c::text, true);
  SET LOCAL ROLE authenticated;
  e := 'OK'; BEGIN sup := public.lyann_open_support_conversation(); sup2 := public.lyann_open_support_conversation();
    IF sup IS NULL OR sup <> sup2 THEN e := 'NOT_IDEMPOTENT'; END IF; EXCEPTION WHEN OTHERS THEN e := SQLSTATE || ' ' || SQLERRM; END;
  r := r || jsonb_build_object('member_support_conversation', e);
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', a::text, true);
  SET LOCAL ROLE authenticated;
  e := 'OK'; BEGIN conv := public.get_or_create_conversation(b); conv2 := public.get_or_create_conversation(b);
    IF conv IS NULL OR conv <> conv2 THEN e := 'NOT_IDEMPOTENT'; END IF; EXCEPTION WHEN OTHERS THEN e := SQLSTATE || ' ' || SQLERRM; END;
  r := r || jsonb_build_object('member_get_or_create_conversation', e);
  e := 'OK'; BEGIN dj := public.open_direct_conversation(b);
    IF (dj->>'conversation_id')::uuid <> conv THEN e := 'DIFFERENT_CONV'; END IF; EXCEPTION WHEN OTHERS THEN e := SQLSTATE || ' ' || SQLERRM; END;
  r := r || jsonb_build_object('member_open_direct_conversation', e);
  RESET ROLE;
  SELECT count(*) INTO n0 FROM public.notifications WHERE user_id = b;
  SET LOCAL ROLE authenticated;
  e := 'OK'; BEGIN INSERT INTO public.messages (conversation_id, sender_id, content) VALUES (conv, a, 'rehearsal message'); EXCEPTION WHEN OTHERS THEN e := SQLSTATE || ' ' || SQLERRM; END;
  r := r || jsonb_build_object('member_send_message', e);
  RESET ROLE;
  SELECT count(*) INTO n1 FROM public.notifications WHERE user_id = b;
  r := r || jsonb_build_object('trigger_chain_notification_for_recipient', n1 - n0);

  -- 3. direct writes by a member must stay denied
  SET LOCAL ROLE authenticated;
  e := 'ALLOWED'; BEGIN INSERT INTO public.notifications (user_id, type, title, body) VALUES (b, 'X', 't', 'b'); EXCEPTION WHEN OTHERS THEN e := SQLSTATE; END;
  r := r || jsonb_build_object('member_direct_insert_notification', e);
  e := 'ALLOWED'; BEGIN INSERT INTO public.conversation_participants (conversation_id, user_id) VALUES (conv, c); EXCEPTION WHEN OTHERS THEN e := SQLSTATE; END;
  r := r || jsonb_build_object('member_direct_insert_participant_for_other', e);
  e := 'ALLOWED'; BEGIN INSERT INTO public.messages (conversation_id, sender_id, content) VALUES (conv, b, 'spoof'); EXCEPTION WHEN OTHERS THEN e := SQLSTATE; END;
  r := r || jsonb_build_object('member_message_as_other_user', e);
  RESET ROLE;

  -- 4. direct INSERT into conversations (the policy under review)
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
  e := 'ALLOWED'; BEGIN INSERT INTO public.conversations (started_by, context_mode) VALUES (b, 'direct'); EXCEPTION WHEN OTHERS THEN e := SQLSTATE; END;
  r := r || jsonb_build_object('anon_direct_insert_conversation', e);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', a::text, true);
  SET LOCAL ROLE authenticated;
  e := 'ALLOWED'; BEGIN INSERT INTO public.conversations (started_by, context_mode) VALUES (b, 'direct'); EXCEPTION WHEN OTHERS THEN e := SQLSTATE; END;
  r := r || jsonb_build_object('member_direct_insert_conversation_spoofing_started_by', e);
  e := 'ALLOWED'; BEGIN INSERT INTO public.conversations (started_by) VALUES (a); EXCEPTION WHEN OTHERS THEN e := SQLSTATE; END;
  r := r || jsonb_build_object('member_direct_insert_conversation_own', e);
  RESET ROLE;
  IF adm IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', adm::text, true);
    SET LOCAL ROLE authenticated;
    e := 'OK'; BEGIN INSERT INTO public.conversations (started_by) VALUES (adm); EXCEPTION WHEN OTHERS THEN e := SQLSTATE || ' ' || SQLERRM; END;
    r := r || jsonb_build_object('admin_direct_insert_conversation', e);
    RESET ROLE;
  END IF;
  SET LOCAL ROLE service_role;
  e := 'OK'; BEGIN INSERT INTO public.conversations (started_by) VALUES (a); EXCEPTION WHEN OTHERS THEN e := SQLSTATE || ' ' || SQLERRM; END;
  r := r || jsonb_build_object('service_role_direct_insert_conversation', e);
  RESET ROLE;

  -- 5. block rule between members still enforced (existing behaviour must not change)
  INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES (b, c);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', c::text, true);
  SET LOCAL ROLE authenticated;
  e := 'ALLOWED'; BEGIN PERFORM public.get_or_create_conversation(b); EXCEPTION WHEN OTHERS THEN e := SQLSTATE || ' ' || coalesce(SQLERRM, ''); END;
  r := r || jsonb_build_object('blocked_member_get_or_create_conversation', e);
  RESET ROLE;

  IF v_apply96 THEN
    -- ===== rollback of migration 96 (verbatim) and exactness proof =====
    CREATE POLICY "Users can insert conversations" ON public.conversations FOR INSERT TO public WITH CHECK (true);
    SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text, '')) INTO fp2 FROM
      (SELECT policyname, tablename, cmd, roles::text, qual, with_check, permissive FROM pg_policies WHERE schemaname = 'public') x;
    r := r || jsonb_build_object('rollback96_exact', fp2 = fp0);
  END IF;

  r := r || jsonb_build_object('counts_before', cnt0,
      'counts_after_in_txn', jsonb_build_object('conversations', (SELECT count(*) FROM public.conversations), 'participants', (SELECT count(*) FROM public.conversation_participants),
          'messages', (SELECT count(*) FROM public.messages), 'notifications', (SELECT count(*) FROM public.notifications)));
  RAISE EXCEPTION 'REHEARSAL96_REPORT %', r::text;
END
$reh$;
