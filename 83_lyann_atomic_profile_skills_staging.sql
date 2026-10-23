BEGIN;
CREATE FUNCTION public.lyann_sync_profile_skills(p_user uuid,p_titles text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_title text; v_titles text[];
BEGIN
 IF auth.uid() IS NULL OR auth.uid()<>p_user THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
 IF p_titles IS NULL OR cardinality(p_titles)>100 OR EXISTS(SELECT 1 FROM unnest(p_titles) t WHERE t IS NULL OR length(btrim(t))=0 OR length(t)>120) THEN
  RAISE EXCEPTION 'Catégories invalides' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(array_agg(t),'{}'::text[]) INTO v_titles FROM (SELECT DISTINCT ON(lower(btrim(x))) btrim(x) t FROM unnest(p_titles) x ORDER BY lower(btrim(x))) clean;
 PERFORM pg_advisory_xact_lock(hashtextextended('lyann-rights:'||p_user::text,0));
 -- Delete only profile-created stubs, never priced services. This entire replacement is atomic.
 DELETE FROM public.services s WHERE owner_id=p_user
 AND NOT EXISTS(SELECT 1 FROM unnest(v_titles) t WHERE lower(t)=lower(btrim(s.title)))
 AND base_price IS NULL AND indicative_price IS NULL AND price_type IS NULL AND pricing_model IS NULL
 AND (coalesce(btrim(description),'')='' OR btrim(description)=btrim(title));
 FOREACH v_title IN ARRAY v_titles LOOP
  IF NOT EXISTS(SELECT 1 FROM public.services WHERE owner_id=p_user AND lower(btrim(title))=lower(v_title)) THEN
   INSERT INTO public.services(owner_id,title,description,category,slug)
   VALUES(p_user,v_title,v_title,v_title,'skill-'||gen_random_uuid()::text);
  END IF;
 END LOOP;
 RETURN jsonb_build_object('success',true,'skills',v_titles);
END; $$;
REVOKE ALL ON FUNCTION public.lyann_sync_profile_skills(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lyann_sync_profile_skills(uuid,text[]) TO authenticated;
COMMIT;
