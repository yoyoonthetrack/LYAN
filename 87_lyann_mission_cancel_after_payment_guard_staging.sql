-- LYANN Migration 87 — refuse mission cancellation once money is engaged.
-- Status: PROPOSED, not applied. Apply on Staging (tdktfbtqceldlaeqjtow) first.
-- A paid mission stays AGREED, and migration 28 only checked the mission status: a participant
-- could cancel after the client paid, leaving secured funds with no refund path.
-- Rollback: re-run section 6 of 28_mission_execution_milestones_migration.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_mission_secure(
    p_mission_id uuid,
    p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_mission record;
    v_conv_id uuid;
    v_clean_reason text;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    v_clean_reason := NULLIF(TRIM(p_reason), '');
    IF v_clean_reason IS NULL THEN
        RAISE EXCEPTION 'Un motif d''annulation est obligatoire' USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_mission FROM public.missions WHERE id = p_mission_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mission introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_mission.requester_id != v_user_id AND v_mission.helper_id != v_user_id THEN
        RAISE EXCEPTION 'Seuls les participants à la mission peuvent demander l''annulation' USING ERRCODE = '42501';
    END IF;

    IF v_mission.status = 'IN_PROGRESS' THEN
        RAISE EXCEPTION 'Une mission en cours ne peut pas être annulée unilatéralement. Veuillez utiliser la gestion des litiges.' USING ERRCODE = '22000';
    END IF;

    IF v_mission.status IN ('COMPLETED', 'CANCELLED', 'DISPUTED') THEN
        RAISE EXCEPTION 'La mission ne peut plus être annulée dans son état actuel (statut: %)', v_mission.status USING ERRCODE = '22000';
    END IF;

    -- Refunds are not automated: once a payment is engaged, cancellation goes through LYANN support.
    IF EXISTS (
        SELECT 1
        FROM public.quotes q
        JOIN public.milestones m ON m.quote_id = q.id
        LEFT JOIN public.payments p ON p.milestone_id = m.id
        WHERE q.mission_id = p_mission_id
          AND (
              m.status IN ('FUNDED', 'IN_PROGRESS', 'COMPLETED', 'RELEASED', 'DISPUTED')
              OR p.payment_status IN ('REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'PARTIALLY_REFUNDED', 'DISPUTED')
              OR (p.payment_status = 'CREATED' AND p.stripe_payment_intent_id IS NOT NULL)
          )
    ) THEN
        RAISE EXCEPTION 'Un paiement est engagé sur cette mission : l''annulation doit être traitée par l''équipe LYANN.' USING ERRCODE = '22000';
    END IF;

    UPDATE public.missions
    SET status = 'CANCELLED',
        updated_at = now()
    WHERE id = p_mission_id
      AND status = 'AGREED';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Concurrence lors de l''annulation' USING ERRCODE = '40001';
    END IF;

    SELECT conversation_id INTO v_conv_id FROM public.request_invitations WHERE id = v_mission.request_invitation_id;
    IF v_conv_id IS NOT NULL THEN
        INSERT INTO public.messages (conversation_id, sender_id, content, created_at)
        VALUES (v_conv_id, v_user_id, jsonb_build_object(
            'type', 'system_card',
            'event_type', 'MISSION_CANCELLED',
            'mission_id', p_mission_id,
            'reason', v_clean_reason,
            'text', format('❌ La mission a été annulée. Motif : %s', v_clean_reason)
        )::text, now());
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'mission_id', p_mission_id,
        'status', 'CANCELLED',
        'reason', v_clean_reason
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_mission_secure(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_mission_secure(uuid, text) TO authenticated, service_role;

COMMIT;
