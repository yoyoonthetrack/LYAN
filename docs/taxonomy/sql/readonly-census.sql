-- Recensement en LECTURE SEULE des volumes réels (agrégats uniquement, aucune donnée personnelle)
-- ============================================================================
-- NE PAS EXÉCUTER sur Production sans autorisation explicite : la phase 3.2B n'a eu accès qu'à Staging.
-- Toutes les requêtes sont des SELECT ; aucun identifiant de membre, e-mail, nom ou texte libre de description n'est renvoyé.
-- Exploitation : exporter chaque résultat en JSON, puis `node scripts/taxonomy-v2/census-coverage.js export.json`.
-- ============================================================================

-- C1. Volumétrie générale
SELECT (SELECT count(*) FROM public.requests)                                   AS requests,
       (SELECT count(*) FROM public.requests WHERE taxonomy_id IS NOT NULL)     AS requests_with_taxonomy_id,
       (SELECT count(*) FROM public.services)                                   AS services_rows,
       (SELECT count(DISTINCT owner_id) FROM public.services)                   AS members_with_skill,
       (SELECT count(*) FROM public.lyann_taxonomy)                             AS taxonomy_rows;

-- C2. Utilisation de chaque feuille historique par les demandes
SELECT t.universe, t.category, t.subcategory, count(r.id) AS requests
FROM public.lyann_taxonomy t LEFT JOIN public.requests r ON r.taxonomy_id = t.id
GROUP BY 1, 2, 3 ORDER BY requests DESC, 1, 2, 3;

-- C3. Titres de compétences (texte libre) : distribution — alimente census-coverage.js
SELECT lower(btrim(title)) AS title, count(*) AS rows, count(DISTINCT owner_id) AS members
FROM public.services GROUP BY 1 ORDER BY rows DESC LIMIT 1000;

-- C4. Catégories libres des demandes
SELECT coalesce(category, '') AS category, count(*) AS requests, count(taxonomy_id) AS with_taxonomy_id
FROM public.requests GROUP BY 1 ORDER BY requests DESC LIMIT 300;

-- C5. Titres de demandes (agrégés, minuscules) — pour mesurer la classification sur du vrai langage ; tronqué à 80 caractères
SELECT left(lower(btrim(title)), 80) AS title, count(*) AS requests
FROM public.requests WHERE coalesce(btrim(title), '') <> '' GROUP BY 1 ORDER BY requests DESC LIMIT 1000;

-- C6. Qualité : valeurs vides, doublons de casse, titres très longs
SELECT count(*) FILTER (WHERE coalesce(btrim(title), '') = '')   AS empty_service_titles,
       count(*) FILTER (WHERE length(title) > 60)                AS long_service_titles,
       count(*) FILTER (WHERE title = category)                  AS title_equals_category
FROM public.services;

-- C7. Rythme : demandes par mois et part déjà classée
SELECT date_trunc('month', created_at) AS month, count(*) AS requests, count(taxonomy_id) AS classified
FROM public.requests GROUP BY 1 ORDER BY 1;

-- C8. Statuts de classification observés
SELECT coalesce(classification_status, '(null)') AS classification_status, count(*) AS requests FROM public.requests GROUP BY 1 ORDER BY 2 DESC;

-- C9. Documents professionnels par clé d'activité (clés d'exigences réglementaires)
SELECT activity_category, count(*) AS documents FROM public.professional_documents GROUP BY 1 ORDER BY 2 DESC;
