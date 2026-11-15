-- LYANN 99 — Staging only (tdktfbtqceldlaeqjtow). Do not apply on Production.
-- Mission prestation cap, one timeline event per business fact, quote withdraw
-- and unpaid amendments. Does not delete historical messages or notifications.
-- Rollback: 99_mission_cap_and_deal_dedupe_rollback.sql

BEGIN;

INSERT INTO public.system_settings (key, value)
VALUES ('mission_prestation_cap_eur', '1000'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.quotes
    ADD COLUMN IF NOT EXISTS accepted_prestation_amount numeric;

ALTER TABLE public.quotes
    ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

DO $$
BEGIN
    IF to_regclass('public.quotes') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'public.quotes'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%WITHDRAWN%'
       ) THEN
        ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS check_quotes_status;
        ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
        ALTER TABLE public.quotes ADD CONSTRAINT check_quotes_status
            CHECK (status IN (
                'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'DECLINED', 'CANCELLED',
                'EXPIRED', 'WITHDRAWN', 'SUPERSEDED', 'VIEWED', 'REVISED'
            ));
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.lyann_mission_cap_eur()
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    raw jsonb;
    amount numeric;
BEGIN
    SELECT value INTO raw FROM public.system_settings WHERE key = 'mission_prestation_cap_eur';
    IF raw IS NULL THEN
        RETURN 1000;
    END IF;
    BEGIN
        amount := raw::text::numeric;
    EXCEPTION WHEN OTHERS THEN
        RETURN 1000;
    END;
    -- A stored value that is not already exact cents is ignored.
    -- It is not rounded into a higher or lower ceiling.
    IF amount IS NULL OR amount <> trunc(amount, 2) OR amount < 1 OR amount > 100000 THEN
        RETURN 1000;
    END IF;
    RETURN amount;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_mission_cap_eur() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lyann_mission_prestation_cap_eur()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.lyann_mission_cap_eur();
$$;

REVOKE ALL ON FUNCTION public.lyann_mission_prestation_cap_eur() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lyann_mission_prestation_cap_eur() TO authenticated, service_role;

-- Exact euro cents. Rejects a third decimal instead of rounding it away.
CREATE OR REPLACE FUNCTION public.lyann_money_cents(p_amount numeric)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_scaled numeric;
BEGIN
    IF p_amount IS NULL THEN
        RAISE EXCEPTION 'Indiquez un montant supérieur à 0 €.' USING ERRCODE = '22000';
    END IF;
    IF p_amount <> trunc(p_amount, 2) THEN
        RAISE EXCEPTION 'Le montant doit être exprimé en euros avec deux décimales au plus.'
            USING ERRCODE = '22000', HINT = 'money_scale';
    END IF;
    v_scaled := p_amount * 100;
    IF v_scaled <> trunc(v_scaled, 0) THEN
        RAISE EXCEPTION 'Le montant doit être exprimé en euros avec deux décimales au plus.'
            USING ERRCODE = '22000', HINT = 'money_scale';
    END IF;
    RETURN trunc(v_scaled, 0)::bigint;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_money_cents(numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lyann_assert_prestation_cap(p_amount numeric)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cap numeric;
    v_cents bigint;
    v_cap_cents bigint;
BEGIN
    v_cents := public.lyann_money_cents(p_amount);
    IF v_cents < 0 THEN
        RAISE EXCEPTION 'Indiquez un montant supérieur à 0 €.' USING ERRCODE = '22000';
    END IF;
    v_cap := public.lyann_mission_cap_eur();
    v_cap_cents := public.lyann_money_cents(v_cap);
    IF v_cents > v_cap_cents THEN
        IF v_cap_cents = 100000 THEN
            RAISE EXCEPTION 'Pour le moment, les missions sur LYANN sont limitées à 1 000 €. Ajustez votre devis pour continuer.'
                USING ERRCODE = 'P0001', HINT = 'mission_cap';
        END IF;
        RAISE EXCEPTION 'Pour le moment, les missions sur LYANN sont limitées à % €. Ajustez votre devis pour continuer.',
            trim(to_char(v_cap, 'FM999999990.00'))
            USING ERRCODE = 'P0001', HINT = 'mission_cap';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_assert_prestation_cap(numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lyann_guard_quote_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_amount numeric;
BEGIN
    v_amount := COALESCE(NEW.total_amount, NEW.amount);
    IF TG_OP = 'UPDATE'
       AND OLD.status = 'ACCEPTED'
       AND (
            NEW.total_amount IS DISTINCT FROM OLD.total_amount
            OR NEW.amount IS DISTINCT FROM OLD.amount
       )
       AND current_setting('lyann.contract_amendment', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Un devis accepté ne peut pas être modifié sans avenant.'
            USING ERRCODE = '22000';
    END IF;

    IF v_amount IS NOT NULL THEN
        IF public.lyann_money_cents(v_amount) < 0
           OR (NEW.status IN ('SENT', 'ACCEPTED') AND public.lyann_money_cents(v_amount) = 0) THEN
            RAISE EXCEPTION 'Indiquez un montant supérieur à 0 €.' USING ERRCODE = '22000';
        END IF;
    END IF;

    IF TG_OP = 'INSERT' AND NEW.status IN ('SENT', 'ACCEPTED') THEN
        PERFORM public.lyann_assert_prestation_cap(v_amount);
    ELSIF TG_OP = 'UPDATE'
          AND NEW.status = 'SENT'
          AND (
              NEW.total_amount IS DISTINCT FROM OLD.total_amount
              OR NEW.amount IS DISTINCT FROM OLD.amount
          ) THEN
        PERFORM public.lyann_assert_prestation_cap(v_amount);
    ELSIF TG_OP = 'UPDATE'
          AND NEW.status = 'ACCEPTED'
          AND OLD.status IS DISTINCT FROM 'ACCEPTED' THEN
        PERFORM public.lyann_assert_prestation_cap(v_amount);
        NEW.accepted_prestation_amount := v_amount;
    ELSIF TG_OP = 'UPDATE'
          AND current_setting('lyann.contract_amendment', true) = 'on'
          AND (
              NEW.total_amount IS DISTINCT FROM OLD.total_amount
              OR NEW.amount IS DISTINCT FROM OLD.amount
          ) THEN
        PERFORM public.lyann_assert_prestation_cap(v_amount);
        NEW.accepted_prestation_amount := v_amount;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_guard_quote_cap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lyann_guard_quote_cap ON public.quotes;
CREATE TRIGGER trg_lyann_guard_quote_cap
    BEFORE INSERT OR UPDATE OF status, total_amount, amount ON public.quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_guard_quote_cap();

CREATE OR REPLACE FUNCTION public.lyann_guard_milestone_money()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_cents bigint;
BEGIN
    IF NEW.amount IS NULL THEN
        RAISE EXCEPTION 'Chaque montant doit être supérieur à 0 €.' USING ERRCODE = '22000';
    END IF;
    v_cents := public.lyann_money_cents(NEW.amount);
    IF NEW.status IS DISTINCT FROM 'CANCELLED' AND v_cents <= 0 THEN
        RAISE EXCEPTION 'Chaque montant doit être supérieur à 0 €.' USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_guard_milestone_money() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lyann_guard_milestone_money ON public.milestones;
CREATE TRIGGER trg_lyann_guard_milestone_money
    BEFORE INSERT OR UPDATE OF amount, status ON public.milestones
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_guard_milestone_money();

-- Sees every milestone of the quote, including rows hidden by RLS.
-- Locks the quote so two concurrent writes cannot each pass on a stale sum.
CREATE OR REPLACE FUNCTION public.lyann_assert_quote_milestone_bounds(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status text;
    v_total numeric;
    v_sum numeric;
BEGIN
    IF p_quote_id IS NULL THEN
        RETURN;
    END IF;
    SELECT status, COALESCE(total_amount, amount)
      INTO v_status, v_total
    FROM public.quotes
    WHERE id = p_quote_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN;
    END IF;
    SELECT COALESCE(sum(amount), 0)
      INTO v_sum
    FROM public.milestones
    WHERE quote_id = p_quote_id
      AND status IS DISTINCT FROM 'CANCELLED';
    IF v_sum <> 0 AND v_sum <> trunc(v_sum, 2) THEN
        RAISE EXCEPTION 'Le montant doit être exprimé en euros avec deux décimales au plus.'
            USING ERRCODE = '22000', HINT = 'money_scale';
    END IF;
    IF v_status IN ('SENT', 'DRAFT') AND v_sum > 0 THEN
        PERFORM public.lyann_assert_prestation_cap(v_sum);
    END IF;
    IF v_status = 'ACCEPTED'
       AND public.lyann_money_cents(v_sum) > public.lyann_money_cents(COALESCE(v_total, 0)) THEN
        RAISE EXCEPTION 'Le total des jalons dépasse le montant accepté.'
            USING ERRCODE = '22000', HINT = 'mission_cap';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_assert_quote_milestone_bounds(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lyann_guard_quote_bounds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Deferred: milestones replaced in the same transaction are already visible.
    PERFORM public.lyann_assert_quote_milestone_bounds(NEW.id);
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_guard_quote_bounds() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lyann_guard_quote_bounds ON public.quotes;
CREATE CONSTRAINT TRIGGER trg_lyann_guard_quote_bounds
    AFTER UPDATE OF status, total_amount, amount ON public.quotes
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_guard_quote_bounds();

CREATE OR REPLACE FUNCTION public.lyann_guard_milestone_sum()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ids uuid[];
    v_quote_id uuid;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_ids := ARRAY[NEW.quote_id];
    ELSIF TG_OP = 'DELETE' THEN
        v_ids := ARRAY[OLD.quote_id];
    ELSE
        v_ids := ARRAY[OLD.quote_id, NEW.quote_id];
    END IF;

    -- One lock order for every transaction: smallest uuid first.
    FOR v_quote_id IN
        SELECT DISTINCT q.id
        FROM public.quotes q
        WHERE q.id = ANY (v_ids)
        ORDER BY q.id
    LOOP
        PERFORM public.lyann_assert_quote_milestone_bounds(v_quote_id);
    END LOOP;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_guard_milestone_sum() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lyann_guard_milestone_sum ON public.milestones;
CREATE CONSTRAINT TRIGGER trg_lyann_guard_milestone_sum
    AFTER INSERT OR UPDATE OF amount, status, quote_id OR DELETE ON public.milestones
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_guard_milestone_sum();

-- One quote_updated per version. Other timeline events stay unique per entity.
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
    wanted_version text;
BEGIN
    IF p_conversation_id IS NULL OR p_sender_id IS NULL OR p_message_type IS NULL THEN
        RETURN NULL;
    END IF;
    wanted_version := COALESCE(p_metadata->>'version', '');
    SELECT id INTO existing
    FROM public.messages
    WHERE entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND message_type = p_message_type
      AND (
          p_message_type IS DISTINCT FROM 'quote_updated'
          OR COALESCE(metadata->>'version', '') = wanted_version
      )
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
          AND (
              p_message_type IS DISTINCT FROM 'quote_updated'
              OR COALESCE(metadata->>'version', '') = COALESCE(p_metadata->>'version', '')
          )
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
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'WITHDRAWN' THEN
        kind := 'quote_declined';
        actor := COALESCE(auth.uid(), NEW.provider_id);
        label := 'Devis retiré';
    ELSE
        RETURN NEW;
    END IF;
    IF actor IS NULL THEN
        RETURN NEW;
    END IF;
    PERFORM public.lyann_insert_timeline_event(
        conv, actor, kind, 'quote', NEW.id, label,
        jsonb_build_object('status', NEW.status, 'version', NEW.version)
    );
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_quote_timeline() FROM PUBLIC, anon, authenticated;

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
            NEW.provider_id::text || ':' || NEW.id::text || ':v' || COALESCE(NEW.version, 1)::text
        );
    ELSIF NEW.status = 'SENT'
          AND NEW.version IS DISTINCT FROM OLD.version THEN
        IF NEW.requester_id IS NULL OR NEW.requester_id = NEW.provider_id THEN
            RETURN NEW;
        END IF;
        IF public.lyann_pref_enabled(NEW.requester_id, 'messages') THEN
            PERFORM public.lyann_insert_notification(
                NEW.requester_id, 'QUOTE_RECEIVED', 'LYANN',
                'Le devis a été mis à jour.', 'quote',
                NEW.provider_id::text || ':' || NEW.id::text || ':v' || NEW.version::text
            );
        END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'ACCEPTED' THEN
        IF NEW.provider_id IS NULL OR NEW.provider_id = NEW.requester_id THEN
            RETURN NEW;
        END IF;
        IF public.lyann_pref_enabled(NEW.provider_id, 'messages') THEN
            PERFORM public.lyann_insert_notification(
                NEW.provider_id, 'MISSION_ACCEPTED', 'LYANN',
                'Une mission a été acceptée.', 'quote',
                NEW.requester_id::text || ':' || NEW.id::text
            );
        END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'WITHDRAWN' THEN
        IF NEW.requester_id IS NULL OR NEW.requester_id = NEW.provider_id THEN
            RETURN NEW;
        END IF;
        IF public.lyann_pref_enabled(NEW.requester_id, 'messages') THEN
            PERFORM public.lyann_insert_notification(
                NEW.requester_id, 'QUOTE_WITHDRAWN', 'LYANN',
                'La proposition a été retirée.', 'quote',
                NEW.provider_id::text || ':' || NEW.id::text
            );
        END IF;
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'lyann_notify_quote_push: %', SQLERRM;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_notify_quote_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lyann_notify_quote_push ON public.quotes;
CREATE TRIGGER trg_lyann_notify_quote_push
    AFTER INSERT OR UPDATE OF status, version ON public.quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_notify_quote_push();

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
    IF left(btrim(COALESCE(NEW.content, '')), 1) = '{'
       AND NEW.content LIKE '%system_card%' THEN
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

-- A system_card is never proof of a mission transition. The JSON is dropped.
-- Official events are written by lyann_record_mission_transition from the
-- mission row updated by the secure RPCs.
CREATE OR REPLACE FUNCTION public.lyann_skip_legacy_system_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    payload jsonb;
BEGIN
    IF NEW.message_type IS NOT NULL THEN
        RETURN NEW;
    END IF;
    IF left(btrim(COALESCE(NEW.content, '')), 1) IS DISTINCT FROM '{' THEN
        RETURN NEW;
    END IF;
    BEGIN
        payload := NEW.content::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RETURN NEW;
    END;
    IF COALESCE(payload->>'type', '') IS DISTINCT FROM 'system_card' THEN
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

-- BEFORE INSERT order is alphabetical:
--   messages_protect_timeline_insert  (token required for reserved types)
--   trg_block_restricted_messages     (restricted account)
--   trg_lyann_skip_legacy_system_card (drops system_card, creates nothing)
DROP TRIGGER IF EXISTS trg_lyann_skip_legacy_system_card ON public.messages;
CREATE TRIGGER trg_lyann_skip_legacy_system_card
    BEFORE INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_skip_legacy_system_card();

REVOKE ALL ON FUNCTION public.lyann_skip_legacy_system_card() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lyann_record_mission_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor uuid;
    v_other uuid;
    v_conv uuid;
    v_kind text;
    v_label text;
    v_notif text;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;
    v_actor := auth.uid();
    IF v_actor IS NULL THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'AGREED' AND NEW.status = 'IN_PROGRESS' AND v_actor = NEW.helper_id THEN
        v_kind := 'mission_started';
        v_label := 'Mission commencée';
        v_notif := 'MISSION_STARTED';
        v_other := NEW.requester_id;
    ELSIF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' AND v_actor = NEW.requester_id THEN
        v_kind := 'mission_completed';
        v_label := 'Mission terminée';
        v_notif := 'MISSION_COMPLETED';
        v_other := NEW.helper_id;
    ELSIF OLD.status = 'AGREED' AND NEW.status = 'CANCELLED'
          AND (v_actor = NEW.helper_id OR v_actor = NEW.requester_id) THEN
        v_kind := 'mission_cancelled';
        v_label := 'Mission annulée';
        v_notif := 'MISSION_CANCELLED';
        v_other := CASE WHEN v_actor = NEW.helper_id THEN NEW.requester_id ELSE NEW.helper_id END;
    ELSE
        RETURN NEW;
    END IF;

    SELECT ri.conversation_id
      INTO v_conv
    FROM public.request_invitations ri
    WHERE ri.id = NEW.request_invitation_id;
    IF v_conv IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.conversation_participants cp
        WHERE cp.conversation_id = v_conv
          AND cp.user_id = v_actor
    ) THEN
        RETURN NEW;
    END IF;

    PERFORM public.lyann_insert_timeline_event(
        v_conv, v_actor, v_kind, 'mission', NEW.id, v_label,
        jsonb_build_object('status', NEW.status)
    );
    IF v_other IS NOT NULL
       AND v_other IS DISTINCT FROM v_actor
       AND EXISTS (
            SELECT 1
            FROM public.conversation_participants cp
            WHERE cp.conversation_id = v_conv
              AND cp.user_id = v_other
       ) THEN
        PERFORM public.lyann_insert_notification(
            v_other, v_notif, 'LYANN', v_label, 'mission',
            v_actor::text || ':' || NEW.id::text
        );
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_record_mission_transition() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lyann_mission_status_event ON public.missions;
CREATE TRIGGER trg_lyann_mission_status_event
    AFTER UPDATE OF status ON public.missions
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_record_mission_transition();

CREATE OR REPLACE FUNCTION public.withdraw_sent_quote(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_quote public.quotes%ROWTYPE;
BEGIN
    PERFORM set_config('lock_timeout', '4s', true);
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Devis introuvable' USING ERRCODE = 'P0002';
    END IF;
    IF v_quote.provider_id IS DISTINCT FROM v_my_id THEN
        RAISE EXCEPTION 'Seul l’auteur du devis peut le retirer.' USING ERRCODE = '42501';
    END IF;
    IF v_quote.status = 'WITHDRAWN' THEN
        RETURN jsonb_build_object('success', true, 'quote_id', p_quote_id, 'status', 'WITHDRAWN', 'already_withdrawn', true);
    END IF;
    IF v_quote.status IS DISTINCT FROM 'SENT' THEN
        RAISE EXCEPTION 'Ce devis ne peut plus être retiré.' USING ERRCODE = '22000';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.missions
        WHERE id = v_quote.mission_id
          AND status IS DISTINCT FROM 'CANCELLED'
    ) OR EXISTS (
        SELECT 1 FROM public.payments p
        JOIN public.milestones m ON m.id = p.milestone_id
        WHERE m.quote_id = p_quote_id
          AND p.payment_status IN ('REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'PARTIALLY_REFUNDED', 'DISPUTED')
    ) THEN
        RAISE EXCEPTION 'Ce devis ne peut plus être retiré.' USING ERRCODE = '22000';
    END IF;
    UPDATE public.quotes
    SET status = 'WITHDRAWN',
        withdrawn_at = now(),
        updated_at = now()
    WHERE id = p_quote_id
      AND status = 'SENT';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ce devis ne peut plus être retiré.' USING ERRCODE = '22000';
    END IF;
    RETURN jsonb_build_object('success', true, 'quote_id', p_quote_id, 'status', 'WITHDRAWN');
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_sent_quote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_sent_quote(uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.quote_amendments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'PROPOSED',
    description text NOT NULL,
    total_amount numeric NOT NULL,
    milestones jsonb NOT NULL,
    proposed_by uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    CONSTRAINT quote_amendments_status CHECK (status IN ('PROPOSED', 'ACCEPTED', 'DECLINED', 'SUPERSEDED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS quote_amendments_one_open
    ON public.quote_amendments (quote_id)
    WHERE status = 'PROPOSED';

ALTER TABLE public.quote_amendments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quote_amendments_party_read ON public.quote_amendments;
CREATE POLICY quote_amendments_party_read ON public.quote_amendments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.quotes q
            WHERE q.id = quote_amendments.quote_id
              AND (q.requester_id = auth.uid() OR q.provider_id = auth.uid())
        )
    );

GRANT SELECT ON public.quote_amendments TO authenticated;
REVOKE ALL ON public.quote_amendments FROM anon;

CREATE OR REPLACE FUNCTION public.propose_quote_amendment(
    p_quote_id uuid,
    p_description text,
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
    v_description text;
    v_total numeric := 0;
    v_count int := 0;
    v_elem jsonb;
    v_amount numeric;
    v_title text;
    v_id uuid;
BEGIN
    PERFORM set_config('lock_timeout', '4s', true);
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Devis introuvable' USING ERRCODE = 'P0002';
    END IF;
    IF v_quote.provider_id IS DISTINCT FROM v_my_id THEN
        RAISE EXCEPTION 'Seul l’auteur du devis peut proposer un avenant.' USING ERRCODE = '42501';
    END IF;
    IF v_quote.status IS DISTINCT FROM 'ACCEPTED' THEN
        RAISE EXCEPTION 'Un avenant concerne un devis déjà accepté.' USING ERRCODE = '22000';
    END IF;
    IF p_expected_version IS DISTINCT FROM COALESCE(v_quote.version, 1) THEN
        RAISE EXCEPTION 'Ce devis a été modifié entre-temps. Rechargez la conversation avant de réessayer.'
            USING ERRCODE = 'P0001';
    END IF;
    PERFORM public.lyann_refuse_paid_amendment(p_quote_id, v_quote.mission_id);
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
        IF v_title = '' OR v_amount IS NULL OR public.lyann_money_cents(v_amount) <= 0 THEN
            RAISE EXCEPTION 'Chaque partie a besoin d’un titre et d’un montant supérieur à 0 €.' USING ERRCODE = '22000';
        END IF;
        v_total := v_total + v_amount;
    END LOOP;
    IF v_count < 1 OR v_count > 12 THEN
        RAISE EXCEPTION 'Indiquez au moins une partie du devis.' USING ERRCODE = '22000';
    END IF;
    PERFORM public.lyann_assert_prestation_cap(v_total);
    UPDATE public.quote_amendments
    SET status = 'SUPERSEDED', decided_at = now()
    WHERE quote_id = p_quote_id AND status = 'PROPOSED';
    INSERT INTO public.quote_amendments (quote_id, description, total_amount, milestones, proposed_by)
    VALUES (p_quote_id, v_description, v_total, p_milestones_json, v_my_id)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'amendment_id', v_id, 'quote_id', p_quote_id, 'total_amount', v_total, 'status', 'PROPOSED');
END;
$$;

REVOKE ALL ON FUNCTION public.propose_quote_amendment(uuid, text, jsonb, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_quote_amendment(uuid, text, jsonb, int) TO authenticated, service_role;

-- Shared lock order for an amendment and for a new payment row:
-- quote, then mission, then milestones by id, then payments by id.
CREATE OR REPLACE FUNCTION public.lyann_lock_quote_payment_rows(p_quote_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mission_id uuid;
BEGIN
    PERFORM 1
    FROM public.quotes
    WHERE id = p_quote_id
    FOR UPDATE;
    SELECT mission_id INTO v_mission_id
    FROM public.quotes
    WHERE id = p_quote_id;
    IF v_mission_id IS NOT NULL THEN
        PERFORM 1
        FROM public.missions
        WHERE id = v_mission_id
        FOR UPDATE;
    END IF;
    PERFORM 1
    FROM public.milestones
    WHERE quote_id = p_quote_id
    ORDER BY id
    FOR UPDATE;
    PERFORM 1
    FROM public.payments p
    WHERE p.milestone_id IN (
        SELECT m.id FROM public.milestones m WHERE m.quote_id = p_quote_id
    )
    ORDER BY p.id
    FOR UPDATE;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_lock_quote_payment_rows(uuid) FROM PUBLIC, anon, authenticated;

-- Any payment row blocks the amendment, whatever its status.
CREATE OR REPLACE FUNCTION public.lyann_refuse_paid_amendment(p_quote_id uuid, p_mission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mission_status text;
BEGIN
    PERFORM public.lyann_lock_quote_payment_rows(p_quote_id);
    IF p_mission_id IS NOT NULL THEN
        SELECT status
          INTO v_mission_status
        FROM public.missions
        WHERE id = p_mission_id;
        IF v_mission_status IN ('IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED') THEN
            RAISE EXCEPTION 'Une mission commencée ne se modifie pas par un simple avenant.'
                USING ERRCODE = '22000';
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.milestones
        WHERE quote_id = p_quote_id
          AND status IN ('FUNDED', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'RELEASED', 'DISPUTED')
    ) OR EXISTS (
        SELECT 1
        FROM public.payments p
        JOIN public.milestones m ON m.id = p.milestone_id
        WHERE m.quote_id = p_quote_id
    ) THEN
        RAISE EXCEPTION 'Un paiement est déjà sécurisé. Un avenant qui modifie le montant ne peut pas être appliqué automatiquement. Contactez l’Aide LYANN.'
            USING ERRCODE = '22000', HINT = 'payment_secured';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_refuse_paid_amendment(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Inserts the payment row only after the same locks as an amendment.
-- Amounts come from the API. The quote, mission and milestone come from the locked rows.
CREATE OR REPLACE FUNCTION public.lyann_insert_milestone_payment(p_milestone_id uuid, p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_quote_id uuid;
    v_milestone public.milestones%ROWTYPE;
    v_quote public.quotes%ROWTYPE;
    v_payment public.payments%ROWTYPE;
BEGIN
    PERFORM set_config('lock_timeout', '4s', true);
    SELECT quote_id INTO v_quote_id
    FROM public.milestones
    WHERE id = p_milestone_id;
    IF v_quote_id IS NULL THEN
        RAISE EXCEPTION 'Étape de paiement introuvable.' USING ERRCODE = 'P0002';
    END IF;
    PERFORM public.lyann_lock_quote_payment_rows(v_quote_id);
    SELECT * INTO v_milestone FROM public.milestones WHERE id = p_milestone_id;
    SELECT * INTO v_quote FROM public.quotes WHERE id = v_quote_id;
    IF v_milestone.id IS NULL OR v_quote.id IS NULL THEN
        RAISE EXCEPTION 'Étape de paiement introuvable.' USING ERRCODE = 'P0002';
    END IF;
    IF v_milestone.status IS DISTINCT FROM 'PENDING' OR v_quote.status IS DISTINCT FROM 'ACCEPTED' THEN
        RAISE EXCEPTION 'Cette Partie n''est pas payable.' USING ERRCODE = '22000';
    END IF;
    INSERT INTO public.payments (
        milestone_id, quote_id, mission_id, requester_id, provider_id,
        service_amount_cents, customer_fee_cents, customer_total_cents,
        provider_fee_cents, provider_net_cents, lyann_revenue_cents,
        amount_refunded_cents, currency, payment_status, transfer_status,
        amount_gross_cents, amount_platform_fee_cents, amount_provider_net_cents,
        metadata
    ) VALUES (
        v_milestone.id,
        v_quote.id,
        v_quote.mission_id,
        COALESCE(v_quote.requester_id, (p_row->>'requester_id')::uuid),
        COALESCE(v_quote.provider_id, (p_row->>'provider_id')::uuid),
        (p_row->>'service_amount_cents')::bigint,
        (p_row->>'customer_fee_cents')::bigint,
        (p_row->>'customer_total_cents')::bigint,
        (p_row->>'provider_fee_cents')::bigint,
        (p_row->>'provider_net_cents')::bigint,
        (p_row->>'lyann_revenue_cents')::bigint,
        COALESCE((p_row->>'amount_refunded_cents')::bigint, 0),
        COALESCE(p_row->>'currency', 'EUR'),
        'CREATED',
        'NOT_STARTED',
        (p_row->>'amount_gross_cents')::bigint,
        (p_row->>'amount_platform_fee_cents')::bigint,
        (p_row->>'amount_provider_net_cents')::bigint,
        COALESCE(p_row->'metadata', '{}'::jsonb)
    )
    RETURNING * INTO v_payment;
    RETURN to_jsonb(v_payment);
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_insert_milestone_payment(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lyann_insert_milestone_payment(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.accept_quote_amendment(p_amendment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_my_id uuid;
    v_amendment public.quote_amendments%ROWTYPE;
    v_quote public.quotes%ROWTYPE;
    v_elem jsonb;
    v_order int := 1;
    v_new_version int;
BEGIN
    PERFORM set_config('lock_timeout', '4s', true);
    v_my_id := auth.uid();
    IF v_my_id IS NULL THEN
        RAISE EXCEPTION 'Non authentifié' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_amendment FROM public.quote_amendments WHERE id = p_amendment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Avenant introuvable' USING ERRCODE = 'P0002';
    END IF;
    IF v_amendment.status = 'ACCEPTED' THEN
        RETURN jsonb_build_object('success', true, 'already_accepted', true, 'amendment_id', p_amendment_id);
    END IF;
    IF v_amendment.status IS DISTINCT FROM 'PROPOSED' THEN
        RAISE EXCEPTION 'Cet avenant n’est plus proposé.' USING ERRCODE = '22000';
    END IF;
    SELECT * INTO v_quote FROM public.quotes WHERE id = v_amendment.quote_id FOR UPDATE;
    IF v_quote.requester_id IS DISTINCT FROM v_my_id THEN
        RAISE EXCEPTION 'Seul le demandeur peut accepter cet avenant.' USING ERRCODE = '42501';
    END IF;
    IF v_quote.status IS DISTINCT FROM 'ACCEPTED' THEN
        RAISE EXCEPTION 'Un avenant concerne un devis déjà accepté.' USING ERRCODE = '22000';
    END IF;
    PERFORM public.lyann_refuse_paid_amendment(v_quote.id, v_quote.mission_id);
    PERFORM public.lyann_assert_prestation_cap(v_amendment.total_amount);
    PERFORM set_config('lyann.contract_amendment', 'on', true);
    v_new_version := COALESCE(v_quote.version, 1) + 1;
    UPDATE public.quotes
    SET description = v_amendment.description,
        details = v_amendment.description,
        amount = v_amendment.total_amount,
        total_amount = v_amendment.total_amount,
        version = v_new_version,
        updated_at = now()
    WHERE id = v_quote.id
      AND status = 'ACCEPTED';
    DELETE FROM public.milestones
    WHERE quote_id = v_quote.id
      AND status = 'PENDING';
    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_amendment.milestones) LOOP
        INSERT INTO public.milestones (quote_id, title, description, amount, display_order, status)
        VALUES (
            v_quote.id,
            btrim(v_elem->>'title'),
            NULLIF(btrim(COALESCE(v_elem->>'description', '')), ''),
            (v_elem->>'amount')::numeric,
            v_order,
            'PENDING'
        );
        v_order := v_order + 1;
    END LOOP;
    UPDATE public.quote_amendments
    SET status = 'ACCEPTED', decided_at = now()
    WHERE id = p_amendment_id AND status = 'PROPOSED';
    IF v_quote.provider_id IS NOT NULL AND v_quote.provider_id IS DISTINCT FROM v_my_id THEN
        PERFORM public.lyann_insert_notification(
            v_quote.provider_id, 'QUOTE_RECEIVED', 'LYANN',
            'L’avenant a été accepté.', 'quote',
            v_my_id::text || ':' || v_quote.id::text || ':amendment:' || p_amendment_id::text
        );
    END IF;
    IF v_quote.conversation_id IS NOT NULL THEN
        PERFORM public.lyann_insert_timeline_event(
            v_quote.conversation_id,
            v_my_id,
            'quote_updated',
            'quote',
            v_quote.id,
            'Avenant accepté',
            jsonb_build_object('status', 'ACCEPTED', 'version', v_new_version, 'amendment_id', p_amendment_id)
        );
    END IF;
    RETURN jsonb_build_object(
        'success', true,
        'amendment_id', p_amendment_id,
        'quote_id', v_quote.id,
        'version', v_new_version,
        'total_amount', v_amendment.total_amount
    );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_quote_amendment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_quote_amendment(uuid) TO authenticated, service_role;


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
        IF v_amount IS NULL OR public.lyann_money_cents(v_amount) <= 0 THEN
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
        PERFORM public.lyann_insert_timeline_event(
            v_quote.conversation_id,
            v_my_id,
            'quote_updated',
            'quote',
            p_quote_id,
            'Devis modifié',
            jsonb_build_object('status', 'SENT', 'version', v_new_version, 'total_amount', v_total)
        );
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
        'WORK_TO_VALIDATE', 'PAYOUT_READY', 'PAYMENT_FAILED', 'OPPORTUNITY',
        'QUOTE_WITHDRAWN', 'MISSION_STARTED', 'MISSION_COMPLETED', 'MISSION_CANCELLED'
    ) THEN
        RETURN NEW;
    END IF;

    v_peer := NULLIF(NEW.entity_id, '');
    IF NEW.type = 'NEW_MESSAGE' AND (
        NEW.body IN (
            '📄 Devis proposé', '✅ Devis accepté', 'Devis refusé', 'Devis retiré', 'Devis modifié', 'Avenant accepté',
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
    ELSIF NEW.type IN (
        'QUOTE_RECEIVED', 'MISSION_ACCEPTED', 'WORK_TO_VALIDATE',
        'QUOTE_WITHDRAWN', 'MISSION_STARTED', 'MISSION_COMPLETED', 'MISSION_CANCELLED'
    ) THEN
        v_title := 'LYANN';
        v_body := COALESCE(NULLIF(NEW.body, ''), CASE NEW.type
            WHEN 'QUOTE_RECEIVED' THEN 'Vous avez reçu une proposition.'
            WHEN 'MISSION_ACCEPTED' THEN 'Une mission a été acceptée.'
            WHEN 'QUOTE_WITHDRAWN' THEN 'La proposition a été retirée.'
            WHEN 'MISSION_STARTED' THEN 'Mission commencée'
            WHEN 'MISSION_COMPLETED' THEN 'Mission terminée'
            WHEN 'MISSION_CANCELLED' THEN 'Mission annulée'
            ELSE 'Un travail est à valider.'
        END);
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

REVOKE ALL ON FUNCTION public.lyann_enqueue_push_from_notification() FROM PUBLIC, anon, authenticated;

COMMIT;
