-- 94c_taxonomy_v2_search_and_skills — recherche unifiée, vue à plat, compétences de profil rattachées aux nœuds
-- ============================================================================
-- BROUILLON — NON APPLIQUÉ. Aucune exécution sur Staging ni sur Production dans la phase 3.2B.
-- Dépend de 01 et 02. Rollback : 09_rollback_taxonomy_v2.sql
-- ============================================================================
BEGIN;

-- Vue à plat pour l'administration et les exports (sécurité de l'appelant : la RLS des tables s'applique).
CREATE VIEW public.lyann_taxonomy_v2_flat WITH (security_invoker = true) AS
SELECT n.code, n.kind, n.label_fr, n.safety, n.selectable, n.sort_order, n.active,
       f.code AS family_code, f.label_fr AS family_label,
       g.label_fr AS group_label,
       COALESCE(p.code, CASE WHEN n.kind = 'trade' THEN n.code END) AS trade_code,
       COALESCE(p.label_fr, CASE WHEN n.kind = 'trade' THEN n.label_fr END) AS trade_label,
       CASE WHEN n.kind = 'specialty' THEN n.code END AS specialty_code,
       COALESCE((SELECT array_agg(nf.family_code ORDER BY nf.family_code) FROM public.lyann_taxonomy_node_family nf WHERE nf.node_code = n.code), '{}') AS also_families
FROM public.lyann_taxonomy_node n
JOIN public.lyann_taxonomy_node f ON f.code = n.family_code
LEFT JOIN public.lyann_taxonomy_node p ON p.code = n.parent_code
LEFT JOIN public.lyann_taxonomy_group g ON g.family_code = n.family_code AND g.code = n.group_code
WHERE n.kind <> 'family';

-- ---------------------------------------------------------------------------
-- Recherche par métier, problème ou synonyme. Lecture seule, SECURITY INVOKER (RLS appliquée).
-- Score : terme exact 100 · début de terme 80 · terme contenu en mots entiers dans la saisie 60+ · proximité (trigrammes) ≤ 40.
-- La saisie est normalisée en [a-z0-9 ] : aucun caractère spécial de LIKE ne peut subsister.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.lyann_taxonomy_search(p_query text, p_limit integer DEFAULT 12)
RETURNS TABLE (node_code text, kind text, label_fr text, trade_code text, family_code text, selectable boolean, safety text,
               score numeric, matched_term text, matched_type text, needs_clarification boolean, clarification_fr text)
LANGUAGE sql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
    WITH q AS (
        SELECT public.lyann_taxonomy_norm(left(coalesce(p_query, ''), 160)) AS n
    ),
    hits AS (
        SELECT t.node_code, t.term, t.term_type,
               CASE
                   WHEN t.term_norm = q.n                                        THEN 100
                   WHEN length(q.n) >= 3 AND t.term_norm LIKE q.n || '%'          THEN 80
                   WHEN (' ' || q.n || ' ') LIKE '% ' || t.term_norm || ' %'      THEN 60 + least(length(t.term_norm), 20) * 0.5
                   WHEN length(q.n) >= 4 AND similarity(t.term_norm, q.n) >= 0.45 THEN 40 * similarity(t.term_norm, q.n)
                   ELSE 0
               END AS s
        FROM q
        JOIN public.lyann_taxonomy_term t ON q.n <> '' AND t.active
    ),
    best AS (
        SELECT DISTINCT ON (h.node_code) h.node_code, h.term, h.term_type, h.s
        FROM hits h WHERE h.s > 0
        ORDER BY h.node_code, h.s DESC, h.term_type
    ),
    amb AS (
        SELECT a.question_fr FROM q JOIN public.lyann_taxonomy_ambiguous_term a ON q.n = a.term_norm LIMIT 1
    )
    SELECT n.code, n.kind, n.label_fr,
           CASE WHEN n.kind = 'specialty' THEN n.parent_code ELSE n.code END,
           n.family_code, n.selectable, n.safety,
           round(b.s::numeric, 1), b.term, b.term_type,
           EXISTS (SELECT 1 FROM amb), (SELECT question_fr FROM amb)
    FROM best b
    JOIN public.lyann_taxonomy_node n ON n.code = b.node_code AND n.active
    ORDER BY b.s DESC, (n.kind = 'trade') DESC, n.sort_order, n.code
    LIMIT least(greatest(coalesce(p_limit, 12), 1), 50)
$$;
REVOKE ALL ON FUNCTION public.lyann_taxonomy_search(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lyann_taxonomy_search(text, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Compétences de profil rattachées aux nœuds (référence unique partagée avec les annonces).
-- Pendant la transition, services reste lu par l'application : la nouvelle RPC écrit AUSSI le stub services
-- (title = libellé du nœud, category = libellé, taxonomy_node_code = code) pour que les anciens clients continuent d'afficher les compétences.
-- ---------------------------------------------------------------------------
CREATE TABLE public.lyann_profile_skill (
    user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    node_code  text        NOT NULL REFERENCES public.lyann_taxonomy_node(code),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, node_code)
);
CREATE INDEX lyann_profile_skill_node_idx ON public.lyann_profile_skill (node_code);
ALTER TABLE public.lyann_profile_skill ENABLE ROW LEVEL SECURITY;
CREATE POLICY lyann_profile_skill_read  ON public.lyann_profile_skill FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.lyann_profile_skill FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lyann_profile_skill TO authenticated;   -- l'écriture passe uniquement par la RPC ci-dessous

CREATE FUNCTION public.lyann_sync_profile_skills_v2(p_user uuid, p_nodes text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_nodes text[];
    v_code  text;
    v_label text;
BEGIN
    IF auth.uid() IS NULL OR auth.uid() <> p_user THEN
        RAISE EXCEPTION 'Accès refusé' USING ERRCODE = '42501';
    END IF;
    IF p_nodes IS NULL OR cardinality(p_nodes) > 60 OR EXISTS (SELECT 1 FROM unnest(p_nodes) c WHERE c IS NULL OR c !~ '^[a-z0-9_]{2,80}$') THEN
        RAISE EXCEPTION 'Compétences invalides' USING ERRCODE = '22023';
    END IF;
    SELECT coalesce(array_agg(DISTINCT c), '{}') INTO v_nodes FROM unnest(p_nodes) c;
    -- Chaque code doit exister, être actif, sélectionnable et hors famille « autres » ; sinon on refuse tout (atomique).
    IF EXISTS (
        SELECT 1 FROM unnest(v_nodes) c
        LEFT JOIN public.lyann_taxonomy_node n ON n.code = c
        WHERE n.code IS NULL OR NOT n.active OR NOT n.selectable OR n.kind = 'family' OR n.family_code = 'autres'
    ) THEN
        RAISE EXCEPTION 'Compétence non proposable' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('lyann-rights:' || p_user::text, 0));

    DELETE FROM public.lyann_profile_skill WHERE user_id = p_user AND NOT (node_code = ANY (v_nodes));
    INSERT INTO public.lyann_profile_skill(user_id, node_code)
    SELECT p_user, c FROM unnest(v_nodes) c ON CONFLICT DO NOTHING;

    -- Compatibilité : mêmes règles que lyann_sync_profile_skills (ne jamais supprimer un service tarifé).
    DELETE FROM public.services s
    WHERE s.owner_id = p_user AND s.taxonomy_node_code IS NOT NULL AND NOT (s.taxonomy_node_code = ANY (v_nodes))
      AND s.base_price IS NULL AND s.indicative_price IS NULL AND s.price_type IS NULL AND s.pricing_model IS NULL
      AND (coalesce(btrim(s.description), '') = '' OR btrim(s.description) = btrim(s.title));
    FOREACH v_code IN ARRAY v_nodes LOOP
        SELECT label_fr INTO v_label FROM public.lyann_taxonomy_node WHERE code = v_code;
        IF NOT EXISTS (SELECT 1 FROM public.services WHERE owner_id = p_user AND taxonomy_node_code = v_code) THEN
            INSERT INTO public.services(owner_id, title, description, category, slug, taxonomy_node_code)
            VALUES (p_user, v_label, v_label, v_label, 'skill-' || gen_random_uuid()::text, v_code);
        END IF;
    END LOOP;
    RETURN jsonb_build_object('success', true, 'skills', v_nodes);
END;
$$;
REVOKE ALL ON FUNCTION public.lyann_sync_profile_skills_v2(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lyann_sync_profile_skills_v2(uuid, text[]) TO authenticated;

COMMIT;
