-- LYANN Migration 96 — remove the permissive direct INSERT policy on public.conversations.
-- PREPARED, NOT APPLIED. Staging only (tdktfbtqceldlaeqjtow). Needs its own authorization. Never Production without a separate, explicit decision.
-- Rollback: 96_conversations_insert_policy_lockdown_rollback.sql
--
-- Finding (Phase 3.2C-5.2, Staging): public.conversations has two PERMISSIVE INSERT policies for {public}:
--   "No direct insert on conversations for standard users"  WITH CHECK is_current_user_admin()   (migration 02, the intended rule)
--   "Users can insert conversations"                         WITH CHECK true                       (schema.sql, never removed)
-- Permissive policies are OR-ed, so the second one makes the first one void: anon and any member can INSERT rows into conversations through
-- PostgREST (anon and authenticated hold INSERT on the table), with arbitrary started_by / mission_id / context_mode values.
-- conversation_participants and messages stay protected (admin-only participant insert; participant-only message insert), so the rows are orphan
-- conversations nobody can read, but they can be created without limit and carry a forged started_by.
--
-- Legitimate creation paths are unaffected: get_or_create_conversation, lyann_pair_conversation (and through them open_direct_conversation,
-- lyann_open_support_conversation, lyann_ensure_support_welcome, initiate_lyann_help_conversation) are SECURITY DEFINER functions owned by postgres
-- (bypassrls); the server uses the service_role client (bypassrls); admins keep the policy "No direct insert ..." (is_current_user_admin()).
-- No client code (web, TestFlight 15 and 16 bundles) inserts into conversations; they only SELECT.
--
-- Scope: exactly one policy on one table. No data, grant, function or other policy is touched.

BEGIN;

DO $pre$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'conversations' AND policyname = 'Users can insert conversations'
          AND cmd = 'INSERT' AND permissive = 'PERMISSIVE' AND with_check = 'true'
    ) THEN
        RAISE EXCEPTION 'migration 96: policy "Users can insert conversations" (WITH CHECK true) not found as expected';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'conversations' AND policyname = 'No direct insert on conversations for standard users'
          AND cmd = 'INSERT' AND with_check ILIKE '%is_current_user_admin()%'
    ) THEN
        RAISE EXCEPTION 'migration 96: the admin-only INSERT policy is missing; refusing to leave conversations without a restrictive INSERT rule';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.conversations'::regclass) THEN
        RAISE EXCEPTION 'migration 96: RLS is disabled on public.conversations';
    END IF;
END
$pre$;

DROP POLICY "Users can insert conversations" ON public.conversations;

DO $post$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'conversations' AND cmd IN ('INSERT', 'ALL')
          AND permissive = 'PERMISSIVE' AND coalesce(with_check, 'true') = 'true'
    ) THEN
        RAISE EXCEPTION 'migration 96: a permissive unconditional INSERT policy still exists on public.conversations';
    END IF;
    IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'conversations' AND cmd = 'INSERT') <> 1 THEN
        RAISE EXCEPTION 'migration 96: expected exactly one INSERT policy on public.conversations';
    END IF;
END
$post$;

COMMIT;
