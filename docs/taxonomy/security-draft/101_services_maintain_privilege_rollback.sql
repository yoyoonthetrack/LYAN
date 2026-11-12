-- LYANN Migration 101 — ROLLBACK (PRÊT ET TESTÉ SUR LE BANC) : redonne MAINTAIN sur public.services à anon et authenticated.
-- USAGE D'URGENCE : il rétablit un privilège d'administration dont aucun parcours LYANN n'a besoin. À n'utiliser que si une dépendance légitime documentée
-- est découverte. Ne touche à aucune politique ni à aucun autre privilège. Restitue l'ACL d'origine : non transmissible, donneur = propriétaire (postgres).
BEGIN;

DO $pre$
BEGIN
    IF to_regclass('public.services') IS NULL THEN
        RAISE EXCEPTION 'rollback 101: public.services missing';
    END IF;
    IF current_setting('server_version_num')::int < 170000 THEN
        RAISE EXCEPTION 'rollback 101: MAINTAIN exists from PostgreSQL 17 only';
    END IF;
END
$pre$;

GRANT MAINTAIN ON TABLE public.services TO anon, authenticated;

DO $post$
DECLARE
    v_role text;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF NOT has_table_privilege(v_role, 'public.services', 'MAINTAIN') THEN
            RAISE EXCEPTION 'rollback 101: % did not get MAINTAIN back', v_role;
        END IF;
    END LOOP;
END
$post$;

COMMIT;
