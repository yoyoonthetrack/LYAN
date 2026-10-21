-- Allow Android FCM tokens beside the existing iOS APNs rows.
-- Apply on Staging first. Do not apply on Production until that deploy is authorized.
-- Existing rows stay platform ios. This only widens the platform check.
-- Does not change payments, quotes, chat, missions, or Stripe data.
-- The server private key never belongs in this file or in the Android binary.

ALTER TABLE public.device_push_tokens
    DROP CONSTRAINT IF EXISTS device_push_tokens_platform_check;

ALTER TABLE public.device_push_tokens
    ADD CONSTRAINT device_push_tokens_platform_check
    CHECK (platform IN ('ios', 'android'));

NOTIFY pgrst, 'reload schema';
