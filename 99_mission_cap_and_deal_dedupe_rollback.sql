-- Rollback for 99 on Staging tdktfbtqceldlaeqjtow. Do not run on Production.
-- Ne supprime pas les messages, notifications, devis, jalons, paiements,
-- ni l'historique contractuel (colonnes accepted_prestation_amount, withdrawn_at,
-- table quote_amendments).
--
-- Retire les objets ajoutés par 99, puis restaure les fonctions remplacées
-- depuis leurs définitions antérieures :
--   45_chat_timeline.sql : lyann_insert_timeline_event, lyann_quote_timeline, idx_messages_timeline_event
--   49_push_delivery_queue.sql : lyann_notify_quote_push et son trigger
--   55_payment_failed_notification.sql : lyann_notify_on_message, lyann_enqueue_push_from_notification
--   59_revise_sent_quote_p0001.sql : revise_sent_quote
--
-- Vérification après exécution :
--   les cinq fonctions restaurées existent ;
--   withdraw_sent_quote, propose_quote_amendment, accept_quote_amendment,
--   lyann_money_cents et lyann_assert_prestation_cap n'existent plus ;
--   les triggers trg_lyann_guard_quote_cap, trg_lyann_guard_quote_bounds,
--   trg_lyann_guard_milestone_sum, trg_lyann_guard_milestone_money,
--   trg_lyann_skip_legacy_system_card n'existent plus ;
--   idx_messages_quote_updated_version n'existe plus ;
--   idx_messages_timeline_event existe et exclut quote_updated ;
--   idx_messages_quote_updated_version existe ;
--   plusieurs quote_updated d'un même devis sont conservés ;
--   quotes, milestones, payments, messages et quote_amendments ont le même nombre de lignes.

BEGIN;

DROP TRIGGER IF EXISTS trg_lyann_guard_quote_cap ON public.quotes;
DROP TRIGGER IF EXISTS trg_lyann_guard_quote_bounds ON public.quotes;
DROP TRIGGER IF EXISTS trg_lyann_guard_milestone_sum ON public.milestones;
DROP TRIGGER IF EXISTS trg_lyann_guard_milestone_money ON public.milestones;
DROP TRIGGER IF EXISTS trg_lyann_skip_legacy_system_card ON public.messages;
DROP TRIGGER IF EXISTS trg_lyann_mission_status_event ON public.missions;
DROP TRIGGER IF EXISTS trg_lyann_guard_payment_insert ON public.payments;

DROP FUNCTION IF EXISTS public.lyann_guard_payment_insert();
DROP FUNCTION IF EXISTS public.lyann_record_mission_transition();
DROP FUNCTION IF EXISTS public.lyann_insert_milestone_payment(uuid, jsonb);
DROP FUNCTION IF EXISTS public.lyann_refuse_paid_amendment(uuid, uuid);
DROP FUNCTION IF EXISTS public.lyann_lock_quote_payment_rows(uuid);
DROP FUNCTION IF EXISTS public.withdraw_sent_quote(uuid);
DROP FUNCTION IF EXISTS public.propose_quote_amendment(uuid, text, jsonb, int);
DROP FUNCTION IF EXISTS public.accept_quote_amendment(uuid);
DROP FUNCTION IF EXISTS public.lyann_skip_legacy_system_card();
DROP FUNCTION IF EXISTS public.lyann_guard_quote_bounds();
DROP FUNCTION IF EXISTS public.lyann_guard_quote_cap();
DROP FUNCTION IF EXISTS public.lyann_guard_milestone_sum();
DROP FUNCTION IF EXISTS public.lyann_guard_milestone_money();
DROP FUNCTION IF EXISTS public.lyann_assert_quote_milestone_bounds(uuid);
DROP FUNCTION IF EXISTS public.lyann_assert_prestation_cap(numeric);
DROP FUNCTION IF EXISTS public.lyann_money_cents(numeric);
DROP FUNCTION IF EXISTS public.lyann_mission_prestation_cap_eur();
DROP FUNCTION IF EXISTS public.lyann_mission_cap_eur();

-- quote_updated is kept, including several versions of the same quote.
-- The pre-99 unique index cannot be rebuilt over those rows without deleting them.
DROP INDEX IF EXISTS public.idx_messages_timeline_event;
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_timeline_event
    ON public.messages (entity_type, entity_id, message_type)
    WHERE entity_id IS NOT NULL
      AND message_type IS NOT NULL
      AND message_type NOT IN (
          'text', 'photo', 'document', 'visit_proposed', 'visit_rescheduled', 'system', 'quote_updated'
      );

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_quote_updated_version
    ON public.messages (entity_id, (COALESCE(metadata->>'version', '')))
    WHERE message_type = 'quote_updated' AND entity_id IS NOT NULL;

-- Restores the direct insert used by the API that predates lyann_insert_milestone_payment.
-- Confirmed by the preflight: service_role currently holds INSERT. anon and authenticated do not get it back.
GRANT INSERT ON TABLE public.payments TO service_role;

-- Restored from 45_chat_timeline.sql
CREATE OR REPLACE FUNCTION public.lyann_insert_timeline_event(
    p_conversation_id uuid,
    p_sender_id uuid,
    p_message_type text,
    p_entity_type text,
    p_entity_id uuid,
    p_content text,
    p_metadata jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    existing uuid;
    created uuid;
BEGIN
    IF p_conversation_id IS NULL OR p_sender_id IS NULL OR p_message_type IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT id INTO existing
    FROM public.messages
    WHERE entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND message_type = p_message_type
    LIMIT 1;
    IF existing IS NOT NULL THEN
        RETURN existing;
    END IF;
    PERFORM public.lyann_timeline_claim();
    INSERT INTO public.messages (
        conversation_id, sender_id, content, message_type, entity_type, entity_id, metadata, is_read
    ) VALUES (
        p_conversation_id,
        p_sender_id,
        COALESCE(p_content, ''),
        p_message_type,
        p_entity_type,
        p_entity_id,
        COALESCE(p_metadata, '{}'::jsonb),
        false
    )
    RETURNING id INTO created;
    RETURN created;
EXCEPTION
    WHEN unique_violation THEN
        SELECT id INTO existing
        FROM public.messages
        WHERE entity_type = p_entity_type
          AND entity_id = p_entity_id
          AND message_type = p_message_type
        LIMIT 1;
        RETURN existing;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_insert_timeline_event(uuid, uuid, text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lyann_quote_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    conv uuid;
    actor uuid;
    kind text;
    label text;
BEGIN
    conv := public.lyann_conversation_for_quote(NEW.conversation_id, NEW.request_invitation_id, NEW.mission_id);
    IF conv IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        kind := 'quote_created';
        actor := COALESCE(NEW.provider_id, auth.uid());
        label := '📄 Devis proposé';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'ACCEPTED' THEN
        kind := 'quote_accepted';
        actor := COALESCE(auth.uid(), NEW.requester_id);
        label := '✅ Devis accepté';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('REJECTED', 'DECLINED') THEN
        kind := 'quote_declined';
        actor := COALESCE(auth.uid(), NEW.requester_id);
        label := 'Devis refusé';
    ELSE
        RETURN NEW;
    END IF;
    PERFORM public.lyann_insert_timeline_event(conv, actor, kind, 'quote', NEW.id, label, jsonb_build_object('status', NEW.status));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_timeline_event ON public.quotes;
CREATE TRIGGER quotes_timeline_event
    AFTER INSERT OR UPDATE OF status ON public.quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_quote_timeline();

-- Restored from 49_push_delivery_queue.sql
CREATE OR REPLACE FUNCTION public.lyann_notify_quote_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.requester_id IS NULL OR NEW.requester_id = NEW.provider_id THEN
            RETURN NEW;
        END IF;
        IF NOT public.lyann_pref_enabled(NEW.requester_id, 'messages') THEN
            RETURN NEW;
        END IF;
        PERFORM public.lyann_insert_notification(
            NEW.requester_id, 'QUOTE_RECEIVED', 'LYANN',
            'Vous avez reçu une proposition.', 'quote',
            NEW.provider_id::text || ':' || NEW.id::text
        );
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'ACCEPTED' THEN
        IF NEW.provider_id IS NULL OR NEW.provider_id = NEW.requester_id THEN
            RETURN NEW;
        END IF;
        IF NOT public.lyann_pref_enabled(NEW.provider_id, 'messages') THEN
            RETURN NEW;
        END IF;
        PERFORM public.lyann_insert_notification(
            NEW.provider_id, 'MISSION_ACCEPTED', 'LYANN',
            'Une mission a été acceptée.', 'quote',
            NEW.requester_id::text || ':' || NEW.id::text
        );
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lyann_notify_quote_push: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lyann_notify_quote_push ON public.quotes;
CREATE TRIGGER trg_lyann_notify_quote_push
    AFTER INSERT OR UPDATE OF status ON public.quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_notify_quote_push();

-- Restored from 55_payment_failed_notification.sql
CREATE OR REPLACE FUNCTION public.lyann_notify_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_recipient uuid;
    v_preview text;
BEGIN
    IF NEW.message_type IN (
        'quote_created', 'quote_updated', 'quote_accepted', 'quote_declined',
        'payment_requested', 'payment_secured', 'payment_failed',
        'milestone_created', 'milestone_completed', 'milestone_approved',
        'funds_released', 'mission_started', 'mission_completed', 'mission_cancelled'
    ) THEN
        RETURN NEW;
    END IF;
    IF COALESCE(NEW.metadata->>'kind', '') = 'payout_ready' THEN
        RETURN NEW;
    END IF;

    v_preview := left(regexp_replace(COALESCE(NEW.content, ''), '\s+', ' ', 'g'), 140);
    IF v_preview IS NULL OR btrim(v_preview) = '' THEN
        v_preview := 'Nouveau message';
    END IF;

    FOR v_recipient IN
        SELECT cp.user_id
        FROM public.conversation_participants cp
        WHERE cp.conversation_id = NEW.conversation_id
          AND cp.user_id IS DISTINCT FROM NEW.sender_id
          AND cp.user_id IS DISTINCT FROM public.lyann_support_user_id()
    LOOP
        IF public.lyann_pref_enabled(v_recipient, 'messages') THEN
            PERFORM public.lyann_insert_notification(
                v_recipient,
                'NEW_MESSAGE',
                'Nouveau message',
                v_preview,
                'conversation',
                COALESCE(NEW.sender_id::text, NEW.conversation_id::text)
            );
        END IF;
    END LOOP;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lyann_notify_on_message: %', SQLERRM;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.lyann_enqueue_push_from_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_title text;
    v_body text;
    v_route text;
    v_contact text;
    v_request text;
    v_key text;
    v_peer text;
    v_expires timestamptz;
BEGIN
    IF NEW.user_id IS NULL OR NEW.user_id = public.lyann_support_user_id() THEN
        RETURN NEW;
    END IF;
    IF NEW.type NOT IN (
        'NEW_MESSAGE', 'QUOTE_RECEIVED', 'MISSION_ACCEPTED',
        'WORK_TO_VALIDATE', 'PAYOUT_READY', 'PAYMENT_FAILED', 'OPPORTUNITY'
    ) THEN
        RETURN NEW;
    END IF;

    v_peer := NULLIF(NEW.entity_id, '');
    IF NEW.type = 'NEW_MESSAGE' AND (
        NEW.body IN (
            '📄 Devis proposé', '✅ Devis accepté', 'Devis refusé',
            '💳 Paiement demandé', '🔒 Fonds sécurisés', '❌ Paiement échoué',
            '🔨 Jalon', '✓ Travail déclaré terminé', '✅ Jalon validé',
            '💶 Fonds libérés', 'Mission commencée', 'Mission terminée', 'Mission annulée'
        )
        OR NEW.body LIKE '% a configuré son compte de versement. Le paiement peut maintenant être effectué.'
    ) THEN
        RETURN NEW;
    END IF;
    IF NEW.type = 'NEW_MESSAGE' THEN
        v_title := 'LYANN';
        v_body := 'Vous avez un nouveau message.';
        v_route := 'messages';
        v_contact := v_peer;
        v_key := 'msg:' || NEW.user_id::text || ':' || COALESCE(v_peer, '');
        PERFORM pg_advisory_xact_lock(hashtext(v_key));
        IF v_contact IS NULL OR v_contact = NEW.user_id::text THEN
            RETURN NEW;
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.push_deliveries d
            WHERE d.dedupe_key = v_key
              AND d.created_at > now() - interval '2 minutes'
        ) THEN
            RETURN NEW;
        END IF;
    ELSIF NEW.type = 'OPPORTUNITY' THEN
        v_title := 'LYANN';
        v_body := 'Une annonce correspond à une de vos compétences.';
        v_route := 'mission';
        v_request := v_peer;
        v_key := 'opp:' || NEW.user_id::text;
        PERFORM pg_advisory_xact_lock(hashtext(v_key));
        IF EXISTS (
            SELECT 1 FROM public.push_deliveries d
            WHERE d.user_id = NEW.user_id
              AND d.event_type = 'OPPORTUNITY'
              AND d.created_at > now() - interval '6 hours'
        ) THEN
            RETURN NEW;
        END IF;
    ELSIF NEW.type = 'PAYMENT_FAILED' THEN
        v_title := 'LYANN';
        v_body := 'Une action est nécessaire sur un paiement.';
        v_key := 'evt:PAYMENT_FAILED:' || NEW.user_id::text || ':' || COALESCE(NEW.entity_id, '');
        IF split_part(COALESCE(NEW.entity_id, ''), ':', 1) = 'finances' THEN
            v_route := 'finances';
            v_contact := NULL;
            v_request := NULL;
        ELSE
            v_route := 'messages';
            v_contact := NULLIF(split_part(COALESCE(NEW.entity_id, ''), ':', 1), '');
            v_request := NULLIF(split_part(COALESCE(NEW.entity_id, ''), ':', 3), '');
            IF v_contact IS NULL OR v_contact = NEW.user_id::text OR v_request IS NULL THEN
                v_route := 'finances';
                v_contact := NULL;
                v_request := NULL;
            END IF;
        END IF;
    ELSIF NEW.type IN ('QUOTE_RECEIVED', 'MISSION_ACCEPTED', 'WORK_TO_VALIDATE') THEN
        v_title := 'LYANN';
        v_body := CASE NEW.type
            WHEN 'QUOTE_RECEIVED' THEN 'Vous avez reçu une proposition.'
            WHEN 'MISSION_ACCEPTED' THEN 'Une mission a été acceptée.'
            ELSE 'Un travail est à valider.'
        END;
        v_route := 'messages';
        v_contact := NULLIF(split_part(COALESCE(NEW.entity_id, ''), ':', 1), '');
        v_request := NULLIF(split_part(COALESCE(NEW.entity_id, ''), ':', 3), '');
        v_key := 'evt:' || NEW.type || ':' || NEW.user_id::text || ':' || COALESCE(NEW.entity_id, '');
        IF v_contact IS NULL OR v_contact = NEW.user_id::text THEN
            RETURN NEW;
        END IF;
    ELSIF NEW.type = 'PAYOUT_READY' THEN
        v_title := 'LYANN';
        v_body := 'Une action est nécessaire sur un versement.';
        v_route := 'finances';
        v_key := 'evt:PAYOUT_READY:' || NEW.user_id::text || ':' || COALESCE(NEW.entity_id, '');
    ELSE
        RETURN NEW;
    END IF;

    v_expires := CASE
        WHEN NEW.type = 'NEW_MESSAGE' THEN now() + interval '15 minutes'
        WHEN NEW.type = 'OPPORTUNITY' THEN now() + interval '6 hours'
        ELSE now() + interval '24 hours'
    END;

    INSERT INTO public.push_deliveries (
        notification_id, user_id, event_type, entity_id, dedupe_key,
        route, contact_id, request_id, title, body, expires_at
    ) VALUES (
        NEW.id, NEW.user_id, NEW.type, NEW.entity_id, v_key,
        v_route, v_contact, v_request, v_title, v_body, v_expires
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lyann_enqueue_push: %', SQLERRM;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_notify_on_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lyann_enqueue_push_from_notification() FROM PUBLIC, anon, authenticated;

-- Restored from 59_revise_sent_quote_p0001.sql
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

COMMIT;
