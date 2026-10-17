-- Rollback 56 (local note). Do not apply until 56 itself was applied.
-- Restores the previous policies. Anonymous reads of profiles can again
-- raise 42501. Does not DELETE data and does not change public.public_profiles.

BEGIN;

DROP POLICY IF EXISTS "Users can view own profile or admins view all" ON public.profiles;
CREATE POLICY "Users can view own profile or admins view all"
ON public.profiles FOR SELECT
USING (
    auth.uid() = id
    OR public.is_current_user_admin()
);

DROP POLICY IF EXISTS "Participants can read messages" ON public.messages;
CREATE POLICY "Participants can read messages"
ON public.messages FOR SELECT
USING (
    public.is_current_user_conversation_participant(conversation_id)
    OR public.is_current_user_admin()
);

COMMIT;
