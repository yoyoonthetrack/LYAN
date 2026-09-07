-- ============================================================================
-- LYANN — ROLLBACK MIGRATION 07 V2.6.1 (RESTAURATION SCHÉMA LEGACY)
-- ============================================================================
-- IMPORTANT : Ce script annule les contraintes V2.6.1 et restaure le schéma legacy
-- de public.payments et public.milestones si nécessaire.
-- NE CONTIENT AUCUNE EXÉCUTION AUTOMATIQUE SUR LA PRODUCTION.
-- ============================================================================

BEGIN;

-- 1. Restauration de la contrainte milestones_status_check legacy
ALTER TABLE public.milestones DROP CONSTRAINT IF EXISTS milestones_status_check;
ALTER TABLE public.milestones 
  ADD CONSTRAINT milestones_status_check 
  CHECK (status IN ('PENDING', 'FUNDED', 'IN_PROGRESS', 'COMPLETED', 'RELEASED', 'CANCELLED'));

-- 2. Suppression des contraintes et index V2.6.1 de public.payments
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_milestone_id_fkey;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_quote_id_fkey;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_mission_id_fkey;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_requester_id_fkey;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_provider_id_fkey;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_positive_amounts;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_refund_limit;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_accounting_invariants;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_payment_status;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_transfer_status;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS uq_payments_stripe_intent;

DROP INDEX IF EXISTS public.idx_payments_milestone_id;
DROP INDEX IF EXISTS public.idx_payments_quote_id;
DROP INDEX IF EXISTS public.idx_payments_mission_id;
DROP INDEX IF EXISTS public.idx_payments_requester_id;
DROP INDEX IF EXISTS public.idx_payments_provider_id;
DROP INDEX IF EXISTS public.idx_payments_payment_status;
DROP INDEX IF EXISTS public.idx_payments_transfer_status;
DROP INDEX IF EXISTS public.idx_payments_one_active_or_succeeded_per_milestone;

-- 3. Suppression des colonnes V2.6.1 ajoutées
ALTER TABLE public.payments DROP COLUMN IF EXISTS quote_id;
ALTER TABLE public.payments DROP COLUMN IF EXISTS requester_id;
ALTER TABLE public.payments DROP COLUMN IF EXISTS provider_id;
ALTER TABLE public.payments DROP COLUMN IF EXISTS service_amount_cents;
ALTER TABLE public.payments DROP COLUMN IF EXISTS customer_fee_cents;
ALTER TABLE public.payments DROP COLUMN IF EXISTS customer_total_cents;
ALTER TABLE public.payments DROP COLUMN IF EXISTS provider_fee_cents;
ALTER TABLE public.payments DROP COLUMN IF EXISTS provider_net_cents;
ALTER TABLE public.payments DROP COLUMN IF EXISTS lyann_revenue_cents;
ALTER TABLE public.payments DROP COLUMN IF EXISTS amount_refunded_cents;
ALTER TABLE public.payments DROP COLUMN IF EXISTS currency;
ALTER TABLE public.payments DROP COLUMN IF EXISTS payment_status;
ALTER TABLE public.payments DROP COLUMN IF EXISTS transfer_status;
ALTER TABLE public.payments DROP COLUMN IF EXISTS stripe_charge_id;
ALTER TABLE public.payments DROP COLUMN IF EXISTS stripe_transfer_id;
ALTER TABLE public.payments DROP COLUMN IF EXISTS stripe_refund_id;
ALTER TABLE public.payments DROP COLUMN IF EXISTS metadata;
ALTER TABLE public.payments DROP COLUMN IF EXISTS funded_at;

-- 4. Restauration des colonnes et contraintes legacy
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS amount numeric;
ALTER TABLE public.payments ALTER COLUMN milestone_id DROP NOT NULL;

ALTER TABLE public.payments 
  ADD CONSTRAINT payments_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE CASCADE,
  ADD CONSTRAINT payments_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE SET NULL,
  ADD CONSTRAINT payments_status_check CHECK (status IN ('PENDING', 'HELD_IN_ESCROW', 'RELEASED', 'REFUNDED'));

COMMIT;
