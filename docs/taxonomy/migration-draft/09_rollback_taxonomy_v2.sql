-- 94z_taxonomy_v2_rollback — retour exact à l'état antérieur au schéma v2
-- ============================================================================
-- BROUILLON — NON APPLIQUÉ. Aucune exécution sur Staging ni sur Production dans la phase 3.2B.
-- Ce script ne touche JAMAIS aux colonnes ni aux lignes historiques : il retire seulement ce que 01 à 06 ont ajouté.
-- Conséquences connues (à valider avant d'appliquer 01-05) :
--   * la table lyann_profile_skill est supprimée : les compétences restent portées par `services` (stubs écrits en double) ;
--   * les colonnes taxonomy_node_code / node_code sont supprimées : l'ancien lien requests.taxonomy_id → lyann_taxonomy.id n'a jamais été modifié.
-- ============================================================================
BEGIN;

DROP TRIGGER  IF EXISTS lyann_requests_derive_node_trg ON public.requests;
DROP TRIGGER  IF EXISTS lyann_services_derive_node_trg ON public.services;
DROP FUNCTION IF EXISTS public.lyann_derive_request_node();
DROP FUNCTION IF EXISTS public.lyann_derive_service_node();
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
