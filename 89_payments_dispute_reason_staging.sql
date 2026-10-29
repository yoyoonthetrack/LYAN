-- LYANN Migration 89 — Optional dispute reason on payments (Staging first).
-- Additive. Server already freezes without this column and stores the reason
-- in payments.metadata.dispute_reason when the column is absent.

BEGIN;

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS dispute_reason text;

COMMIT;
