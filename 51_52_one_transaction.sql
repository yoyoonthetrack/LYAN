-- LYANN — 51 puis 52 dans une seule transaction.
-- Ne pas exécuter sans l’autorisation explicite de Yoann.
-- Ne remplace pas get_or_create_conversation, is_blocked_between,
-- conversation_has_block_for ni refuse_message_between_blocked_users.
-- Si cette transaction échoue, rien de 51 ni de 52 n’est conservé.

BEGIN;

-- LYANN — signalements, révision des devis, et refus d'un nouveau participant bloqué.
-- Local only. Do not apply to production until a verified backup exists and Yoann approves it.
-- Requires public.user_blocks (33), public.is_blocked_between (46) and the quotes/milestones tables (04, 27, 28).
-- Does not replace get_or_create_conversation or is_blocked_between.
-- Message refusal for an existing conversation stays in 46_user_block_enforcement.sql.
-- This script does not create a payment, a transfer, a refund or a notification.


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

-- LYANN — acceptation de la version affichée, blocage des nouveaux échanges,
-- et preuves privées des signalements.
-- Local only. Do not apply until Yoann approves it, after 33, 46 and 51.
-- Does not create a payment, a transfer, a refund or a notification.
-- Leaves 49, 50 and 51 unchanged.


-- Do not replace conversation_has_block_for or refuse_message_between_blocked_users.
-- Their production bodies were not readable. Message refusal stays as already deployed.
-- A block also closes the commercial bypass: no new quote, no revision of a
-- sent quote, and no new invitation. Accepting the version already sent,
-- and updating a mission or a payment, are not refused here.
CREATE OR REPLACE FUNCTION public.refuse_blocked_commercial_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_TABLE_NAME = 'quotes' AND TG_OP = 'INSERT' THEN
        IF public.is_blocked_between(NEW.provider_id, NEW.requester_id) THEN
            RAISE EXCEPTION 'Ce membre ne peut pas recevoir vos messages.'
                USING ERRCODE = '42501', HINT = 'user_blocked';
        END IF;
    ELSIF TG_TABLE_NAME = 'quotes' AND TG_OP = 'UPDATE' THEN
        IF public.is_blocked_between(NEW.provider_id, NEW.requester_id) THEN
            -- A sent quote is not yet a contract. Accepting it would create one.
            IF OLD.status = 'SENT' AND NEW.status = 'ACCEPTED' THEN
                RAISE EXCEPTION 'Ce devis ne peut plus être accepté.'
                    USING ERRCODE = '42501', HINT = 'user_blocked';
            END IF;
            -- Revising a sent quote is also a new offer.
            IF OLD.status = 'SENT'
               AND NEW.status = 'SENT'
               AND (
                    NEW.total_amount IS DISTINCT FROM OLD.total_amount
                    OR NEW.amount IS DISTINCT FROM OLD.amount
                    OR NEW.description IS DISTINCT FROM OLD.description
                    OR NEW.version IS DISTINCT FROM OLD.version
               ) THEN
                RAISE EXCEPTION 'Ce membre ne peut pas recevoir vos messages.'
                    USING ERRCODE = '42501', HINT = 'user_blocked';
            END IF;
        END IF;
        -- An already accepted quote can still receive its mission link.
        -- Milestone, payment, dispute and mission-closure writes are other tables.
    ELSIF TG_TABLE_NAME = 'request_invitations' AND TG_OP = 'INSERT' THEN
        IF public.is_blocked_between(NEW.requester_id, NEW.recipient_id) THEN
            RAISE EXCEPTION 'Ce membre ne peut pas recevoir vos messages.'
                USING ERRCODE = '42501', HINT = 'user_blocked';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refuse_blocked_quote_write ON public.quotes;
CREATE TRIGGER trg_refuse_blocked_quote_write
    BEFORE INSERT OR UPDATE ON public.quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.refuse_blocked_commercial_write();

DROP TRIGGER IF EXISTS trg_refuse_blocked_invitation ON public.request_invitations;
CREATE TRIGGER trg_refuse_blocked_invitation
    BEFORE INSERT ON public.request_invitations
    FOR EACH ROW
    EXECUTE FUNCTION public.refuse_blocked_commercial_write();

-- Two signatures stay available during the transition.
-- accept_request_quote(uuid, int) is the current client: the version on screen
-- must still be the locked row.
-- accept_request_quote(uuid) is the client already in production. It cannot
-- name a version, so it may accept only a quote that was never revised
-- (version 1). A revised quote is refused until the application sends the
-- version it displayed. Blocking and a second acceptance are refused either way.
-- The one-argument function is not dropped.

CREATE OR REPLACE FUNCTION public.accept_request_quote(
    p_quote_id uuid,
    p_expected_version int
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
    v_version int;
BEGIN
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_quote_record FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Devis introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_quote_record.requester_id != v_my_id THEN
        RAISE EXCEPTION 'Seul le demandeur de la prestation peut accepter ce devis' USING ERRCODE = '42501';
    END IF;

    IF v_quote_record.status IS DISTINCT FROM 'SENT' THEN
        RAISE EXCEPTION 'Le devis ne peut plus être accepté (statut actuel: %)',
            COALESCE(v_quote_record.status, 'NULL')
            USING ERRCODE = '22000';
    END IF;

    IF public.is_blocked_between(v_quote_record.provider_id, v_quote_record.requester_id) THEN
        RAISE EXCEPTION 'Ce devis ne peut plus être accepté.'
            USING ERRCODE = '42501', HINT = 'user_blocked';
    END IF;

    v_version := COALESCE(v_quote_record.version, 1);
    IF p_expected_version IS DISTINCT FROM v_version THEN
        RAISE EXCEPTION 'Ce devis a changé. Rechargez-le avant d’accepter la nouvelle version.'
            USING ERRCODE = '40001';
    END IF;

    IF v_quote_record.valid_until IS NOT NULL AND v_quote_record.valid_until < now() THEN
        RAISE EXCEPTION 'Le devis a expiré (date limite: %)', v_quote_record.valid_until
            USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_req_record FROM public.requests WHERE id = v_quote_record.request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La demande liée est introuvable' USING ERRCODE = 'P0002';
    END IF;
    IF v_req_record.status IS DISTINCT FROM 'OPEN' THEN
        RAISE EXCEPTION 'La demande liée n''est plus ouverte (statut actuel: %)',
            COALESCE(v_req_record.status, 'NULL')
            USING ERRCODE = '22000';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.missions
        WHERE request_invitation_id = v_quote_record.request_invitation_id
          AND status != 'CANCELLED'
    ) THEN
        RAISE EXCEPTION 'Une mission a déjà été créée et acceptée pour cette invitation'
            USING ERRCODE = '40001';
    END IF;

    UPDATE public.quotes
    SET status = 'ACCEPTED',
        updated_at = now()
    WHERE id = p_quote_id
      AND status = 'SENT'
      AND COALESCE(version, 1) = v_version;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ce devis a changé. Rechargez-le avant d’accepter la nouvelle version.'
            USING ERRCODE = '40001';
    END IF;

    BEGIN
        INSERT INTO public.missions (
            requester_id, helper_id, related_request_id, request_invitation_id,
            title, status, total_amount, created_at, updated_at
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
        RAISE EXCEPTION 'Une mission active a déjà été créée pour cette invitation'
            USING ERRCODE = '40001';
    END;

    UPDATE public.quotes SET mission_id = v_mission_id WHERE id = p_quote_id;

    RETURN jsonb_build_object(
        'success', true,
        'quote_id', p_quote_id,
        'mission_id', v_mission_id,
        'version', v_version,
        'status', 'ACCEPTED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_request_quote(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_request_quote(uuid, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_request_quote(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_version int;
BEGIN
    SELECT COALESCE(version, 1) INTO v_version
    FROM public.quotes
    WHERE id = p_quote_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Devis introuvable' USING ERRCODE = 'P0002';
    END IF;
    IF v_version > 1 THEN
        RAISE EXCEPTION 'Ce devis a été modifié. Mettez à jour LYANN pour accepter la nouvelle version.'
            USING ERRCODE = '40001';
    END IF;
    RETURN public.accept_request_quote(p_quote_id, v_version);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_request_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_request_quote(uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.report_evidence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id uuid NOT NULL REFERENCES public.user_reports(id) ON DELETE CASCADE,
    reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    storage_path text NOT NULL,
    mime_type text NOT NULL,
    byte_size integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT report_evidence_size CHECK (byte_size > 0 AND byte_size <= 8388608),
    CONSTRAINT report_evidence_mime CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
    CONSTRAINT report_evidence_path_unique UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_report_evidence_report ON public.report_evidence(report_id, created_at);

ALTER TABLE public.report_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_evidence_insert_own ON public.report_evidence;
CREATE POLICY report_evidence_insert_own ON public.report_evidence
FOR INSERT TO authenticated
WITH CHECK (
    reporter_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.user_reports r
        WHERE r.id = report_id AND r.reporter_id = auth.uid()
    )
);

DROP POLICY IF EXISTS report_evidence_select_reporter_or_admin ON public.report_evidence;
CREATE POLICY report_evidence_select_reporter_or_admin ON public.report_evidence
FOR SELECT TO authenticated
USING (reporter_id = auth.uid() OR public.is_current_user_admin());

GRANT SELECT, INSERT ON public.report_evidence TO authenticated;
REVOKE ALL ON public.report_evidence FROM anon;

CREATE OR REPLACE FUNCTION public.report_evidence_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF (
        SELECT count(*) FROM public.report_evidence
        WHERE report_id = NEW.report_id
    ) >= 4 THEN
        RAISE EXCEPTION 'Quatre preuves maximum pour un signalement.' USING ERRCODE = '54000';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_report_evidence_limit ON public.report_evidence;
CREATE TRIGGER trg_report_evidence_limit
    BEFORE INSERT ON public.report_evidence
    FOR EACH ROW
    EXECUTE FUNCTION public.report_evidence_limit();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'report-evidence',
    'report-evidence',
    false,
    8388608,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.report_evidence_path_ok(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
    parts text[];
    reporter text;
    report_id text;
    file text;
    ext text;
BEGIN
    parts := storage.foldername(object_name);
    IF parts IS NULL OR array_length(parts, 1) IS DISTINCT FROM 2 THEN
        RETURN false;
    END IF;
    reporter := parts[1];
    report_id := parts[2];
    file := storage.filename(object_name);
    ext := lower(storage.extension(object_name));
    IF reporter IS DISTINCT FROM auth.uid()::text THEN
        RETURN false;
    END IF;
    IF report_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN false;
    END IF;
    IF file !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$' THEN
        RETURN false;
    END IF;
    IF ext NOT IN ('jpg', 'jpeg', 'png', 'webp', 'heic', 'heif') THEN
        RETURN false;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM public.user_reports r
        WHERE r.id = report_id::uuid AND r.reporter_id = auth.uid()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.report_evidence_path_ok(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_evidence_path_ok(text) TO authenticated;

DROP POLICY IF EXISTS report_evidence_storage_select ON storage.objects;
CREATE POLICY report_evidence_storage_select ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'report-evidence'
    AND (
        public.report_evidence_path_ok(name)
        OR public.is_current_user_admin()
    )
);

DROP POLICY IF EXISTS report_evidence_storage_insert ON storage.objects;
CREATE POLICY report_evidence_storage_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'report-evidence' AND public.report_evidence_path_ok(name));

COMMIT;
