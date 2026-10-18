-- Rollback 58. The active-quote EXISTS refusal returns 40001 again.
-- The unique index is not dropped. Does not DELETE quotes.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_request_quote(
    p_invitation_id uuid,
    p_description text DEFAULT NULL,
    p_valid_until timestamptz DEFAULT NULL,
    p_milestones_json jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_inv_record record;
    v_req_status text;
    v_quote_id uuid;
    v_quote_num text;
    v_next_version int := 1;
    v_total_amount numeric := 0;
    v_calculated_sum numeric := 0;
    v_m_elem jsonb;
    v_m_title text;
    v_m_desc text;
    v_m_amount numeric;
    v_m_percent numeric;
    v_m_order int := 1;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_inv_record FROM public.request_invitations WHERE id = p_invitation_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_inv_record.recipient_id != v_my_id THEN
        RAISE EXCEPTION 'Seul le Lyanneur invité peut créer un devis pour ce besoin' USING ERRCODE = '42501';
    END IF;

    IF v_inv_record.status IS DISTINCT FROM 'ACCEPTED' THEN
        RAISE EXCEPTION
          'L''invitation doit être acceptée avant de pouvoir soumettre un devis (statut actuel: %)',
          COALESCE(v_inv_record.status, 'NULL')
          USING ERRCODE = '22000';
    END IF;

    SELECT status INTO v_req_status FROM public.requests WHERE id = v_inv_record.request_id;
    IF v_req_status IS DISTINCT FROM 'OPEN' THEN
        RAISE EXCEPTION
          'La demande liée n''est plus ouverte (statut actuel: %)',
          COALESCE(v_req_status, 'NULL')
          USING ERRCODE = '22000';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.quotes
        WHERE request_invitation_id = p_invitation_id
          AND status IN ('SENT', 'ACCEPTED')
    ) THEN
        RAISE EXCEPTION
          'Un devis actif (SENT ou ACCEPTED) existe déjà pour cette invitation'
          USING ERRCODE = '40001';
    END IF;

    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.quotes
    WHERE request_invitation_id = p_invitation_id;

    IF jsonb_array_length(p_milestones_json) > 0 THEN
        FOR v_m_elem IN SELECT * FROM jsonb_array_elements(p_milestones_json) LOOP
            v_m_amount := (v_m_elem->>'amount')::numeric;
            IF v_m_amount IS NULL OR v_m_amount <= 0 THEN
                RAISE EXCEPTION 'Le montant d''un jalon doit être strictement supérieur à 0' USING ERRCODE = '22000';
            END IF;
            v_calculated_sum := v_calculated_sum + v_m_amount;
        END LOOP;
        v_total_amount := v_calculated_sum;
    ELSE
        RAISE EXCEPTION 'Un devis doit comporter au moins un jalon de prestation' USING ERRCODE = '22000';
    END IF;

    IF v_total_amount <= 0 THEN
        RAISE EXCEPTION 'Le montant total du devis doit être supérieur à 0 €' USING ERRCODE = '22000';
    END IF;

    v_quote_num := 'DEV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4)) || '-V' || v_next_version;

    BEGIN
        INSERT INTO public.quotes (
            request_id, request_invitation_id, conversation_id, requester_id, provider_id,
            quote_number, description, details, amount, total_amount, status, version,
            valid_until, created_at, updated_at
        ) VALUES (
            v_inv_record.request_id, p_invitation_id, v_inv_record.conversation_id,
            v_inv_record.requester_id, v_my_id, v_quote_num, p_description, p_description,
            v_total_amount, v_total_amount, 'SENT', v_next_version,
            COALESCE(p_valid_until, now() + interval '30 days'), now(), now()
        )
        RETURNING id INTO v_quote_id;

        FOR v_m_elem IN SELECT * FROM jsonb_array_elements(p_milestones_json) LOOP
            v_m_title := COALESCE(v_m_elem->>'title', 'Jalon ' || v_m_order);
            v_m_desc := v_m_elem->>'description';
            v_m_amount := (v_m_elem->>'amount')::numeric;
            v_m_percent := (v_m_elem->>'percentage')::numeric;
            INSERT INTO public.milestones (
                quote_id, title, description, amount, percentage, display_order, status, created_at, updated_at
            ) VALUES (
                v_quote_id, v_m_title, v_m_desc, v_m_amount, v_m_percent, v_m_order, 'PENDING', now(), now()
            );
            v_m_order := v_m_order + 1;
        END LOOP;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION
          'Un devis actif (SENT/ACCEPTED) ou cette version existe déjà pour cette invitation'
          USING ERRCODE = '40001';
    END;

    RETURN jsonb_build_object(
        'success', true,
        'quote_id', v_quote_id,
        'quote_number', v_quote_num,
        'version', v_next_version,
        'total_amount', v_total_amount,
        'request_id', v_inv_record.request_id,
        'status', 'SENT'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_request_quote(uuid, text, timestamptz, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_request_quote(uuid, text, timestamptz, jsonb) TO authenticated, service_role;

COMMIT;
