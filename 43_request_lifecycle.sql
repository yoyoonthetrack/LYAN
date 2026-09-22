-- Annonce en pause 15 jours après acceptation d'un devis, puis fermeture.
-- Deux jours avant la fermeture, une notification propose :
-- Rouvrir, Mettre en pause, ou Laisser fermer.

ALTER TABLE public.requests
    ADD COLUMN IF NOT EXISTS auto_close_at timestamptz,
    ADD COLUMN IF NOT EXISTS close_notice_sent boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.lyann_pause_request_on_quote_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.request_id IS NULL OR NEW.status IS DISTINCT FROM 'ACCEPTED' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'ACCEPTED' THEN
        RETURN NEW;
    END IF;

    UPDATE public.requests
       SET status = 'PAUSED',
           auto_close_at = now() + interval '15 days',
           close_notice_sent = false
     WHERE id = NEW.request_id
       AND status IN ('OPEN', 'PAUSED');

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pause_request_on_quote_accept ON public.quotes;
CREATE TRIGGER trg_pause_request_on_quote_accept
    AFTER INSERT OR UPDATE OF status ON public.quotes
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_pause_request_on_quote_accept();

CREATE OR REPLACE FUNCTION public.lyann_advance_request_lifecycle()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r record;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN;
    END IF;

    FOR r IN
        SELECT id, requester_id
          FROM public.requests
         WHERE requester_id = auth.uid()
           AND status = 'PAUSED'
           AND auto_close_at IS NOT NULL
           AND auto_close_at <= now() + interval '2 days'
           AND close_notice_sent = false
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.notifications
             WHERE user_id = r.requester_id
               AND type = 'REQUEST_CLOSING'
               AND entity_id = r.id::text
        ) THEN
            INSERT INTO public.notifications (user_id, type, title, body, entity_type, entity_id)
            VALUES (
                r.requester_id,
                'REQUEST_CLOSING',
                'Ton annonce va se fermer',
                'Elle se ferme dans 2 jours. Tu peux la rouvrir, la laisser en pause, ou la laisser se fermer.',
                'request',
                r.id::text
            );
        END IF;
        UPDATE public.requests SET close_notice_sent = true WHERE id = r.id;
    END LOOP;

    UPDATE public.requests
       SET status = 'CLOSED',
           auto_close_at = NULL
     WHERE requester_id = auth.uid()
       AND status = 'PAUSED'
       AND auto_close_at IS NOT NULL
       AND auto_close_at <= now();
END;
$$;

CREATE OR REPLACE FUNCTION public.lyann_apply_request_lifecycle(p_request_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Utilisateur non connecté';
    END IF;

    SELECT requester_id INTO v_owner
      FROM public.requests
     WHERE id = p_request_id;

    IF v_owner IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Action réservée à l’auteur de l’annonce';
    END IF;

    IF p_action = 'reopen' THEN
        UPDATE public.requests
           SET status = 'OPEN',
               auto_close_at = NULL,
               close_notice_sent = true
         WHERE id = p_request_id;
    ELSIF p_action = 'pause' THEN
        UPDATE public.requests
           SET status = 'PAUSED',
               auto_close_at = NULL,
               close_notice_sent = true
         WHERE id = p_request_id;
    ELSIF p_action = 'leave' THEN
        UPDATE public.requests
           SET close_notice_sent = true
         WHERE id = p_request_id
           AND status = 'PAUSED';
    ELSIF p_action = 'close' THEN
        UPDATE public.requests
           SET status = 'CLOSED',
               auto_close_at = NULL,
               close_notice_sent = true
         WHERE id = p_request_id;
    ELSE
        RAISE EXCEPTION 'Action inconnue';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.lyann_pause_request_on_quote_accept() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lyann_advance_request_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lyann_apply_request_lifecycle(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lyann_advance_request_lifecycle() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lyann_apply_request_lifecycle(uuid, text) TO authenticated;
