-- Staging only: public, minimal badges; never expose dossier or billing details.
BEGIN;
CREATE OR REPLACE FUNCTION public.lyann_dossier_is_verified(p_identity jsonb,p_documents jsonb,p_status text)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE d jsonb; required text[]; kind text; expiry date;
BEGIN
 IF p_status IS DISTINCT FROM 'approved' OR jsonb_typeof(p_documents) IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_documents)=0 OR coalesce(p_identity->>'activity','') NOT IN ('general','construction','regulated') THEN RETURN false; END IF;
 required:=CASE p_identity->>'activity' WHEN 'construction' THEN ARRAY['registration','insurance','decennial']
 WHEN 'regulated' THEN ARRAY['registration','insurance','qualification'] ELSE ARRAY['registration'] END;
 FOREACH kind IN ARRAY required LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_documents) x WHERE x->>'kind'=kind) THEN RETURN false; END IF;
 END LOOP;
 FOR d IN SELECT * FROM jsonb_array_elements(p_documents) LOOP
  IF d->>'decision' IS DISTINCT FROM 'approved' THEN RETURN false; END IF;
  IF d->>'kind' IN ('insurance','decennial') AND coalesce(d->>'expires_at','')='' THEN RETURN false; END IF;
  IF coalesce(d->>'expires_at','')<>'' THEN
   IF d->>'expires_at' !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN false; END IF;
   BEGIN expiry:=(d->>'expires_at')::date; EXCEPTION WHEN OTHERS THEN RETURN false; END;
   IF to_char(expiry,'YYYY-MM-DD')<>d->>'expires_at' OR (expiry+1)::timestamp AT TIME ZONE 'UTC'<=now() THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.lyann_dossier_is_verified(jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lyann_dossier_is_verified(jsonb,jsonb,text) TO service_role;

CREATE OR REPLACE FUNCTION public.lyann_public_badges(p_users uuid[])
RETURNS TABLE(user_id uuid,plan text,verified boolean,valid_until timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF coalesce(cardinality(p_users),0)>100 THEN RAISE EXCEPTION 'BADGE_BATCH_TOO_LARGE' USING ERRCODE='22023'; END IF;
 RETURN QUERY
 SELECT p.id,
 CASE WHEN m.plan IN ('PLUS','PRO') AND m.status IN ('active','cancel_at_period_end') AND m.expires_at>now() THEN m.plan ELSE 'FREE' END,
 coalesce(m.plan='PRO' AND m.status IN ('active','cancel_at_period_end') AND m.expires_at>now()
 AND public.lyann_dossier_is_verified(d.identity,d.documents,d.status),false),
 -- Short-lived presentation only. This timestamp does not reveal a billing period.
 least(now()+interval '30 seconds',CASE WHEN m.expires_at>now() THEN m.expires_at ELSE now()+interval '30 seconds' END,
 (date_trunc('day',now() AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC')
 FROM public.public_profiles p
 LEFT JOIN public.lyann_plan_memberships m ON m.user_id=p.id
 LEFT JOIN public.lyann_pro_dossiers d ON d.user_id=p.id
 WHERE p.id=ANY(p_users);
END $$;
REVOKE ALL ON FUNCTION public.lyann_public_badges(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lyann_public_badges(uuid[]) TO anon,authenticated,service_role;
COMMIT;
