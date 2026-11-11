-- 94z_taxonomy_v2_rollback — retour exact à l'état antérieur au schéma v2
-- ============================================================================
-- BROUILLON — NON APPLIQUÉ. Aucune exécution sur Staging ni sur Production dans la phase 3.2B.
-- Ce script ne touche JAMAIS aux colonnes ni aux lignes historiques : il retire seulement ce que 01 à 06 et 08 ont ajouté.
-- Conséquences connues (à valider avant d'appliquer 01-05) :
--   * la table lyann_profile_skill est supprimée : les compétences restent portées par `services` (stubs écrits en double) ;
--   * les colonnes taxonomy_node_code / node_code sont supprimées : l'ancien lien requests.taxonomy_id → lyann_taxonomy.id n'a jamais été modifié.
-- ============================================================================
BEGIN;

-- Restitue l'ancienne RPC d'enregistrement des compétences à l'identique de la migration 83.
CREATE OR REPLACE FUNCTION public.lyann_sync_profile_skills(p_user uuid,p_titles text[]) RETURNS jsonb
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

DROP TRIGGER  IF EXISTS lyann_requests_derive_node_trg ON public.requests;
DROP TRIGGER  IF EXISTS lyann_services_derive_node_trg ON public.services;
DROP TRIGGER  IF EXISTS lyann_requests_legacy_projection_trg ON public.requests;
DROP FUNCTION IF EXISTS public.lyann_fill_request_legacy();
DROP TABLE    IF EXISTS public.lyann_taxonomy_legacy_projection;
DROP FUNCTION IF EXISTS public.lyann_derive_request_node();
DROP FUNCTION IF EXISTS public.lyann_derive_service_node();
DROP FUNCTION IF EXISTS public.lyann_service_legacy_matches_node(text, text);
DROP FUNCTION IF EXISTS public.lyann_request_legacy_matches_node(text, uuid, text);
DROP FUNCTION IF EXISTS public.lyann_node_related_to(text, text[]);
DROP FUNCTION IF EXISTS public.lyann_legacy_value_is_placeholder(text);
DROP FUNCTION IF EXISTS public.lyann_legacy_certain_node(text, text);
DROP FUNCTION IF EXISTS public.lyann_sync_profile_skills_v2(uuid, text[]);
DROP TABLE    IF EXISTS public.lyann_profile_skill;
DROP FUNCTION IF EXISTS public.lyann_taxonomy_search(text, integer);
DROP VIEW     IF EXISTS public.lyann_taxonomy_v2_flat;

ALTER TABLE public.services       DROP CONSTRAINT IF EXISTS services_taxonomy_node_code_fk;
ALTER TABLE public.requests       DROP CONSTRAINT IF EXISTS requests_taxonomy_node_code_fk;
ALTER TABLE public.lyann_taxonomy DROP CONSTRAINT IF EXISTS lyann_taxonomy_node_code_fk;
DROP INDEX IF EXISTS public.services_taxonomy_node_code_idx;
DROP INDEX IF EXISTS public.requests_taxonomy_node_code_idx;
ALTER TABLE public.services       DROP COLUMN IF EXISTS taxonomy_node_source;
ALTER TABLE public.requests       DROP COLUMN IF EXISTS taxonomy_node_source;
ALTER TABLE public.services       DROP COLUMN IF EXISTS taxonomy_node_code;
ALTER TABLE public.requests       DROP COLUMN IF EXISTS taxonomy_node_code;
ALTER TABLE public.lyann_taxonomy DROP COLUMN IF EXISTS node_code;

DROP TABLE IF EXISTS public.lyann_taxonomy_legacy_map;
DROP TABLE IF EXISTS public.lyann_taxonomy_ambiguous_term;
DROP TABLE IF EXISTS public.lyann_taxonomy_term;
DROP TABLE IF EXISTS public.lyann_taxonomy_node_family;
DROP TABLE IF EXISTS public.lyann_taxonomy_node;
DROP TABLE IF EXISTS public.lyann_taxonomy_group;
DROP TABLE IF EXISTS public.lyann_taxonomy_release;
DROP FUNCTION IF EXISTS public.lyann_taxonomy_node_guard();
DROP FUNCTION IF EXISTS public.lyann_taxonomy_norm(text);
-- Les extensions unaccent / pg_trgm ne sont volontairement pas retirées (susceptibles d'être utilisées ailleurs).

COMMIT;
