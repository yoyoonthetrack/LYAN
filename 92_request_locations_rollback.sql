-- LYANN Migration 92 rollback — removes public.request_locations. Staging only.
-- Destructive for the stored locations: it refuses to run while the table holds rows, unless the operator states it in
-- the same transaction:  SET LOCAL lyann.rollback_92_drop_rows = 'yes';  (put it right after BEGIN).
-- It never touches public.requests, its policies or its privileges (migrations 90 and 91 stay in place).
BEGIN;

DO $pre$
DECLARE
    v_rows bigint := 0;
BEGIN
    IF to_regclass('public.request_locations') IS NULL THEN
        RAISE EXCEPTION 'rollback 92: public.request_locations does not exist';
    END IF;
    EXECUTE 'SELECT count(*) FROM public.request_locations' INTO v_rows;
    IF v_rows > 0 AND coalesce(current_setting('lyann.rollback_92_drop_rows', true), '') <> 'yes' THEN
        RAISE EXCEPTION 'rollback 92: request_locations holds % row(s); set lyann.rollback_92_drop_rows = ''yes'' to drop them', v_rows;
    END IF;
END
$pre$;

DROP TABLE public.request_locations;
DROP FUNCTION IF EXISTS public.lyann_request_locations_touch();

DO $post$
BEGIN
    IF to_regclass('public.request_locations') IS NOT NULL OR to_regprocedure('public.lyann_request_locations_touch()') IS NOT NULL THEN
        RAISE EXCEPTION 'rollback 92: objects remain';
    END IF;
    IF (SELECT array_agg(policyname || ':' || roles::text ORDER BY policyname)
        FROM pg_policies WHERE schemaname = 'public' AND tablename = 'requests' AND cmd IN ('SELECT', 'ALL'))
       IS DISTINCT FROM ARRAY['Requests readable by authorized members:{authenticated}'] THEN
        RAISE EXCEPTION 'rollback 92: the requests SELECT policy is not the migration 90 one';
    END IF;
END
$post$;

COMMIT;
