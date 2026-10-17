-- Safe rollback 55 (Lyann-test only). Do not apply on Supabase Production.
-- Restores the 54 NEW_MESSAGE skip (payment_failed is NOT skipped) while
-- KEEPING lyann_notify_payment_failed so the requester never goes silent.
-- After this file: requester still gets PAYMENT_FAILED; Lyanneur also gets
-- the old technical NEW_MESSAGE. That dual path is the non-silent undo.
-- Dropping the producer is NOT in this file: it would restore requester
-- silence for new failures. Historical notifications are never deleted.

BEGIN;

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
        'payment_requested', 'payment_secured',
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

-- Optional full undo (do not include here):
-- DROP TRIGGER IF EXISTS trg_lyann_notify_payment_failed ON public.payments;
-- DROP FUNCTION IF EXISTS public.lyann_notify_payment_failed();
-- That step restores requester silence for new payment_failed events.
-- The old NEW_MESSAGE then goes to the Lyanneur only. Inevitable if the
-- dedicated producer must be removed. Do not DELETE historical rows.

COMMIT;
