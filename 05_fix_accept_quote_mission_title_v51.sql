-- ============================================================================
-- LYANN DOM — 05_FIX_ACCEPT_QUOTE_MISSION_TITLE_V51.SQL
-- Migration corrective V5.1 pour accept_request_quote()
-- Correction ciblée : Alimentation de missions.title depuis requests.title
-- sans référence aux colonnes inexistantes (description, category, location)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.accept_request_quote(
    p_quote_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_quote_record record;
    v_req_record record;
    v_mission_id uuid;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    -- 1. Récupération et verrouillage du devis (FOR UPDATE anti-concurrence)
    SELECT * INTO v_quote_record FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Devis introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- 2. Vérification : Seul le demandeur (Client) peut accepter le devis
    IF v_quote_record.requester_id != v_my_id THEN
        RAISE EXCEPTION 'Seul le demandeur de la prestation peut accepter ce devis' USING ERRCODE = '42501';
    END IF;

    -- 3. Vérification : Seul un devis au statut SENT peut être accepté
    IF v_quote_record.status IS DISTINCT FROM 'SENT' THEN
        RAISE EXCEPTION
          'Le devis ne peut plus être accepté (statut actuel: %)',
          COALESCE(v_quote_record.status, 'NULL')
          USING ERRCODE = '22000';
    END IF;

    -- 4. Vérification de l'expiration du devis (valid_until)
    IF v_quote_record.valid_until IS NOT NULL AND v_quote_record.valid_until < now() THEN
        RAISE EXCEPTION
          'Le devis a expiré (date limite: %)',
          v_quote_record.valid_until
          USING ERRCODE = '22000';
    END IF;

    -- 5. Récupération et vérification de la demande liée (requests.title requis pour missions.title)
    SELECT * INTO v_req_record FROM public.requests WHERE id = v_quote_record.request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La demande liée est introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_req_record.status IS DISTINCT FROM 'OPEN' THEN
        RAISE EXCEPTION
          'La demande liée n''est plus ouverte (statut actuel: %)',
          COALESCE(v_req_record.status, 'NULL')
          USING ERRCODE = '22000';
    END IF;

    -- 6. Vérification d'unicité basée sur request_invitation_id
    IF EXISTS (
        SELECT 1 FROM public.missions
        WHERE request_invitation_id = v_quote_record.request_invitation_id
          AND status != 'CANCELLED'
    ) THEN
        RAISE EXCEPTION
          'Une mission a déjà été créée et acceptée pour cette invitation'
          USING ERRCODE = '40001';
    END IF;

    -- 7. Verrouillage du devis (statut ACCEPTED)
    UPDATE public.quotes
    SET status = 'ACCEPTED',
        updated_at = now()
    WHERE id = p_quote_id
      AND status = 'SENT';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Impossible d''accepter le devis (concurrence ou statut déjà modifié)' USING ERRCODE = '40001';
    END IF;

    -- 8. Création atomique de la mission liée (sur colonnes réelles de missions uniquement)
    BEGIN
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
            COALESCE(NULLIF(TRIM(v_req_record.title), ''), 'Mission LYANN'),
            'AGREED',
            v_quote_record.total_amount,
            now(),
            now()
        )
        RETURNING id INTO v_mission_id;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION
          'Une mission active a déjà été créée pour cette invitation'
          USING ERRCODE = '40001';
    END;

    -- 9. Liaison de la mission sur le devis
    UPDATE public.quotes SET mission_id = v_mission_id WHERE id = p_quote_id;

    RETURN jsonb_build_object(
        'success', true,
        'quote_id', p_quote_id,
        'mission_id', v_mission_id,
        'request_id', v_quote_record.request_id,
        'request_invitation_id', v_quote_record.request_invitation_id,
        'status', 'ACCEPTED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_request_quote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_request_quote(uuid) TO authenticated, service_role;
