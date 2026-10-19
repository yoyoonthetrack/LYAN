-- LYANN — signalements, révision des devis, et refus d'un nouveau participant bloqué.
-- Local only. Do not apply to production until a verified backup exists and Yoann approves it.
-- Requires public.user_blocks (33), public.is_blocked_between (46) and the quotes/milestones tables (04, 27, 28).
-- Does not replace get_or_create_conversation or is_blocked_between.
-- Message refusal for an existing conversation stays in 46_user_block_enforcement.sql.
-- This script does not create a payment, a transfer, a refund or a notification.

BEGIN;

-- Do not replace get_or_create_conversation or is_blocked_between.
-- Their production bodies were not readable. A new participant is refused
-- when auth.uid() is present and that person is blocked with someone already
-- in the conversation. An existing pair is reused by the current function
-- before any insert, so this trigger does not run on that path.
-- auth.uid() stays null for service-role writes, which are left alone.
CREATE OR REPLACE FUNCTION public.refuse_blocked_new_participant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.user_id IS NULL OR NEW.conversation_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.conversation_participants cp
        WHERE cp.conversation_id = NEW.conversation_id
          AND cp.user_id IS DISTINCT FROM NEW.user_id
          AND public.is_blocked_between(cp.user_id, NEW.user_id)
    ) THEN
        RAISE EXCEPTION 'Ce membre ne peut pas recevoir vos messages.'
            USING ERRCODE = '42501', HINT = 'user_blocked';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refuse_blocked_new_participant ON public.conversation_participants;
CREATE TRIGGER trg_refuse_blocked_new_participant
    AFTER INSERT ON public.conversation_participants
    FOR EACH ROW
    EXECUTE FUNCTION public.refuse_blocked_new_participant();

ALTER TABLE public.user_reports
    ADD COLUMN IF NOT EXISTS conversation_id uuid,
    ADD COLUMN IF NOT EXISTS source text DEFAULT 'profile';

ALTER TABLE public.user_reports DROP CONSTRAINT IF EXISTS user_reports_source_check;
ALTER TABLE public.user_reports
    ADD CONSTRAINT user_reports_source_check
    CHECK (source IS NULL OR source IN ('profile', 'conversation'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_reports_one_open
    ON public.user_reports (reporter_id, target_user_id)
    WHERE status IN ('OPEN', 'IN_REVIEW');

CREATE OR REPLACE FUNCTION public.submit_user_report(
    p_target_user_id uuid,
    p_reason text,
    p_details text DEFAULT NULL,
    p_conversation_id uuid DEFAULT NULL,
    p_source text DEFAULT 'profile'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_reason text;
    v_details text;
    v_source text;
    v_recent int;
    v_report_id uuid;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;
    IF p_target_user_id IS NULL OR p_target_user_id = v_my_id THEN
        RAISE EXCEPTION 'Signalement invalide' USING ERRCODE = '22000';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
        RAISE EXCEPTION 'Membre introuvable' USING ERRCODE = 'P0002';
    END IF;

    v_reason := left(btrim(COALESCE(p_reason, '')), 160);
    IF v_reason = '' THEN
        RAISE EXCEPTION 'Indiquez un motif.' USING ERRCODE = '22000';
    END IF;
    v_details := NULLIF(left(btrim(COALESCE(p_details, '')), 4000), '');
    v_source := CASE WHEN p_source = 'conversation' THEN 'conversation' ELSE 'profile' END;

    IF p_conversation_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.conversation_participants
            WHERE conversation_id = p_conversation_id AND user_id = v_my_id
        ) OR NOT EXISTS (
            SELECT 1 FROM public.conversation_participants
            WHERE conversation_id = p_conversation_id AND user_id = p_target_user_id
        ) THEN
            RAISE EXCEPTION 'Cette conversation ne peut pas servir de contexte.' USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT count(*) INTO v_recent
    FROM public.user_reports
    WHERE reporter_id = v_my_id
      AND created_at > now() - interval '24 hours';
    IF v_recent >= 10 THEN
        RAISE EXCEPTION 'Vous avez atteint la limite de signalements pour aujourd’hui.' USING ERRCODE = '54000';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.user_reports
        WHERE reporter_id = v_my_id
          AND target_user_id = p_target_user_id
          AND status IN ('OPEN', 'IN_REVIEW')
    ) THEN
        RAISE EXCEPTION 'Un signalement est déjà en cours pour ce membre.' USING ERRCODE = '23505';
    END IF;

    BEGIN
        INSERT INTO public.user_reports (
            reporter_id, target_user_id, reason, details, status, conversation_id, source
        ) VALUES (
            v_my_id, p_target_user_id, v_reason, v_details, 'OPEN', p_conversation_id, v_source
        )
        RETURNING id INTO v_report_id;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Un signalement est déjà en cours pour ce membre.' USING ERRCODE = '23505';
    END;

    RETURN jsonb_build_object(
        'id', v_report_id,
        'status', 'OPEN',
        'created_at', now()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_user_report(uuid, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_user_report(uuid, text, text, uuid, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.quote_revisions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    version int NOT NULL,
    description text,
    total_amount numeric NOT NULL,
    valid_until timestamptz,
    milestones jsonb NOT NULL,
    revised_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT quote_revisions_version_positive CHECK (version >= 1),
    CONSTRAINT quote_revisions_unique_version UNIQUE (quote_id, version)
);

ALTER TABLE public.quote_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_revisions_select_participants ON public.quote_revisions;
CREATE POLICY quote_revisions_select_participants ON public.quote_revisions
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE q.id = quote_revisions.quote_id
          AND (q.requester_id = auth.uid() OR q.provider_id = auth.uid())
    )
);

GRANT SELECT ON public.quote_revisions TO authenticated;
REVOKE ALL ON public.quote_revisions FROM anon;

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
            USING ERRCODE = '40001';
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
            USING ERRCODE = '40001';
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

COMMIT;
