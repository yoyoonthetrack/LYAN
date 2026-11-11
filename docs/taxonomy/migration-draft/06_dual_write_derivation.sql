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
--      explicite ou issu du classifieur ne l'est jamais ;
--   4. FAIL-OPEN : toute anomalie lève un avertissement et laisse le champ NULL ; une écriture d'un ancien client n'est
--      jamais bloquée par la taxonomie ;
--   5. SECURITY DEFINER avec search_path fixé : la table de correspondance est réservée à l'administration (RLS), un membre
--      ne pourrait pas la lire avec ses propres droits ; la fonction ne lit que des catalogues et n'écrit que dans NEW.
-- Provenances : client · user · classifier (v2) · derived_leaf · derived_category · derived_title (ce fichier) · backfill_* (05).
-- ============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.lyann_derive_request_node() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_code   text;
    v_source text;
BEGIN
    BEGIN
        IF NEW.taxonomy_node_code IS NOT NULL THEN
            -- Valeur explicite. Seul un rattachement dérivé dont la source ancienne a changé est recalculé.
            IF TG_OP = 'UPDATE'
               AND NEW.taxonomy_node_code IS NOT DISTINCT FROM OLD.taxonomy_node_code
               AND coalesce(NEW.taxonomy_node_source, '') ~ '^(derived_|backfill_)'
               AND (NEW.taxonomy_id IS DISTINCT FROM OLD.taxonomy_id OR NEW.category IS DISTINCT FROM OLD.category) THEN
                NULL; -- on retombe sur la dérivation ci-dessous
            ELSE
                IF NEW.taxonomy_node_source IS NULL THEN NEW.taxonomy_node_source := 'client'; END IF;
                RETURN NEW;
            END IF;
        END IF;

        IF NEW.taxonomy_id IS NOT NULL THEN
            SELECT coalesce(t.node_code, m.node_code) INTO v_code
            FROM public.lyann_taxonomy t
            LEFT JOIN public.lyann_taxonomy_legacy_map m
                   ON m.legacy_kind = 'taxonomy_leaf' AND m.legacy_key = t.universe || '|' || t.category || '|' || t.subcategory
            WHERE t.id = NEW.taxonomy_id;
            IF v_code IS NOT NULL THEN v_source := 'derived_leaf'; END IF;
        END IF;

        IF v_code IS NULL AND nullif(btrim(NEW.category), '') IS NOT NULL THEN
            SELECT m.node_code INTO v_code
            FROM public.lyann_taxonomy_legacy_map m
            WHERE m.legacy_kind = 'request_category' AND m.mapping_kind IN ('exact', 'broad', 'merge')
              AND lower(btrim(m.legacy_key)) = lower(btrim(NEW.category));
            IF v_code IS NOT NULL THEN v_source := 'derived_category'; END IF;
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
BEGIN
    BEGIN
        IF NEW.taxonomy_node_code IS NOT NULL THEN
            IF TG_OP = 'UPDATE'
               AND NEW.taxonomy_node_code IS NOT DISTINCT FROM OLD.taxonomy_node_code
               AND coalesce(NEW.taxonomy_node_source, '') ~ '^(derived_|backfill_)'
               AND (NEW.title IS DISTINCT FROM OLD.title) THEN
                NULL;
            ELSE
                IF NEW.taxonomy_node_source IS NULL THEN NEW.taxonomy_node_source := 'client'; END IF;
                RETURN NEW;
            END IF;
        END IF;

        -- Compétence : correspondance par titre normalisé. Les titres ambigus (« Installation », « Dépannage »…) restent NULL.
        SELECT m.node_code INTO v_code
        FROM public.lyann_taxonomy_legacy_map m
        WHERE m.legacy_kind = 'skill_title' AND m.mapping_kind IN ('exact', 'broad', 'merge')
          AND lower(btrim(m.legacy_key)) = lower(btrim(NEW.title));
        NEW.taxonomy_node_code := v_code;
        NEW.taxonomy_node_source := CASE WHEN v_code IS NULL THEN NULL ELSE 'derived_title' END;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'lyann_derive_service_node: % (%), rattachement laissé en l''état', SQLERRM, SQLSTATE;
    END;
    RETURN NEW;
END;
$$;

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
