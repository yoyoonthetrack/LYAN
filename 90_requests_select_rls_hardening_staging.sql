-- LYANN Migration 90 — requests SELECT: stop anonymous and third-party reads of private, targeted,
-- closed, paused and masked announcements.
-- Status: PREPARED, NOT APPLIED. Staging only (tdktfbtqceldlaeqjtow). Never Production (see section 0).
-- Procedure: docs/requests-rls-hardening-staging.md. Rollback: 90_requests_select_rls_hardening_rollback.sql.
--
-- Finding (Staging, 2026-11-05): the single SELECT policy "Requests are viewable by everyone"
-- (roles {public}) answers true for every approved row, whatever its visibility, status, safety status or
-- target. anon and every member read the 14 DIRECT ads and 50 non-OPEN public ads, with requester_id and
-- internal_tags. The JavaScript filters are not a protection.
--
-- Result:
--   anon           reads nothing (no policy, no table privilege). The public API reads with the service role.
--   author         unchanged: own rows unless rejected.
--   admin          unchanged: every row.
--   other members  PUBLIC + OPEN + SAFE + untargeted + classified/unclassified + approved (the Découvrir rule), and
--                  only the rows they are legitimately part of: target_user_id, invitation recipient (not cancelled),
--                  quote provider, mission helper. Never a PROHIBITED row. Always approved moderation.
--
-- Permissive policies are OR-ed: the old policy is dropped, and the migration refuses to run if any other
-- SELECT/ALL policy exists on requests, otherwise a second permissive policy would keep the exposure.
-- RLS filters rows, not columns: authenticated members still receive every column of the rows they may read
-- (see docs/requests-rls-hardening-staging.md, "Colonnes").
BEGIN;

-- 0. Preconditions: abort (and roll back) on anything unexpected.
DO $pre$
DECLARE
    v_names text[];
    v_qual text;
BEGIN
    IF to_regclass('public.requests') IS NULL
       OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.requests'::regclass) THEN
        RAISE EXCEPTION 'migration 90: public.requests missing or RLS disabled';
    END IF;
    IF to_regclass('public.request_invitations') IS NULL OR to_regclass('public.quotes') IS NULL OR to_regclass('public.missions') IS NULL THEN
        RAISE EXCEPTION 'migration 90: request_invitations, quotes or missions missing';
    END IF;
    IF to_regprocedure('public.is_current_user_admin()') IS NULL THEN
        RAISE EXCEPTION 'migration 90: is_current_user_admin() missing';
    END IF;

    SELECT array_agg(policyname ORDER BY policyname) INTO v_names
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'requests' AND cmd IN ('SELECT', 'ALL');
    IF v_names IS DISTINCT FROM ARRAY['Requests are viewable by everyone'] THEN
        RAISE EXCEPTION 'migration 90: unexpected SELECT policies on requests: %. Review them before continuing.', v_names;
    END IF;

    -- Staging shape of the policy (CASE ... is_current_user_admin() ... ELSE true, no visibility test).
    -- Production carries the migration-70 policy, which mentions visibility: this guard refuses it.
    SELECT qual INTO v_qual FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'requests' AND policyname = 'Requests are viewable by everyone';
    IF v_qual IS NULL OR v_qual ~* 'visibility' OR v_qual !~* 'is_current_user_admin' THEN
        RAISE EXCEPTION 'migration 90: the live policy is not the expected Staging policy. This migration is Staging only.';
    END IF;
END
$pre$;

-- 1. Index for the participant lookup (invitations and quotes already have one on request_id).
CREATE INDEX IF NOT EXISTS idx_missions_related_request ON public.missions (related_request_id);

-- 2. Participant lookup. SECURITY DEFINER with row_security off, like is_current_user_conversation_participant,
--    so the policy never depends on the RLS of the other tables. It only answers for auth.uid().
CREATE OR REPLACE FUNCTION public.lyann_request_participant_access(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
    SELECT auth.uid() IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.request_invitations i
                WHERE i.request_id = p_request_id AND i.recipient_id = auth.uid() AND i.status <> 'CANCELLED')
        OR EXISTS (SELECT 1 FROM public.quotes q
                   WHERE q.request_id = p_request_id AND q.provider_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.missions m
                   WHERE m.related_request_id = p_request_id AND m.helper_id = auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.lyann_request_participant_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lyann_request_participant_access(uuid) TO authenticated;

-- 3. The only SELECT policy of requests.
DROP POLICY IF EXISTS "Requests are viewable by everyone" ON public.requests;
DROP POLICY IF EXISTS "Requests readable by authorized members" ON public.requests;

CREATE POLICY "Requests readable by authorized members"
ON public.requests FOR SELECT
TO authenticated
USING (
    -- author: own announcements, unless rejected (same rule as before)
    (requester_id = (SELECT auth.uid()) AND public_moderation_status IS DISTINCT FROM 'rejected')
    -- back-office
    OR (SELECT public.is_current_user_admin())
    OR (
        public_moderation_status = 'approved'
        AND (
            -- public Découvrir rule, identical to api/public-explorer-requests.js eligible()
            (visibility = 'PUBLIC' AND status = 'OPEN' AND safety_status = 'SAFE' AND target_user_id IS NULL
             AND classification_status IN ('CLASSIFIED', 'UNCLASSIFIED'))
            -- legitimate recipients and participants, never a PROHIBITED row
            OR (safety_status IS DISTINCT FROM 'PROHIBITED' AND (
                    target_user_id = (SELECT auth.uid())
                    OR public.lyann_request_participant_access(id)
            ))
        )
    )
);

COMMENT ON POLICY "Requests readable by authorized members" ON public.requests IS
    'Migration 90. Public OPEN ads for members; author; admin; target, invitee, quote provider, mission helper. anon: none.';

-- 4. Defence in depth: the visitor key has no business reading requests (the public list is served by the API
--    with the service role). Without the privilege a future permissive policy cannot expose columns to anon.
REVOKE SELECT ON public.requests FROM anon;

-- 5. Post-conditions: roll back if the result is not what was prepared.
DO $post$
DECLARE
    v_rows text[];
BEGIN
    SELECT array_agg(policyname || ':' || roles::text ORDER BY policyname) INTO v_rows
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'requests' AND cmd IN ('SELECT', 'ALL');
    IF v_rows IS DISTINCT FROM ARRAY['Requests readable by authorized members:{authenticated}'] THEN
        RAISE EXCEPTION 'migration 90: unexpected SELECT policies after change: %', v_rows;
    END IF;
    IF has_table_privilege('anon', 'public.requests', 'SELECT') THEN
        RAISE EXCEPTION 'migration 90: anon still has SELECT on requests';
    END IF;
    IF has_function_privilege('anon', 'public.lyann_request_participant_access(uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.lyann_request_participant_access(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'migration 90: wrong EXECUTE grants on lyann_request_participant_access';
    END IF;
END
$post$;

COMMIT;
