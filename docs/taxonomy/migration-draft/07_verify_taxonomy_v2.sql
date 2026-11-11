-- 94v_taxonomy_v2_verify — contrôles de cohérence (lecture seule)
-- ============================================================================
-- BROUILLON — NON APPLIQUÉ. Chaque requête doit renvoyer ZÉRO ligne (sauf mention contraire).
-- À exécuter après 04 (seed) puis après 05 (backfill), sur Staging d'abord.
-- ============================================================================

-- V01 — familles : exactement 9 (8 + autres)
SELECT 'V01 familles' AS check, count(*) AS found FROM public.lyann_taxonomy_node WHERE kind = 'family' HAVING count(*) <> 9;

-- V02 — spécialités dont le parent n'est pas un métier, ou famille incohérente avec le parent
SELECT 'V02 parent/famille' AS check, s.code FROM public.lyann_taxonomy_node s
LEFT JOIN public.lyann_taxonomy_node p ON p.code = s.parent_code
WHERE s.kind = 'specialty' AND (p.kind IS DISTINCT FROM 'trade' OR p.family_code <> s.family_code);

-- V03 — métiers sans spécialité ET sans terme (nœud inutilisable en recherche)
SELECT 'V03 métier sans terme' AS check, n.code FROM public.lyann_taxonomy_node n
WHERE n.kind = 'trade' AND NOT EXISTS (SELECT 1 FROM public.lyann_taxonomy_term t WHERE t.node_code = n.code);

-- V04 — normalisation : term_norm stocké identique à la fonction de normalisation
SELECT 'V04 term_norm' AS check, id, term FROM public.lyann_taxonomy_term WHERE term_norm <> public.lyann_taxonomy_norm(term);

-- V05 — activités réglementées sélectionnables (doit être impossible par contrainte)
SELECT 'V05 réglementé sélectionnable' AS check, code FROM public.lyann_taxonomy_node WHERE safety IN ('RESTRICTED', 'PROHIBITED') AND selectable;

-- V06 — familles secondaires qui ne sont pas des familles
SELECT 'V06 famille secondaire' AS check, nf.node_code, nf.family_code FROM public.lyann_taxonomy_node_family nf
JOIN public.lyann_taxonomy_node f ON f.code = nf.family_code WHERE f.kind <> 'family' OR nf.family_code = (SELECT family_code FROM public.lyann_taxonomy_node WHERE code = nf.node_code);

-- V07 — la correspondance couvre toutes les feuilles historiques
SELECT 'V07 feuille sans correspondance' AS check, t.id, t.universe, t.category, t.subcategory FROM public.lyann_taxonomy t
WHERE NOT EXISTS (SELECT 1 FROM public.lyann_taxonomy_legacy_map m WHERE m.legacy_kind = 'taxonomy_leaf' AND m.legacy_key = t.universe || '|' || t.category || '|' || t.subcategory);

-- V08 (après backfill) — feuilles historiques sans node_code, SAUF celles qui recouvrent plusieurs métiers (décision X5 : rien n'est rattaché ;
-- elles sont listées par V20 pour décision humaine)
SELECT 'V08 feuille sans node_code' AS check, t.id FROM public.lyann_taxonomy t
WHERE t.node_code IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.lyann_taxonomy_legacy_map m
                  WHERE m.legacy_kind = 'taxonomy_leaf' AND m.legacy_key = t.universe || '|' || t.category || '|' || t.subcategory
                    AND m.mapping_kind IN ('split', 'merge', 'ambiguous') AND cardinality(m.alt_codes) > 0);

-- V09 (après backfill) — demandes classées à l'ancienne mais sans nœud v2 (hors demandes volontairement exclues du rétro-remplissage : modération en cours, voir V22)
SELECT 'V09 demande classée sans nœud' AS check, r.id FROM public.requests r WHERE r.taxonomy_id IS NOT NULL AND r.taxonomy_node_code IS NULL
  AND r.public_moderation_status = 'approved' AND r.title_pending IS NULL AND r.description_pending IS NULL;

-- V10 — cohérence ancien/nouveau : une demande ne peut pas pointer un nœud v2 SANS RAPPORT avec celui de sa feuille.
-- Même nœud, spécialité du métier de la feuille, ou métier de la feuille (le client v2 peut être plus précis que l'ancienne feuille, jamais ailleurs).
SELECT 'V10 incohérence ancien/nouveau' AS check, r.id FROM public.requests r
JOIN public.lyann_taxonomy t ON t.id = r.taxonomy_id
JOIN public.lyann_taxonomy_node n ON n.code = r.taxonomy_node_code
WHERE r.taxonomy_node_code IS NOT NULL AND t.node_code IS NOT NULL AND r.taxonomy_node_code <> t.node_code
  AND n.parent_code IS DISTINCT FROM t.node_code
  AND NOT EXISTS (SELECT 1 FROM public.lyann_taxonomy_node c WHERE c.parent_code = n.code AND c.code = t.node_code);

-- V11 — informatif : couverture du backfill (aucune erreur attendue ; pour le suivi)
SELECT 'V11 couverture demandes' AS info,
       count(*) AS total, count(taxonomy_id) AS ancien_classees, count(taxonomy_node_code) AS nouveau_classees
FROM public.requests;
SELECT 'V11 couverture compétences' AS info, count(*) AS total, count(taxonomy_node_code) AS rattachees FROM public.services;

-- V12 — politiques RLS présentes sur toutes les nouvelles tables (doit lister les 7 tables avec rowsecurity = true)
SELECT 'V12 RLS désactivée' AS check, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname LIKE 'lyann_taxonomy_%' AND c.relkind = 'r' AND NOT c.relrowsecurity
  AND c.relname IN ('lyann_taxonomy_release', 'lyann_taxonomy_group', 'lyann_taxonomy_node', 'lyann_taxonomy_node_family', 'lyann_taxonomy_term', 'lyann_taxonomy_ambiguous_term', 'lyann_taxonomy_legacy_map', 'lyann_taxonomy_legacy_projection');

-- V13 (après 06) — un nœud renseigné doit toujours avoir une provenance (demandes et compétences)
SELECT 'V13 nœud sans provenance' AS check, 'requests' AS t, r.id::text FROM public.requests r WHERE r.taxonomy_node_code IS NOT NULL AND r.taxonomy_node_source IS NULL
UNION ALL
SELECT 'V13 nœud sans provenance', 'services', s.id::text FROM public.services s WHERE s.taxonomy_node_code IS NOT NULL AND s.taxonomy_node_source IS NULL;

-- V14 (après 06) — un rattachement dérivé d'une feuille doit être celui de cette feuille (jamais de divergence silencieuse)
SELECT 'V14 dérivation divergente' AS check, r.id FROM public.requests r JOIN public.lyann_taxonomy t ON t.id = r.taxonomy_id
WHERE r.taxonomy_node_source IN ('derived_leaf', 'derived_leaf_parent') AND t.node_code IS NOT NULL AND r.taxonomy_node_code <> t.node_code;

-- V15 (après 08) — la table de projection historique est intègre : toute feuille citée existe et est active
SELECT 'V15 projection : feuille introuvable' AS check, p.node_code, p.legacy_leaf_key FROM public.lyann_taxonomy_legacy_projection p
WHERE p.legacy_leaf_key IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.lyann_taxonomy t WHERE t.active AND t.universe || '|' || t.category || '|' || t.subcategory = p.legacy_leaf_key);

-- V16 (après 08) — la projection n'est JAMAIS plus précise que le nœud : la feuille écrite correspond au nœud (ou à son métier, ou à l'une de ses spécialités)
SELECT 'V16 projection plus précise que le nœud' AS check, p.node_code, p.legacy_leaf_key FROM public.lyann_taxonomy_legacy_projection p
JOIN public.lyann_taxonomy_legacy_map m ON m.legacy_kind = 'taxonomy_leaf' AND m.legacy_key = p.legacy_leaf_key
WHERE p.legacy_leaf_key IS NOT NULL AND NOT public.lyann_node_related_to(p.node_code, ARRAY[m.node_code] || m.alt_codes);

-- V17 (après 08) — une projection ne peut pas viser un nœud sans pont véridique : aucune ligne pour un nœud de la famille « autres »
SELECT 'V17 projection vers « autres »' AS check, p.node_code FROM public.lyann_taxonomy_legacy_projection p
JOIN public.lyann_taxonomy_node n ON n.code = p.node_code WHERE n.family_code = 'autres';

-- V18 (après backfill / 06) — décision X5 : AUCUNE spécialité n'est choisie à partir d'une valeur ambiguë.
-- Un rattachement dérivé ou rétro-rempli sans suffixe _parent ne peut pas viser une spécialité si la correspondance est split / merge / ambiguous avec alternatives.
SELECT 'V18 spécialité inventée (annonce)' AS check, r.id::text FROM public.requests r
JOIN public.lyann_taxonomy t ON t.id = r.taxonomy_id
JOIN public.lyann_taxonomy_legacy_map m ON m.legacy_kind = 'taxonomy_leaf' AND m.legacy_key = t.universe || '|' || t.category || '|' || t.subcategory
JOIN public.lyann_taxonomy_node n ON n.code = r.taxonomy_node_code
WHERE r.taxonomy_node_source IN ('backfill_leaf', 'derived_leaf') AND n.kind = 'specialty'
  AND m.mapping_kind IN ('split', 'merge', 'ambiguous') AND cardinality(m.alt_codes) > 0
UNION ALL
SELECT 'V18 spécialité inventée (compétence)', s.id::text FROM public.services s
JOIN public.lyann_taxonomy_legacy_map m ON m.legacy_kind = 'skill_title' AND lower(btrim(m.legacy_key)) = lower(btrim(s.title))
JOIN public.lyann_taxonomy_node n ON n.code = s.taxonomy_node_code
WHERE s.taxonomy_node_source IN ('backfill_title', 'derived_title') AND n.kind = 'specialty'
  AND m.mapping_kind IN ('split', 'merge', 'ambiguous') AND cardinality(m.alt_codes) > 0;

-- V19 — informatif : file « besoin de précision » (rattachements au métier parent faute de certitude sur la spécialité)
SELECT 'V19 besoin de précision' AS info, 'requests' AS t, taxonomy_node_source AS source, count(*) AS n
FROM public.requests WHERE taxonomy_node_source LIKE '%\_parent' GROUP BY taxonomy_node_source
UNION ALL
SELECT 'V19 besoin de précision', 'services', taxonomy_node_source, count(*) FROM public.services WHERE taxonomy_node_source LIKE '%\_parent' GROUP BY taxonomy_node_source;

-- V20 — informatif : feuilles historiques qui recouvrent plusieurs métiers (aucun nœud rattaché : à classer par décision humaine)
SELECT 'V20 feuille multi-métiers' AS info, t.id, t.universe || '|' || t.category || '|' || t.subcategory AS leaf
FROM public.lyann_taxonomy t WHERE t.node_code IS NULL;

-- V21 — quota de catégories (décision X2, politique C) : deux nœuds proposables ne doivent jamais produire le même titre de compétence
-- (« Métier · Spécialité », libellé seul pour un métier), sinon deux compétences ne compteraient que pour une catégorie du forfait.
SELECT 'V21 titre de compétence en collision' AS check, k AS title_key, count(*) AS n FROM (
    SELECT lower(regexp_replace(btrim(CASE WHEN n.kind = 'specialty' THEN p.label_fr || ' · ' || n.label_fr ELSE n.label_fr END), '\s+', ' ', 'g')) AS k
    FROM public.lyann_taxonomy_node n LEFT JOIN public.lyann_taxonomy_node p ON p.code = n.parent_code
    WHERE n.selectable AND n.kind IN ('trade', 'specialty') AND n.family_code <> 'autres'
) t GROUP BY k HAVING count(*) > 1;

-- V22 — informatif : demandes volontairement exclues du rétro-remplissage (modération en cours : statut non approuvé ou modification en attente)
SELECT 'V22 demandes exclues (modération)' AS info, count(*) AS n FROM public.requests
WHERE taxonomy_node_code IS NULL AND (public_moderation_status IS DISTINCT FROM 'approved' OR title_pending IS NOT NULL OR description_pending IS NOT NULL);
