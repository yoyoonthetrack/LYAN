-- ==============================================================================
-- LYANN DOM — MIGRATION 10 : STRIPE CONNECT PROFILE STATUS CACHE
-- Idempotent Migration for Stripe Step 3 (Onboarding & Mes Gains)
-- ==============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS stripe_connect_status text DEFAULT 'NOT_CONFIGURED',
ADD COLUMN IF NOT EXISTS stripe_connect_updated_at timestamptz NULL;

-- Comment for documentation
COMMENT ON COLUMN public.profiles.stripe_connect_status IS 'Stripe Connect UX status: NOT_CONFIGURED, ACTION_REQUIRED, PENDING, ACTIVE, RESTRICTED';
