BEGIN;
CREATE TABLE public.lyann_business_places (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), content jsonb NOT NULL DEFAULT '{}'::jsonb,
 lat double precision GENERATED ALWAYS AS ((content->>'lat')::double precision) STORED CHECK(lat BETWEEN -90 AND 90),
 lng double precision GENERATED ALWAYS AS ((content->>'lng')::double precision) STORED CHECK(lng BETWEEN -180 AND 180),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),
 version integer NOT NULL DEFAULT 1, review_message text NOT NULL DEFAULT '',
 reviewer_id uuid REFERENCES auth.users(id), reviewed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lyann_business_places ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lyann_business_places FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.lyann_business_places TO service_role;
CREATE TABLE public.lyann_business_place_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, actor_id uuid,
 status text NOT NULL, version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lyann_business_place_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lyann_business_place_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.lyann_business_place_events TO service_role;
CREATE FUNCTION public.lyann_record_place_change() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 INSERT INTO public.lyann_business_place_events(user_id,actor_id,status,version)
 VALUES(NEW.user_id,coalesce(NEW.reviewer_id,NEW.user_id),NEW.status,NEW.version);
 RETURN NEW;
END; $$;
CREATE TRIGGER lyann_place_event AFTER INSERT OR UPDATE ON public.lyann_business_places
 FOR EACH ROW EXECUTE FUNCTION public.lyann_record_place_change();
COMMIT;
