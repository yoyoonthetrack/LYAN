-- ============================================================================
-- LYANN — MIGRATION 07 V2.2 : PAYMENT CORE (LEGACY ADAPTATION & ESCROW SCHEMA)
-- ============================================================================
-- IMPORTANT : Ce script adapte la table legacy `public.payments` (actuellement vide)
-- vers le nouveau schéma financier sécurisé en centimes d'euros sans destruction.
-- IDEMPOTENCE DDL TOTALE ET VALIDATION COMPTABLE DE DÉCHARGE/REMBOURSEMENT.
-- NE CONTIENT AUCUNE EXÉCUTION AUTOMATIQUE.
-- ============================================================================

BEGIN;

-- 1. NETTOYAGE IDEMPOTENT DES ANCIENNES CONTRAINTES ET INDEX LEGACY
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_milestone_id_fkey;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_quote_id_fkey;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_mission_id_fkey;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_requester_id_fkey;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_provider_id_fkey;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_positive_amounts;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_amount_accounting;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_status;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_refund_range;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_status_refund_coherence;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS uq_payments_stripe_intent;

DROP INDEX IF EXISTS public.idx_payments_mission_id;
DROP INDEX IF EXISTS public.idx_payments_milestone_id;
DROP INDEX IF EXISTS public.idx_payments_one_active_or_succeeded_per_milestone;
DROP INDEX IF EXISTS public.idx_payments_quote_id;
DROP INDEX IF EXISTS public.idx_payments_requester_id;
DROP INDEX IF EXISTS public.idx_payments_provider_id;
DROP INDEX IF EXISTS public.idx_payments_status;

-- 2. RESTRUCTURATION DES COLONNES DE PUBLIC.PAYMENTS
ALTER TABLE public.payments
  ALTER COLUMN status SET DATA TYPE text,
  ALTER COLUMN status SET DEFAULT 'CREATED',
  ALTER COLUMN stripe_payment_intent_id SET DATA TYPE text,
  ALTER COLUMN milestone_id SET NOT NULL;

-- Suppression des colonnes legacy inutilisées (amount float & released_at)
ALTER TABLE public.payments DROP COLUMN IF EXISTS amount;
ALTER TABLE public.payments DROP COLUMN IF EXISTS released_at;

-- Ajout idempotent des colonnes financières structurées (sans FK implicites inline)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS quote_id uuid NOT NULL,
  ADD COLUMN IF NOT EXISTS requester_id uuid NOT NULL,
  ADD COLUMN IF NOT EXISTS provider_id uuid NOT NULL,
  ADD COLUMN IF NOT EXISTS amount_gross_cents bigint NOT NULL,
  ADD COLUMN IF NOT EXISTS amount_platform_fee_cents bigint NOT NULL,
  ADD COLUMN IF NOT EXISTS amount_provider_net_cents bigint NOT NULL,
  ADD COLUMN IF NOT EXISTS amount_refunded_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Ré-association explicite et idempotente des 5 clés étrangères avec ON DELETE RESTRICT
ALTER TABLE public.payments
  ADD CONSTRAINT payments_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE RESTRICT,
  ADD CONSTRAINT payments_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE RESTRICT,
  ADD CONSTRAINT payments_mission_id_fkey FOREIGN KEY (mission_id) REFERENCES public.missions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT payments_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD CONSTRAINT payments_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

-- 3. CONTRAINTES DE SÉCURITÉ ET COMPTABILITÉ FINANCIÈRE V2.2 (IDEMPOTENTES)

-- A. Positivité et bornage des montants
ALTER TABLE public.payments
  ADD CONSTRAINT chk_payments_positive_amounts 
    CHECK (amount_gross_cents > 0 AND amount_platform_fee_cents >= 0 AND amount_provider_net_cents >= 0),
  ADD CONSTRAINT chk_payments_refund_range 
    CHECK (amount_refunded_cents >= 0 AND amount_refunded_cents <= amount_gross_cents),
  ADD CONSTRAINT chk_payments_amount_accounting 
    CHECK (amount_gross_cents = amount_platform_fee_cents + amount_provider_net_cents),
  ADD CONSTRAINT chk_payments_status 
    CHECK (status IN ('CREATED', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED')),
  ADD CONSTRAINT uq_payments_stripe_intent 
    UNIQUE (stripe_payment_intent_id);

-- B. Cohérence stricte entre statut de paiement et montant remboursé
ALTER TABLE public.payments
  ADD CONSTRAINT chk_payments_status_refund_coherence
    CHECK (
      (status = 'REFUNDED' AND amount_refunded_cents = amount_gross_cents) OR
      (status = 'PARTIALLY_REFUNDED' AND amount_refunded_cents > 0 AND amount_refunded_cents < amount_gross_cents) OR
      (status IN ('CREATED', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED') AND amount_refunded_cents = 0) OR
      (status = 'DISPUTED' AND amount_refunded_cents >= 0 AND amount_refunded_cents <= amount_gross_cents)
    );

-- 4. GESTION DES PAYMENT ATTEMPTS & UNICITÉ PAR JALON (INDEX UNIQUE PARTIEL INCHANGÉ V2.1/V2.2)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_active_or_succeeded_per_milestone 
ON public.payments (milestone_id) 
WHERE status IN ('CREATED', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED');

-- Index de performance (Idempotents)
CREATE INDEX IF NOT EXISTS idx_payments_milestone_id ON public.payments(milestone_id);
CREATE INDEX IF NOT EXISTS idx_payments_quote_id ON public.payments(quote_id);
CREATE INDEX IF NOT EXISTS idx_payments_mission_id ON public.payments(mission_id);
CREATE INDEX IF NOT EXISTS idx_payments_requester_id ON public.payments(requester_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_id ON public.payments(provider_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- 5. TRIGGER D'HORODATAGE UPDATED_AT (IDEMPOTENT)
CREATE OR REPLACE FUNCTION public.set_payments_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_payments_updated_at();

-- 6. SÉCURITÉ RLS ET PERMISSIONS MATRICIELLES SUR PUBLIC.PAYMENTS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Révocation explicite des droits d'écriture directe pour authenticated et anon
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated, anon, public;
REVOKE ALL ON public.payments FROM anon;

-- Privilège de lecture pour authenticated
GRANT SELECT ON public.payments TO authenticated;

-- Confirmation des privilèges totalement conservés pour service_role
GRANT ALL ON public.payments TO service_role;

-- Policy RLS de lecture (Demandeur A ou Provider B)
DROP POLICY IF EXISTS payments_select_policy ON public.payments;
CREATE POLICY payments_select_policy ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = requester_id OR auth.uid() = provider_id
  );

-- 7. TABLE D'IDEMPOTENCE DES WEBHOOKS STRIPE (IDEMPOTENTE)
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id text NOT NULL UNIQUE,
    event_type text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Verrouillage strict de stripe_webhook_events au backend (service_role)
REVOKE ALL ON public.stripe_webhook_events FROM PUBLIC, authenticated, anon;
GRANT ALL ON public.stripe_webhook_events TO service_role;

COMMIT;
