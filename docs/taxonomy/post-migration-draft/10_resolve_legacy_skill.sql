-- 10_resolve_legacy_skill — le membre précise le métier d'une ancienne compétence sans nœud (PRÊT ET TESTÉ SUR LE BANC — NON APPLIQUÉ)
-- ============================================================================
-- À appliquer APRÈS P5, séparément (aucune dépendance de 01-09 envers ce fichier : il ne fait pas partie de la séquence validée par P3).
-- Staging uniquement (tdktfbtqceldlaeqjtow). Jamais Production sans autorisation spécifique. Rollback : 10_resolve_legacy_skill_rollback.sql.
--
-- Pourquoi : 52 des 208 compétences de Staging (voir docs/taxonomy/generated/unattached-skills.json) n'ont pas de nœud v2 parce que leur titre
-- (« Courses », « Cuisine », « Dépannage »…) désigne plusieurs métiers : décision X5, aucun métier n'est choisi à la place du membre.
-- La RPC v2 d'édition (lyann_sync_profile_skills_v2, 03) crée un NOUVEAU stub « Métier · Spécialité » et laisserait l'ancien stub à côté : doublon, et une
-- clé de quota de plus (migration 82). Cette fonction rattache au contraire le nœud choisi à la compétence EXISTANTE.
--
-- Garanties (testées dans tests/taxonomy-p45-skills.test.js) :
--   · seul le propriétaire peut agir (auth.uid()) ; une compétence d'autrui et une compétence inexistante donnent la même réponse (pas d'énumération) ;
--   · ne remplit qu'une compétence SANS nœud : changer un nœud existant passe par l'éditeur v2 ;
--   · le nœud doit être actif, sélectionnable (jamais une activité réglementée), ni une famille ni « autres » : mêmes règles que la RPC v2 ;
--   · écrit uniquement taxonomy_node_code et taxonomy_node_source = 'user' : titre, catégorie, description, prix, actif ne changent JAMAIS ;
--   · le quota de catégories n'est pas touché (le déclencheur de la migration 82 n'écoute pas taxonomy_node_code) ;
--   · atomique, sous le même verrou consultatif que la RPC v2 (pas de course avec un enregistrement de profil).
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.lyann_resolve_legacy_skill(p_service uuid, p_node text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_uid     uuid := auth.uid();
    v_owner   uuid;
    v_current text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
    END IF;
    IF p_service IS NULL OR p_node IS NULL OR p_node !~ '^[a-z0-9_]{2,80}$' THEN
        RAISE EXCEPTION 'Compétence invalide' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('lyann-rights:' || v_uid::text, 0));

    SELECT s.owner_id, s.taxonomy_node_code INTO v_owner, v_current FROM public.services s WHERE s.id = p_service FOR UPDATE;
    IF NOT FOUND OR v_owner IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
    END IF;
    IF v_current IS NOT NULL THEN
        RAISE EXCEPTION 'Compétence déjà classée' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.lyann_taxonomy_node n
                   WHERE n.code = p_node AND n.active AND n.selectable AND n.kind <> 'family' AND n.family_code IS DISTINCT FROM 'autres') THEN
        RAISE EXCEPTION 'Compétence non proposable' USING ERRCODE = '22023';
    END IF;

    UPDATE public.services SET taxonomy_node_code = p_node, taxonomy_node_source = 'user' WHERE id = p_service;
    INSERT INTO public.lyann_profile_skill(user_id, node_code) VALUES (v_uid, p_node) ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('success', true, 'service_id', p_service, 'node', p_node);
END;
$$;
REVOKE ALL ON FUNCTION public.lyann_resolve_legacy_skill(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lyann_resolve_legacy_skill(uuid, text) TO authenticated;

COMMIT;
