-- LYANN Migration 100 — ROLLBACK (BROUILLON — NON APPLIQUÉ) : redonne TRUNCATE, TRIGGER et REFERENCES sur public.services à anon et authenticated.
-- USAGE D'URGENCE : il rétablit des privilèges structurels dont aucun parcours LYANN n'a besoin. À n'utiliser que si une dépendance légitime documentée
-- est découverte, en préférant un correctif ciblé. Ne touche à aucune politique ni à aucun autre privilège.
BEGIN;

DO $pre$
BEGIN
    IF to_regclass('public.services') IS NULL THEN
        RAISE EXCEPTION 'rollback 100: public.services missing';
    END IF;
END
$pre$;

GRANT TRUNCATE, TRIGGER, REFERENCES ON TABLE public.services TO anon, authenticated;

DO $post$
DECLARE
    v_role text;
    v_priv text;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        FOREACH v_priv IN ARRAY ARRAY['TRUNCATE', 'TRIGGER', 'REFERENCES'] LOOP
            IF NOT has_table_privilege(v_role, 'public.services', v_priv) THEN
                RAISE EXCEPTION 'rollback 100: % did not get % back', v_role, v_priv;
            END IF;
        END LOOP;
    END LOOP;
END
$post$;

COMMIT;
