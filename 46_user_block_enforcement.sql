-- Blocking is enforced by the database, not only hidden by the client.
-- A member-authored message is refused when its sender and another participant
-- of the conversation have blocked each other in either direction.
-- Mission, quote and payment events written by SECURITY DEFINER functions or by
-- the server (service_role) are never refused: a block must not strand a mission
-- or a payment mid-flight.
-- Additive and idempotent: safe to run once, and again.

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked
    ON public.user_blocks (blocked_id, blocker_id);

CREATE OR REPLACE FUNCTION public.is_blocked_between(p_user_a uuid, p_user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE (b.blocker_id = p_user_a AND b.blocked_id = p_user_b)
           OR (b.blocker_id = p_user_b AND b.blocked_id = p_user_a)
    );
$$;

REVOKE ALL ON FUNCTION public.is_blocked_between(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.conversation_has_block_for(p_conversation_id uuid, p_sender_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.conversation_participants cp
        JOIN public.user_blocks b
          ON (b.blocker_id = cp.user_id AND b.blocked_id = p_sender_id)
          OR (b.blocker_id = p_sender_id AND b.blocked_id = cp.user_id)
        WHERE cp.conversation_id = p_conversation_id
          AND cp.user_id <> p_sender_id
    );
$$;

REVOKE ALL ON FUNCTION public.conversation_has_block_for(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversation_has_block_for(uuid, uuid) TO authenticated;

-- SECURITY INVOKER on purpose: current_user is 'authenticated' only for a direct
-- member insert, and the function owner inside SECURITY DEFINER callers.
CREATE OR REPLACE FUNCTION public.refuse_message_between_blocked_users()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;
    IF NEW.sender_id IS NULL OR NEW.conversation_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF public.conversation_has_block_for(NEW.conversation_id, NEW.sender_id) THEN
        RAISE EXCEPTION 'Ce membre ne peut pas recevoir vos messages.'
            USING ERRCODE = '42501', HINT = 'user_blocked';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refuse_message_between_blocked_users ON public.messages;
CREATE TRIGGER trg_refuse_message_between_blocked_users
    BEFORE INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.refuse_message_between_blocked_users();
