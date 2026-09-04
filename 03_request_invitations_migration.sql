-- ============================================================================
-- LYANN DOM — 03_REQUEST_INVITATIONS_MIGRATION.SQL (V2 SÉCURISÉE)
-- Migration autonome, idempotente et renforcée pour le système d'invitations :
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

-- 2. ACTIVATION & POLITIQUES RLS SUR REQUEST_INVITATIONS (VERROUILLAGE DES MUTATIONS DIRECTES)
ALTER TABLE public.request_invitations ENABLE ROW LEVEL SECURITY;

-- Nettoyage de toutes les anciennes politiques d'écriture directe pour les utilisateurs standards
DROP POLICY IF EXISTS "Participants can view request invitations" ON public.request_invitations;
DROP POLICY IF EXISTS "Requesters can insert request invitations" ON public.request_invitations;
DROP POLICY IF EXISTS "Participants can update request invitations" ON public.request_invitations;
DROP POLICY IF EXISTS "Requesters can delete request invitations" ON public.request_invitations;

-- Seule la LECTURE est autorisée directement pour les utilisateurs participants
CREATE POLICY "Participants can view request invitations"
ON public.request_invitations FOR SELECT
USING (
    auth.uid() = requester_id OR auth.uid() = recipient_id
);

-- AUCUNE politique INSERT, UPDATE ou DELETE n'est créée pour les utilisateurs standards.
-- Toutes les mutations passent EXCLUSIVEMENT par les RPC SECURITY DEFINER ci-dessous.


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

    -- Vérification de la demande
    SELECT * INTO v_req_record FROM public.requests WHERE id = p_request_id;
    IF v_req_record.id IS NULL THEN
        RAISE EXCEPTION 'Demande introuvable' USING ERRCODE = 'P0002';
    END IF;

    -- Vérification de la propriété de la demande
    IF v_req_record.requester_id != v_my_id THEN
        RAISE EXCEPTION 'Seul l''auteur de la demande peut envoyer des invitations' USING ERRCODE = '42501';
    END IF;

    -- CORRECTION SÉCURITÉ 3 : La demande doit obligatoirement être encore OPEN
    IF COALESCE(v_req_record.status, 'OPEN') != 'OPEN' THEN
        RAISE EXCEPTION 'La demande n''est plus ouverte aux invitations (statut actuel: %)', v_req_record.status USING ERRCODE = '22000';
    END IF;

    IF ARRAY_LENGTH(p_recipient_ids, 1) IS NULL OR ARRAY_LENGTH(p_recipient_ids, 1) = 0 THEN
        RETURN jsonb_build_object('success', true, 'inserted_count', 0);
    END IF;

    FOREACH v_recipient_id IN ARRAY p_recipient_ids LOOP
        -- Protection contre l'auto-invitation
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


-- 4. RPC 2 : ACCEPTATION SÉCURISÉE AVEC VERROUILLAGE DES TRANSITIONS DE STATUT
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

    -- CORRECTION SÉCURITÉ 2 : Seuls les statuts PENDING et VIEWED peuvent être acceptés
    IF v_inv_record.status NOT IN ('PENDING', 'VIEWED') THEN
        RAISE EXCEPTION 'L''invitation ne peut plus être acceptée (statut actuel: %)', v_inv_record.status USING ERRCODE = '22000';
    END IF;

    -- Récupération ou création atomique de la conversation entre le demandeur et le lyanneur
    v_conv_id := public.get_or_create_conversation(v_inv_record.requester_id);

    -- Mise à jour atomique conditionnelle au statut PENDING/VIEWED
    UPDATE public.request_invitations
    SET status = 'ACCEPTED',
        conversation_id = v_conv_id,
        responded_at = now(),
        updated_at = now()
    WHERE id = p_invitation_id
      AND recipient_id = v_my_id
      AND status IN ('PENDING', 'VIEWED');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Impossible d''accepter l''invitation (concurrence ou statut déjà modifié)' USING ERRCODE = '40001';
    END IF;

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


-- 5. RPC 3 : REFUS SÉCURISÉ AVEC VERROUILLAGE DES TRANSITIONS DE STATUT
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

    -- CORRECTION SÉCURITÉ 2 : Seuls les statuts PENDING et VIEWED peuvent être déclinés
    IF v_inv_record.status NOT IN ('PENDING', 'VIEWED') THEN
        RAISE EXCEPTION 'L''invitation ne peut plus être déclinée (statut actuel: %)', v_inv_record.status USING ERRCODE = '22000';
    END IF;

    -- Mise à jour atomique conditionnelle au statut PENDING/VIEWED
    UPDATE public.request_invitations
    SET status = 'DECLINED',
        responded_at = now(),
        updated_at = now()
    WHERE id = p_invitation_id
      AND recipient_id = v_my_id
      AND status IN ('PENDING', 'VIEWED');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Impossible de décliner l''invitation (concurrence ou statut déjà modifié)' USING ERRCODE = '40001';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'invitation_id', p_invitation_id,
        'status', 'DECLINED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.decline_request_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_request_invitation(uuid) TO authenticated, service_role;


-- 6. PERMISSIONS DE TABLE (LECTURE SEULE POUR UTILISATEURS AUTHENTIFIÉS, ALL POUR SERVICE_ROLE)
REVOKE ALL ON public.request_invitations FROM PUBLIC;
GRANT SELECT ON public.request_invitations TO authenticated;
GRANT ALL ON public.request_invitations TO service_role;
