-- LYANN — 66 fix messaging RLS recursion (42P17) and profile UPDATE trigger (42703).
-- Target: tdktfbtqceldlaeqjtow (Staging V2) only. Do not apply to gzispjfoywklpqatjyop.
-- Does not change migrations 001–065. Does not DROP tables or data. Does not disable RLS.

BEGIN;

-- ============================================================================
-- P0 — Remove inherited policies that subquery conversation_participants.
-- Postgres evaluates every permissive policy for the command. The helper
-- is_current_user_conversation_participant is already SECURITY DEFINER with
-- row_security=off, but sibling policies that EXISTS-scan the same table
-- re-enter RLS and raise 42P17.
-- Replacement rights already exist on the helper-based policies (kept below).
-- ============================================================================

-- SELECT conversation_participants: recursive EXISTS on the same table.
DROP POLICY IF EXISTS "Users can view participants" ON public.conversation_participants;

-- SELECT conversations: EXISTS on conversation_participants (re-enters RLS).
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;

-- INSERT messages: EXISTS on conversation_participants (re-enters RLS).
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;

-- SELECT messages: EXISTS on conversation_participants (re-enters RLS).
DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;

-- Inherited INSERT that is not itself recursive, but becomes a hole once
-- 42P17 is gone: any authenticated user could insert user_id = auth.uid()
-- into any conversation and then read it. Direct participant writes stay
-- admin-only; membership is created by SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "Users can join conversations" ON public.conversation_participants;

-- Kept (unchanged):
--   conversation_participants SELECT "Participants can view conversation participants"
--   conversation_participants INSERT "No direct insert on participants for standard users"
--   conversation_participants DELETE "Users can only leave their own conversations"
--   conversations SELECT "Participants can view conversation"
--   conversations INSERT "No direct insert on conversations for standard users"
--   conversations INSERT "Users can insert conversations" (unchanged; not 42P17)
--   messages SELECT "Participants can read messages"
--   messages INSERT "Participants can insert messages"
--   messages UPDATE "Recipients can mark messages read"
-- Helper is_current_user_conversation_participant is not rewritten.

-- ============================================================================
-- P1 — protect_sensitive_profile_columns_update referenced NEW.stripe_account_status,
-- a column that does not exist on public.profiles (42703 on every user UPDATE).
-- Protect the columns that actually exist. Do not add the missing name.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.role() != 'service_role' AND NOT public.is_current_user_admin() THEN
        IF NEW.role IS DISTINCT FROM OLD.role
           OR NEW.account_type IS DISTINCT FROM OLD.account_type
           OR NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
           OR NEW.stripe_connect_status IS DISTINCT FROM OLD.stripe_connect_status
           OR NEW.stripe_connect_updated_at IS DISTINCT FROM OLD.stripe_connect_updated_at
           OR NEW.is_pro IS DISTINCT FROM OLD.is_pro
           OR NEW.kyc_verified IS DISTINCT FROM OLD.kyc_verified
           OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
           OR NEW.is_agent IS DISTINCT FROM OLD.is_agent
           OR NEW.professional_status IS DISTINCT FROM OLD.professional_status THEN
            RAISE EXCEPTION 'Modification of protected profile fields is not allowed' USING ERRCODE = '42501';
        END IF;

        IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Modification of immutable profile fields is not allowed' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_sensitive_profile_columns_update() FROM PUBLIC, anon, authenticated;

COMMIT;
