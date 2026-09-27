-- Chat timeline events.
-- messages records that an event happened. quotes, milestones, payments and
-- missions stay the source of truth. This script does not rewrite old rows
-- and does not invent a backfill.
-- Do not run until reviewed. It is safe to run once, and again:
-- columns use IF NOT EXISTS, triggers are replaced, policies are not dropped.

ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS message_type text,
    ADD COLUMN IF NOT EXISTS entity_type text,
    ADD COLUMN IF NOT EXISTS entity_id uuid,
    ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.messages
    DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE public.messages
    ADD CONSTRAINT messages_message_type_check
    CHECK (message_type IS NULL OR message_type IN (
        'text', 'photo', 'document', 'system',
        'visit_proposed', 'visit_accepted', 'visit_declined', 'visit_rescheduled',
        'quote_created', 'quote_updated', 'quote_accepted', 'quote_declined',
        'payment_requested', 'payment_secured', 'payment_failed',
        'milestone_created', 'milestone_completed', 'milestone_approved',
        'funds_released',
        'mission_started', 'mission_completed', 'mission_cancelled',
        'review_requested', 'review_submitted'
    ));

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_timeline_event
    ON public.messages (entity_type, entity_id, message_type)
    WHERE entity_id IS NOT NULL
      AND message_type IS NOT NULL
      AND message_type NOT IN ('text', 'photo', 'document', 'visit_proposed', 'visit_rescheduled', 'system');

-- A read receipt must not rewrite the event.
CREATE OR REPLACE FUNCTION public.protect_message_read_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.attachment_url IS DISTINCT FROM OLD.attachment_url
     OR NEW.attachment_type IS DISTINCT FROM OLD.attachment_type
     OR NEW.attachment_name IS DISTINCT FROM OLD.attachment_name
     OR NEW.attachment_size IS DISTINCT FROM OLD.attachment_size
     OR NEW.attachment_mime IS DISTINCT FROM OLD.attachment_mime
     OR NEW.client_message_id IS DISTINCT FROM OLD.client_message_id
     OR NEW.message_type IS DISTINCT FROM OLD.message_type
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.metadata IS DISTINCT FROM OLD.metadata THEN
    RAISE EXCEPTION 'messages update is limited to read receipts';
  END IF;
  IF OLD.sender_id = auth.uid() THEN
    RAISE EXCEPTION 'sender cannot mark own message';
  END IF;
  IF NOT public.is_current_user_conversation_participant(OLD.conversation_id) THEN
    RAISE EXCEPTION 'not a participant';
  END IF;
  NEW.is_read := true;
  RETURN NEW;
END;
$$;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO postgres;

CREATE TABLE IF NOT EXISTS private.timeline_write_tokens (
    token uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.timeline_write_tokens FROM PUBLIC, anon, authenticated;

-- One token authorizes one reserved insert. Authenticated clients cannot
-- insert into this table, so set_config alone is not enough.
CREATE OR REPLACE FUNCTION public.lyann_timeline_claim()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    issued uuid := gen_random_uuid();
BEGIN
    INSERT INTO private.timeline_write_tokens (token) VALUES (issued);
    PERFORM set_config('lyann.timeline_token', issued::text, true);
    RETURN issued;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_timeline_claim() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.protect_timeline_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    reserved text[] := ARRAY[
        'system',
        'visit_accepted', 'visit_declined', 'visit_rescheduled',
        'quote_created', 'quote_updated', 'quote_accepted', 'quote_declined',
        'payment_requested', 'payment_secured', 'payment_failed',
        'milestone_created', 'milestone_completed', 'milestone_approved',
        'funds_released',
        'mission_started', 'mission_completed', 'mission_cancelled',
        'review_requested', 'review_submitted'
    ];
    v_token text;
BEGIN
    IF NEW.message_type IS NULL OR NOT (NEW.message_type = ANY (reserved)) THEN
        RETURN NEW;
    END IF;
    v_token := current_setting('lyann.timeline_token', true);
    IF v_token IS NULL OR v_token = '' OR v_token !~* '^[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'reserved timeline event' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM private.timeline_write_tokens AS twt WHERE twt.token = v_token::uuid) THEN
        RAISE EXCEPTION 'reserved timeline event' USING ERRCODE = '42501';
    END IF;
    DELETE FROM private.timeline_write_tokens AS twt WHERE twt.token = v_token::uuid;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_protect_timeline_insert ON public.messages;
CREATE TRIGGER messages_protect_timeline_insert
    BEFORE INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_timeline_message_insert();

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

-- A timeline event is attached only when one conversation is known for sure.
-- 1. quotes.conversation_id
-- 2. the invitation row's conversation_id (one invitation, one foreign key)
-- 3. conversations.mission_id, and only when that mission has exactly one conversation
-- Otherwise NULL. Never the latest conversation between two people.
DROP FUNCTION IF EXISTS public.lyann_conversation_for_pair(uuid, uuid);

CREATE OR REPLACE FUNCTION public.lyann_conversation_for_quote(
    p_conversation_id uuid,
    p_request_invitation_id uuid,
    p_mission_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    conv uuid;
    mission_conversations integer;
BEGIN
    IF p_conversation_id IS NOT NULL THEN
        RETURN p_conversation_id;
    END IF;
    IF p_request_invitation_id IS NOT NULL THEN
        SELECT ri.conversation_id INTO conv
        FROM public.request_invitations ri
        WHERE ri.id = p_request_invitation_id
          AND ri.conversation_id IS NOT NULL;
        IF conv IS NOT NULL THEN
            RETURN conv;
        END IF;
    END IF;
    IF p_mission_id IS NOT NULL THEN
        SELECT count(*) INTO mission_conversations
        FROM public.conversations c
        WHERE c.mission_id = p_mission_id;
        IF mission_conversations = 1 THEN
            SELECT c.id INTO conv
            FROM public.conversations c
            WHERE c.mission_id = p_mission_id;
            RETURN conv;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_conversation_for_quote(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

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

CREATE OR REPLACE FUNCTION public.lyann_milestone_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    quote_row public.quotes%ROWTYPE;
    conv uuid;
    actor uuid;
    kind text;
    label text;
BEGIN
    SELECT * INTO quote_row FROM public.quotes WHERE id = NEW.quote_id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;
    conv := public.lyann_conversation_for_quote(quote_row.conversation_id, quote_row.request_invitation_id, quote_row.mission_id);
    IF conv IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        kind := 'milestone_created';
        actor := COALESCE(quote_row.provider_id, auth.uid());
        label := '🔨 Jalon';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'COMPLETED' THEN
        kind := 'milestone_completed';
        actor := COALESCE(auth.uid(), quote_row.provider_id);
        label := '✓ Travail déclaré terminé';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'VALIDATED' THEN
        kind := 'milestone_approved';
        actor := COALESCE(auth.uid(), quote_row.requester_id);
        label := '✅ Jalon validé';
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'RELEASED' THEN
        kind := 'funds_released';
        actor := COALESCE(auth.uid(), quote_row.requester_id);
        label := '💶 Fonds libérés';
    ELSE
        RETURN NEW;
    END IF;
    PERFORM public.lyann_insert_timeline_event(
        conv, actor, kind, 'milestone', NEW.id, label,
        jsonb_build_object('status', NEW.status, 'title', NEW.title)
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS milestones_timeline_event ON public.milestones;
CREATE TRIGGER milestones_timeline_event
    AFTER INSERT OR UPDATE OF status ON public.milestones
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_milestone_timeline();

-- Payment events follow the payment row, never a frontend guess.
-- SUCCEEDED is the only source of payment_secured.
CREATE OR REPLACE FUNCTION public.lyann_payment_timeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    payload jsonb := to_jsonb(NEW);
    previous jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
    v_status text := COALESCE(payload->>'payment_status', payload->>'status');
    v_previous text := COALESCE(previous->>'payment_status', previous->>'status');
    milestone_id uuid := NULLIF(payload->>'milestone_id', '')::uuid;
    quote_row public.quotes%ROWTYPE;
    milestone_quote uuid;
    conv uuid;
    actor uuid;
    kind text;
    label text;
BEGIN
    IF v_status IS NOT DISTINCT FROM v_previous THEN
        RETURN NEW;
    END IF;
    IF v_status = 'SUCCEEDED' THEN
        kind := 'payment_secured';
        label := '🔒 Fonds sécurisés';
    ELSIF v_status = 'FAILED' THEN
        kind := 'payment_failed';
        label := '❌ Paiement échoué';
    ELSIF v_status IN ('CREATED', 'REQUIRES_ACTION', 'PROCESSING') AND TG_OP = 'INSERT' THEN
        kind := 'payment_requested';
        label := '💳 Paiement demandé';
    ELSE
        RETURN NEW;
    END IF;
    IF milestone_id IS NOT NULL THEN
        SELECT quote_id INTO milestone_quote FROM public.milestones WHERE id = milestone_id;
        SELECT * INTO quote_row FROM public.quotes WHERE id = milestone_quote;
    END IF;
    conv := public.lyann_conversation_for_quote(quote_row.conversation_id, quote_row.request_invitation_id, quote_row.mission_id);
    IF conv IS NULL THEN
        RETURN NEW;
    END IF;
    actor := COALESCE(auth.uid(), quote_row.requester_id, NULLIF(payload->>'requester_id', '')::uuid);
    IF actor IS NULL THEN
        RETURN NEW;
    END IF;
    PERFORM public.lyann_insert_timeline_event(
        conv, actor, kind, 'payment', NULLIF(payload->>'id', '')::uuid, label,
        jsonb_build_object('status', v_status)
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_timeline_event ON public.payments;
CREATE TRIGGER payments_timeline_event
    AFTER INSERT OR UPDATE ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_payment_timeline();

-- Visit reply. The proposal message is the visit record; there is no visits table.
CREATE OR REPLACE FUNCTION public.respond_to_visit(p_message_id uuid, p_decision text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    proposal public.messages%ROWTYPE;
    actor uuid := auth.uid();
    existing_decision uuid;
    kind text;
    label text;
BEGIN
    IF actor IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;
    IF p_decision NOT IN ('accept', 'decline') THEN
        RAISE EXCEPTION 'Décision invalide' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO proposal FROM public.messages WHERE id = p_message_id;
    IF NOT FOUND OR proposal.message_type IS DISTINCT FROM 'visit_proposed' THEN
        RAISE EXCEPTION 'Visite introuvable' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.is_current_user_conversation_participant(proposal.conversation_id) THEN
        RAISE EXCEPTION 'not a participant' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO existing_decision
    FROM public.messages
    WHERE entity_type = 'visit'
      AND entity_id = proposal.id
      AND message_type IN ('visit_accepted', 'visit_declined')
    LIMIT 1;
    IF existing_decision IS NOT NULL THEN
        RETURN existing_decision;
    END IF;
    IF proposal.sender_id = actor THEN
        RAISE EXCEPTION 'reserved timeline event' USING ERRCODE = '42501';
    END IF;
    kind := CASE WHEN p_decision = 'accept' THEN 'visit_accepted' ELSE 'visit_declined' END;
    label := CASE WHEN p_decision = 'accept' THEN '✓ Visite acceptée' ELSE 'Visite refusée' END;
    RETURN public.lyann_insert_timeline_event(
        proposal.conversation_id,
        actor,
        kind,
        'visit',
        proposal.id,
        label,
        COALESCE(proposal.metadata, '{}'::jsonb)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_visit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_visit(uuid, text) TO authenticated;
