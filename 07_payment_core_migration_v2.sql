-- ============================================================================
-- LYANN DOM — 07_PAYMENT_CORE_MIGRATION_V2.SQL (V2 ALTER TABLE SÉCURISÉE)
-- Migration autonome, non destructive et déterministe pour la table public.payments :
-- ADAPTATION DE LA TABLE LEGACY PAIEMENTS → SOCLE FINANCIER PAR JALON
-- ============================================================================
-- IMPORTANT : Ce fichier prépare exclusivement le socle SQL et les contraintes DB.
-- AUCUN PAIEMENT STRIPE RÉEL NI AUCUNE EDGE FUNCTION N'EST EXÉCUTÉ DANS CE SCRIPT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ADAPTATION NON DESTRUCTIVE DE LA TABLE PUBLIC.PAYMENTS LEGACY
-- ----------------------------------------------------------------------------
-- Transformation de la table public.payments vide vers le modèle V2.
-- Les colonnes sont ajoutées et adaptées sans destruction DDL de la table.
-- ----------------------------------------------------------------------------

-- Ajout des colonnes de liaisons fonctionnelles
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS milestone_id uuid REFERENCES public.milestones(id) ON DELETE RESTRICT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS requester_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS provider_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;

-- Migration des anciennes clés d'identité legacy si présentes
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='payer_id') THEN
        UPDATE public.payments SET requester_id = payer_id WHERE requester_id IS NULL AND payer_id IS NOT NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='recipient_id') THEN
        UPDATE public.payments SET provider_id = recipient_id WHERE provider_id IS NULL AND recipient_id IS NOT NULL;
    END IF;
END $$;

-- Ajout des colonnes financières stricts en CENTIMES (bigint)
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS amount_gross_cents bigint;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS amount_platform_fee_cents bigint;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS amount_provider_net_cents bigint;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS stripe_charge_id text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS stripe_refund_id text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS succeeded_at timestamptz;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS transferred_at timestamptz;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- Mise à jour et normalisation du champ status de la table payments
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS status text DEFAULT 'CREATED';

-- Nettoyage préventif des anciennes contraintes status
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS check_payments_status;
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments ADD CONSTRAINT check_payments_status
CHECK (
    status IN (
        'CREATED',           -- PaymentIntent initialisé côté serveur
        'REQUIRES_ACTION',   -- 3DSecure ou action client requise
        'PROCESSING',        -- Traitement bancaire en cours
        'SUCCEEDED',         -- Encaissement réussi (Jalon financé / FUNDED)
        'FAILED',            -- Échec de débit carte
        'CANCELLED',         -- Annulé avant encaissement
        'REFUNDED',          -- Remboursé au client
        'PARTIALLY_REFUNDED' -- Remboursement partiel
    )
);

-- Ajout de la contrainte d'intégrité financière
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS check_payment_amounts_sum;
ALTER TABLE public.payments ADD CONSTRAINT check_payment_amounts_sum
CHECK (
    amount_gross_cents IS NULL OR (
        amount_gross_cents = (COALESCE(amount_platform_fee_cents, 0) + COALESCE(amount_provider_net_cents, 0))
    )
);

-- Contraintes d'unicité sur les identifiants Stripe & Idempotence
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_payments_stripe_pi') THEN
        ALTER TABLE public.payments ADD CONSTRAINT unique_payments_stripe_pi UNIQUE (stripe_payment_intent_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_payments_idempotency') THEN
        ALTER TABLE public.payments ADD CONSTRAINT unique_payments_idempotency UNIQUE (idempotency_key);
    END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 2. CONTRAINTE D'UNICITÉ PARTIELLE PAR JALON (IDEMPOTENCE DES PAIEMENTS)
-- ----------------------------------------------------------------------------
-- Garantit qu'un jalon ne peut avoir qu'UN SEUL paiement actif ou réussi à la fois.
-- Si une tentative échoue ('FAILED' ou 'CANCELLED'), le client peut réessayer.
-- Dès qu'un paiement passe à 'SUCCEEDED', aucun nouveau paiement ne peut être créé.
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_active_or_succeeded_per_milestone
ON public.payments (milestone_id)
WHERE status IN ('CREATED', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED');

-- Index d'optimisation
CREATE INDEX IF NOT EXISTS idx_payments_milestone ON public.payments(milestone_id);
CREATE INDEX IF NOT EXISTS idx_payments_quote ON public.payments(quote_id);
CREATE INDEX IF NOT EXISTS idx_payments_mission ON public.payments(mission_id);
CREATE INDEX IF NOT EXISTS idx_payments_requester ON public.payments(requester_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON public.payments(provider_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);


-- ----------------------------------------------------------------------------
-- 3. CRÉATION DE LA TABLE PUBLIC.STRIPE_WEBHOOK_EVENTS (IDEMPOTENCE WEBHOOKS)
-- ----------------------------------------------------------------------------
-- Empêche le traitement multiple du même événement Stripe (evt_...).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id text NOT NULL UNIQUE,
    event_type text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now(),
    payload_summary jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_evt_id ON public.stripe_webhook_events(stripe_event_id);


-- ----------------------------------------------------------------------------
-- 4. TRIGGER SÉCURISÉ POUR MISE À JOUR DE UPDATED_AT
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_payments_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_payments_updated_at ON public.payments;
CREATE TRIGGER tr_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.set_payments_updated_at();


-- ----------------------------------------------------------------------------
-- 5. VERROUILLAGE RLS ET PRIVILÈGES (REVOKE INTERDICTIONS ÉCRITURE DIRECTE)
-- ----------------------------------------------------------------------------

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Nettoyage des privilèges et interdiction d'écriture directe pour authenticated
REVOKE ALL ON public.payments FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated;
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

REVOKE ALL ON public.stripe_webhook_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.stripe_webhook_events TO service_role;

-- Politiques RLS SELECT pour Client A et Lyanneur B
DROP POLICY IF EXISTS "Participants can view own payments" ON public.payments;
CREATE POLICY "Participants can view own payments"
ON public.payments FOR SELECT
TO authenticated
USING (
    auth.uid() = requester_id OR auth.uid() = provider_id
);

-- ============================================================================
-- FIN DE LA MIGRATION 07 V2 — SOCLE PAIEMENT PRÊT (NON EXÉCUTÉ)
-- ============================================================================
