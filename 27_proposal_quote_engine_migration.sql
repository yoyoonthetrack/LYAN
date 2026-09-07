-- ============================================================================
-- LYANN DOM — 27_PROPOSAL_QUOTE_ENGINE_MIGRATION.SQL (HARDENED V2)
-- Migration pour le Moteur de Propositions & Devis (Step 18)
-- ============================================================================

-- 1. ADAPTATION DU CHECK CONSTRAINT SUR PUBLIC.QUOTES (AJOUT DES STATUTS WITHDRAWN ET SUPERSEDED)
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS check_quotes_status;
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_check;

ALTER TABLE public.quotes ADD CONSTRAINT check_quotes_status
CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'WITHDRAWN', 'SUPERSEDED'));

-- Contrainte d'unicité de version par invitation sur public.quotes
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_invitation_version
ON public.quotes(request_invitation_id, version)
WHERE request_invitation_id IS NOT NULL;


-- 2. RPC : CRÉATION SÉCURISÉE D'UNE PROPOSITION (PROPOSAL ENGINE WITH SUPERSEDED & CONCURRENCY LOCK)
-- Calcul automatique des montants et frais en centimes entiers (Client 3%, Prestataire 3%)
CREATE OR REPLACE FUNCTION public.create_proposal_secure(
    p_conversation_id uuid,
    p_description text DEFAULT NULL,
    p_valid_until_days int DEFAULT 14,
    p_items_json jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_proposer_id uuid;
    v_inv_record record;
    v_req_status text;
    v_quote_id uuid;
    v_quote_num text;
    v_version int := 1;
    
    -- Calculs financiers en centimes entiers
    v_subtotal_cents bigint := 0;
    v_client_fee_cents bigint := 0;
    v_total_client_cents bigint := 0;
    v_helper_fee_cents bigint := 0;
    v_helper_net_cents bigint := 0;

    v_item_elem jsonb;
    v_item_title text;
    v_item_desc text;
    v_item_qty numeric;
    v_unit_price_cents bigint;
    v_item_amount_cents bigint;
    v_item_order int := 1;
BEGIN
    v_proposer_id := auth.uid();
    IF v_proposer_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    -- Contrôle 1 : L'utilisateur doit être un participant légitime de la conversation
    IF NOT public.is_current_user_conversation_participant(p_conversation_id) 
       AND NOT public.is_current_user_admin() THEN
        RAISE EXCEPTION 'Accès refusé à cette conversation' USING ERRCODE = '42501';
    END IF;

    -- Contrôle 2 : Récupération et VERROUILLAGE (FOR UPDATE) de l'invitation canonique
    SELECT 
        ri.id, ri.request_id, ri.requester_id, ri.recipient_id, ri.status
    INTO v_inv_record
    FROM public.request_invitations ri
    WHERE ri.conversation_id = p_conversation_id
      AND (ri.requester_id = v_proposer_id OR ri.recipient_id = v_proposer_id OR public.is_current_user_admin())
    ORDER BY ri.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_inv_record.id IS NULL THEN
        RAISE EXCEPTION 'Aucun Lyann lié à cette conversation' USING ERRCODE = 'P0002';
    END IF;

    -- Contrôle 3 : Empêcher le demandeur de se faire une proposition à lui-même
    IF v_inv_record.requester_id = v_proposer_id THEN
        RAISE EXCEPTION 'Le demandeur ne peut pas créer de proposition sur son propre Lyann' USING ERRCODE = '42501';
    END IF;

    -- Contrôle 4 : Vérification de l'état du Lyann (doit être OPEN)
    SELECT status INTO v_req_status FROM public.requests WHERE id = v_inv_record.request_id;
    IF v_req_status IS DISTINCT FROM 'OPEN' THEN
        RAISE EXCEPTION 'Ce Lyann n''est plus ouvert aux propositions (statut: %)', COALESCE(v_req_status, 'INCONNU') USING ERRCODE = '22000';
    END IF;

    -- Contrôle 5 : Validation des lignes de devis et calcul en centimes
    IF jsonb_array_length(p_items_json) = 0 THEN
        RAISE EXCEPTION 'Une proposition doit comporter au moins une ligne de prestation' USING ERRCODE = '22000';
    END IF;

    FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items_json) LOOP
        v_item_qty := COALESCE((v_item_elem->>'quantity')::numeric, 1);
        
        -- Extraction du prix unitaire en centimes
        IF v_item_elem ? 'unit_price_cents' THEN
            v_unit_price_cents := (v_item_elem->>'unit_price_cents')::bigint;
        ELSE
            v_unit_price_cents := ROUND(((v_item_elem->>'unit_price')::numeric) * 100)::bigint;
        END IF;

        IF v_unit_price_cents <= 0 OR v_item_qty <= 0 THEN
            RAISE EXCEPTION 'Le prix unitaire et la quantité doivent être strictement positifs' USING ERRCODE = '22000';
        END IF;

        v_item_amount_cents := ROUND(v_item_qty * v_unit_price_cents)::bigint;
        v_subtotal_cents := v_subtotal_cents + v_item_amount_cents;
    END LOOP;

    IF v_subtotal_cents <= 0 THEN
        RAISE EXCEPTION 'Le sous-total de la proposition doit être supérieur à 0' USING ERRCODE = '22000';
    END IF;

    -- CALCUL DES FRAIS SÉCURISÉS EN CENTIMES (Client 3%, Prestataire 3%)
    v_client_fee_cents := ROUND(v_subtotal_cents * 0.03)::bigint;
    v_total_client_cents := v_subtotal_cents + v_client_fee_cents;

    v_helper_fee_cents := ROUND(v_subtotal_cents * 0.03)::bigint;
    v_helper_net_cents := v_subtotal_cents - v_helper_fee_cents;

    -- HARDENING 1 : Passer automatiquement les anciennes propositions 'SENT' -> 'SUPERSEDED'
    UPDATE public.quotes
    SET status = 'SUPERSEDED',
        updated_at = now()
    WHERE request_invitation_id = v_inv_record.id
      AND status = 'SENT';

    -- HARDENING 2 : Calcul de la version sérialisée et atomique (MAX(version) + 1)
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
    FROM public.quotes
    WHERE request_invitation_id = v_inv_record.id;

    v_quote_num := 'PROP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4)) || '-V' || v_version;

    -- Insertion de la nouvelle version de proposition dans public.quotes
    BEGIN
        INSERT INTO public.quotes (
            request_id,
            request_invitation_id,
            conversation_id,
            requester_id,
            provider_id,
            quote_number,
            description,
            details,
            amount,
            total_amount,
            status,
            version,
            valid_until,
            created_at,
            updated_at
        ) VALUES (
            v_inv_record.request_id,
            v_inv_record.id,
            p_conversation_id,
            v_inv_record.requester_id,
            v_proposer_id,
            v_quote_num,
            p_description,
            p_description,
            (v_subtotal_cents::numeric / 100.0),
            (v_total_client_cents::numeric / 100.0),
            'SENT',
            v_version,
            now() + (COALESCE(p_valid_until_days, 14) || ' days')::interval,
            now(),
            now()
        )
        RETURNING id INTO v_quote_id;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Concurrence lors de la création de version' USING ERRCODE = '40001';
    END;

    -- Insertion des lignes dans public.milestones
    FOR v_item_elem IN SELECT * FROM jsonb_array_elements(p_items_json) LOOP
        v_item_title := COALESCE(v_item_elem->>'label', v_item_elem->>'title', 'Prestation ' || v_item_order);
        v_item_desc := v_item_elem->>'description';
        v_item_qty := COALESCE((v_item_elem->>'quantity')::numeric, 1);
        
        IF v_item_elem ? 'unit_price_cents' THEN
            v_unit_price_cents := (v_item_elem->>'unit_price_cents')::bigint;
        ELSE
            v_unit_price_cents := ROUND(((v_item_elem->>'unit_price')::numeric) * 100)::bigint;
        END IF;

        v_item_amount_cents := ROUND(v_item_qty * v_unit_price_cents)::bigint;

        INSERT INTO public.milestones (
            quote_id,
            title,
            description,
            amount,
            display_order,
            status,
            created_at,
            updated_at
        ) VALUES (
            v_quote_id,
            v_item_title,
            v_item_desc,
            (v_item_amount_cents::numeric / 100.0),
            v_item_order,
            'PENDING',
            now(),
            now()
        );

        v_item_order := v_item_order + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'proposal_id', v_quote_id,
        'quote_number', v_quote_num,
        'version', v_version,
        'status', 'SENT',
        'request_id', v_inv_record.request_id,
        'requester_id', v_inv_record.requester_id,
        'proposer_id', v_proposer_id,
        'subtotal_cents', v_subtotal_cents,
        'client_fee_cents', v_client_fee_cents,
        'total_client_cents', v_total_client_cents,
        'helper_fee_cents', v_helper_fee_cents,
        'helper_net_cents', v_helper_net_cents,
        'subtotal_eur', (v_subtotal_cents::numeric / 100.0),
        'total_client_eur', (v_total_client_cents::numeric / 100.0),
        'helper_net_eur', (v_helper_net_cents::numeric / 100.0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_proposal_secure(uuid, text, int, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_proposal_secure(uuid, text, int, jsonb) TO authenticated, service_role;


-- 3. RPC : ACCEPTATION SÉCURISÉE D'UNE PROPOSITION
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


-- 4. RPC : REFUS SÉCURISÉ D'UNE PROPOSITION
CREATE OR REPLACE FUNCTION public.reject_proposal_secure(
    p_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_quote_record record;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_quote_record FROM public.quotes WHERE id = p_proposal_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Proposition introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_quote_record.requester_id != v_user_id THEN
        RAISE EXCEPTION 'Seul le demandeur peut refuser cette proposition' USING ERRCODE = '42501';
    END IF;

    IF v_quote_record.status IS DISTINCT FROM 'SENT' THEN
        RAISE EXCEPTION 'La proposition ne peut plus être refusée (statut actuel: %)', v_quote_record.status USING ERRCODE = '22000';
    END IF;

    UPDATE public.quotes
    SET status = 'REJECTED',
        updated_at = now()
    WHERE id = p_proposal_id
      AND status = 'SENT';

    RETURN jsonb_build_object(
        'success', true,
        'proposal_id', p_proposal_id,
        'status', 'REJECTED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_proposal_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_proposal_secure(uuid) TO authenticated, service_role;


-- 5. RPC : RETRAIT D'UNE PROPOSITION PAR LE PRESTATAIRE
CREATE OR REPLACE FUNCTION public.withdraw_proposal_secure(
    p_proposal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_quote_record record;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_quote_record FROM public.quotes WHERE id = p_proposal_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Proposition introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_quote_record.provider_id != v_user_id THEN
        RAISE EXCEPTION 'Seul le prestataire auteur peut retirer cette proposition' USING ERRCODE = '42501';
    END IF;

    IF v_quote_record.status IS DISTINCT FROM 'SENT' THEN
        RAISE EXCEPTION 'La proposition ne peut plus être retirée (statut actuel: %)', v_quote_record.status USING ERRCODE = '22000';
    END IF;

    UPDATE public.quotes
    SET status = 'WITHDRAWN',
        updated_at = now()
    WHERE id = p_proposal_id
      AND status = 'SENT';

    RETURN jsonb_build_object(
        'success', true,
        'proposal_id', p_proposal_id,
        'status', 'WITHDRAWN'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_proposal_secure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_proposal_secure(uuid) TO authenticated, service_role;


-- 6. RPC : LECTURE DES PROPOSITIONS D'UNE CONVERSATION
CREATE OR REPLACE FUNCTION public.get_conversation_proposals(
    p_conversation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_proposals jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    IF NOT public.is_current_user_conversation_participant(p_conversation_id) 
       AND NOT public.is_current_user_admin() THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', q.id,
            'quote_number', q.quote_number,
            'version', q.version,
            'description', q.description,
            'subtotal_eur', q.amount,
            'total_client_eur', q.total_amount,
            'status', q.status,
            'created_at', q.created_at,
            'valid_until', q.valid_until,
            'requester_id', q.requester_id,
            'proposer_id', q.provider_id,
            'items', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', m.id,
                        'title', m.title,
                        'description', m.description,
                        'amount_eur', m.amount,
                        'display_order', m.display_order
                    ) ORDER BY m.display_order ASC
                )
                FROM public.milestones m
                WHERE m.quote_id = q.id
            )
        ) ORDER BY q.version DESC, q.created_at DESC
    ) INTO v_proposals
    FROM public.quotes q
    WHERE q.conversation_id = p_conversation_id;

    RETURN COALESCE(v_proposals, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_conversation_proposals(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_conversation_proposals(uuid) TO authenticated, service_role;
