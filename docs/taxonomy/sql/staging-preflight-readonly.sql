-- Pré-vol Staging de l'intégration taxonomie v2 — LECTURE SEULE (SELECT uniquement).
-- À exécuter UNIQUEMENT sur Staging (tdktfbtqceldlaeqjtow), jamais sur Production. Aucun résultat ne contient de donnée personnelle.
-- Non exécuté à ce jour : l'exécution n'a pas été autorisée par le contrôle automatique. Chaque requête a un critère d'arrêt (colonne « attendu »).

-- P01 — la permission taxonomy.manage existe déjà (migration 17) : attendu = 2 lignes (taxonomy.read, taxonomy.manage)
SELECT 'P01 permissions taxonomie' AS controle, code FROM public.admin_permissions WHERE code LIKE 'taxonomy.%' ORDER BY code;

-- P02 — qui détient taxonomy.manage (attendu : rôle propriétaire uniquement ; aucune création/attribution dans cette phase)
SELECT 'P02 rôles avec taxonomy.manage' AS controle, r.code AS role FROM public.admin_role_permissions rp
JOIN public.admin_permissions p ON p.id = rp.permission_id AND p.code = 'taxonomy.manage'
JOIN public.admin_roles r ON r.id = rp.role_id ORDER BY 2;

-- P03 — extensions requises par le brouillon 01 : attendu = pg_trgm et unaccent disponibles (installées ou installables)
SELECT 'P03 extensions' AS controle, name, installed_version FROM pg_available_extensions WHERE name IN ('pg_trgm', 'unaccent');

-- P04 — aucune table v2 déjà présente (attendu : 0 ligne)
SELECT 'P04 tables v2 existantes' AS controle, table_name FROM information_schema.tables
WHERE table_schema = 'public' AND (table_name LIKE 'lyann_taxonomy_%' OR table_name = 'lyann_profile_skill');

-- P05 — colonnes de requests et services (le brouillon 02 suppose l'absence de taxonomy_node_code / taxonomy_node_source)
SELECT 'P05 colonnes' AS controle, table_name, column_name, data_type, column_default
FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('requests', 'services')
  AND column_name IN ('category', 'taxonomy_id', 'classification_status', 'title', 'taxonomy_node_code', 'taxonomy_node_source')
ORDER BY table_name, column_name;

-- P06 — déclencheurs existants sur requests et services (l'ordre alphabétique des BEFORE compte pour 06)
SELECT 'P06 déclencheurs' AS controle, event_object_table AS table_name, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers WHERE event_object_schema = 'public' AND event_object_table IN ('requests', 'services') ORDER BY 2, 3;

-- P07 — politiques RLS actuelles de requests, services, lyann_taxonomy (instantané à comparer avant/après chaque étape)
SELECT 'P07 politiques' AS controle, tablename, policyname, cmd, roles::text FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('requests', 'services', 'lyann_taxonomy') ORDER BY 2, 3;

-- P08 — privilèges de table de requests/services pour anon et authenticated (instantané ; la migration 91 doit rester intacte)
SELECT 'P08 privilèges' AS controle, table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants WHERE table_schema = 'public' AND table_name IN ('requests', 'services') AND grantee IN ('anon', 'authenticated')
GROUP BY 2, 3 ORDER BY 2, 3;

-- P09 — privilèges par colonne (attendu : 0 ligne ; sinon les nouvelles colonnes ne seraient pas écrivables par les clients)
SELECT 'P09 privilèges par colonne' AS controle, table_name, column_name, grantee, privilege_type
FROM information_schema.column_privileges WHERE table_schema = 'public' AND table_name IN ('requests', 'services') AND grantee IN ('anon', 'authenticated')
  AND column_name IN ('category', 'taxonomy_id') LIMIT 20;

-- P10 — fonctions qui lisent requests.category ou services.title/category (à relire avant de changer la sémantique)
SELECT 'P10 fonctions dépendantes' AS controle, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosrc ~* '(requests|r)\.category|services.*category|taxonomy_id' ORDER BY 2;

-- P11 — vues dépendant de requests ou services (une colonne ajoutée ne casse pas une vue ; un SELECT * figé doit être connu)
SELECT 'P11 vues dépendantes' AS controle, v.table_name AS vue, v.view_definition ~* 'select\s+\*' AS select_etoile
FROM information_schema.views v WHERE v.table_schema = 'public' AND v.view_definition ~* '(requests|services)' ORDER BY 2;

-- P12 — distribution des valeurs de catégorie (agrégats de recette) : attendu = celle de staging-snapshot.json
SELECT 'P12 catégories de demandes' AS controle, category, count(*) AS n, count(taxonomy_id) AS avec_feuille
FROM public.requests GROUP BY category ORDER BY n DESC;

-- P13 — nombre de demandes exposées à l'API publique (même filtre que api/public-explorer-requests.js) et valeurs de classification_status
SELECT 'P13 statuts de classification' AS controle, classification_status, count(*) AS n FROM public.requests GROUP BY 2 ORDER BY 2;

-- P14 — doublons de compétences par propriétaire (la RPC 83 déduplique par lower(btrim(titre)))
SELECT 'P14 doublons de compétences' AS controle, count(*) AS n FROM (
    SELECT owner_id, lower(btrim(title)) FROM public.services GROUP BY 1, 2 HAVING count(*) > 1) d;

-- P15 — migrations déjà appliquées (la numérotation 94 à 99 doit être libre)
SELECT 'P15 migrations' AS controle, version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 12;
