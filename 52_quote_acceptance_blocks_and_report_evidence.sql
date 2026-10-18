-- LYANN — acceptation de la version affichée, blocage des nouveaux échanges,
-- et preuves privées des signalements.
-- Local only. Do not apply until Yoann approves it, after 33, 46 and 51.
-- Does not create a payment, a transfer, a refund or a notification.
-- Leaves 49, 50 and 51 unchanged.

BEGIN;

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
    -- PostgREST retries SQLSTATE 40001 until the HTTP call dies. A business refusal must not use it.
    PERFORM set_config('lock_timeout', '4s', true);
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
            USING ERRCODE = 'P0001';
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
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.quotes
    SET status = 'ACCEPTED',
        updated_at = now()
    WHERE id = p_quote_id
      AND status = 'SENT'
      AND COALESCE(version, 1) = v_version;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ce devis a changé. Rechargez-le avant d’accepter la nouvelle version.'
            USING ERRCODE = 'P0001';
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
            USING ERRCODE = 'P0001';
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
    PERFORM set_config('lock_timeout', '4s', true);
    SELECT COALESCE(version, 1) INTO v_version
    FROM public.quotes
    WHERE id = p_quote_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Devis introuvable' USING ERRCODE = 'P0002';
    END IF;
    IF v_version > 1 THEN
        RAISE EXCEPTION 'Ce devis a été modifié. Mettez à jour LYANN pour accepter la nouvelle version.'
            USING ERRCODE = 'P0001';
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
