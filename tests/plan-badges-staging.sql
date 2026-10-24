-- Transaction-only fixtures; safe to run on Staging with rollback.
BEGIN;
INSERT INTO auth.users(id,email) VALUES('85000000-0000-4000-a000-000000000001','badges-fixture@example.invalid');
INSERT INTO public.lyann_plan_memberships(user_id,plan,status,expires_at,source)
VALUES('85000000-0000-4000-a000-000000000001','PLUS','active',now()+interval '1 hour','staging_test');
INSERT INTO public.lyann_pro_dossiers(user_id,identity,documents,status)
VALUES('85000000-0000-4000-a000-000000000001','{"activity":"general"}','[{"kind":"registration","decision":"approved"}]','approved');
DO $$
DECLARE b record;
BEGIN
 SELECT * INTO b FROM public.lyann_public_badges(ARRAY['85000000-0000-4000-a000-000000000001']::uuid[]);
 IF b.plan IS DISTINCT FROM 'PLUS' OR b.verified THEN RAISE EXCEPTION 'Plus badge invalid'; END IF;
 UPDATE lyann_plan_memberships SET plan='PRO' WHERE user_id=b.user_id;
 SELECT * INTO b FROM public.lyann_public_badges(ARRAY[b.user_id]);
 IF b.plan IS DISTINCT FROM 'PRO' OR NOT b.verified THEN RAISE EXCEPTION 'Pro verified invalid'; END IF;
 UPDATE lyann_pro_dossiers SET identity='{"activity":"construction"}' WHERE user_id=b.user_id;
 SELECT * INTO b FROM public.lyann_public_badges(ARRAY[b.user_id]);
 IF b.verified THEN RAISE EXCEPTION 'Missing insurance accepted'; END IF;
 UPDATE lyann_pro_dossiers SET identity='{"activity":"general"}',documents='[{"kind":"registration","decision":"approved","expires_at":"2099-02-30"}]' WHERE user_id=b.user_id;
 SELECT * INTO b FROM public.lyann_public_badges(ARRAY[b.user_id]);
 IF b.verified THEN RAISE EXCEPTION 'Invalid date accepted'; END IF;
 UPDATE lyann_plan_memberships SET expires_at=now()-interval '1 minute' WHERE user_id=b.user_id;
 SELECT * INTO b FROM public.lyann_public_badges(ARRAY[b.user_id]);
 IF b.plan IS DISTINCT FROM 'FREE' OR b.verified THEN RAISE EXCEPTION 'Expired plan accepted'; END IF;
 IF has_function_privilege('anon','public.lyann_dossier_is_verified(jsonb,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'Private helper exposed'; END IF;
 IF NOT has_function_privilege('anon','public.lyann_public_badges(uuid[])','EXECUTE') THEN RAISE EXCEPTION 'Public badges unavailable'; END IF;
 BEGIN PERFORM public.lyann_public_badges(array_fill(b.user_id,ARRAY[101])); RAISE EXCEPTION 'Missing batch limit';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SET LOCAL ROLE anon;
SELECT user_id,plan,verified FROM public.lyann_public_badges(ARRAY['85000000-0000-4000-a000-000000000001']::uuid[]);
RESET ROLE;
ROLLBACK;
