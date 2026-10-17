-- LYANN — File d'attente des notifications push automatiques.
--
-- Préparé uniquement. Ne pas exécuter sur Supabase de production sans accord.
-- Ce script n'envoie rien à Apple : il enregistre des lignes. L'envoi reste
-- dans le serveur, et seulement si PUSH_AUTOMATIC_ENABLED=true.
-- Aucune écriture de paiement, de devis, de mission ou de message n'est modifiée
-- au-delà d'une notification interne ajoutée après coup.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id uuid UNIQUE REFERENCES public.notifications(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    entity_id text,
    dedupe_key text NOT NULL,
    route text,
    contact_id text,
    request_id text,
    title text NOT NULL,
    body text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 5,
    lock_token text,
    locked_at timestamptz,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
    last_error text,
    apns_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT push_deliveries_status_check
        CHECK (status IN ('pending', 'processing', 'sent', 'retry', 'dead', 'skipped'))
);

CREATE UNIQUE INDEX IF NOT EXISTS push_deliveries_event_once
    ON public.push_deliveries (user_id, event_type, entity_id)
    WHERE event_type NOT IN ('NEW_MESSAGE', 'OPPORTUNITY') AND entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS push_deliveries_claim
    ON public.push_deliveries (next_attempt_at, created_at)
    WHERE status IN ('pending', 'retry', 'processing');

ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_deliveries TO service_role;

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
        'WORK_TO_VALIDATE', 'PAYOUT_READY', 'OPPORTUNITY'
    ) THEN
        RETURN NEW;
    END IF;

    v_peer := NULLIF(NEW.entity_id, '');
    -- These system timeline messages already have their own push
    -- (QUOTE_RECEIVED, MISSION_ACCEPTED, WORK_TO_VALIDATE, PAYOUT_READY).
    -- The in-app NEW_MESSAGE row stays. Only the extra push is skipped.
    IF NEW.type = 'NEW_MESSAGE' AND (
        NEW.body IN ('📄 Devis proposé', '✅ Devis accepté', '✓ Travail déclaré terminé')
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
    ELSIF NEW.type IN ('QUOTE_RECEIVED', 'MISSION_ACCEPTED', 'WORK_TO_VALIDATE') THEN
        v_title := CASE NEW.type
            WHEN 'QUOTE_RECEIVED' THEN 'LYANN'
            WHEN 'MISSION_ACCEPTED' THEN 'LYANN'
            ELSE 'LYANN'
        END;
        v_body := CASE NEW.type
            WHEN 'QUOTE_RECEIVED' THEN 'Vous avez reçu une proposition.'
            WHEN 'MISSION_ACCEPTED' THEN 'Une mission a été acceptée.'
            ELSE 'Un travail est à valider.'
        END;
        v_route := 'messages';
        v_contact := NULLIF(split_part(COALESCE(NEW.entity_id, ''), ':', 1), '');
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

DROP TRIGGER IF EXISTS trg_lyann_enqueue_push ON public.notifications;
CREATE TRIGGER trg_lyann_enqueue_push
    AFTER INSERT ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_enqueue_push_from_notification();

-- Devis et mission : une notification interne, puis la file. Le statut du devis
-- et le paiement ne sont pas modifiés ici.
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

CREATE OR REPLACE FUNCTION public.lyann_notify_work_to_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_requester uuid;
    v_provider uuid;
BEGIN
    IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status <> 'COMPLETED' THEN
        RETURN NEW;
    END IF;
    SELECT q.requester_id, q.provider_id INTO v_requester, v_provider
    FROM public.quotes q
    WHERE q.id = NEW.quote_id;
    IF v_requester IS NULL OR v_requester = v_provider THEN
        RETURN NEW;
    END IF;
    IF NOT public.lyann_pref_enabled(v_requester, 'messages') THEN
        RETURN NEW;
    END IF;
    PERFORM public.lyann_insert_notification(
        v_requester, 'WORK_TO_VALIDATE', 'LYANN',
        'Un travail est à valider.', 'milestone',
        v_provider::text || ':' || NEW.id::text
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lyann_notify_work_to_validate: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lyann_notify_work_to_validate ON public.milestones;
CREATE TRIGGER trg_lyann_notify_work_to_validate
    AFTER UPDATE OF status ON public.milestones
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_notify_work_to_validate();

CREATE OR REPLACE FUNCTION public.lyann_claim_push_deliveries(p_worker text, p_limit integer)
RETURNS SETOF public.push_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.push_deliveries
    SET status = 'skipped',
        last_error = 'EXPIRED',
        lock_token = NULL,
        updated_at = now()
    WHERE expires_at <= now()
      AND (
          status IN ('pending', 'retry')
          OR (status = 'processing' AND locked_at < now() - interval '2 minutes')
      );

    RETURN QUERY
    WITH picked AS (
        SELECT q.id
        FROM public.push_deliveries q
        WHERE (
            q.status IN ('pending', 'retry')
            OR (q.status = 'processing' AND q.locked_at < now() - interval '2 minutes')
        )
          AND q.next_attempt_at <= now()
          AND q.expires_at > now()
          AND q.attempts < q.max_attempts
        ORDER BY q.created_at
        FOR UPDATE SKIP LOCKED
        LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 50))
    )
    UPDATE public.push_deliveries d
    SET status = 'processing',
        attempts = d.attempts + 1,
        lock_token = p_worker,
        locked_at = now(),
        apns_id = COALESCE(d.apns_id, gen_random_uuid()),
        updated_at = now()
    FROM picked
    WHERE d.id = picked.id
    RETURNING d.*;
END;
$$;

-- A system line stays in the conversation. It must not also create a second
-- in-app card when a specific notification already describes the event.
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
    IF NEW.message_type IN ('quote_created', 'quote_accepted', 'milestone_completed') THEN
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

REVOKE ALL ON FUNCTION public.lyann_notify_on_message() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.lyann_enqueue_push_from_notification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lyann_notify_quote_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lyann_notify_work_to_validate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lyann_claim_push_deliveries(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lyann_claim_push_deliveries(text, integer) TO service_role;

COMMIT;
