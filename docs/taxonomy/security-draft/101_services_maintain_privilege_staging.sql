-- LYANN Migration 101 (PRÊT ET TESTÉ SUR LE BANC) — services : retirer le privilège MAINTAIN à anon, authenticated (et PUBLIC).
-- Staging uniquement (tdktfbtqceldlaeqjtow). Jamais Production sans autorisation spécifique.
-- Rollback : 101_services_maintain_privilege_rollback.sql. Suite de 100_services_dangerous_privileges_staging.sql (TRUNCATE, TRIGGER, REFERENCES).
--
-- Constat (Staging, 12 nov. 2026, après 100) : anon et authenticated gardent MAINTAIN (lettre « m », PostgreSQL 17) sur public.services. Ce privilège autorise
-- VACUUM, ANALYZE, REINDEX, CLUSTER et REFRESH MATERIALIZED VIEW sur la table : opérations d'administration (réécriture, verrous longs) qu'un porteur d'un jeton
-- `anon` publiable pourrait lancer par toute connexion SQL directe sous ce rôle. PostgREST ne les expose pas ; aucun parcours LYANN n'en a besoin (autovacuum et
-- les opérations d'administration s'exécutent avec les droits du propriétaire ou de supabase_admin).
--
-- Limite connue, NON traitée ici : LOCK TABLE … IN ACCESS EXCLUSIVE MODE reste permis par UPDATE ou DELETE (règle de PostgreSQL), que anon et authenticated
-- conservent légitimement. Retirer MAINTAIN ne l'empêche donc pas ; ce risque est inhérent à l'écriture sur la table et ne se corrige pas par un privilège.
--
-- Non modifié, volontairement (l'instantané « autres privilèges » le prouve avant COMMIT) : SELECT, INSERT, UPDATE, DELETE, TRUNCATE/TRIGGER/REFERENCES (traités par 100), les politiques RLS, service_role, postgres,
-- l'appartenance à pg_maintain et toute autre table. Les privilèges par défaut du schéma public (tables FUTURES) ne sont pas modifiés.
BEGIN;

-- Un REVOKE demande un court verrou exclusif sur services : échouer vite plutôt que de s'empiler derrière une transaction longue (ne jamais boucler sur cette erreur).
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- 0. Préconditions et instantanés. Tout écart annule la migration entière.
DO $pre$
DECLARE
    v_policies text;
    v_kept text;
    v_invokers text;
    v_deps text;
    v_role text;
BEGIN
    IF to_regclass('public.services') IS NULL THEN
        RAISE EXCEPTION 'migration 101: public.services missing';
    END IF;
    IF current_setting('server_version_num')::int < 170000 THEN
        RAISE EXCEPTION 'migration 101: MAINTAIN exists from PostgreSQL 17 only (found %)', current_setting('server_version');
    END IF;

    -- Garde 1 : un droit hérité du rôle prédéfini pg_maintain ne serait pas retiré par un REVOKE sur la table. Il faut le savoir AVANT d'écrire.
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'authenticator'] LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role);
        IF pg_has_role(v_role, 'pg_maintain', 'USAGE') THEN
            RAISE EXCEPTION 'migration 101: % inherits MAINTAIN through pg_maintain (a table REVOKE would not remove it)', v_role;
        END IF;
    END LOOP;

    -- Garde 2 : une routine SECURITY INVOKER qui exécute VACUUM, ANALYZE, REINDEX, CLUSTER ou REFRESH MATERIALIZED VIEW sur services cesserait de fonctionner pour les rôles exposés.
    -- (Les routines SECURITY DEFINER s'exécutent avec les droits de leur propriétaire et ne sont pas concernées.)
    SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text) INTO v_invokers
    FROM pg_proc p
    WHERE p.prokind IN ('f', 'p') AND NOT p.prosecdef
      AND p.pronamespace NOT IN ('pg_catalog'::regnamespace, 'information_schema'::regnamespace)
      AND p.prolang IN (SELECT oid FROM pg_language WHERE lanname IN ('plpgsql', 'sql'))
      AND p.prosrc ~* '\m(vacuum|analy[sz]e|reindex|cluster|refresh\s+materialized)\M'
      AND p.prosrc ~* '\mservices\M';
    IF v_invokers IS NOT NULL THEN
        RAISE EXCEPTION 'migration 101: SECURITY INVOKER routine(s) run a maintenance command on services (%): review before applying', v_invokers;
    END IF;

    -- Instantané 1 : clés étrangères, déclencheurs, règles et indicateurs de sécurité de ligne de services.
    SELECT (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.services'::regclass)::text || '/'
        || (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.services'::regclass AND NOT tgisinternal)::text || '/'
        || (SELECT count(*) FROM pg_rewrite r WHERE r.ev_class = 'public.services'::regclass)::text || '/'
        || (SELECT relrowsecurity::text || relforcerowsecurity::text FROM pg_class WHERE oid = 'public.services'::regclass) INTO v_deps;
    PERFORM set_config('lyann.m101_deps', v_deps, true);

    -- Instantané 2 : toutes les politiques de la table.
    SELECT coalesce(md5(string_agg(policyname || '|' || cmd || '|' || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''),
                                   E'\n' ORDER BY policyname)), '')
      INTO v_policies
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'services';
    PERFORM set_config('lyann.m101_policies', v_policies, true);

    -- Instantané 3 : tout privilège de table que cette migration ne doit PAS toucher (bénéficiaire, privilège, transmissible, donneur), PUBLIC compris.
    SELECT coalesce(string_agg(grantee || ':' || privilege_type || ':' || is_grantable || ':' || grantor, ',' ORDER BY grantee, privilege_type, grantor), '')
      INTO v_kept
    FROM (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type, a.is_grantable, pg_get_userbyid(a.grantor) AS grantor
          FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
          WHERE c.oid = 'public.services'::regclass AND a.privilege_type <> 'MAINTAIN') s;
    PERFORM set_config('lyann.m101_kept', v_kept, true);
END
$pre$;

-- 1. Le correctif. PUBLIC est inclus pour que rien ne subsiste par le pseudo-rôle.
REVOKE MAINTAIN ON TABLE public.services FROM PUBLIC, anon, authenticated;

-- 2. Postconditions : annulation si le résultat n'est pas exactement celui préparé.
DO $post$
DECLARE
    v_role text;
    v_policies text;
    v_kept text;
BEGIN
    -- Droits effectifs (directs, hérités, via PUBLIC) des rôles exposés.
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'authenticator'] LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role);   -- authenticator : Supabase seulement
        IF has_table_privilege(v_role, 'public.services', 'MAINTAIN') THEN
            RAISE EXCEPTION 'migration 101: % still has MAINTAIN on services', v_role;
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
               WHERE c.oid = 'public.services'::regclass AND a.grantee = 0 AND a.privilege_type = 'MAINTAIN') THEN
        RAISE EXCEPTION 'migration 101: PUBLIC still holds MAINTAIN on services';
    END IF;

    -- Les rôles internes gardent leurs droits d'administration.
    IF NOT (has_table_privilege('service_role', 'public.services', 'MAINTAIN') AND has_table_privilege('postgres', 'public.services', 'MAINTAIN')) THEN
        RAISE EXCEPTION 'migration 101: service_role or postgres lost MAINTAIN';
    END IF;
    -- Rien d'autre n'a bougé : mêmes autres privilèges, mêmes politiques.
    SELECT coalesce(string_agg(grantee || ':' || privilege_type || ':' || is_grantable || ':' || grantor, ',' ORDER BY grantee, privilege_type, grantor), '')
      INTO v_kept
    FROM (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type, a.is_grantable, pg_get_userbyid(a.grantor) AS grantor
          FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
          WHERE c.oid = 'public.services'::regclass AND a.privilege_type <> 'MAINTAIN') s;
    IF v_kept IS DISTINCT FROM current_setting('lyann.m101_kept') THEN
        RAISE EXCEPTION 'migration 101: other privileges changed (before: %, after: %)', current_setting('lyann.m101_kept'), v_kept;
    END IF;

    SELECT coalesce(md5(string_agg(policyname || '|' || cmd || '|' || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''),
                                   E'\n' ORDER BY policyname)), '')
      INTO v_policies
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'services';
    IF v_policies IS DISTINCT FROM current_setting('lyann.m101_policies') THEN
        RAISE EXCEPTION 'migration 101: the policies of services changed';
    END IF;

    IF (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.services'::regclass)::text || '/'
       || (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.services'::regclass AND NOT tgisinternal)::text || '/'
       || (SELECT count(*) FROM pg_rewrite r WHERE r.ev_class = 'public.services'::regclass)::text || '/'
       || (SELECT relrowsecurity::text || relforcerowsecurity::text FROM pg_class WHERE oid = 'public.services'::regclass) IS DISTINCT FROM current_setting('lyann.m101_deps') THEN
        RAISE EXCEPTION 'migration 101: foreign keys, triggers, rules or row security of services changed';
    END IF;
END
$post$;

COMMIT;
