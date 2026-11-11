-- 94d_taxonomy_v2_dual_write_derivation — rattachement automatique au nœud v2 pour les anciens clients
-- ============================================================================
-- BROUILLON — NON APPLIQUÉ. Aucune exécution sur Staging ni sur Production.
-- Dépend de 01, 02 et 05 (table de correspondance). Rollback : 09_rollback_taxonomy_v2.sql
--
-- Pourquoi : les applications iOS/Android embarquent leur code web (Capacitor, webDir « www », pas d'URL distante) : les
-- builds déjà publiés continueront d'écrire requests.category / requests.taxonomy_id et services.title / services.category
-- sans jamais renseigner taxonomy_node_code. Sans ce déclencheur, chaque annonce ou compétence créée par un ancien client
-- resterait hors du nouveau référentiel et la « référence métier commune » serait trouée.
--
-- Règles (toutes testées localement, voir scripts/taxonomy-v2/validate-sql-pglite.js) :
--   1. une valeur explicite d'un client v2 n'est JAMAIS écrasée (provenance « client » si elle n'est pas fournie) ;
--   2. sinon, dérivation depuis la source la plus structurée : feuille historique (taxonomy_id) puis catégorie libre
--      (uniquement les correspondances exact / broad / merge : « Général », « Autre » et les résidus de test restent NULL) ;
--   3. un rattachement dérivé est recalculé si l'ancien client modifie la feuille ou la catégorie ; un rattachement
--      explicite ou issu du classifieur n'est recalculé que si l'ancien client écrit une valeur INFORMATIVE qui CONTREDIT
--      le nœud (ni le nœud, ni son métier parent, ni l'une de ses spécialités n'est atteignable depuis la valeur écrite) ;
--      une valeur de repli (« Général », « Autre / Je ne trouve pas », vide) n'est jamais une contradiction — l'ancien
--      assistant les présélectionne d'office, elle ne prouve rien — et une valeur cohérente (catégorie historique du pont) conserve le nœud ;
--   4. FAIL-OPEN : toute anomalie lève un avertissement et laisse le champ NULL ; une écriture d'un ancien client n'est
--      jamais bloquée par la taxonomie ;
--   5. l'ancien éditeur de compétences (RPC de la migration 83) ne supprime plus une compétence posée par un client v2 ;
--   6. SECURITY DEFINER avec search_path fixé : la table de correspondance est réservée à l'administration (RLS), un membre
--      ne pourrait pas la lire avec ses propres droits ; la fonction ne lit que des catalogues et n'écrit que dans NEW.
-- Provenances : client · user · classifier (v2) · derived_leaf · derived_category · derived_title (ce fichier) · backfill_* (05) ;
-- le suffixe _parent (derived_*_parent, backfill_*_parent) signale un rattachement au métier parent faute de certitude sur la spécialité : besoin de précision (décision X5).
-- ============================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- Aides de cohérence (lecture seule, SECURITY DEFINER : la table de correspondance est réservée à l'administration)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lyann_legacy_value_is_placeholder(p text) RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
    SELECT nullif(btrim(coalesce(p, '')), '') IS NULL
        OR lower(btrim(p)) IN ('général', 'general', 'autre', 'autres', 'autre / je ne trouve pas', 'autres besoins');
$$;

-- Le nœud est-il atteignable depuis l'une des cibles : le nœud lui-même, son métier parent, ou l'une de ses spécialités ?
CREATE OR REPLACE FUNCTION public.lyann_node_related_to(p_node text, p_targets text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p_node IS NOT NULL AND p_targets IS NOT NULL AND cardinality(p_targets) > 0 AND EXISTS (
        SELECT 1 FROM public.lyann_taxonomy_node n
        WHERE n.code = p_node
          AND (n.code = ANY (p_targets)
               OR n.parent_code = ANY (p_targets)
               OR EXISTS (SELECT 1 FROM public.lyann_taxonomy_node c WHERE c.parent_code = n.code AND c.code = ANY (p_targets)))
    );
$$;

-- Les champs historiques d'une annonce (feuille, catégorie) sont-ils compatibles avec ce nœud ?
CREATE OR REPLACE FUNCTION public.lyann_request_legacy_matches_node(p_node text, p_taxonomy_id uuid, p_category text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_targets text[] := '{}';
    v_cat     text := lower(btrim(coalesce(p_category, '')));
BEGIN
    IF p_taxonomy_id IS NOT NULL THEN
        SELECT v_targets || coalesce(array_agg(DISTINCT c) FILTER (WHERE c IS NOT NULL), '{}') INTO v_targets FROM (
            SELECT t.node_code AS c FROM public.lyann_taxonomy t WHERE t.id = p_taxonomy_id
            UNION SELECT m.node_code FROM public.lyann_taxonomy t JOIN public.lyann_taxonomy_legacy_map m
                ON m.legacy_kind = 'taxonomy_leaf' AND m.legacy_key = t.universe || '|' || t.category || '|' || t.subcategory WHERE t.id = p_taxonomy_id
            UNION SELECT unnest(m.alt_codes) FROM public.lyann_taxonomy t JOIN public.lyann_taxonomy_legacy_map m
                ON m.legacy_kind = 'taxonomy_leaf' AND m.legacy_key = t.universe || '|' || t.category || '|' || t.subcategory WHERE t.id = p_taxonomy_id
        ) s;
    END IF;
    IF NOT public.lyann_legacy_value_is_placeholder(p_category) THEN
        SELECT v_targets || coalesce(array_agg(DISTINCT c) FILTER (WHERE c IS NOT NULL), '{}') INTO v_targets FROM (
            SELECT m.node_code AS c FROM public.lyann_taxonomy_legacy_map m WHERE m.legacy_kind = 'request_category' AND lower(btrim(m.legacy_key)) = v_cat
            UNION SELECT unnest(m.alt_codes) FROM public.lyann_taxonomy_legacy_map m WHERE m.legacy_kind = 'request_category' AND lower(btrim(m.legacy_key)) = v_cat
            -- catégorie historique = deuxième segment de « univers|catégorie|sous-catégorie »
            UNION SELECT m.node_code FROM public.lyann_taxonomy_legacy_map m WHERE m.legacy_kind = 'taxonomy_leaf' AND lower(split_part(m.legacy_key, '|', 2)) = v_cat
            UNION SELECT unnest(m.alt_codes) FROM public.lyann_taxonomy_legacy_map m WHERE m.legacy_kind = 'taxonomy_leaf' AND lower(split_part(m.legacy_key, '|', 2)) = v_cat
            -- un client v2 qui écrit le libellé du nœud dans category
            UNION SELECT n.code FROM public.lyann_taxonomy_node n WHERE lower(n.label_fr) = v_cat
        ) s;
    END IF;
    RETURN public.lyann_node_related_to(p_node, v_targets);
END;
$$;

CREATE OR REPLACE FUNCTION public.lyann_service_legacy_matches_node(p_node text, p_title text) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_targets text[] := '{}';
    v_title   text := lower(btrim(coalesce(p_title, '')));
BEGIN
    IF v_title = '' THEN RETURN false; END IF;
    SELECT coalesce(array_agg(DISTINCT c) FILTER (WHERE c IS NOT NULL), '{}') INTO v_targets FROM (
        SELECT m.node_code AS c FROM public.lyann_taxonomy_legacy_map m WHERE m.legacy_kind = 'skill_title' AND lower(btrim(m.legacy_key)) = v_title
        UNION SELECT unnest(m.alt_codes) FROM public.lyann_taxonomy_legacy_map m WHERE m.legacy_kind = 'skill_title' AND lower(btrim(m.legacy_key)) = v_title
        UNION SELECT n.code FROM public.lyann_taxonomy_node n WHERE lower(n.label_fr) = v_title
        -- titre composé « Métier · Spécialité » (politique d'écriture C du pont de compatibilité)
        UNION SELECT n.code FROM public.lyann_taxonomy_node n JOIN public.lyann_taxonomy_node p ON p.code = n.parent_code
              WHERE lower(p.label_fr || ' · ' || n.label_fr) = v_title
    ) s;
    RETURN public.lyann_node_related_to(p_node, v_targets);
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_legacy_value_is_placeholder(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lyann_node_related_to(text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lyann_request_legacy_matches_node(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lyann_service_legacy_matches_node(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lyann_derive_request_node() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_code   text;
    v_source text;
    v_prec   boolean := false;
    c        record;
BEGIN
    BEGIN
        IF NEW.taxonomy_node_code IS NOT NULL THEN
            -- Valeur explicite. Recalculée seulement si l'ancien client a modifié la feuille/catégorie SANS toucher au nœud, et :
            --   · soit le rattachement est lui-même dérivé ;
            --   · soit la valeur écrite est informative et contredit le nœud (un repli « Général »/« Autre » ne contredit rien).
            IF TG_OP = 'UPDATE'
               AND NEW.taxonomy_node_code IS NOT DISTINCT FROM OLD.taxonomy_node_code
               AND (NEW.taxonomy_id IS DISTINCT FROM OLD.taxonomy_id OR NEW.category IS DISTINCT FROM OLD.category)
               AND (coalesce(NEW.taxonomy_node_source, '') ~ '^(derived_|backfill_)'
                    OR ((NEW.taxonomy_id IS NOT NULL OR NOT public.lyann_legacy_value_is_placeholder(NEW.category))
                        AND NOT public.lyann_request_legacy_matches_node(NEW.taxonomy_node_code, NEW.taxonomy_id, NEW.category))) THEN
                NULL; -- on retombe sur la dérivation ci-dessous (NULL si rien de fiable : « à classer »)
            ELSE
                IF NEW.taxonomy_node_source IS NULL THEN NEW.taxonomy_node_source := 'client'; END IF;
                RETURN NEW;
            END IF;
        END IF;

        -- Décision X5 : un nœud précis n'est dérivé que si la correspondance est certaine ; si la valeur historique recouvre plusieurs
        -- spécialités d'un même métier, on rattache au MÉTIER PARENT (provenance *_parent = besoin de précision) ; si elle recouvre
        -- plusieurs métiers, on ne rattache à rien. Jamais de spécialité choisie arbitrairement.
        IF NEW.taxonomy_id IS NOT NULL THEN
            SELECT coalesce(t.node_code, k.node_code), coalesce(k.precision_needed, false) AND coalesce(t.node_code, k.node_code) IS NOT DISTINCT FROM k.node_code
              INTO v_code, v_prec
            FROM public.lyann_taxonomy t
            LEFT JOIN LATERAL public.lyann_legacy_certain_node('taxonomy_leaf', t.universe || '|' || t.category || '|' || t.subcategory) k ON true
            WHERE t.id = NEW.taxonomy_id;
            IF v_code IS NOT NULL THEN v_source := CASE WHEN v_prec THEN 'derived_leaf_parent' ELSE 'derived_leaf' END; END IF;
        END IF;

        IF v_code IS NULL AND nullif(btrim(NEW.category), '') IS NOT NULL THEN
            SELECT * INTO c FROM public.lyann_legacy_certain_node('request_category', NEW.category);
            -- « Général », « Autre » et les résidus de test (ambiguous sans alternative) ne désignent rien : NULL.
            IF c.node_code IS NOT NULL AND (c.precision_needed OR c.mapping_kind IN ('exact', 'broad', 'merge')) THEN
                v_code := c.node_code;
                v_source := CASE WHEN c.precision_needed THEN 'derived_category_parent' ELSE 'derived_category' END;
            END IF;
        END IF;

        NEW.taxonomy_node_code := v_code;       -- NULL si rien de fiable : « à classer »
        NEW.taxonomy_node_source := v_source;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'lyann_derive_request_node: % (%), rattachement laissé en l''état', SQLERRM, SQLSTATE;
    END;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.lyann_derive_service_node() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_code text;
    c      record;
BEGIN
    BEGIN
        IF NEW.taxonomy_node_code IS NOT NULL THEN
            IF TG_OP = 'UPDATE'
               AND NEW.taxonomy_node_code IS NOT DISTINCT FROM OLD.taxonomy_node_code
               AND (NEW.title IS DISTINCT FROM OLD.title)
               AND (coalesce(NEW.taxonomy_node_source, '') ~ '^(derived_|backfill_)'
                    OR (nullif(btrim(coalesce(NEW.title, '')), '') IS NOT NULL
                        AND NOT public.lyann_service_legacy_matches_node(NEW.taxonomy_node_code, NEW.title))) THEN
                NULL;
            ELSE
                IF NEW.taxonomy_node_source IS NULL THEN NEW.taxonomy_node_source := 'client'; END IF;
                RETURN NEW;
            END IF;
        END IF;

        -- Compétence : correspondance par titre normalisé (décision X5). Les titres sans objet (« Installation », « Dépannage »…) qui
        -- recouvrent plusieurs métiers restent NULL ; ceux qui recouvrent plusieurs spécialités d'un même métier montent au métier parent.
        SELECT * INTO c FROM public.lyann_legacy_certain_node('skill_title', NEW.title);
        IF c.node_code IS NOT NULL AND (c.precision_needed OR c.mapping_kind IN ('exact', 'broad', 'merge')) THEN
            v_code := c.node_code;
        END IF;
        NEW.taxonomy_node_code := v_code;
        NEW.taxonomy_node_source := CASE WHEN v_code IS NULL THEN NULL WHEN c.precision_needed THEN 'derived_title_parent' ELSE 'derived_title' END;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'lyann_derive_service_node: % (%), rattachement laissé en l''état', SQLERRM, SQLSTATE;
    END;
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Ancien éditeur de compétences : ne supprime plus une compétence posée par un client v2.
-- L'ancienne RPC (migration 83) supprime tout « stub » de profil absent de la liste des titres envoyés ; un ancien client ne connaît pas
-- les compétences v2 (aucun bouton correspondant) et les effacerait à chaque enregistrement de son profil. Seule modification : la ligne
-- « AND NOT (… taxonomy_node_code IS NOT NULL …) ». Signature, droits et résultat inchangés. Rollback : 09 restitue la définition de 83.
-- ---------------------------------------------------------------------------
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
 -- Delete only profile-created stubs, never priced services, never v2 skills. This entire replacement is atomic.
 DELETE FROM public.services s WHERE owner_id=p_user
 AND NOT EXISTS(SELECT 1 FROM unnest(v_titles) t WHERE lower(t)=lower(btrim(s.title)))
 -- Compétence posée par un client v2 (nœud explicite) : l'ancien client ne la voit pas dans ses boutons, il ne doit pas la supprimer.
 AND NOT (s.taxonomy_node_code IS NOT NULL AND coalesce(s.taxonomy_node_source,'') !~ '^(derived_|backfill_)')
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

REVOKE ALL ON FUNCTION public.lyann_derive_request_node() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lyann_derive_service_node() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lyann_requests_derive_node_trg ON public.requests;
CREATE TRIGGER lyann_requests_derive_node_trg
    BEFORE INSERT OR UPDATE OF taxonomy_id, category, taxonomy_node_code ON public.requests
    FOR EACH ROW EXECUTE FUNCTION public.lyann_derive_request_node();

DROP TRIGGER IF EXISTS lyann_services_derive_node_trg ON public.services;
CREATE TRIGGER lyann_services_derive_node_trg
    BEFORE INSERT OR UPDATE OF title, category, taxonomy_node_code ON public.services
    FOR EACH ROW EXECUTE FUNCTION public.lyann_derive_service_node();

COMMIT;
