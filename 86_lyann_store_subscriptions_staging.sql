-- Staging only. No purchases enabled and no existing membership changed.
BEGIN;
CREATE TABLE public.lyann_store_accounts (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 account_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.lyann_store_subscriptions (
 provider text NOT NULL CHECK(provider IN ('apple','google')),
 purchase_key text NOT NULL CHECK(purchase_key ~ '^[0-9a-f]{64}$'),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 product_id text NOT NULL, plan text NOT NULL CHECK(plan IN ('PLUS','PRO')),
 status text NOT NULL CHECK(status IN ('active','cancel_at_period_end','expired','revoked')),
 expires_at timestamptz NOT NULL, checked_at timestamptz NOT NULL,
 environment text NOT NULL CHECK(environment IN ('Sandbox','Test')),
 PRIMARY KEY(provider,purchase_key)
);
CREATE INDEX lyann_store_subscriptions_user ON public.lyann_store_subscriptions(user_id);
ALTER TABLE public.lyann_store_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_store_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lyann_store_accounts,public.lyann_store_subscriptions FROM anon,authenticated;
GRANT ALL ON public.lyann_store_accounts,public.lyann_store_subscriptions TO service_role;

CREATE FUNCTION public.lyann_store_account(p_user uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE token uuid;
BEGIN
 INSERT INTO public.lyann_store_accounts(user_id) VALUES(p_user) ON CONFLICT(user_id) DO NOTHING;
 SELECT account_token INTO token FROM public.lyann_store_accounts WHERE user_id=p_user;
 RETURN token;
END $$;

CREATE FUNCTION public.lyann_apply_store_subscription(
 p_user uuid,p_account uuid,p_provider text,p_key text,p_product text,p_plan text,
 p_status text,p_expires timestamptz,p_checked timestamptz,p_environment text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing public.lyann_store_subscriptions; chosen public.lyann_store_subscriptions; current_source text;
BEGIN
 IF p_provider NOT IN ('apple','google') OR p_plan NOT IN ('PLUS','PRO')
 OR p_status NOT IN ('active','cancel_at_period_end','expired','revoked')
 OR p_key !~ '^[0-9a-f]{64}$' OR p_product IS NULL OR length(p_product)>250
 OR p_checked IS NULL OR p_checked>now()+interval '1 minute'
 OR p_expires IS NULL
 OR (p_provider='apple' AND p_environment IS DISTINCT FROM 'Sandbox')
 OR (p_provider='google' AND p_environment IS DISTINCT FROM 'Test') THEN
 RAISE EXCEPTION 'INVALID_STORE_SUBSCRIPTION' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM lyann_store_accounts WHERE user_id=p_user AND account_token=p_account) THEN
 RAISE EXCEPTION 'STORE_ACCOUNT_MISMATCH' USING ERRCODE='42501'; END IF;
 -- Same user and same purchase locks protect parallel restores and cross-account claims.
 PERFORM pg_advisory_xact_lock(hashtextextended('lyann-store-user:'||p_user::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('lyann-store-purchase:'||p_provider||p_key,0));
 SELECT * INTO existing FROM lyann_store_subscriptions WHERE provider=p_provider AND purchase_key=p_key FOR UPDATE;
 IF FOUND AND existing.user_id<>p_user THEN RAISE EXCEPTION 'STORE_PURCHASE_ALREADY_BOUND' USING ERRCODE='42501'; END IF;
 SELECT source INTO current_source FROM lyann_plan_memberships WHERE user_id=p_user FOR UPDATE;
 IF current_source='stripe' THEN RAISE EXCEPTION 'EXISTING_BILLING_REQUIRES_REVIEW' USING ERRCODE='42501'; END IF;
 IF existing.checked_at IS NOT NULL AND existing.checked_at>p_checked THEN
 RETURN jsonb_build_object('applied',false,'reason','newer_check_exists'); END IF;
 INSERT INTO lyann_store_subscriptions(provider,purchase_key,user_id,product_id,plan,status,expires_at,checked_at,environment)
 VALUES(p_provider,p_key,p_user,p_product,p_plan,p_status,p_expires,p_checked,p_environment)
 ON CONFLICT(provider,purchase_key) DO UPDATE SET product_id=excluded.product_id,plan=excluded.plan,
 status=excluded.status,expires_at=excluded.expires_at,checked_at=excluded.checked_at;
 -- An old/expired purchase must not downgrade a different, still active subscription.
 SELECT * INTO chosen FROM lyann_store_subscriptions WHERE user_id=p_user
 AND status IN ('active','cancel_at_period_end') AND expires_at>now()
 ORDER BY CASE plan WHEN 'PRO' THEN 2 ELSE 1 END DESC,expires_at DESC LIMIT 1;
 IF NOT FOUND THEN
  SELECT * INTO chosen FROM lyann_store_subscriptions WHERE user_id=p_user ORDER BY checked_at DESC LIMIT 1;
  chosen.status:=CASE WHEN chosen.status='revoked' THEN 'revoked' ELSE 'expired' END;
 END IF;
 INSERT INTO lyann_plan_memberships(user_id,plan,status,expires_at,source,external_id,updated_at)
 VALUES(p_user,chosen.plan,chosen.status,chosen.expires_at,chosen.provider,chosen.provider||':'||chosen.purchase_key,now())
 ON CONFLICT(user_id) DO UPDATE SET plan=excluded.plan,status=excluded.status,expires_at=excluded.expires_at,
 source=excluded.source,external_id=excluded.external_id,updated_at=excluded.updated_at;
 RETURN jsonb_build_object('applied',true);
END $$;
REVOKE ALL ON FUNCTION public.lyann_store_account(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.lyann_apply_store_subscription(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lyann_store_account(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lyann_apply_store_subscription(uuid,uuid,text,text,text,text,text,timestamptz,timestamptz,text) TO service_role;
COMMIT;
