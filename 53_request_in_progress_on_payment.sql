-- After a devis is accepted AND paid (milestone FUNDED), the annonce becomes
-- IN_PROGRESS and leaves public discovery (explorer only lists status = OPEN).
-- When every milestone is RELEASED, the annonce becomes COMPLETED.

CREATE OR REPLACE FUNCTION public.lyann_mark_request_in_progress_on_funding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request_id uuid;
BEGIN
    IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status <> 'FUNDED' THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(q.request_id, m.related_request_id)
      INTO v_request_id
      FROM public.milestones ms
      JOIN public.quotes q ON q.id = ms.quote_id
      LEFT JOIN public.missions m ON m.id = q.mission_id
     WHERE ms.id = NEW.id;

    IF v_request_id IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE public.requests
       SET status = 'IN_PROGRESS',
           auto_close_at = NULL,
           close_notice_sent = true,
           updated_at = now()
     WHERE id = v_request_id
       AND status IN ('OPEN', 'PAUSED', 'ASSIGNED');

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_request_in_progress_on_funding ON public.milestones;
CREATE TRIGGER trg_request_in_progress_on_funding
    AFTER UPDATE OF status ON public.milestones
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_mark_request_in_progress_on_funding();

CREATE OR REPLACE FUNCTION public.lyann_mark_request_completed_on_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_request_id uuid;
    v_quote_id uuid;
    v_open_count int;
BEGIN
    IF TG_OP <> 'UPDATE' OR NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status <> 'RELEASED' THEN
        RETURN NEW;
    END IF;

    SELECT q.id, COALESCE(q.request_id, m.related_request_id)
      INTO v_quote_id, v_request_id
      FROM public.milestones ms
      JOIN public.quotes q ON q.id = ms.quote_id
      LEFT JOIN public.missions m ON m.id = q.mission_id
     WHERE ms.id = NEW.id;

    IF v_request_id IS NULL OR v_quote_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT COUNT(*)::int INTO v_open_count
      FROM public.milestones
     WHERE quote_id = v_quote_id
       AND status NOT IN ('RELEASED', 'CANCELLED');

    IF v_open_count > 0 THEN
        RETURN NEW;
    END IF;

    UPDATE public.requests
       SET status = 'COMPLETED',
           auto_close_at = NULL,
           close_notice_sent = true,
           updated_at = now()
     WHERE id = v_request_id
       AND status IN ('OPEN', 'PAUSED', 'ASSIGNED', 'IN_PROGRESS');

    UPDATE public.missions
       SET status = 'COMPLETED',
           updated_at = now()
     WHERE id = (SELECT mission_id FROM public.quotes WHERE id = v_quote_id)
       AND status IS DISTINCT FROM 'COMPLETED';

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_request_completed_on_release ON public.milestones;
CREATE TRIGGER trg_request_completed_on_release
    AFTER UPDATE OF status ON public.milestones
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_mark_request_completed_on_release();
