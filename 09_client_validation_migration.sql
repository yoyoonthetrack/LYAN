-- ============================================================================
-- MIGRATION 09: CLIENT VALIDATION TIMESTAMPTZ FOR LYANN PAYMENT CORE STEP 2B
-- Add client_validated_at timestamptz NULL to public.payments
-- Pure Idempotent Migration
-- ============================================================================

ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS client_validated_at timestamptz NULL;

COMMENT ON COLUMN public.payments.client_validated_at IS 'Timestamp of explicit client validation approving milestone completion and authorizing transfer release';
