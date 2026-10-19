-- Device push tokens for LYANN iOS.
-- Apply once in the Supabase SQL editor. Safe to re-run.
-- Writes and reads go through the API only. The authenticated role has no direct access.
-- Does not read or change payments, quotes, chat, missions, or Stripe data.

CREATE TABLE IF NOT EXISTS public.device_push_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    installation_id text NOT NULL,
    token text NOT NULL,
    platform text NOT NULL DEFAULT 'ios',
    apns_environment text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT device_push_tokens_environment_check
        CHECK (apns_environment IN ('sandbox', 'production')),
    CONSTRAINT device_push_tokens_platform_check
        CHECK (platform IN ('ios')),
    CONSTRAINT device_push_tokens_user_install_unique
        UNIQUE (user_id, installation_id)
);

CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user_active
    ON public.device_push_tokens (user_id)
    WHERE active = true;

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_push_tokens_select_own ON public.device_push_tokens;
DROP POLICY IF EXISTS device_push_tokens_insert_own ON public.device_push_tokens;
DROP POLICY IF EXISTS device_push_tokens_update_own ON public.device_push_tokens;

REVOKE ALL ON public.device_push_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.device_push_tokens TO service_role;

NOTIFY pgrst, 'reload schema';
