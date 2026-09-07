-- ============================================================================
-- LYANN — ROLLBACK MIGRATION 07 V2.6.2 (RESTAURATION POST-V2 STATE)
-- ============================================================================
-- IMPORTANT : Ce script annule les contraintes V2.6.2 et restaure le schéma POST-V2
-- de public.payments et public.milestones si nécessaire.
-- NE CONTIENT AUCUNE EXÉCUTION AUTOMATIQUE SUR LA PRODUCTION.
-- ============================================================================

BEGIN;

-- 1. Restauration de milestones_status_check legacy/post-v2
ALTER TABLE public.milestones DROP CONSTRAINT IF EXISTS milestones_status_check;
ALTER TABLE public.milestones ADD CONSTRAINT milestones_status_check 
  CHECK (status IN ('PENDING', 'FUNDED', 'IN_PROGRESS', 'COMPLETED', 'RELEASED', 'CANCELLED'));

-- 2. Suppression des contraintes et index V2.6.2 de public.payments
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

-- 3. Suppression des colonnes V2.6.2 ajoutées
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
ALTER TABLE public.payments DROP COLUMN IF EXISTS funded_at;
ALTER TABLE public.payments DROP COLUMN IF EXISTS released_at;

-- 4. Restauration des colonnes et contraintes post-v2
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS status text DEFAULT 'CREATED';
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS amount_gross_cents bigint;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS amount_platform_fee_cents bigint;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS amount_provider_net_cents bigint;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS succeeded_at timestamptz;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS transferred_at timestamptz;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

ALTER TABLE public.payments 
  ADD CONSTRAINT payments_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT payments_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE RESTRICT,
  ADD CONSTRAINT payments_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD CONSTRAINT payments_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

COMMIT;
