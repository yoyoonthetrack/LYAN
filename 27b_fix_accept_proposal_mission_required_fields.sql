-- ============================================================================
-- LYANN DOM — 27B_FIX_ACCEPT_PROPOSAL_MISSION_REQUIRED_FIELDS.SQL
-- Hotfix Patch pour public.accept_proposal_secure (Step 18 Hardened V2)
-- Correction 1 : Verrouillage strict de ligne (FOR UPDATE) & search_path = public, pg_temp
-- Correction 2 : Alimentation explicite de la colonne NOT NULL 'title' dans public.missions
-- Source du titre : COALESCE(NULLIF(TRIM(requests.title), ''), 'Mission LYANN')
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_proposal_secure(
    p_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id uuid;
    v_quote_record record;
    v_req_status text;
    v_request_title text;
    v_mission_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    -- Verrouillage de la ligne du devis FOR UPDATE pour sérialiser les appels concurrents
    SELECT * INTO v_quote_record FROM public.quotes WHERE id = p_proposal_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Proposition introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- Contrôle 1 : Seul le demandeur (Client) peut accepter la proposition
    IF v_quote_record.requester_id != v_user_id THEN
        RAISE EXCEPTION 'Seul le demandeur peut accepter cette proposition' USING ERRCODE = '42501';
    END IF;

    -- Contrôle 2 : Statut doit être SENT (Idempotence : si déjà ACCEPTED, retourne succès sans dupliquer)
    IF v_quote_record.status = 'ACCEPTED' THEN
        SELECT id INTO v_mission_id FROM public.missions 
        WHERE request_invitation_id = v_quote_record.request_invitation_id AND status != 'CANCELLED';
        
        RETURN jsonb_build_object(
            'success', true,
            'proposal_id', p_proposal_id,
            'mission_id', v_mission_id,
            'status', 'ACCEPTED',
            'already_accepted', true
        );
    END IF;

    IF v_quote_record.status IS DISTINCT FROM 'SENT' THEN
        RAISE EXCEPTION 'La proposition ne peut plus être acceptée (statut actuel: %)', v_quote_record.status USING ERRCODE = '22000';
    END IF;

    -- Contrôle 3 : Expiration
    IF v_quote_record.valid_until IS NOT NULL AND v_quote_record.valid_until < now() THEN
        RAISE EXCEPTION 'La proposition a expiré' USING ERRCODE = '22000';
    END IF;

    -- Contrôle 4 : Statut du Lyann et récupération de son titre canonique BDD
    SELECT status, title INTO v_req_status, v_request_title FROM public.requests WHERE id = v_quote_record.request_id;
    IF v_req_status IS DISTINCT FROM 'OPEN' THEN
        RAISE EXCEPTION 'Le Lyann n''est plus ouvert' USING ERRCODE = '22000';
    END IF;

    -- Mise à jour du statut de la proposition
    UPDATE public.quotes
    SET status = 'ACCEPTED',
        updated_at = now()
    WHERE id = p_proposal_id
      AND status = 'SENT';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Concurrence lors de l''acceptation' USING ERRCODE = '40001';
    END IF;

    -- Déclenchement / Vérification de la mission (Step 13 Mission Engine)
    SELECT id INTO v_mission_id FROM public.missions 
    WHERE request_invitation_id = v_quote_record.request_invitation_id AND status != 'CANCELLED';

    IF v_mission_id IS NULL THEN
        INSERT INTO public.missions (
            requester_id,
            helper_id,
            related_request_id,
            request_invitation_id,
            title,
            status,
            total_amount,
            created_at,
            updated_at
        ) VALUES (
            v_quote_record.requester_id,
            v_quote_record.provider_id,
            v_quote_record.request_id,
            v_quote_record.request_invitation_id,
            COALESCE(NULLIF(TRIM(v_request_title), ''), 'Mission LYANN'),
            'AGREED',
            v_quote_record.total_amount,
            now(),
            now()
        )
        RETURNING id INTO v_mission_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'proposal_id', p_proposal_id,
        'mission_id', v_mission_id,
        'status', 'ACCEPTED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_proposal_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_proposal_secure(uuid) TO authenticated, service_role;
