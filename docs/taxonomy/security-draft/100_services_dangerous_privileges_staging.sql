-- LYANN Migration 100 (BROUILLON — NON APPLIQUÉ) — services : retirer les privilèges structurels TRUNCATE, TRIGGER et REFERENCES
-- à anon, authenticated (et PUBLIC). Staging uniquement (tdktfbtqceldlaeqjtow). Jamais Production sans autorisation spécifique.
-- Rollback : 100_services_dangerous_privileges_rollback.sql. Dépendances et preuves : docs/taxonomy/13-lock-before-staging-migration.md §3.
--
-- Constat (pré-vol Staging du 11 nov. 2026, P08) : `anon` ET `authenticated` portent SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES sur
-- public.services ; la migration 91 n'a traité que public.requests. La RLS ne protège pas TRUNCATE : tout porteur d'un jeton `anon` publiable pourrait
-- vider la table des compétences si PostgREST exposait TRUNCATE (il ne l'expose pas) ou par toute connexion SQL directe sous ce rôle.
--
-- Aucun parcours LYANN n'a besoin de ces trois privilèges : les clients et l'API n'exécutent que SELECT / INSERT / UPDATE / DELETE via PostgREST ;
-- les déclencheurs (lyann_category_entitlement, dérivation taxonomie), les fonctions SECURITY DEFINER et les clés étrangères qui touchent services
-- appartiennent à postgres (propriétaire), qui garde ses droits ; les vérifications d'intégrité référentielle s'exécutent avec les droits du propriétaire.
--
-- Non modifié, volontairement : SELECT, INSERT, UPDATE, DELETE, MAINTAIN, les politiques RLS, service_role, postgres et toute autre table.
BEGIN;

-- 0. Preconditions and snapshots. Anything unexpected aborts and rolls back the whole migration.
DO $pre$
DECLARE
    v_policies text;
    v_kept text;
BEGIN
    IF to_regclass('public.services') IS NULL THEN
        RAISE EXCEPTION 'migration 100: public.services missing';
    END IF;

    -- Snapshot 1: every policy of the table (name, command, roles, expressions).
    SELECT md5(string_agg(policyname || '|' || cmd || '|' || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''),
                          E'\n' ORDER BY policyname))
      INTO v_policies
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'services';

    -- Snapshot 2: every table privilege that this migration must NOT touch (grantee, privilege), PUBLIC included.
    SELECT coalesce(string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type), '')
      INTO v_kept
    FROM (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type
          FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
          WHERE c.oid = 'public.services'::regclass
            AND a.privilege_type NOT IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')) s;

    PERFORM set_config('lyann.m100_policies', v_policies, true);
    PERFORM set_config('lyann.m100_kept', v_kept, true);
END
$pre$;

-- 1. The correction. PUBLIC is included so that nothing can remain through the pseudo role.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE public.services FROM PUBLIC, anon, authenticated;

-- 2. Post-conditions: roll back if the result is not exactly what was prepared.
DO $post$
DECLARE
    v_role text;
    v_priv text;
    v_policies text;
    v_kept text;
BEGIN
    -- Effective privileges (direct, inherited and through PUBLIC) of the two exposed roles.
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'authenticator'] LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role);  -- authenticator: Supabase only
        FOREACH v_priv IN ARRAY ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES'] LOOP
            IF has_table_privilege(v_role, 'public.services', v_priv) THEN
                RAISE EXCEPTION 'migration 100: % still has % on services', v_role, v_priv;
            END IF;
        END LOOP;
        IF has_any_column_privilege(v_role, 'public.services', 'REFERENCES') THEN
            RAISE EXCEPTION 'migration 100: % still has a column REFERENCES privilege on services', v_role;
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
               WHERE c.oid = 'public.services'::regclass AND a.grantee = 0
                 AND a.privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')) THEN
        RAISE EXCEPTION 'migration 100: PUBLIC still holds a structural privilege on services';
    END IF;

    -- Internal roles keep what they had.
    IF NOT (has_table_privilege('service_role', 'public.services', 'TRUNCATE')
        AND has_table_privilege('service_role', 'public.services', 'TRIGGER')
        AND has_table_privilege('service_role', 'public.services', 'REFERENCES')
        AND has_table_privilege('postgres', 'public.services', 'TRUNCATE')) THEN
        RAISE EXCEPTION 'migration 100: service_role or postgres lost a privilege';
    END IF;

    -- Nothing else moved: same other privileges, same policies.
    SELECT coalesce(string_agg(grantee || ':' || privilege_type, ',' ORDER BY grantee, privilege_type), '')
      INTO v_kept
    FROM (SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee, a.privilege_type
          FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
          WHERE c.oid = 'public.services'::regclass
            AND a.privilege_type NOT IN ('TRUNCATE', 'TRIGGER', 'REFERENCES')) s;
    IF v_kept IS DISTINCT FROM current_setting('lyann.m100_kept') THEN
        RAISE EXCEPTION 'migration 100: other privileges changed (before: %, after: %)', current_setting('lyann.m100_kept'), v_kept;
    END IF;

    SELECT md5(string_agg(policyname || '|' || cmd || '|' || roles::text || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''),
                          E'\n' ORDER BY policyname))
      INTO v_policies
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'services';
    IF v_policies IS DISTINCT FROM current_setting('lyann.m100_policies') THEN
        RAISE EXCEPTION 'migration 100: the policies of services changed';
    END IF;
END
$post$;

COMMIT;
