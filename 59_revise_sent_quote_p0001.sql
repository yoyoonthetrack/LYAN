-- Staging only. Replaces revise_sent_quote so a stale version raises P0001.
-- Does not touch Production. Rollback is the previous definition saved at apply time.

CREATE OR REPLACE FUNCTION public.revise_sent_quote(
    p_quote_id uuid,
    p_description text,
    p_valid_until timestamptz,
    p_milestones_json jsonb,
    p_expected_version int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_quote public.quotes%ROWTYPE;
    v_current_version int;
    v_new_version int;
    v_description text;
    v_total numeric := 0;
    v_count int := 0;
    v_elem jsonb;
    v_amount numeric;
    v_title text;
    v_order int := 1;
    v_snapshot jsonb;
BEGIN
    -- PostgREST retries serialization_failure until the HTTP call dies. A stale version is a business refusal.
    PERFORM set_config('lock_timeout', '4s', true);
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_quote
    FROM public.quotes
    WHERE id = p_quote_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Devis introuvable' USING ERRCODE = 'P0002';
    END IF;
    IF v_quote.provider_id IS DISTINCT FROM v_my_id THEN
        RAISE EXCEPTION 'Seul l’auteur du devis peut le modifier.' USING ERRCODE = '42501';
    END IF;
    IF v_quote.status IS DISTINCT FROM 'SENT' THEN
        RAISE EXCEPTION 'Un devis accepté ou déjà clos ne peut pas être modifié.' USING ERRCODE = '22000';
    END IF;

    v_current_version := COALESCE(v_quote.version, 1);
    IF p_expected_version IS DISTINCT FROM v_current_version THEN
        RAISE EXCEPTION 'Ce devis a été modifié entre-temps. Rechargez la conversation avant de réessayer.'
            USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.milestones
        WHERE quote_id = p_quote_id
          AND status IN ('FUNDED', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'RELEASED', 'DISPUTED')
    ) THEN
        RAISE EXCEPTION 'Un jalon déjà engagé ne peut pas être modifié.' USING ERRCODE = '22000';
    END IF;

    IF to_regclass('public.payments') IS NOT NULL AND EXISTS (
        SELECT 1
        FROM public.payments p
        JOIN public.milestones m ON m.id = p.milestone_id
        WHERE m.quote_id = p_quote_id
    ) THEN
        RAISE EXCEPTION 'Un paiement est déjà engagé sur ce devis.' USING ERRCODE = '22000';
    END IF;

    v_description := btrim(COALESCE(p_description, ''));
    IF v_description = '' OR char_length(v_description) > 2000 THEN
        RAISE EXCEPTION 'Décrivez la prestation et ses conditions.' USING ERRCODE = '22000';
    END IF;
    IF p_milestones_json IS NULL OR jsonb_typeof(p_milestones_json) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Indiquez au moins une partie du devis.' USING ERRCODE = '22000';
    END IF;

    FOR v_elem IN SELECT value FROM jsonb_array_elements(p_milestones_json) LOOP
        v_count := v_count + 1;
        v_amount := (v_elem->>'amount')::numeric;
        v_title := btrim(COALESCE(v_elem->>'title', ''));
        IF v_title = '' OR char_length(v_title) > 160 THEN
            RAISE EXCEPTION 'Chaque partie a besoin d’un titre.' USING ERRCODE = '22000';
        END IF;
        IF v_amount IS NULL OR v_amount <= 0 THEN
            RAISE EXCEPTION 'Chaque montant doit être supérieur à 0 €.' USING ERRCODE = '22000';
        END IF;
        v_total := v_total + v_amount;
    END LOOP;

    IF v_count < 1 OR v_count > 12 OR v_total <= 0 THEN
        RAISE EXCEPTION 'Indiquez au moins une partie du devis.' USING ERRCODE = '22000';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', m.id,
        'title', m.title,
        'description', m.description,
        'amount', m.amount,
        'display_order', m.display_order,
        'status', m.status
    ) ORDER BY m.display_order, m.created_at), '[]'::jsonb)
    INTO v_snapshot
    FROM public.milestones m
    WHERE m.quote_id = p_quote_id;

    INSERT INTO public.quote_revisions (
        quote_id, version, description, total_amount, valid_until, milestones, revised_by
    ) VALUES (
        p_quote_id,
        v_current_version,
        v_quote.description,
        COALESCE(v_quote.total_amount, v_quote.amount, 0),
        v_quote.valid_until,
        v_snapshot,
        v_my_id
    );

    v_new_version := v_current_version + 1;
    UPDATE public.quotes
    SET description = v_description,
        details = v_description,
        amount = v_total,
        total_amount = v_total,
        valid_until = COALESCE(p_valid_until, valid_until),
        version = v_new_version,
        updated_at = now()
    WHERE id = p_quote_id
      AND status = 'SENT'
      AND COALESCE(version, 1) = v_current_version;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ce devis a été modifié entre-temps. Rechargez la conversation avant de réessayer.'
            USING ERRCODE = 'P0001';
    END IF;

    DELETE FROM public.milestones
    WHERE quote_id = p_quote_id
      AND status = 'PENDING';

    FOR v_elem IN SELECT value FROM jsonb_array_elements(p_milestones_json) LOOP
        INSERT INTO public.milestones (
            quote_id, title, description, amount, percentage, display_order, status
        ) VALUES (
            p_quote_id,
            btrim(v_elem->>'title'),
            NULLIF(btrim(COALESCE(v_elem->>'description', '')), ''),
            (v_elem->>'amount')::numeric,
            NULL,
            v_order,
            'PENDING'
        );
        v_order := v_order + 1;
    END LOOP;

    IF v_quote.conversation_id IS NOT NULL
       AND NOT public.is_blocked_between(v_my_id, v_quote.requester_id) THEN
        BEGIN
            INSERT INTO public.messages (conversation_id, sender_id, content, is_read)
            VALUES (
                v_quote.conversation_id,
                v_my_id,
                'Le devis a été mis à jour (version ' || v_new_version || '). Montant : ' || trim(to_char(v_total, 'FM999999990.00')) || ' €.',
                false
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'quote revision notice skipped: %', SQLERRM;
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'quote_id', p_quote_id,
        'status', 'SENT',
        'version', v_new_version,
        'total_amount', v_total
    );
END;
$$;

REVOKE ALL ON FUNCTION public.revise_sent_quote(uuid, text, timestamptz, jsonb, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revise_sent_quote(uuid, text, timestamptz, jsonb, int) TO authenticated;
