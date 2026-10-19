-- Rollback for 66_fix_messaging_rls_and_profile_trigger.sql
-- Target: tdktfbtqceldlaeqjtow only. Restores the pre-66 inherited policies
-- and the trigger body that references stripe_account_status. Do not apply
-- unless 66 must be undone. Production gzispjfoywklpqatjyop is forbidden.

BEGIN;

CREATE POLICY "Users can view participants" ON public.conversation_participants
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM conversation_participants cp
            WHERE cp.conversation_id = conversation_participants.conversation_id
              AND cp.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view their conversations" ON public.conversations
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM conversation_participants
            WHERE conversation_participants.conversation_id = conversations.id
              AND conversation_participants.user_id = auth.uid()
        )
    );

CREATE POLICY "Participants can send messages" ON public.messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM conversation_participants
            WHERE conversation_participants.conversation_id = messages.conversation_id
              AND conversation_participants.user_id = auth.uid()
        )
    );

CREATE POLICY "Participants can view messages" ON public.messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM conversation_participants
            WHERE conversation_participants.conversation_id = messages.conversation_id
              AND conversation_participants.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can join conversations" ON public.conversation_participants
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.role() != 'service_role' AND NOT public.is_current_user_admin() THEN
        IF NEW.role IS DISTINCT FROM OLD.role OR
           NEW.account_type IS DISTINCT FROM OLD.account_type OR
           NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id OR
           NEW.stripe_account_status IS DISTINCT FROM OLD.stripe_account_status OR
           NEW.is_pro IS DISTINCT FROM OLD.is_pro OR
           NEW.kyc_verified IS DISTINCT FROM OLD.kyc_verified OR
           NEW.is_verified IS DISTINCT FROM OLD.is_verified OR
           NEW.is_agent IS DISTINCT FROM OLD.is_agent OR
           NEW.professional_status IS DISTINCT FROM OLD.professional_status THEN
            RAISE EXCEPTION 'Modification of protected profile fields is not allowed' USING ERRCODE = '42501';
        END IF;

        IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Modification of immutable profile fields is not allowed' USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;
