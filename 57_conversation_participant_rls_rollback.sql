-- Rollback 57. Restores the helper without row_security = off.
-- Anonymous execute stays revoked. Does not DELETE rows.
-- After this file, a SELECT on conversation_participants can recurse again.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_current_user_conversation_participant(
  _conversation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = _conversation_id
      AND user_id = auth.uid()
  );
$$;

ALTER FUNCTION public.is_current_user_conversation_participant(uuid) RESET row_security;

REVOKE ALL ON FUNCTION public.is_current_user_conversation_participant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_conversation_participant(uuid) TO authenticated, service_role;

COMMIT;
