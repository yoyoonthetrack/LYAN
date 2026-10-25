BEGIN;
CREATE FUNCTION public.lyann_my_entitlements() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié' USING ERRCODE='42501'; END IF;
 RETURN public.lyann_get_entitlements(auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.lyann_my_entitlements() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lyann_my_entitlements() TO authenticated;
COMMIT;
