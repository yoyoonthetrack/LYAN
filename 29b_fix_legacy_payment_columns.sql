-- ============================================================================
-- LYANN DOM — 29B_FIX_LEGACY_PAYMENT_COLUMNS.SQL
-- Hotfix de Compatibilité Legacy pour public.payments (Step 20)
-- IMPORTANT : RENSEIGNE LES COLONNES LEGACY SANS SUPPRIMER LEUR NOT NULL
-- STRIPE SANDBOX ONLY — DO NOT EXECUTE AUTOMATICALLY ON PRODUCTION
-- ============================================================================

BEGIN;

-- RPC : RE-CRÉATION DE CREATE_MILESTONE_PAYMENT_SECURE AVEC POPULATION LEGACY
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

    -- INSERTION EN BASE CONTENANT À LA FOIS LES CHAMPS CANONIQUES STEP 20 ET LES CHAMPS LEGACY DE COMPATIBILITÉ
    INSERT INTO public.payments (
        mission_id,
        milestone_id,
        quote_id,
        requester_id,
        provider_id,
        -- CHAMPS CANONIQUES STEP 20
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
        -- CHAMPS LEGACY DE COMPATIBILITÉ (CONSERVANT LEUR CONTRAINTE NOT NULL)
        amount_gross_cents,
        amount_platform_fee_cents,
        amount_provider_net_cents,
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
        -- VALEURS CANONIQUES
        v_service_amount_cents,
        v_customer_fee_cents,
        v_customer_total_cents,
        v_provider_fee_cents,
        v_provider_net_cents,
        v_lyann_revenue_cents,
        0, 0, 0, 0, 0,
        -- MAPPING DÉRIVÉ DES VARIABLES SERVEUR CANONIQUES
        v_customer_total_cents,  -- amount_gross_cents = customer_total_cents
        v_lyann_revenue_cents,   -- amount_platform_fee_cents = lyann_revenue_cents
        v_provider_net_cents,    -- amount_provider_net_cents = provider_net_cents
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

COMMIT;
