-- LYANN — 56 anonymous profile reads must not call is_current_user_admin().
-- Local only. Do not apply on Supabase Production or Lyann-test until authorized.
-- Fixes 42501: anon has no EXECUTE on the admin helper, and the profiles
-- SELECT policy evaluated it for every anonymous read.
-- Authenticated owners and admins keep the same access.
-- Does not change public.public_profiles, grants, messages data, or notifications.
-- No DELETE.

BEGIN;

DROP POLICY IF EXISTS "Users can view own profile or admins view all" ON public.profiles;
CREATE POLICY "Users can view own profile or admins view all"
ON public.profiles FOR SELECT
USING (
    CASE
        WHEN auth.uid() = id THEN true
        WHEN COALESCE(auth.role(), '') IS DISTINCT FROM 'authenticated' THEN false
        ELSE public.is_current_user_admin()
    END
);

-- Realtime authorization on messages evaluates this policy. Anonymous
-- subscribers must not call the admin or participant helpers.
DROP POLICY IF EXISTS "Participants can read messages" ON public.messages;
CREATE POLICY "Participants can read messages"
ON public.messages FOR SELECT
USING (
    CASE
        WHEN COALESCE(auth.role(), '') IS DISTINCT FROM 'authenticated' THEN false
        ELSE public.is_current_user_conversation_participant(conversation_id)
            OR public.is_current_user_admin()
    END
);

COMMIT;
