-- Direct conversations: contacting a profile does not surface an existing annonce.
-- A private service request stays out of Explorer. An offer can be sent without a public annonce.

ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS started_by uuid,
    ADD COLUMN IF NOT EXISTS context_mode text DEFAULT 'request';

ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_context_mode_check;
ALTER TABLE public.conversations
    ADD CONSTRAINT conversations_context_mode_check CHECK (context_mode IN ('request', 'direct'));

UPDATE public.conversations c
SET started_by = first_sender.sender_id
FROM (
    SELECT DISTINCT ON (conversation_id) conversation_id, sender_id
    FROM public.messages
    WHERE sender_id IS NOT NULL
    ORDER BY conversation_id, created_at ASC
) AS first_sender
WHERE c.id = first_sender.conversation_id
  AND c.started_by IS NULL;

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(
    p_target_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_conv_id uuid;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;
    IF v_my_id = p_target_user_id THEN
        RAISE EXCEPTION 'Impossible de créer une conversation avec soi-même' USING ERRCODE = '22000';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
        RAISE EXCEPTION 'Utilisateur destinataire introuvable' USING ERRCODE = '23503';
    END IF;

    SELECT cp1.conversation_id INTO v_conv_id
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2 ON cp1.conversation_id = cp2.conversation_id
    WHERE cp1.user_id = v_my_id
      AND cp2.user_id = p_target_user_id
      AND (
        SELECT COUNT(*) FROM public.conversation_participants cp3
        WHERE cp3.conversation_id = cp1.conversation_id
      ) = 2
    LIMIT 1;

    IF v_conv_id IS NOT NULL THEN
        RETURN v_conv_id;
    END IF;

    INSERT INTO public.conversations (started_by, context_mode)
    VALUES (v_my_id, 'direct')
    RETURNING id INTO v_conv_id;

    INSERT INTO public.conversation_participants (conversation_id, user_id)
    VALUES (v_conv_id, v_my_id), (v_conv_id, p_target_user_id);

    RETURN v_conv_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_direct_conversation(p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_conv_id uuid;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;
    v_conv_id := public.get_or_create_conversation(p_target_user_id);
    UPDATE public.conversations
    SET context_mode = 'direct',
        started_by = v_my_id
    WHERE id = v_conv_id;
    RETURN jsonb_build_object(
        'conversation_id', v_conv_id,
        'started_by', v_my_id,
        'direct', true
    );
END;
$$;

-- The person who was contacted can attach a quote without a public annonce.
CREATE OR REPLACE FUNCTION public.prepare_direct_offer(p_other_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_conv_id uuid;
    v_request_id uuid;
    v_invitation_id uuid;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;
    IF p_other_user IS NULL OR p_other_user = v_my_id THEN
        RAISE EXCEPTION 'Destinataire invalide' USING ERRCODE = '22000';
    END IF;

    v_conv_id := public.get_or_create_conversation(p_other_user);

    SELECT r.id, ri.id
    INTO v_request_id, v_invitation_id
    FROM public.request_invitations ri
    JOIN public.requests r ON r.id = ri.request_id
    WHERE ri.conversation_id = v_conv_id
      AND ri.recipient_id = v_my_id
      AND ri.requester_id = p_other_user
      AND ri.status = 'ACCEPTED'
      AND r.status = 'OPEN'
      AND (r.visibility = 'DIRECT' OR r.target_user_id = v_my_id)
    ORDER BY ri.created_at DESC
    LIMIT 1;

    IF v_invitation_id IS NULL THEN
        INSERT INTO public.requests (
            requester_id, title, description, category, location, status,
            visibility, target_user_id, urgency, date_mode, price_mode,
            safety_status, classification_status
        ) VALUES (
            p_other_user, 'Service direct', 'Offre envoyée dans la conversation.', 'Général', 'Guadeloupe', 'OPEN',
            'DIRECT', v_my_id, 'flexible', 'FLEXIBLE', 'QUOTE',
            'SAFE', 'UNCLASSIFIED'
        )
        RETURNING id INTO v_request_id;

        INSERT INTO public.request_invitations (
            request_id, requester_id, recipient_id, conversation_id, status, sent_at, responded_at, updated_at
        ) VALUES (
            v_request_id, p_other_user, v_my_id, v_conv_id, 'ACCEPTED', now(), now(), now()
        )
        RETURNING id INTO v_invitation_id;
    END IF;

    UPDATE public.conversations SET context_mode = 'direct' WHERE id = v_conv_id;

    RETURN jsonb_build_object(
        'invitation_id', v_invitation_id,
        'request_id', v_request_id,
        'conversation_id', v_conv_id
    );
END;
$$;

-- The initiator chooses whether the request stays in the thread or also goes to Explorer.
CREATE OR REPLACE FUNCTION public.bind_conversation_request(
    p_request_id uuid,
    p_recipient_id uuid,
    p_visibility text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_conv_id uuid;
    v_invitation_id uuid;
    v_visibility text;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;
    IF p_recipient_id IS NULL OR p_recipient_id = v_my_id THEN
        RAISE EXCEPTION 'Destinataire invalide' USING ERRCODE = '22000';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.requests
        WHERE id = p_request_id AND requester_id = v_my_id AND status = 'OPEN'
    ) THEN
        RAISE EXCEPTION 'Demande introuvable' USING ERRCODE = 'P0002';
    END IF;

    v_visibility := CASE WHEN upper(COALESCE(p_visibility, 'DIRECT')) = 'PUBLIC' THEN 'PUBLIC' ELSE 'DIRECT' END;
    v_conv_id := public.get_or_create_conversation(p_recipient_id);

    UPDATE public.requests
    SET visibility = v_visibility,
        target_user_id = CASE WHEN v_visibility = 'DIRECT' THEN p_recipient_id ELSE NULL END
    WHERE id = p_request_id;

    INSERT INTO public.request_invitations (
        request_id, requester_id, recipient_id, conversation_id, status, sent_at, responded_at, updated_at
    ) VALUES (
        p_request_id, v_my_id, p_recipient_id, v_conv_id, 'ACCEPTED', now(), now(), now()
    )
    ON CONFLICT (request_id, recipient_id)
    DO UPDATE SET
        conversation_id = EXCLUDED.conversation_id,
        status = 'ACCEPTED',
        updated_at = now()
    RETURNING id INTO v_invitation_id;

    UPDATE public.conversations
    SET context_mode = CASE WHEN v_visibility = 'PUBLIC' THEN 'request' ELSE 'direct' END
    WHERE id = v_conv_id;

    RETURN jsonb_build_object(
        'invitation_id', v_invitation_id,
        'conversation_id', v_conv_id,
        'visibility', v_visibility
    );
END;
$$;

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
    v_mode text;
    v_started uuid;
    v_inv_record record;
    v_req_record record;
    v_profile_record record;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN NULL;
    END IF;

    IF NOT public.is_current_user_conversation_participant(p_conversation_id)
       AND NOT public.is_current_user_admin() THEN
        RETURN NULL;
    END IF;

    SELECT context_mode, started_by INTO v_mode, v_started
    FROM public.conversations
    WHERE id = p_conversation_id;

    SELECT
        ri.id AS invitation_id,
        ri.status AS invitation_status,
        ri.request_id,
        ri.requester_id,
        ri.recipient_id
    INTO v_inv_record
    FROM public.request_invitations ri
    JOIN public.requests r ON r.id = ri.request_id
    WHERE ri.conversation_id = p_conversation_id
      AND (ri.requester_id = v_user_id OR ri.recipient_id = v_user_id OR public.is_current_user_admin())
      AND (
        COALESCE(v_mode, 'request') <> 'direct'
        OR r.visibility = 'DIRECT'
        OR r.target_user_id IS NOT NULL
      )
    ORDER BY ri.created_at DESC
    LIMIT 1;

    IF v_inv_record.invitation_id IS NULL THEN
        IF COALESCE(v_mode, 'request') = 'direct' THEN
            RETURN jsonb_build_object('direct', true, 'started_by', v_started, 'request', NULL);
        END IF;
        RETURN NULL;
    END IF;

    SELECT id, title, description, category, location, budget, urgency, status, created_at, requester_id, visibility, target_user_id
    INTO v_req_record
    FROM public.requests
    WHERE id = v_inv_record.request_id;

    IF v_req_record.id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT id, first_name, last_name, avatar_url
    INTO v_profile_record
    FROM public.profiles
    WHERE id = v_req_record.requester_id;

    RETURN jsonb_build_object(
        'direct', COALESCE(v_mode, 'request') = 'direct' OR v_req_record.visibility = 'DIRECT' OR v_req_record.target_user_id IS NOT NULL,
        'started_by', v_started,
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
            'requester_id', v_req_record.requester_id,
            'visibility', v_req_record.visibility,
            'target_user_id', v_req_record.target_user_id
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

CREATE OR REPLACE FUNCTION public.initiate_lyann_help_conversation(p_request_id uuid)
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

    SELECT id, requester_id, status INTO v_req_record
    FROM public.requests
    WHERE id = p_request_id;

    IF v_req_record.id IS NULL THEN
        RAISE EXCEPTION 'Lyann introuvable' USING ERRCODE = 'P0002';
    END IF;
    IF COALESCE(v_req_record.status, '') != 'OPEN' THEN
        RAISE EXCEPTION 'Ce Lyann n''est plus ouvert aux propositions (statut actuel: %)', COALESCE(v_req_record.status, 'INCONNU')
        USING ERRCODE = '22000';
    END IF;

    v_requester_id := v_req_record.requester_id;
    IF v_requester_id = v_helper_id THEN
        RAISE EXCEPTION 'Vous ne pouvez pas répondre à votre propre Lyann' USING ERRCODE = '42501';
    END IF;

    v_conv_id := public.get_or_create_conversation(v_requester_id);
    UPDATE public.conversations SET context_mode = 'request' WHERE id = v_conv_id;

    INSERT INTO public.request_invitations (
        request_id, requester_id, recipient_id, conversation_id, status, sent_at, responded_at, updated_at
    ) VALUES (
        p_request_id, v_requester_id, v_helper_id, v_conv_id, 'ACCEPTED', now(), now(), now()
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

REVOKE ALL ON FUNCTION public.open_direct_conversation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_direct_offer(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bind_conversation_request(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_direct_conversation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_direct_offer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bind_conversation_request(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_conversation_request_context_secure(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.initiate_lyann_help_conversation(uuid) TO authenticated, service_role;
