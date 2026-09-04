-- ============================================================================
-- LYANN DOM — 03_REQUEST_INVITATIONS_MIGRATION.SQL
-- Migration autonome et idempotente pour le système d'invitations directes :
-- MATCHING → SÉLECTION → INVITATION
-- ============================================================================

-- 1. CRÉATION DE LA TABLE REQUEST_INVITATIONS
CREATE TABLE IF NOT EXISTS public.request_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VIEWED', 'ACCEPTED', 'DECLINED', 'CANCELLED')),
    conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
    sent_at timestamptz NOT NULL DEFAULT now(),
    viewed_at timestamptz,
    responded_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unique_request_recipient UNIQUE(request_id, recipient_id)
);

-- Index d'optimisation
CREATE INDEX IF NOT EXISTS idx_request_invitations_request ON public.request_invitations(request_id);
CREATE INDEX IF NOT EXISTS idx_request_invitations_recipient ON public.request_invitations(recipient_id);
CREATE INDEX IF NOT EXISTS idx_request_invitations_requester ON public.request_invitations(requester_id);

-- 2. ACTIVATION & POLITIQUES RLS SUR REQUEST_INVITATIONS
ALTER TABLE public.request_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view request invitations" ON public.request_invitations;
CREATE POLICY "Participants can view request invitations"
ON public.request_invitations FOR SELECT
USING (
    auth.uid() = requester_id OR auth.uid() = recipient_id
);

DROP POLICY IF EXISTS "Requesters can insert request invitations" ON public.request_invitations;
CREATE POLICY "Requesters can insert request invitations"
ON public.request_invitations FOR INSERT
WITH CHECK (
    auth.uid() = requester_id
);

DROP POLICY IF EXISTS "Participants can update request invitations" ON public.request_invitations;
CREATE POLICY "Participants can update request invitations"
ON public.request_invitations FOR UPDATE
USING (
    auth.uid() = requester_id OR auth.uid() = recipient_id
);

DROP POLICY IF EXISTS "Requesters can delete request invitations" ON public.request_invitations;
CREATE POLICY "Requesters can delete request invitations"
ON public.request_invitations FOR DELETE
USING (
    auth.uid() = requester_id
);

-- 3. RPC 1 : ENVOI ATOMIQUE DES INVITATIONS PAR LE DEMANDEUR
CREATE OR REPLACE FUNCTION public.send_request_invitations(
    p_request_id uuid,
    p_recipient_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_req_record record;
    v_recipient_id uuid;
    v_inserted_count int := 0;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_req_record FROM public.requests WHERE id = p_request_id;
    IF v_req_record.id IS NULL THEN
        RAISE EXCEPTION 'Demande introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_req_record.requester_id != v_my_id THEN
        RAISE EXCEPTION 'Seul l''auteur de la demande peut envoyer des invitations' USING ERRCODE = '42501';
    END IF;

    IF ARRAY_LENGTH(p_recipient_ids, 1) IS NULL OR ARRAY_LENGTH(p_recipient_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', true, 'inserted_count', 0);
    END IF;

    FOREACH v_recipient_id IN ARRAY p_recipient_ids LOOP
        IF v_recipient_id = v_my_id THEN
            CONTINUE;
        END IF;

        IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_recipient_id) THEN
            INSERT INTO public.request_invitations (request_id, requester_id, recipient_id, status)
            VALUES (p_request_id, v_my_id, v_recipient_id, 'PENDING')
            ON CONFLICT (request_id, recipient_id) DO NOTHING;

            IF FOUND THEN
                v_inserted_count := v_inserted_count + 1;
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'request_id', p_request_id,
        'inserted_count', v_inserted_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.send_request_invitations(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_request_invitations(uuid, uuid[]) TO authenticated, service_role;

-- 4. RPC 2 : ACCEPTATION SÉCURISÉE DE L'INVITATION PAR LE LYANNEUR
CREATE OR REPLACE FUNCTION public.accept_request_invitation(
    p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_inv_record record;
    v_conv_id uuid;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_inv_record FROM public.request_invitations WHERE id = p_invitation_id;
    IF v_inv_record.id IS NULL THEN
        RAISE EXCEPTION 'Invitation introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_inv_record.recipient_id != v_my_id THEN
        RAISE EXCEPTION 'Action non autorisée sur cette invitation' USING ERRCODE = '42501';
    END IF;

    -- Récupération ou création atomique de la conversation entre le demandeur et le lyanneur
    v_conv_id := public.get_or_create_conversation(v_inv_record.requester_id);

    UPDATE public.request_invitations
    SET status = 'ACCEPTED',
        conversation_id = v_conv_id,
        responded_at = now(),
        updated_at = now()
    WHERE id = p_invitation_id;

    RETURN jsonb_build_object(
        'success', true,
        'invitation_id', p_invitation_id,
        'conversation_id', v_conv_id,
        'request_id', v_inv_record.request_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_request_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_request_invitation(uuid) TO authenticated, service_role;

-- 5. RPC 3 : REFUS SÉCURISÉ DE L'INVITATION PAR LE LYANNEUR
CREATE OR REPLACE FUNCTION public.decline_request_invitation(
    p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_inv_record record;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_inv_record FROM public.request_invitations WHERE id = p_invitation_id;
    IF v_inv_record.id IS NULL THEN
        RAISE EXCEPTION 'Invitation introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_inv_record.recipient_id != v_my_id THEN
        RAISE EXCEPTION 'Action non autorisée sur cette invitation' USING ERRCODE = '42501';
    END IF;

    UPDATE public.request_invitations
    SET status = 'DECLINED',
        responded_at = now(),
        updated_at = now()
    WHERE id = p_invitation_id;

    RETURN jsonb_build_object(
        'success', true,
        'invitation_id', p_invitation_id,
        'status', 'DECLINED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.decline_request_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_request_invitation(uuid) TO authenticated, service_role;

-- 6. AUTORISATIONS DE TABLE
GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_invitations TO authenticated, service_role;
