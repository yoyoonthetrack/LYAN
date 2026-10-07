-- Lets a webhook retry after a temporary failure.
-- A row is claimed as "processing" and becomes "processed" only after success.
-- Additive. Do not run automatically from the app.

ALTER TABLE public.stripe_webhook_events
    ADD COLUMN IF NOT EXISTS status text;

UPDATE public.stripe_webhook_events
    SET status = 'processed'
    WHERE status IS NULL;

ALTER TABLE public.stripe_webhook_events
    ALTER COLUMN status SET DEFAULT 'processing';

ALTER TABLE public.stripe_webhook_events
    DROP CONSTRAINT IF EXISTS stripe_webhook_events_status_check;

ALTER TABLE public.stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_status_check
    CHECK (status IN ('processing', 'processed', 'failed'));
