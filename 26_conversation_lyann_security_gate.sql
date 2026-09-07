-- ============================================================================
-- LYANN DOM — 26_CONVERSATION_LYANN_SECURITY_GATE.SQL
-- Migration pour la sécurisation de la relation Conversation <-> Lyann (Request)
-- ============================================================================

-- 1. RPC : OBTENTION SÉCURISÉE DU CONTEXTE LYANN D'UNE CONVERSATION
-- Interdiction du fallback client : Seule la relation autorisée en BDD fait foi.
CREATE OR REPLACE FUNCTION public.get_conversation_request_context_secure(
    p_conversation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_inv_record record;
    v_req_record record;
    v_profile_record record;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Contrôle 1 : L'utilisateur doit être un participant légitime de la conversation
    IF NOT public.is_current_user_conversation_participant(p_conversation_id) 
       AND NOT public.is_current_user_admin() THEN
        RETURN NULL;
    END IF;

    -- Contrôle 2 : Recherche de la relation canonique dans request_invitations
    SELECT 
        ri.id AS invitation_id, 
        ri.status AS invitation_status, 
        ri.request_id, 
        ri.requester_id, 
        ri.recipient_id
    INTO v_inv_record
    FROM public.request_invitations ri
    WHERE ri.conversation_id = p_conversation_id
      AND (ri.requester_id = v_user_id OR ri.recipient_id = v_user_id OR public.is_current_user_admin())
    ORDER BY ri.created_at DESC
    LIMIT 1;

    IF v_inv_record.invitation_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Récupération sécurisée du Lyann (projection limitée aux champs publics utiles)
    SELECT 
        id, title, description, category, location, budget, urgency, status, created_at, requester_id
    INTO v_req_record
    FROM public.requests
    WHERE id = v_inv_record.request_id;

    IF v_req_record.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Récupération du profil public du demandeur
    SELECT id, first_name, last_name, avatar_url
    INTO v_profile_record
    FROM public.profiles
    WHERE id = v_req_record.requester_id;

    RETURN jsonb_build_object(
        'invitation_id', v_inv_record.invitation_id,
        'invitation_status', v_inv_record.invitation_status,
        'request_id', v_req_record.id,
        'requester_id', v_req_record.requester_id,
        'helper_id', CASE WHEN v_inv_record.requester_id = v_req_record.requester_id THEN v_inv_record.recipient_id ELSE v_inv_record.requester_id END,
        'request', jsonb_build_object(
            'id', v_req_record.id,
            'title', v_req_record.title,
            'description', v_req_record.description,
            'category', v_req_record.category,
            'location', v_req_record.location,
            'budget', v_req_record.budget,
            'urgency', v_req_record.urgency,
            'status', v_req_record.status,
            'created_at', v_req_record.created_at,
            'requester_id', v_req_record.requester_id
        ),
        'requester_profile', jsonb_build_object(
            'id', v_profile_record.id,
            'first_name', COALESCE(v_profile_record.first_name, 'Membre'),
            'last_name', v_profile_record.last_name,
            'avatar_url', v_profile_record.avatar_url
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_conversation_request_context_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_conversation_request_context_secure(uuid) TO authenticated, service_role;


-- 2. RPC : ACTION "JE PEUX AIDER" SÉCURISÉE ET ATOMIQUE
-- Dérivation stricte du requester depuis public.requests, blocage de l'auto-aide et idempotence.
CREATE OR REPLACE FUNCTION public.initiate_lyann_help_conversation(
    p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_helper_id uuid;
    v_req_record record;
    v_requester_id uuid;
    v_conv_id uuid;
    v_inv_id uuid;
BEGIN
    v_helper_id := auth.uid();
    IF v_helper_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    -- 1. Vérification de l'existence du Lyann
    SELECT id, requester_id, status INTO v_req_record
    FROM public.requests
    WHERE id = p_request_id;

    IF v_req_record.id IS NULL THEN
        RAISE EXCEPTION 'Lyann introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- 2. Vérification de l'état permettant une réponse ('OPEN')
    IF COALESCE(v_req_record.status, '') != 'OPEN' THEN
        RAISE EXCEPTION 'Ce Lyann n''est plus ouvert aux propositions (statut actuel: %)', COALESCE(v_req_record.status, 'INCONNU')
        USING ERRCODE = '22000';
    END IF;

    v_requester_id := v_req_record.requester_id;

    -- 3. Empêcher le requester de répondre à son propre Lyann
    IF v_requester_id = v_helper_id THEN
        RAISE EXCEPTION 'Vous ne pouvez pas répondre à votre propre Lyann' USING ERRCODE = '42501';
    END IF;

    -- 4. Récupérer ou créer la conversation unique entre le demandeur et l'intervenant
    v_conv_id := public.get_or_create_conversation(v_requester_id);

    -- 5. Persister / Mettre à jour la relation conversation <-> request de façon idempotente
    INSERT INTO public.request_invitations (
        request_id,
        requester_id,
        recipient_id,
        conversation_id,
        status,
        sent_at,
        responded_at,
        updated_at
    ) VALUES (
        p_request_id,
        v_requester_id,
        v_helper_id,
        v_conv_id,
        'ACCEPTED',
        now(),
        now(),
        now()
    )
    ON CONFLICT (request_id, recipient_id)
    DO UPDATE SET
        conversation_id = EXCLUDED.conversation_id,
        status = CASE WHEN public.request_invitations.status = 'DECLINED' THEN 'ACCEPTED' ELSE public.request_invitations.status END,
        updated_at = now()
    RETURNING id INTO v_inv_id;

    RETURN jsonb_build_object(
        'success', true,
        'conversation_id', v_conv_id,
        'invitation_id', v_inv_id,
        'request_id', p_request_id,
        'requester_id', v_requester_id,
        'helper_id', v_helper_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.initiate_lyann_help_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initiate_lyann_help_conversation(uuid) TO authenticated, service_role;
