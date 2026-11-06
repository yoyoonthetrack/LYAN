-- Rollback for 90_requests_select_rls_hardening_staging.sql. Staging only (tdktfbtqceldlaeqjtow).
-- EMERGENCY USE: it restores the exposure (anon and every member read all approved announcements,
-- including DIRECT, closed, paused and PROHIBITED ones, with requester_id and internal_tags).
-- It restores the policy exactly as read on Staging on 2026-11-05 (pg_policies, roles {public}), the anon
-- SELECT privilege, and removes what migration 90 added. No row is read or written.
BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'requests'
                   AND policyname = 'Requests readable by authorized members') THEN
        RAISE EXCEPTION 'rollback 90: migration 90 is not applied (policy "Requests readable by authorized members" missing)';
    END IF;
END
$pre$;

DROP POLICY IF EXISTS "Requests readable by authorized members" ON public.requests;
DROP POLICY IF EXISTS "Requests are viewable by everyone" ON public.requests;

CREATE POLICY "Requests are viewable by everyone"
ON public.requests FOR SELECT
USING (
    CASE
        WHEN ((auth.uid() IS NOT NULL) AND (auth.uid() = requester_id) AND (public_moderation_status IS DISTINCT FROM 'rejected'::text)) THEN true
        WHEN (public_moderation_status IS DISTINCT FROM 'approved'::text) THEN
            CASE
                WHEN (COALESCE(auth.role(), ''::text) IS DISTINCT FROM 'authenticated'::text) THEN false
                ELSE is_current_user_admin()
            END
        ELSE true
    END
);

GRANT SELECT ON public.requests TO anon;

DROP FUNCTION IF EXISTS public.lyann_request_participant_access(uuid);
DROP INDEX IF EXISTS public.idx_missions_related_request;

DO $post$
DECLARE
    v_names text[];
BEGIN
    SELECT array_agg(policyname ORDER BY policyname) INTO v_names
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'requests' AND cmd IN ('SELECT', 'ALL');
    IF v_names IS DISTINCT FROM ARRAY['Requests are viewable by everyone']
       OR NOT has_table_privilege('anon', 'public.requests', 'SELECT') THEN
        RAISE EXCEPTION 'rollback 90: the previous state was not restored';
    END IF;
END
$post$;

COMMIT;
