-- LYANN — 57 stop conversation_participants RLS recursion.
-- Local only. Do not apply on LYANN.APP or Lyann-test until authorized.
-- The SELECT policy calls is_current_user_conversation_participant(), which
-- reads the same table. When the function owner is still subject to RLS,
-- Postgres reports infinite recursion.
-- Rights stay the same: a participant sees their rows, an admin still passes
-- through is_current_user_admin(), everyone else is denied.
-- Does not change messages policies, notifications, or E1–E6 client code.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_current_user_conversation_participant(
  _conversation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = _conversation_id
      AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_conversation_participant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_conversation_participant(uuid) TO authenticated, service_role;

COMMIT;
