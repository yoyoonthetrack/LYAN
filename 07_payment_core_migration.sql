-- ============================================================================
-- LYANN DOM — 07_PAYMENT_CORE_MIGRATION.SQL (V1 SOCLE PAIEMENT SÉCURISÉ)
-- Migration autonome, idempotente et renforcée pour le socle financier DB :
-- MISSION → MILESTONE → PAYMENT (STRIPE PI) → FUNDED → COMPLETED → RELEASED
-- ============================================================================
-- IMPORTANT : Ce fichier prépare exclusivement le socle SQL et les contraintes DB.
-- AUCUN PAIEMENT STRIPE RÉEL NI AUCUNE EDGE FUNCTION N'EST EXÉCUTÉ DANS CE SCRIPT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CRÉATION DE LA TABLE PUBLIC.PAYMENTS (SOURCE D'AUTORITÉ FINANCIÈRE JALON)
-- ----------------------------------------------------------------------------
-- Un enregistrement dans public.payments correspond au financement d'UN jalon.
-- La table fige les montants en centimes (bigint) pour éliminer les erreurs d'arrondi float,
-- et applique des contraintes strictes sur les relations DB (Milestone, Quote, Mission, Users).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relations fonctionnelles (Dérivables et figées à la création du paiement)
    milestone_id uuid NOT NULL UNIQUE REFERENCES public.milestones(id) ON DELETE RESTRICT,
    quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
    mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE RESTRICT,
    requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    provider_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    
    -- Montants financiers stricts en CENTIMES (bigint) — Aucune valeur float
    amount_gross_cents bigint NOT NULL CHECK (amount_gross_cents > 0),
    amount_platform_fee_cents bigint NOT NULL CHECK (amount_platform_fee_cents >= 0),
    amount_provider_net_cents bigint NOT NULL CHECK (amount_provider_net_cents >= 0),
    currency text NOT NULL DEFAULT 'eur' CHECK (currency = 'eur'),
    
    -- Machine d'état explicite du paiement Stripe (Indépendante du statut du travail)
    status text NOT NULL DEFAULT 'CREATED' CHECK (
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
    ),
    
    -- Identifiants et références Stripe uniques
    stripe_payment_intent_id text UNIQUE,
    stripe_charge_id text UNIQUE,
    stripe_transfer_id text UNIQUE,
    stripe_refund_id text UNIQUE,
    
    -- Idempotence et métadonnées
    idempotency_key text UNIQUE,
    metadata jsonb DEFAULT '{}'::jsonb,
    
    -- Horodatages
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    succeeded_at timestamptz,
    transferred_at timestamptz,
    refunded_at timestamptz,

    -- Contrainte d'intégrité financière : Gross = Platform Fee + Provider Net
    CONSTRAINT check_payment_amounts_sum CHECK (
        amount_gross_cents = (amount_platform_fee_cents + amount_provider_net_cents)
    )
);

-- Index d'optimisation des requêtes et jointures
CREATE INDEX IF NOT EXISTS idx_payments_milestone ON public.payments(milestone_id);
CREATE INDEX IF NOT EXISTS idx_payments_quote ON public.payments(quote_id);
CREATE INDEX IF NOT EXISTS idx_payments_mission ON public.payments(mission_id);
CREATE INDEX IF NOT EXISTS idx_payments_requester ON public.payments(requester_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON public.payments(provider_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_pi ON public.payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);


-- ----------------------------------------------------------------------------
-- 2. CRÉATION DE LA TABLE PUBLIC.STRIPE_WEBHOOK_EVENTS (IDEMPOTENCE WEBHOOKS)
-- ----------------------------------------------------------------------------
-- Empêche qu'un même événement Stripe (evt_...) ne déclenche plusieurs fois
-- une transition financière ou un double transfert vers le prestataire.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id text NOT NULL UNIQUE,
    event_type text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now(),
    payload_summary jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_evt_id ON public.stripe_webhook_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type ON public.stripe_webhook_events(event_type);


-- ----------------------------------------------------------------------------
-- 3. POLITIQUE RLS HERMÉTIQUE SUR PUBLIC.PAYMENTS ET WEBHOOK EVENTS
-- ----------------------------------------------------------------------------
-- Règle de sécurité : Seuls les participants de la mission (Demandeur A ou Prestataire B)
-- peuvent LIRE les paiements associés. AUCUNE écriture directe n'est permise pour authenticated.
-- Les écritures (INSERT/UPDATE) sont réservées exclusivement au backend (service_role).
-- ----------------------------------------------------------------------------

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Suppression des anciennes politiques si existantes
DROP POLICY IF EXISTS "Participants can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Service role full access on payments" ON public.payments;

-- Policy SELECT pour Client A et Lyanneur B
CREATE POLICY "Participants can view own payments"
ON public.payments FOR SELECT
TO authenticated
USING (
    auth.uid() = requester_id OR auth.uid() = provider_id
);

-- Suppression des accès directs écriture (INSERT, UPDATE, DELETE) pour authenticated sur payments
DROP POLICY IF EXISTS "No direct insert for authenticated on payments" ON public.payments;
DROP POLICY IF EXISTS "No direct update for authenticated on payments" ON public.payments;

-- Note: En l'absence de policy FOR INSERT / UPDATE pour authenticated, PostgREST bloque 
-- automatiquement toute tentative d'écriture directe depuis le client web/mobile.

-- ----------------------------------------------------------------------------
-- 4. AUTORISATIONS ET GRANTS
-- ----------------------------------------------------------------------------

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

GRANT SELECT, INSERT ON public.stripe_webhook_events TO service_role;

-- ============================================================================
-- FIN DE LA MIGRATION 07 — SOCLE PAIEMENT PRÊT (NON EXÉCUTÉ)
-- ============================================================================
