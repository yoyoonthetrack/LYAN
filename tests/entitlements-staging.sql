-- Run on tdktfbtqceldlaeqjtow only. All fixtures are rolled back.
BEGIN;
DO $test$
DECLARE u uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); m1 uuid:=gen_random_uuid(); m2 uuid:=gen_random_uuid();
 m3 uuid:=gen_random_uuid(); p uuid; j jsonb; n integer; old_ids uuid[];
BEGIN
 INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(u,'rights-'||u||'@example.invalid','{}'),(c,'rights-'||c||'@example.invalid','{}');
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=u) THEN RAISE EXCEPTION 'Missing fixture profile'; END IF;
 IF public.lyann_entitlements_enforced(u) THEN RAISE EXCEPTION 'Rollout must be off for ordinary accounts'; END IF;
 PERFORM public.lyann_set_entitlement_test(u,true,c);
 IF NOT public.lyann_entitlements_enforced(u) THEN RAISE EXCEPTION 'Test rollout missing'; END IF;
 IF (SELECT count(*) FROM public.lyann_entitlement_test_events WHERE user_id=u)<>1 THEN RAISE EXCEPTION 'Test audit missing'; END IF;
 IF has_table_privilege('authenticated','public.lyann_entitlement_test_accounts','INSERT')
 OR has_table_privilege('anon','public.lyann_mission_usage','SELECT')
 OR has_function_privilege('anon','public.lyann_my_entitlements()','EXECUTE')
 OR has_function_privilege('authenticated','public.lyann_get_entitlements(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.lyann_set_entitlement_test(uuid,boolean,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Private rights writable/readable by clients'; END IF;

 INSERT INTO missions(id,helper_id,requester_id,status,title) VALUES(m1,u,c,'AGREED','rights-test'),(m2,u,c,'AGREED','rights-test');
 BEGIN
  INSERT INTO missions(id,helper_id,requester_id,status,title) VALUES(m3,u,c,'AGREED','rights-test');
  RAISE EXCEPTION 'Third free mission accepted';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'MISSION_QUOTA_REACHED:%' THEN RAISE; END IF;
 END;
 UPDATE missions SET status='AGREED' WHERE id=m1;
 IF (public.lyann_get_entitlements(u)->'usage'->>'missions')::int<>2 THEN RAISE EXCEPTION 'Idempotence failure'; END IF;
 UPDATE missions SET status='CANCELLED' WHERE id=m1;
 INSERT INTO missions(id,helper_id,requester_id,status,title) VALUES(m3,u,c,'AGREED','rights-test');
 BEGIN
  UPDATE missions SET status='AGREED' WHERE id=m1;
  RAISE EXCEPTION 'Reactivation bypassed quota';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'MISSION_QUOTA_REACHED:%' THEN RAISE; END IF;
 END;
 UPDATE missions SET status='IN_PROGRESS' WHERE id=m2;
 UPDATE missions SET status='CANCELLED' WHERE id=m2;
 IF (public.lyann_get_entitlements(u)->'usage'->>'missions')::int<>2 THEN RAISE EXCEPTION 'Started cancellation restored allowance'; END IF;
 DELETE FROM missions WHERE id=m3;
 BEGIN
  INSERT INTO missions(id,helper_id,requester_id,status) VALUES(m3,u,c,'AGREED');
  RAISE EXCEPTION 'Reused mission ID accepted';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'MISSION_ID_REUSED' THEN RAISE; END IF;
 END;
 IF (public.lyann_get_entitlements(u)->'usage'->>'missions')::int<>2 THEN RAISE EXCEPTION 'Deletion restored allowance'; END IF;

 INSERT INTO lyann_plan_memberships(user_id,plan,status,expires_at,source) VALUES(u,'PLUS','active',now()+interval '1 day','staging_test');
 INSERT INTO missions(helper_id,requester_id,status,title) SELECT u,c,'AGREED','rights-test' FROM generate_series(1,3);
 UPDATE lyann_plan_memberships SET expires_at=now()-interval '1 second' WHERE user_id=u;
 IF public.lyann_current_plan(u)<>'FREE' THEN RAISE EXCEPTION 'Expired plan retained privileges'; END IF;
 BEGIN
  INSERT INTO missions(helper_id,requester_id,status) VALUES(u,c,'IN_PROGRESS');
  RAISE EXCEPTION 'Direct active insertion bypassed quota';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'MISSION_QUOTA_REACHED:%' THEN RAISE; END IF;
 END;
 UPDATE lyann_mission_usage SET accepted_at=(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '1 second' WHERE provider_id=u;
 INSERT INTO missions(helper_id,requester_id,status,title,created_at) VALUES(u,c,'AGREED','rights-test',now()-interval '2 years');
 IF (public.lyann_get_entitlements(u)->'usage'->>'missions')::int<>1 THEN RAISE EXCEPTION 'Month reset or forged created_at failed'; END IF;
 -- Being a requester never consumes a provider allowance.
 INSERT INTO missions(helper_id,requester_id,status,title) SELECT c,u,'AGREED','rights-test' FROM generate_series(1,4);
 IF (public.lyann_get_entitlements(u)->'usage'->>'missions')::int<>1 THEN RAISE EXCEPTION 'Requester was counted'; END IF;

 INSERT INTO user_portfolio_items(user_id,image_url) SELECT u,'https://example.invalid/rights-photo-'||g||'.jpg' FROM generate_series(1,5) g;
 BEGIN
  INSERT INTO user_portfolio_items(user_id,image_url) VALUES(u,'https://example.invalid/extra.jpg');
  RAISE EXCEPTION 'Sixth free photo accepted';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'PORTFOLIO_QUOTA_REACHED:%' THEN RAISE; END IF;
 END;
 UPDATE lyann_plan_memberships SET plan='PRO',expires_at=now()+interval '1 day' WHERE user_id=u;
 INSERT INTO user_portfolio_items(user_id,image_url) SELECT u,'https://example.invalid/pro-photo-'||g||'.jpg' FROM generate_series(1,2) g;
 UPDATE lyann_plan_memberships SET status='revoked' WHERE user_id=u;
 UPDATE user_portfolio_items SET caption='Existing content retained' WHERE user_id=u;
 IF (SELECT count(*) FROM user_portfolio_items WHERE user_id=u)<>7 THEN RAISE EXCEPTION 'Downgrade lost photos'; END IF;

 INSERT INTO services(owner_id,title,category,description,slug) VALUES(u,'Plomberie','  Plomberie ','Plomberie','rights-'||gen_random_uuid());
 INSERT INTO services(owner_id,title,category,description,slug) VALUES(u,'Réparation','plomberie','Réparation','rights-'||gen_random_uuid());
 BEGIN
  INSERT INTO services(owner_id,title,category,slug) VALUES(u,'Peinture','Peinture','rights-'||gen_random_uuid());
  RAISE EXCEPTION 'Second free category accepted';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'CATEGORY_QUOTA_REACHED:%' THEN RAISE; END IF;
 END;
 INSERT INTO services(owner_id,title,category,active,slug) VALUES(u,'Inactive','Peinture',false,'rights-'||gen_random_uuid());
 BEGIN
  UPDATE services SET active=true WHERE owner_id=u AND title='Inactive';
  RAISE EXCEPTION 'Category reactivation bypassed quota';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'CATEGORY_QUOTA_REACHED:%' THEN RAISE; END IF;
 END;
 SELECT array_agg(id ORDER BY id) INTO old_ids FROM services WHERE owner_id=u;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 j:=public.lyann_my_entitlements();
 IF j->>'plan'<>'FREE' OR j->>'requests_unlimited'<>'true' OR j->>'purchases_enabled'<>'false' THEN RAISE EXCEPTION 'Self rights incorrect'; END IF;
 BEGIN
  PERFORM public.lyann_sync_profile_skills(u,ARRAY['A','B']);
  RAISE EXCEPTION 'Atomic replacement accepted over quota';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM NOT LIKE 'CATEGORY_QUOTA_REACHED:%' THEN RAISE; END IF;
 END;
 IF (SELECT array_agg(id ORDER BY id) FROM services WHERE owner_id=u) IS DISTINCT FROM old_ids THEN RAISE EXCEPTION 'Failed skill save deleted existing services'; END IF;
 BEGIN
  PERFORM public.lyann_sync_profile_skills(c,ARRAY['A']);
  RAISE EXCEPTION 'Cross-user skills accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM public.lyann_sync_profile_skills(u,ARRAY['Peinture']);
 IF (public.lyann_get_entitlements(u)->'usage'->>'categories')::int<>1 THEN RAISE EXCEPTION 'Atomic replacement failed'; END IF;
 UPDATE lyann_plan_memberships SET plan='PLUS',status='cancel_at_period_end',expires_at=now()+interval '1 day' WHERE user_id=u;
 PERFORM public.lyann_sync_profile_skills(u,ARRAY['A','B','C']);
 IF (public.lyann_get_entitlements(u)->'usage'->>'categories')::int<>3 THEN RAISE EXCEPTION 'Plus categories failed'; END IF;
 IF public.lyann_current_plan(u)<>'PLUS' THEN RAISE EXCEPTION 'Paid period cancellation revoked early'; END IF;
 PERFORM public.lyann_set_entitlement_test(u,false,c);
 IF public.lyann_entitlements_enforced(u) THEN RAISE EXCEPTION 'Test scope disable failed'; END IF;
END $test$;
SELECT 'PASS: mission quota, cancellation, reactivation, deletion, renewal, portfolio, categories, atomic save, private rights and test audit' AS result;
ROLLBACK;
