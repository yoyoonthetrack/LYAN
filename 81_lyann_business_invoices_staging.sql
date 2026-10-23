BEGIN;
CREATE TABLE public.lyann_invoice_counters(user_id uuid NOT NULL REFERENCES auth.users(id), year integer NOT NULL, last_number integer NOT NULL, PRIMARY KEY(user_id,year));
CREATE TABLE public.lyann_business_invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 customer_id uuid NOT NULL REFERENCES auth.users(id), mission_id uuid NOT NULL REFERENCES public.missions(id),
 number text NOT NULL, kind text NOT NULL CHECK(kind IN ('invoice','deposit','credit')),
 total_cents bigint NOT NULL CHECK(total_cents>0 AND total_cents<=100000000),
 snapshot jsonb NOT NULL, original_id uuid REFERENCES public.lyann_business_invoices(id),
 idempotency_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,number),UNIQUE(user_id,idempotency_key),UNIQUE(original_id),
 CHECK((kind='credit')=(original_id IS NOT NULL))
);
ALTER TABLE public.lyann_invoice_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_business_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lyann_invoice_counters,public.lyann_business_invoices FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.lyann_invoice_counters,public.lyann_business_invoices TO service_role;
CREATE FUNCTION public.lyann_invoice_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Une facture émise est immuable. Émettez un avoir.'; END; $$;
CREATE TRIGGER lyann_invoice_immutable BEFORE UPDATE OR DELETE ON public.lyann_business_invoices FOR EACH ROW EXECUTE FUNCTION public.lyann_invoice_immutable();
CREATE FUNCTION public.lyann_issue_test_invoice(p_user uuid,p_mission uuid,p_kind text,p_amount bigint,p_snapshot jsonb,p_original uuid,p_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m record; old_invoice record; n integer; y integer:=extract(year from now()); balance bigint; issued public.lyann_business_invoices;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('lyann-invoice:'||p_user::text,0));
 SELECT * INTO issued FROM public.lyann_business_invoices WHERE user_id=p_user AND idempotency_key=p_key;
 IF FOUND THEN RETURN to_jsonb(issued); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.lyann_plan_memberships WHERE user_id=p_user AND plan='PRO' AND status IN ('active','cancel_at_period_end') AND expires_at>now()) THEN RAISE EXCEPTION 'Pro actif requis'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.lyann_pro_dossiers WHERE user_id=p_user AND status='approved') THEN RAISE EXCEPTION 'Dossier professionnel approuvé requis'; END IF;
 SELECT * INTO m FROM public.missions WHERE id=p_mission AND helper_id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Mission indisponible'; END IF;
 IF p_kind='credit' THEN
  SELECT * INTO old_invoice FROM public.lyann_business_invoices WHERE id=p_original AND user_id=p_user AND mission_id=p_mission AND kind<>'credit';
  IF NOT FOUND OR old_invoice.total_cents<>p_amount THEN RAISE EXCEPTION 'Avoir invalide'; END IF;
 ELSE
  IF m.status='CANCELLED' THEN RAISE EXCEPTION 'Mission annulée'; END IF;
  SELECT round(m.total_amount*100)-coalesce(sum(CASE WHEN kind='credit' THEN -total_cents ELSE total_cents END),0) INTO balance FROM public.lyann_business_invoices WHERE user_id=p_user AND mission_id=p_mission;
  IF p_amount>balance OR (p_kind='invoice' AND p_amount<>balance) THEN RAISE EXCEPTION 'Le montant doit respecter le solde restant à facturer'; END IF;
 END IF;
 INSERT INTO public.lyann_invoice_counters(user_id,year,last_number) VALUES(p_user,y,1)
 ON CONFLICT(user_id,year) DO UPDATE SET last_number=lyann_invoice_counters.last_number+1 RETURNING last_number INTO n;
 INSERT INTO public.lyann_business_invoices(user_id,customer_id,mission_id,number,kind,total_cents,snapshot,original_id,idempotency_key)
 VALUES(p_user,m.requester_id,p_mission,'TEST-'||y||'-'||lpad(n::text,6,'0'),p_kind,p_amount,p_snapshot,p_original,p_key)
 RETURNING * INTO issued;
 RETURN to_jsonb(issued);
END; $$;
REVOKE ALL ON FUNCTION public.lyann_issue_test_invoice(uuid,uuid,text,bigint,jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lyann_issue_test_invoice(uuid,uuid,text,bigint,jsonb,uuid,uuid) TO service_role;
COMMIT;
