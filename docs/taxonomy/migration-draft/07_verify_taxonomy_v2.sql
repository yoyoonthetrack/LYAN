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

-- V08 (après backfill) — feuilles historiques sans node_code
SELECT 'V08 feuille sans node_code' AS check, t.id FROM public.lyann_taxonomy t WHERE t.node_code IS NULL;

-- V09 (après backfill) — demandes classées à l'ancienne mais sans nœud v2
SELECT 'V09 demande classée sans nœud' AS check, r.id FROM public.requests r WHERE r.taxonomy_id IS NOT NULL AND r.taxonomy_node_code IS NULL;

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
WHERE r.taxonomy_node_source = 'derived_leaf' AND t.node_code IS NOT NULL AND r.taxonomy_node_code <> t.node_code;

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
