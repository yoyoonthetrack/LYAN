-- LYANN — retour arrière de 51_52_one_transaction.sql
-- Ne pas exécuter sans l’autorisation explicite de Yoann.
--
-- Ce script ne contient aucun DELETE, TRUNCATE, DROP TABLE ni suppression
-- de fichier. Les devis, missions, messages, révisions, signalements et
-- preuves déjà enregistrés restent en place.
--
-- Il retire les déclencheurs et les droits ajoutés, puis restaure
-- l’acceptation à un seul argument telle qu’elle est dans
-- 05_fix_accept_quote_mission_title_v51.sql. Cette ancienne fonction
-- n’examine pas la version affichée.

BEGIN;

DROP TRIGGER IF EXISTS trg_refuse_blocked_new_participant ON public.conversation_participants;
DROP TRIGGER IF EXISTS trg_refuse_blocked_quote_write ON public.quotes;
DROP TRIGGER IF EXISTS trg_refuse_blocked_invitation ON public.request_invitations;
DROP TRIGGER IF EXISTS trg_report_evidence_limit ON public.report_evidence;

DROP POLICY IF EXISTS report_evidence_insert_own ON public.report_evidence;
DROP POLICY IF EXISTS report_evidence_select_reporter_or_admin ON public.report_evidence;
DROP POLICY IF EXISTS report_evidence_storage_select ON storage.objects;
DROP POLICY IF EXISTS report_evidence_storage_insert ON storage.objects;

REVOKE ALL ON FUNCTION public.revise_sent_quote(uuid, text, timestamptz, jsonb, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accept_request_quote(uuid, int) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_user_report(uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON TABLE public.report_evidence FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_request_quote(
    p_quote_id uuid
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
        RAISE EXCEPTION
          'Le devis ne peut plus être accepté (statut actuel: %)',
          COALESCE(v_quote_record.status, 'NULL')
          USING ERRCODE = '22000';
    END IF;

    IF v_quote_record.valid_until IS NOT NULL AND v_quote_record.valid_until < now() THEN
        RAISE EXCEPTION
          'Le devis a expiré (date limite: %)',
          v_quote_record.valid_until
          USING ERRCODE = '22000';
    END IF;

    SELECT * INTO v_req_record FROM public.requests WHERE id = v_quote_record.request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La demande liée est introuvable' USING ERRCODE = 'P0002';
    END IF;

    IF v_req_record.status IS DISTINCT FROM 'OPEN' THEN
        RAISE EXCEPTION
          'La demande liée n''est plus ouverte (statut actuel: %)',
          COALESCE(v_req_record.status, 'NULL')
          USING ERRCODE = '22000';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.missions
        WHERE request_invitation_id = v_quote_record.request_invitation_id
          AND status != 'CANCELLED'
    ) THEN
        RAISE EXCEPTION
          'Une mission a déjà été créée et acceptée pour cette invitation'
          USING ERRCODE = '40001';
    END IF;

    UPDATE public.quotes
    SET status = 'ACCEPTED',
        updated_at = now()
    WHERE id = p_quote_id
      AND status = 'SENT';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Impossible d''accepter le devis (concurrence ou statut déjà modifié)' USING ERRCODE = '40001';
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
        RAISE EXCEPTION
          'Une mission active a déjà été créée pour cette invitation'
          USING ERRCODE = '40001';
    END;

    UPDATE public.quotes SET mission_id = v_mission_id WHERE id = p_quote_id;

    RETURN jsonb_build_object(
        'success', true,
        'quote_id', p_quote_id,
        'mission_id', v_mission_id,
        'request_id', v_quote_record.request_id,
        'request_invitation_id', v_quote_record.request_invitation_id,
        'status', 'ACCEPTED'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_request_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_request_quote(uuid) TO authenticated, service_role;

COMMIT;
