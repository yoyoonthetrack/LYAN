-- ==============================================================================
-- LYANN DOM — MIGRATION 11 : DISPUTES, EVIDENCE, EVENTS & ADJUSTMENTS
-- Idempotent Migration for Stripe Step 4 (Litiges, Remboursements & Résolution)
-- ==============================================================================

BEGIN;

-- 0. ALIGNEMENT DU CHECK TRANSFER_STATUS POUR INCLURE REVERSAL_FAILED
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_transfer_status;
ALTER TABLE public.payments 
  ADD CONSTRAINT chk_payments_transfer_status 
  CHECK (transfer_status IN ('NOT_STARTED', 'PENDING_VALIDATION', 'TRANSFER_PROCESSING', 'TRANSFERRED', 'TRANSFER_FAILED', 'REVERSAL_PROCESSING', 'REVERSED', 'REVERSAL_FAILED'));

-- 1. TABLE PRINCIPALE DES LITIGES MÉTIER (ON DELETE RESTRICT SUR LES DONNÉES AUDIT)
CREATE TABLE IF NOT EXISTS public.disputes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE RESTRICT,
    milestone_id UUID NOT NULL REFERENCES public.milestones(id) ON DELETE RESTRICT,
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    provider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    reason TEXT NOT NULL,
    description TEXT,
    resolution_type TEXT NULL, -- FULL_REFUND, FULL_RELEASE, PARTIAL_SETTLEMENT
    resolution_note TEXT NULL,
    resolved_by UUID NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    resolved_at TIMESTAMPTZ NULL,
    CONSTRAINT chk_disputes_status CHECK (status IN ('OPEN', 'AWAITING_PROVIDER', 'UNDER_REVIEW', 'RESOLVED_CLIENT', 'RESOLVED_PROVIDER', 'RESOLVED_PARTIAL', 'CANCELLED'))
);

-- 2. PROTECTION DB : UN SEUL LITIGE ACTIF PAR PARTIE (INDEX UNIQUE PARTIEL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_dispute_per_milestone 
ON public.disputes (milestone_id) 
WHERE status NOT IN ('RESOLVED_CLIENT', 'RESOLVED_PROVIDER', 'RESOLVED_PARTIAL', 'CANCELLED');

-- 3. FIL DE DISCUSSION / MESSAGES LITIGE
CREATE TABLE IF NOT EXISTS public.dispute_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    message TEXT NOT NULL,
    is_internal_note BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 4. PREUVES ET PIÈCES JOINTES
CREATE TABLE IF NOT EXISTS public.dispute_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size_bytes INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 5. JOURNAL APPEND-ONLY D'AUDIT COMPTABLE ET SYSTÈME (HISTORIQUE IMMUABLE)
CREATE TABLE IF NOT EXISTS public.dispute_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE RESTRICT,
    actor_id UUID NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- 6. AJUSTEMENTS FINANCIERS COMPTABLES (IMMUABILITÉ DES MONTANTS ORIGINAUX)
CREATE TABLE IF NOT EXISTS public.payment_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
    dispute_id UUID NULL REFERENCES public.disputes(id) ON DELETE RESTRICT,
    refund_amount_cents BIGINT DEFAULT 0,
    adjusted_service_amount_cents BIGINT DEFAULT 0,
    adjusted_customer_fee_cents BIGINT DEFAULT 0,
    adjusted_customer_total_cents BIGINT DEFAULT 0,
    adjusted_provider_fee_cents BIGINT DEFAULT 0,
    adjusted_provider_net_cents BIGINT DEFAULT 0,
    adjusted_lyann_revenue_cents BIGINT DEFAULT 0,
    stripe_refund_id TEXT NULL,
    stripe_reversal_id TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- INDEXES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_disputes_mission_id ON public.disputes(mission_id);
CREATE INDEX IF NOT EXISTS idx_disputes_milestone_id ON public.disputes(milestone_id);
CREATE INDEX IF NOT EXISTS idx_disputes_payment_id ON public.disputes(payment_id);
CREATE INDEX IF NOT EXISTS idx_disputes_requester_id ON public.disputes(requester_id);
CREATE INDEX IF NOT EXISTS idx_disputes_provider_id ON public.disputes(provider_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.disputes(status);

CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute_id ON public.dispute_messages(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute_id ON public.dispute_evidence(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_events_dispute_id ON public.dispute_events(dispute_id);
CREATE INDEX IF NOT EXISTS idx_payment_adjustments_payment_id ON public.payment_adjustments(payment_id);

-- ACTIVATION RLS
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispute_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_adjustments ENABLE ROW LEVEL SECURITY;

-- POLITIQUES RLS DISPUTES
DROP POLICY IF EXISTS disputes_select_policy ON public.disputes;
CREATE POLICY disputes_select_policy ON public.disputes
    FOR SELECT USING (
        auth.uid() = requester_id OR 
        auth.uid() = provider_id OR 
        auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS disputes_insert_policy ON public.disputes;
CREATE POLICY disputes_insert_policy ON public.disputes
    FOR INSERT WITH CHECK (
        auth.uid() = requester_id OR 
        auth.role() = 'service_role'
    );

-- POLITIQUES RLS DISPUTE_MESSAGES
DROP POLICY IF EXISTS dispute_messages_select_policy ON public.dispute_messages;
CREATE POLICY dispute_messages_select_policy ON public.dispute_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.disputes d
            WHERE d.id = dispute_messages.dispute_id
            AND (d.requester_id = auth.uid() OR d.provider_id = auth.uid())
        ) OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS dispute_messages_insert_policy ON public.dispute_messages;
CREATE POLICY dispute_messages_insert_policy ON public.dispute_messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id AND (
            EXISTS (
                SELECT 1 FROM public.disputes d
                WHERE d.id = dispute_messages.dispute_id
                AND (d.requester_id = auth.uid() OR d.provider_id = auth.uid())
            ) OR auth.role() = 'service_role'
        )
    );

-- POLITIQUES RLS DISPUTE_EVIDENCE
DROP POLICY IF EXISTS dispute_evidence_select_policy ON public.dispute_evidence;
CREATE POLICY dispute_evidence_select_policy ON public.dispute_evidence
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.disputes d
            WHERE d.id = dispute_evidence.dispute_id
            AND (d.requester_id = auth.uid() OR d.provider_id = auth.uid())
        ) OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS dispute_evidence_insert_policy ON public.dispute_evidence;
CREATE POLICY dispute_evidence_insert_policy ON public.dispute_evidence
    FOR INSERT WITH CHECK (
        auth.uid() = uploaded_by AND (
            EXISTS (
                SELECT 1 FROM public.disputes d
                WHERE d.id = dispute_evidence.dispute_id
                AND (d.requester_id = auth.uid() OR d.provider_id = auth.uid())
            ) OR auth.role() = 'service_role'
        )
    );

-- POLITIQUES RLS DISPUTE_EVENTS & PAYMENT_ADJUSTMENTS (LECTURE SEULE / BACKEND ONLY WRITE)
DROP POLICY IF EXISTS dispute_events_select_policy ON public.dispute_events;
CREATE POLICY dispute_events_select_policy ON public.dispute_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.disputes d
            WHERE d.id = dispute_events.dispute_id
            AND (d.requester_id = auth.uid() OR d.provider_id = auth.uid())
        ) OR auth.role() = 'service_role'
    );

DROP POLICY IF EXISTS payment_adjustments_select_policy ON public.payment_adjustments;
CREATE POLICY payment_adjustments_select_policy ON public.payment_adjustments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.payments p
            WHERE p.id = payment_adjustments.payment_id
            AND (p.requester_id = auth.uid() OR p.provider_id = auth.uid())
        ) OR auth.role() = 'service_role'
    );

COMMIT;
