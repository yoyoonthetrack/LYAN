-- LYANN Migration 88 — Option A cancellation on a funded milestone.
-- Staging first (tdktfbtqceldlaeqjtow). Compatible with 87: does not replace
-- cancel_mission_secure. 87 still blocks mission cancel once money is engaged.
-- Client never writes cancellation columns (milestones: SELECT only).
-- REQUESTED = demandeur after J'ai commencé.
-- ACCEPTED = lyanneur agrees → server may later refund if execution is enabled.
-- REFUSED = lyanneur continues; Signaler un problème stays available.

BEGIN;

ALTER TABLE public.milestones
    ADD COLUMN IF NOT EXISTS cancellation_status text,
    ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
    ADD COLUMN IF NOT EXISTS cancellation_decided_at timestamptz;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'milestones_cancellation_status_check'
    ) THEN
        ALTER TABLE public.milestones
            ADD CONSTRAINT milestones_cancellation_status_check
            CHECK (cancellation_status IS NULL OR cancellation_status IN ('REQUESTED', 'ACCEPTED', 'REFUSED'));
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.lyann_request_has_engaged_money(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.quotes q
        JOIN public.milestones m ON m.quote_id = q.id
        LEFT JOIN public.payments p ON p.milestone_id = m.id
        WHERE q.request_id = p_request_id
          AND (
              m.status IN ('FUNDED', 'IN_PROGRESS', 'COMPLETED', 'RELEASED', 'DISPUTED')
              OR p.payment_status IN ('REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'PARTIALLY_REFUNDED', 'DISPUTED')
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.lyann_block_request_close_when_paid()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF public.lyann_request_has_engaged_money(OLD.id) THEN
            RAISE EXCEPTION 'Cette annonce a un paiement sécurisé. Ouvrez le dossier pour annuler et récupérer les fonds.'
                USING ERRCODE = '22000';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('CLOSED', 'COMPLETED', 'CANCELLED', 'CANCELED')
       AND public.lyann_request_has_engaged_money(NEW.id) THEN
        RAISE EXCEPTION 'Cette annonce a un paiement sécurisé. Ouvrez le dossier pour annuler et récupérer les fonds.'
            USING ERRCODE = '22000';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lyann_block_request_close_when_paid ON public.requests;
CREATE TRIGGER trg_lyann_block_request_close_when_paid
    BEFORE UPDATE OF status OR DELETE ON public.requests
    FOR EACH ROW
    EXECUTE FUNCTION public.lyann_block_request_close_when_paid();

REVOKE ALL ON FUNCTION public.lyann_request_has_engaged_money(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lyann_request_has_engaged_money(uuid) TO authenticated, service_role;

COMMIT;
