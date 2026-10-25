-- LYANN offers and private professional review. Staging tdktfbtqceldlaeqjtow only.
-- No subscription is activated by this migration. Billing verification is a separate release gate.
BEGIN;
CREATE TABLE public.lyann_plan_memberships (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id), plan text NOT NULL CHECK(plan IN ('PLUS','PRO')),
 status text NOT NULL CHECK(status IN ('active','cancel_at_period_end','expired','revoked')),
 expires_at timestamptz NOT NULL, source text NOT NULL CHECK(source IN ('apple','google','stripe','staging_test')),
 external_id text UNIQUE, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.lyann_pro_dossiers (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 identity jsonb NOT NULL DEFAULT '{}'::jsonb,
 documents jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(documents)='array'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','needs_info','approved','rejected','suspended')),
 message text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
 submitted_at timestamptz, reviewed_at timestamptz, reviewer_id uuid REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.lyann_business_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id),
 kind text NOT NULL CHECK(kind IN ('enterprise','partnership')),
 name text NOT NULL, organization text NOT NULL, email text NOT NULL,
 size text NOT NULL DEFAULT '', message text NOT NULL,
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','closed')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.lyann_pro_review_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dossier_user_id uuid NOT NULL,
 actor_id uuid, action text NOT NULL, version integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.lyann_record_dossier_change() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 INSERT INTO public.lyann_pro_review_events(dossier_user_id,actor_id,action,version)
 VALUES(NEW.user_id,CASE WHEN NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN NEW.reviewer_id ELSE NEW.user_id END,NEW.status,NEW.version);
 RETURN NEW;
END; $$;
CREATE TRIGGER lyann_dossier_event AFTER INSERT OR UPDATE ON public.lyann_pro_dossiers
 FOR EACH ROW EXECUTE FUNCTION public.lyann_record_dossier_change();
ALTER TABLE public.lyann_plan_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_pro_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_business_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyann_pro_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lyann_plan_memberships,public.lyann_pro_dossiers,public.lyann_business_contacts,public.lyann_pro_review_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.lyann_plan_memberships,public.lyann_pro_dossiers,public.lyann_business_contacts,public.lyann_pro_review_events TO service_role;
-- API-only access. Clients cannot assign a plan, approve a dossier, or replace a reviewed object.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('lyann-pro-private','lyann-pro-private',false,2097152,ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT(id) DO NOTHING;
-- No client Storage policy: the authenticated API owns every upload and download.
INSERT INTO public.admin_permissions(code,name,label,module) VALUES
 ('compliance.read','Lire les dossiers professionnels','Lire les dossiers professionnels','Conformité'),
 ('compliance.review','Examiner les dossiers professionnels','Examiner les dossiers professionnels','Conformité'),
 ('partnerships.manage','Traiter les demandes de contact','Traiter les demandes de contact','Relations')
ON CONFLICT(code) DO NOTHING;
COMMIT;
