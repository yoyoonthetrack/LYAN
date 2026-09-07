-- ============================================================================
-- LYANN DOM — 29_PAYMENT_RELEASE_ENGINE_MIGRATION.SQL (PATCHED V2)
-- Migration pour le Moteur de Paiement, Libération (Release) & Remboursements (Step 20)
-- IMPORTANT : SEPARATE CHARGES & TRANSFERS - PER-MILESTONE FINANCIAL ENGINE
-- INCLUDES COMPONENT TRACKING & FINAL REMAINDER ABSORPTION FOR 100% CONVERGENCE
-- STRIPE SANDBOX ONLY — DO NOT EXECUTE AUTOMATICALLY ON PRODUCTION
-- ============================================================================

BEGIN;

-- 1. COLONNES DE SUIVI AUTOMATIQUE ET COMPOSANTS DE REMBOURSEMENT DANS PUBLIC.PAYMENTS
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS customer_fee_refunded_cents bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_refunded_cents bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_fee_reversed_cents bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_net_reversed_cents bigint DEFAULT 0;

-- ALIGNEMENT DES CONTRAINTES DE STATUT
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_transfer_status;
ALTER TABLE public.payments 
  ADD CONSTRAINT chk_payments_transfer_status 
  CHECK (transfer_status IN (
    'NOT_STARTED', 
    'PENDING_VALIDATION', 
    'TRANSFER_PROCESSING', 
    'TRANSFERRED', 
    'TRANSFER_FAILED', 
    'REVERSAL_PROCESSING', 
    'REVERSED', 
    'REVERSAL_FAILED'
  ));

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_payment_status;
ALTER TABLE public.payments 
  ADD CONSTRAINT chk_payments_payment_status 
  CHECK (payment_status IN (
    'CREATED', 
    'REQUIRES_ACTION', 
    'PROCESSING', 
    'SUCCEEDED', 
    'FAILED', 
    'CANCELLED', 
    'REFUNDED', 
    'PARTIALLY_REFUNDED', 
    'DISPUTED'
  ));


-- 2. RPC : CRÉATION DE PAIEMENT SÉCURISÉ CÔTÉ SERVEUR (DEMANDEUR UNIQUEMENT)
CREATE OR REPLACE FUNCTION public.create_milestone_payment_secure(
    p_milestone_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_milestone record;
    v_quote record;
    v_mission record;
    v_existing_payment record;
    v_service_amount_cents bigint;
    v_customer_fee_cents bigint;
    v_customer_total_cents bigint;
    v_provider_fee_cents bigint;
    v_provider_net_cents bigint;
    v_lyann_revenue_cents bigint;
    v_payment_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    -- Récupération et verrouillage du jalon
    SELECT * INTO v_milestone FROM public.milestones WHERE id = p_milestone_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Jalon introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- Récupération du devis connecté
    SELECT * INTO v_quote FROM public.quotes WHERE id = v_milestone.quote_id;
    IF NOT FOUND OR v_quote.status != 'ACCEPTED' THEN
        RAISE EXCEPTION 'Le devis associé n''est pas au statut ACCEPTED' USING ERRCODE = '22000';
    END IF;

    -- Récupération de la mission connectée
    SELECT * INTO v_mission FROM public.missions 
    WHERE request_invitation_id = v_quote.request_invitation_id AND status != 'CANCELLED';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mission associée introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- Contrôle du rôle : Seul le demandeur de la mission peut initier le paiement
    IF v_mission.requester_id != v_user_id THEN
        RAISE EXCEPTION 'Seul le demandeur de la prestation peut payer ce jalon' USING ERRCODE = '42501';
    END IF;

    -- Calculs financiers stricts en centimes entiers (BigInt 3% + 3% Half-Up Rounding)
    v_service_amount_cents := (v_milestone.amount * 100)::bigint;
    IF v_service_amount_cents <= 0 THEN
        RAISE EXCEPTION 'Le montant du jalon doit être supérieur à zéro centime' USING ERRCODE = '22000';
    END IF;

    v_customer_fee_cents := (v_service_amount_cents * 3 + 50) / 100;
    v_provider_fee_cents := (v_service_amount_cents * 3 + 50) / 100;
    v_customer_total_cents := v_service_amount_cents + v_customer_fee_cents;
    v_provider_net_cents := v_service_amount_cents - v_provider_fee_cents;
    v_lyann_revenue_cents := v_customer_fee_cents + v_provider_fee_cents;

    -- Recherche d'un paiement existant actif/sécurisé pour réutilisation idempotente
    SELECT * INTO v_existing_payment 
    FROM public.payments 
    WHERE milestone_id = p_milestone_id 
      AND payment_status IN ('CREATED', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'PARTIALLY_REFUNDED', 'DISPUTED')
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing_payment.payment_status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'DISPUTED') THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_secured', true,
                'payment_id', v_existing_payment.id,
                'payment_status', v_existing_payment.payment_status,
                'stripe_payment_intent_id', v_existing_payment.stripe_payment_intent_id
            );
        END IF;

        -- Réutilisation du paiement existant en cours de création
        RETURN jsonb_build_object(
            'success', true,
            'reused', true,
            'payment_id', v_existing_payment.id,
            'quote_id', v_quote.id,
            'mission_id', v_mission.id,
            'requester_id', v_mission.requester_id,
            'provider_id', v_mission.helper_id,
            'financials', jsonb_build_object(
                'service_amount_cents', v_existing_payment.service_amount_cents,
                'customer_fee_cents', v_existing_payment.customer_fee_cents,
                'customer_total_cents', v_existing_payment.customer_total_cents,
                'provider_fee_cents', v_existing_payment.provider_fee_cents,
                'provider_net_cents', v_existing_payment.provider_net_cents,
                'lyann_revenue_cents', v_existing_payment.lyann_revenue_cents
            ),
            'stripe_payment_intent_id', v_existing_payment.stripe_payment_intent_id,
            'idempotency_key', format('lyann:payment:%s', v_existing_payment.id)
        );
    END IF;

    -- Insertion d'un nouveau paiement canonique
    INSERT INTO public.payments (
        mission_id,
        milestone_id,
        quote_id,
        requester_id,
        provider_id,
        service_amount_cents,
        customer_fee_cents,
        customer_total_cents,
        provider_fee_cents,
        provider_net_cents,
        lyann_revenue_cents,
        amount_refunded_cents,
        customer_fee_refunded_cents,
        service_refunded_cents,
        provider_fee_reversed_cents,
        provider_net_reversed_cents,
        currency,
        payment_status,
        transfer_status,
        created_at,
        updated_at
    ) VALUES (
        v_mission.id,
        v_milestone.id,
        v_quote.id,
        v_mission.requester_id,
        v_mission.helper_id,
        v_service_amount_cents,
        v_customer_fee_cents,
        v_customer_total_cents,
        v_provider_fee_cents,
        v_provider_net_cents,
        v_lyann_revenue_cents,
        0, 0, 0, 0, 0,
        'EUR',
        'CREATED',
        'NOT_STARTED',
        now(),
        now()
    ) RETURNING id INTO v_payment_id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'quote_id', v_quote.id,
        'mission_id', v_mission.id,
        'requester_id', v_mission.requester_id,
        'provider_id', v_mission.helper_id,
        'financials', jsonb_build_object(
            'service_amount_cents', v_service_amount_cents,
            'customer_fee_cents', v_customer_fee_cents,
            'customer_total_cents', v_customer_total_cents,
            'provider_fee_cents', v_provider_fee_cents,
            'provider_net_cents', v_provider_net_cents,
            'lyann_revenue_cents', v_lyann_revenue_cents
        ),
        'idempotency_key', format('lyann:payment:%s', v_payment_id)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_milestone_payment_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_milestone_payment_secure(uuid) TO authenticated, service_role;


-- 3. RPC : SERVER GATE POUR LA PRÉPARATION DE LA LIBÉRATION D'UN VERSEMENT (RELEASE)
CREATE OR REPLACE FUNCTION public.prepare_milestone_release_secure(
    p_milestone_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_milestone record;
    v_payment record;
    v_provider_profile record;
    v_active_dispute_count int;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    -- Récupération et verrouillage du jalon
    SELECT * INTO v_milestone FROM public.milestones WHERE id = p_milestone_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Jalon introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- Condition 1 : Le jalon doit être contractuellement VALIDATED (ou déjà RELEASED)
    IF v_milestone.status NOT IN ('VALIDATED', 'RELEASED') THEN
        RAISE EXCEPTION 'Le jalon doit être validé par le client avant d''être éligible au versement (statut actuel: %)', v_milestone.status USING ERRCODE = '22000';
    END IF;

    -- Récupération et verrouillage du paiement canonique
    SELECT * INTO v_payment FROM public.payments WHERE milestone_id = p_milestone_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Aucun enregistrement de paiement trouvé pour ce jalon' USING ERRCODE = 'P0002';
    END IF;

    -- Condition 2 : Le paiement client doit être au statut SUCCEEDED
    IF v_payment.payment_status != 'SUCCEEDED' THEN
        RAISE EXCEPTION 'Les fonds doivent être encaissés (SUCCEEDED) avant tout transfert (statut actuel: %)', v_payment.payment_status USING ERRCODE = '22000';
    END IF;

    -- Condition 3 : Si déjà TRANSFERRED avec stripe_transfer_id, idempotence immédiate
    IF v_payment.transfer_status = 'TRANSFERRED' AND v_payment.stripe_transfer_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_transferred', true,
            'payment_id', v_payment.id,
            'stripe_transfer_id', v_payment.stripe_transfer_id,
            'transfer_status', 'TRANSFERRED'
        );
    END IF;

    -- Condition 4 : Vérification des litiges ouverts
    SELECT COUNT(*) INTO v_active_dispute_count 
    FROM public.disputes 
    WHERE milestone_id = p_milestone_id 
      AND status NOT IN ('RESOLVED_CLIENT', 'RESOLVED_PROVIDER', 'RESOLVED_PARTIAL', 'CANCELLED');

    IF v_active_dispute_count > 0 THEN
        RAISE EXCEPTION 'Un litige actif est en cours sur ce jalon. Versement bloqué.' USING ERRCODE = '22000';
    END IF;

    -- Condition 5 : Récupération du compte Connect du prestataire
    SELECT * INTO v_provider_profile FROM public.profiles WHERE id = v_payment.provider_id;
    IF NOT FOUND OR v_provider_profile.stripe_account_id IS NULL THEN
        UPDATE public.payments SET transfer_status = 'TRANSFER_FAILED', updated_at = now() WHERE id = v_payment.id;
        RETURN jsonb_build_object(
            'success', false,
            'eligible', false,
            'code', 'CONNECT_ACCOUNT_MISSING',
            'error', 'Le compte Stripe Connect du prestataire n''est pas configuré.'
        );
    END IF;

    -- Verrouillage de la transition de transfert : NOT_STARTED/PENDING_VALIDATION/TRANSFER_FAILED -> TRANSFER_PROCESSING
    UPDATE public.payments 
    SET transfer_status = 'TRANSFER_PROCESSING',
        updated_at = now()
    WHERE id = v_payment.id
      AND transfer_status IN ('NOT_STARTED', 'PENDING_VALIDATION', 'TRANSFER_FAILED', 'TRANSFER_PROCESSING');

    RETURN jsonb_build_object(
        'success', true,
        'eligible', true,
        'payment_id', v_payment.id,
        'milestone_id', p_milestone_id,
        'provider_id', v_payment.provider_id,
        'stripe_account_id', v_provider_profile.stripe_account_id,
        'provider_net_cents', (v_payment.provider_net_cents - COALESCE(v_payment.provider_net_reversed_cents, 0)),
        'currency', v_payment.currency,
        'idempotency_key', format('lyann:transfer:%s', v_payment.id)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_milestone_release_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_milestone_release_secure(uuid) TO authenticated, service_role;


-- 4. RPC : CONFIRMATION SUCCÈS DU TRANSFERT STRIPE
CREATE OR REPLACE FUNCTION public.confirm_milestone_transfer_secure(
    p_payment_id uuid,
    p_stripe_transfer_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payment record;
BEGIN
    SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paiement introuvable' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.payments
    SET transfer_status = 'TRANSFERRED',
        stripe_transfer_id = p_stripe_transfer_id,
        released_at = now(),
        updated_at = now()
    WHERE id = p_payment_id;

    UPDATE public.milestones
    SET status = 'RELEASED',
        updated_at = now()
    WHERE id = v_payment.milestone_id;

    INSERT INTO public.admin_audit_events (
        actor_id,
        action,
        target_resource,
        target_id,
        details
    ) VALUES (
        COALESCE(auth.uid(), v_payment.provider_id),
        'TRANSFER_SUCCEEDED',
        'payments',
        p_payment_id::text,
        jsonb_build_object(
            'stripe_transfer_id', p_stripe_transfer_id,
            'provider_net_cents', v_payment.provider_net_cents,
            'milestone_id', v_payment.milestone_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'milestone_id', v_payment.milestone_id,
        'transfer_status', 'TRANSFERRED',
        'milestone_status', 'RELEASED',
        'stripe_transfer_id', p_stripe_transfer_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_milestone_transfer_secure(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_milestone_transfer_secure(uuid, text) TO authenticated, service_role;


-- 5. RPC : GESTION DES ÉCHECS DE TRANSFERT (GARDANT LE JALON À 'VALIDATED')
CREATE OR REPLACE FUNCTION public.fail_milestone_transfer_secure(
    p_payment_id uuid,
    p_error_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payment record;
BEGIN
    SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paiement introuvable' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.payments
    SET transfer_status = 'TRANSFER_FAILED',
        metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{last_transfer_error}', to_jsonb(p_error_message)),
        updated_at = now()
    WHERE id = p_payment_id;

    INSERT INTO public.admin_audit_events (
        actor_id,
        action,
        target_resource,
        target_id,
        details
    ) VALUES (
        COALESCE(auth.uid(), v_payment.provider_id),
        'TRANSFER_FAILED',
        'payments',
        p_payment_id::text,
        jsonb_build_object(
            'error_message', p_error_message,
            'milestone_id', v_payment.milestone_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'transfer_status', 'TRANSFER_FAILED',
        'milestone_status', 'VALIDATED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fail_milestone_transfer_secure(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_milestone_transfer_secure(uuid, text) TO authenticated, service_role;


-- 6. RPC : PRÉPARATION SÉCURISÉE DU REMBOURSEMENT AVEC RÈGLE D'ABSORPTION DU RELIQUAT AU REMBOURSEMENT FINAL
CREATE OR REPLACE FUNCTION public.prepare_refund_secure(
    p_payment_id uuid,
    p_amount_cents bigint,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_payment record;
    v_max_refundable bigint;
    v_refund_service bigint;
    v_refund_cust_fee bigint;
    v_refund_prov_fee bigint;
    v_refund_prov_net bigint;
    v_requires_reversal boolean := false;
    v_is_final_refund boolean := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paiement introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_payment.requester_id != v_user_id THEN
        RAISE EXCEPTION 'Seul le demandeur peut demander un remboursement de ce paiement' USING ERRCODE = '42501';
    END IF;

    v_max_refundable := v_payment.customer_total_cents - v_payment.amount_refunded_cents;

    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'Le montant du remboursement doit être supérieur à zéro centime' USING ERRCODE = '22000';
    END IF;

    IF p_amount_cents > v_max_refundable THEN
        RAISE EXCEPTION 'Le montant demandé (% centimes) dépasse le solde remboursable disponible (% centimes)', p_amount_cents, v_max_refundable USING ERRCODE = '22000';
    END IF;

    -- Détection du remboursement final fermant le solde disponible
    IF (v_payment.amount_refunded_cents + p_amount_cents) = v_payment.customer_total_cents THEN
        v_is_final_refund := true;
    END IF;

    -- RÈGLE DE CLÔTURE DU DERNIER REMBOURSEMENT : Absorber l'exact reliquat comptable non encore remboursé
    IF v_is_final_refund THEN
        v_refund_cust_fee := v_payment.customer_fee_cents - COALESCE(v_payment.customer_fee_refunded_cents, 0);
        v_refund_service := v_payment.service_amount_cents - COALESCE(v_payment.service_refunded_cents, 0);
        v_refund_prov_fee := v_payment.provider_fee_cents - COALESCE(v_payment.provider_fee_reversed_cents, 0);
        v_refund_prov_net := v_payment.provider_net_cents - COALESCE(v_payment.provider_net_reversed_cents, 0);
    ELSE
        v_refund_cust_fee := (p_amount_cents * v_payment.customer_fee_cents) / v_payment.customer_total_cents;
        v_refund_service := p_amount_cents - v_refund_cust_fee;
        v_refund_prov_fee := (v_refund_service * v_payment.provider_fee_cents) / v_payment.service_amount_cents;
        v_refund_prov_net := v_refund_service - v_refund_prov_fee;
    END IF;

    IF v_payment.transfer_status = 'TRANSFERRED' THEN
        v_requires_reversal := true;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'stripe_payment_intent_id', v_payment.stripe_payment_intent_id,
        'stripe_charge_id', v_payment.stripe_charge_id,
        'stripe_transfer_id', v_payment.stripe_transfer_id,
        'refund_amount_cents', p_amount_cents,
        'is_final_refund', v_is_final_refund,
        'breakdown', jsonb_build_object(
            'refunded_service_cents', v_refund_service,
            'refunded_customer_fee_cents', v_refund_cust_fee,
            'reversed_provider_net_cents', v_refund_prov_net,
            'reversed_provider_fee_cents', v_refund_prov_fee
        ),
        'reversal_basis', 'PROVIDER_NET',
        'reversal_amount_cents', v_refund_prov_net,
        'requires_reversal', v_requires_reversal,
        'current_transfer_status', v_payment.transfer_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_refund_secure(uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_refund_secure(uuid, bigint, text) TO authenticated, service_role;


-- 7. RPC : CONFIRMATION DU REMBOURSEMENT ET MISE À JOUR DES COMPOSANTS CUMULÉS
CREATE OR REPLACE FUNCTION public.confirm_refund_secure(
    p_payment_id uuid,
    p_amount_cents bigint,
    p_refund_service_cents bigint,
    p_refund_cust_fee_cents bigint,
    p_refund_prov_net_cents bigint,
    p_refund_prov_fee_cents bigint,
    p_stripe_refund_id text,
    p_stripe_reversal_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payment record;
    v_new_status text;
BEGIN
    SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paiement introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF (v_payment.amount_refunded_cents + p_amount_cents) >= v_payment.customer_total_cents THEN
        v_new_status := 'REFUNDED';
    ELSE
        v_new_status := 'PARTIALLY_REFUNDED';
    END IF;

    -- Mise à jour autoritaire des composants cumulés dans public.payments
    UPDATE public.payments
    SET amount_refunded_cents = amount_refunded_cents + p_amount_cents,
        customer_fee_refunded_cents = customer_fee_refunded_cents + p_refund_cust_fee_cents,
        service_refunded_cents = service_refunded_cents + p_refund_service_cents,
        provider_fee_reversed_cents = provider_fee_reversed_cents + p_refund_prov_fee_cents,
        provider_net_reversed_cents = provider_net_reversed_cents + p_refund_prov_net_cents,
        payment_status = v_new_status,
        stripe_refund_id = COALESCE(p_stripe_refund_id, stripe_refund_id),
        updated_at = now()
    WHERE id = p_payment_id;

    -- Traçabilité append-only dans public.payment_adjustments
    INSERT INTO public.payment_adjustments (
        payment_id,
        refund_amount_cents,
        adjusted_service_amount_cents,
        adjusted_customer_fee_cents,
        adjusted_customer_total_cents,
        adjusted_provider_fee_cents,
        adjusted_provider_net_cents,
        stripe_refund_id,
        stripe_reversal_id,
        created_at
    ) VALUES (
        p_payment_id,
        p_amount_cents,
        p_refund_service_cents,
        p_refund_cust_fee_cents,
        p_amount_cents,
        p_refund_prov_fee_cents,
        p_refund_prov_net_cents,
        p_stripe_refund_id,
        p_stripe_reversal_id,
        now()
    );

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'payment_status', v_new_status,
        'total_refunded_cents', (v_payment.amount_refunded_cents + p_amount_cents)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_refund_secure(uuid, bigint, bigint, bigint, bigint, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_refund_secure(uuid, bigint, bigint, bigint, bigint, bigint, text, text) TO authenticated, service_role;

COMMIT;
