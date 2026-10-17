-- Staging only. Locks the unused public bot tables.
-- The application does not read these tables with the anon key.
-- Service role used by the API bypasses row level security.

ALTER TABLE public.ai_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_bot_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ai_bots_deny_public ON public.ai_bots;
DROP POLICY IF EXISTS p_ai_bot_activities_deny_public ON public.ai_bot_activities;
