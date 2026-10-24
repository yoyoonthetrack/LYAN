-- Staging only: install on tdktfbtqceldlaeqjtow. Purchases remain disabled.
BEGIN;
CREATE TABLE public.lyann_entitlement_rollout (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enforce_all boolean NOT NULL DEFAULT false
);
INSERT INTO public.lyann_entitlement_rollout(singleton) VALUES(true);
CREATE TABLE public.lyann_entitlement_test_accounts (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, actor_id uuid NOT NULL REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.lyann_entitlement_test_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid NOT NULL,
 actor_id uuid NOT NULL, enabled boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.lyann_mission_usage (
 mission_id uuid PRIMARY KEY, -- Deliberately no cascading FK: deleting a mission must not reset consumption.
 provider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 accepted_at timestamptz NOT NULL DEFAULT now(), started boolean NOT NULL DEFAULT false,
 released boolean NOT NULL DEFAULT false
);
CREATE INDEX lyann_mission_usage_month ON public.lyann_mission_usage(provider_id,accepted_at) WHERE NOT released;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['lyann_entitlement_rollout','lyann_entitlement_test_accounts','lyann_entitlement_test_events','lyann_mission_usage'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',n);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',n);
 END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE public.lyann_entitlement_test_events_id_seq TO service_role;

CREATE FUNCTION public.lyann_current_plan(p_user uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT plan FROM public.lyann_plan_memberships WHERE user_id=p_user AND plan IN ('PLUS','PRO') AND status IN ('active','cancel_at_period_end') AND expires_at>now()),'FREE');
$$;
CREATE FUNCTION public.lyann_plan_limits(p_plan text) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT CASE p_plan
 WHEN 'PRO' THEN '{"missions":null,"photos":50,"videos":3,"categories":5}'::jsonb
 WHEN 'PLUS' THEN '{"missions":null,"photos":20,"videos":1,"categories":3}'::jsonb
 ELSE '{"missions":2,"photos":5,"videos":0,"categories":1}'::jsonb END;
$$;
CREATE FUNCTION public.lyann_entitlements_enforced(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT enforce_all FROM public.lyann_entitlement_rollout WHERE singleton),false)
 OR EXISTS(SELECT 1 FROM public.lyann_entitlement_test_accounts WHERE user_id=p_user AND expires_at>now());
$$;
CREATE FUNCTION public.lyann_service_category(p_id uuid,p_label text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN p_id IS NOT NULL THEN 'id:'||p_id::text ELSE 'label:'||coalesce(nullif(regexp_replace(lower(btrim(p_label)),'\s+',' ','g'),''),'general') END;
$$;

CREATE FUNCTION public.lyann_guard_mission_entitlement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u public.lyann_mission_usage%ROWTYPE; v_status text; v_limit integer; v_used integer;
BEGIN
 -- Once accepted, identity and provider cannot be rewritten to recycle an allowance.
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.helper_id IS DISTINCT FROM OLD.helper_id)
 AND (EXISTS(SELECT 1 FROM public.lyann_mission_usage WHERE mission_id=OLD.id)
 OR upper(coalesce(OLD.status,'DISCUSSION')) NOT IN ('DISCUSSION','DRAFT','PROPOSED','PENDING','CANCELLED')) THEN
  RAISE EXCEPTION 'MISSION_IDENTITY_LOCKED: Une mission acceptée conserve son prestataire.' USING ERRCODE='P0001';
 END IF;
 IF NEW.helper_id IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('lyann-rights:'||NEW.helper_id::text,0));
 SELECT * INTO u FROM public.lyann_mission_usage WHERE mission_id=NEW.id;
 IF TG_OP='INSERT' AND u.mission_id IS NOT NULL THEN RAISE EXCEPTION 'MISSION_ID_REUSED' USING ERRCODE='P0001'; END IF;
 v_status:=upper(coalesce(NEW.status,'DISCUSSION'));
 IF v_status='CANCELLED' THEN
  UPDATE public.lyann_mission_usage SET released=true WHERE mission_id=NEW.id AND NOT started;
  RETURN NEW;
 END IF;
 IF v_status IN ('DISCUSSION','DRAFT','PROPOSED','PENDING') THEN RETURN NEW; END IF;
 -- Existing accepted missions are grandfathered, never charged again by a status edit.
 IF u.mission_id IS NULL AND TG_OP='UPDATE'
 AND upper(coalesce(OLD.status,'DISCUSSION')) NOT IN ('DISCUSSION','DRAFT','PROPOSED','PENDING','CANCELLED') THEN RETURN NEW; END IF;
 IF u.mission_id IS NULL OR u.released THEN
  v_limit:=(public.lyann_plan_limits(public.lyann_current_plan(NEW.helper_id))->>'missions')::integer;
  SELECT count(*) INTO v_used FROM public.lyann_mission_usage
   WHERE provider_id=NEW.helper_id AND NOT released
   AND accepted_at >= (date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  IF public.lyann_entitlements_enforced(NEW.helper_id) AND v_limit IS NOT NULL AND v_used>=v_limit THEN
   RAISE EXCEPTION 'MISSION_QUOTA_REACHED: Ce prestataire a déjà accepté ses deux missions gratuites ce mois-ci. Les demandes restent illimitées.' USING ERRCODE='P0001';
  END IF;
  INSERT INTO public.lyann_mission_usage(mission_id,provider_id,accepted_at,started,released)
   VALUES(NEW.id,NEW.helper_id,now(),v_status NOT IN ('AGREED','PAYMENT_PENDING'),false)
   ON CONFLICT(mission_id) DO UPDATE SET accepted_at=now(),released=false,started=excluded.started;
 ELSE
  IF v_status NOT IN ('AGREED','PAYMENT_PENDING') THEN UPDATE public.lyann_mission_usage SET started=true WHERE mission_id=NEW.id; END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER lyann_mission_entitlement AFTER INSERT OR UPDATE OF id,status,helper_id ON public.missions
 FOR EACH ROW EXECUTE FUNCTION public.lyann_guard_mission_entitlement();

CREATE FUNCTION public.lyann_guard_portfolio_entitlement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_used integer; v_limit integer;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'PORTFOLIO_OWNER_LOCKED' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('lyann-rights:'||NEW.user_id::text,0));
 IF NOT public.lyann_entitlements_enforced(NEW.user_id) THEN RETURN NEW; END IF;
 SELECT count(*) INTO v_used FROM public.user_portfolio_items WHERE user_id=NEW.user_id;
 v_limit:=(public.lyann_plan_limits(public.lyann_current_plan(NEW.user_id))->>'photos')::integer;
 IF v_used>v_limit THEN RAISE EXCEPTION 'PORTFOLIO_QUOTA_REACHED: Limite de photos atteinte pour votre formule. Vos photos existantes sont conservées.' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER lyann_portfolio_entitlement AFTER INSERT OR UPDATE OF user_id ON public.user_portfolio_items
 FOR EACH ROW EXECUTE FUNCTION public.lyann_guard_portfolio_entitlement();

CREATE FUNCTION public.lyann_guard_category_entitlement() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_used integer; v_before integer; v_limit integer; v_old_key text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'SERVICE_OWNER_LOCKED' USING ERRCODE='P0001'; END IF;
 IF NEW.owner_id IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('lyann-rights:'||NEW.owner_id::text,0));
 IF NOT public.lyann_entitlements_enforced(NEW.owner_id) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND coalesce(OLD.active,true) AND coalesce(OLD.is_active,true) THEN
  v_old_key:=public.lyann_service_category(OLD.category_id,OLD.category);
 END IF;
 SELECT count(DISTINCT public.lyann_service_category(category_id,category)) INTO v_used FROM public.services
 WHERE owner_id=NEW.owner_id AND coalesce(active,true) AND coalesce(is_active,true);
 SELECT count(DISTINCT k) INTO v_before FROM (
  SELECT public.lyann_service_category(category_id,category) k FROM public.services
   WHERE owner_id=NEW.owner_id AND id<>NEW.id AND coalesce(active,true) AND coalesce(is_active,true)
  UNION ALL SELECT v_old_key WHERE v_old_key IS NOT NULL
 ) previous;
 v_limit:=(public.lyann_plan_limits(public.lyann_current_plan(NEW.owner_id))->>'categories')::integer;
 IF v_used>v_limit AND v_used>v_before THEN
  RAISE EXCEPTION 'CATEGORY_QUOTA_REACHED: Limite de catégories actives atteinte pour votre formule. Vos services existants sont conservés.' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER lyann_category_entitlement AFTER INSERT OR UPDATE OF category_id,category,owner_id,active,is_active ON public.services
 FOR EACH ROW EXECUTE FUNCTION public.lyann_guard_category_entitlement();

CREATE FUNCTION public.lyann_get_entitlements(p_user uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p text; v_missions integer; v_photos integer; v_categories integer;
BEGIN
 p:=public.lyann_current_plan(p_user);
 SELECT count(*) INTO v_missions FROM public.lyann_mission_usage WHERE provider_id=p_user AND NOT released
  AND accepted_at >= (date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
 SELECT count(*) INTO v_photos FROM public.user_portfolio_items WHERE user_id=p_user;
 SELECT count(DISTINCT public.lyann_service_category(category_id,category)) INTO v_categories FROM public.services
  WHERE owner_id=p_user AND coalesce(active,true) AND coalesce(is_active,true);
 RETURN jsonb_build_object('plan',p,'limits',public.lyann_plan_limits(p),'usage',jsonb_build_object('missions',v_missions,'photos',v_photos,'categories',v_categories),
  'enforced',public.lyann_entitlements_enforced(p_user),'resets_at',(date_trunc('month',now() AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC',
  'requests_unlimited',true,'staged_payments',true,'portfolio_videos_enabled',false,'purchases_enabled',false);
END; $$;
CREATE FUNCTION public.lyann_set_entitlement_test(p_user uuid,p_enabled boolean,p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_enabled THEN
  INSERT INTO public.lyann_entitlement_test_accounts(user_id,expires_at,actor_id) VALUES(p_user,now()+interval '24 hours',p_actor)
  ON CONFLICT(user_id) DO UPDATE SET expires_at=excluded.expires_at,actor_id=excluded.actor_id,updated_at=now();
 ELSE
  DELETE FROM public.lyann_entitlement_test_accounts WHERE user_id=p_user;
 END IF;
 INSERT INTO public.lyann_entitlement_test_events(user_id,actor_id,enabled) VALUES(p_user,p_actor,p_enabled);
 RETURN public.lyann_get_entitlements(p_user);
END; $$;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('lyann_current_plan','lyann_plan_limits','lyann_entitlements_enforced','lyann_service_category',
 'lyann_guard_mission_entitlement','lyann_guard_portfolio_entitlement','lyann_guard_category_entitlement','lyann_get_entitlements','lyann_set_entitlement_test') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',r.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.signature);
 END LOOP;
END $$;
COMMIT;
